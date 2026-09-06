import { useState } from 'react'
import type { Character, Item, StateGroup } from '../../types'
import { VIEW_ORDER } from '../../types'
import { buildAnimationImagePrompt, type ActionDirection } from '../../lib/promptBuilder'
import { ANIM_IMG_ASPECT_RATIO } from '../../lib/grid'
import { composeImages, blobToBase64DataUri } from '../../lib/imageProcessing'
import { generateImage, type JobProgress } from '../../lib/spriteApi'
import { saveRawGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'error'

interface GenerateParams {
  character: Character
  items: Item[]
  state: StateGroup
  actionDescription: string
  actionDirection: ActionDirection
}

export function useAnimationImageGeneration(onGenerated: (imageUrl: string) => void) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate({ character, items, state, actionDescription, actionDirection }: GenerateParams) {
    setStatus('generating')
    setError(null)
    setProgress(null)
    try {
      const prompt = buildAnimationImagePrompt(
        character.description,
        items.map((i) => i.name),
        state,
        actionDescription,
        actionDirection,
        character.styleTemplate,
      )

      // Reference images keep the generated sheet's character/items visually
      // consistent with the saved model, the same way the video-generation
      // flow does — a text-only prompt drifts in face/outfit/item shape.
      const compositeBlob = await composeImages(
        VIEW_ORDER.map((view) => character.viewBlobs[view]),
        3,
      )
      const compositeDataUri = await blobToBase64DataUri(compositeBlob)
      const itemDataUris = await Promise.all(items.map((item) => blobToBase64DataUri(item.blob)))

      const result = await generateImage(
        prompt,
        setProgress,
        [compositeDataUri, ...itemDataUris],
        ANIM_IMG_ASPECT_RATIO,
      )

      const res = await fetch(result.imageUrl)
      if (!res.ok) throw new Error(`Failed to download generated image: ${res.status} ${res.statusText}`)
      const blob = await res.blob()

      // Persist the raw result immediately, before the user has picked a
      // variant from it — a generation must never be lost just because the
      // user closes the tab before finishing selection.
      await saveRawGeneration({
        id: crypto.randomUUID(),
        kind: 'animation',
        prompt,
        imageBlob: blob,
        createdAt: Date.now(),
      })

      setStatus('idle')
      onGenerated(URL.createObjectURL(blob))
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return { status, progress, error, generate }
}
