import { useState } from 'react'
import { Alert, Button, Card, Progress, Space } from 'antd'
import type { Character, Item, StateGroup } from '../../types'
import { VIEW_ORDER } from '../../types'
import { composeImages, blobToBase64DataUri } from '../../lib/imageProcessing'
import { buildAnimationPrompt } from '../../lib/promptBuilder'
import { generateVideo, type JobProgress } from '../../lib/spriteApi'
import { saveRawVideoGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'done' | 'error'

interface AnimationGeneratePanelProps {
  character: Character
  items: Item[]
  state: StateGroup
  actionDescription: string
  onVideoReady: (rawVideoBlob: Blob) => void
}

export default function AnimationGeneratePanel({
  character,
  items,
  state,
  actionDescription,
  onVideoReady,
}: AnimationGeneratePanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setStatus('generating')
    setError(null)
    setProgress(null)
    try {
      const compositeBlob = await composeImages(
        VIEW_ORDER.map((view) => character.viewBlobs[view]),
        3,
      )
      const compositeDataUri = await blobToBase64DataUri(compositeBlob)
      const itemDataUris = await Promise.all(items.map((item) => blobToBase64DataUri(item.blob)))

      const prompt = buildAnimationPrompt(character.description, items.map((i) => i.name), state, actionDescription)

      const result = await generateVideo(prompt, [compositeDataUri, ...itemDataUris], setProgress)

      // Download and persist the raw video immediately — before any
      // direction-picking or frame-cutting — so an expensive generation is
      // never lost if the user abandons the flow partway through.
      const res = await fetch(result.videoUri)
      if (!res.ok) throw new Error(`Failed to download generated video: ${res.status} ${res.statusText}`)
      const blob = await res.blob()

      await saveRawVideoGeneration({
        id: crypto.randomUUID(),
        prompt,
        videoBlob: blob,
        createdAt: Date.now(),
      })

      setStatus('done')
      onVideoReady(blob)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="Generate">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button type="primary" onClick={handleGenerate} loading={status === 'generating'} block>
          Generate video
        </Button>
        {status === 'generating' && progress && (
          <Progress percent={progress.progress} status="active" format={() => progress.status} />
        )}
        {status === 'error' && error && <Alert type="error" message="Generation failed" description={error} />}
      </Space>
    </Card>
  )
}
