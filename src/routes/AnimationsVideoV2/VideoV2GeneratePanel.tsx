import { useMemo, useState } from 'react'
import { Alert, Button, Card, Collapse, Progress, Space, Typography } from 'antd'
import type { Character, Item, StateGroup } from '../../types'
import { primaryViewBlob } from '../../types'
import { blobToBase64DataUri, composeImages } from '../../lib/imageProcessing'
import { buildVideoAnimationV2Prompt } from '../../lib/promptBuilder'
import { generateVideo, type JobProgress } from '../../lib/spriteApi'
import { saveRawVideoGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'done' | 'error'

interface VideoV2GeneratePanelProps {
  character: Character | null
  referenceImageFile: File | null
  items: Item[]
  state: StateGroup
  actionDescription: string
  onVideoReady: (rawVideoBlob: Blob) => void
}

function referenceViewBlob(character: Character): Blob | undefined {
  return (
    character.viewBlobs.right ??
    character.viewBlobs.three_quarter_right ??
    character.viewBlobs.front ??
    primaryViewBlob(character.viewBlobs)
  )
}

export default function VideoV2GeneratePanel({
  character,
  referenceImageFile,
  items,
  state,
  actionDescription,
  onVideoReady,
}: VideoV2GeneratePanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const prompt = useMemo(
    () =>
      buildVideoAnimationV2Prompt(character?.description ?? '', items.map((i) => i.name), state, actionDescription),
    [character, items, state, actionDescription],
  )

  async function handleGenerate() {
    setStatus('generating')
    setError(null)
    setProgress(null)
    try {
      const imageDataUris: string[] = []

      if (character) {
        const referenceBlob = referenceViewBlob(character)
        if (!referenceBlob) throw new Error('Character has no reference view image')
        imageDataUris.push(await blobToBase64DataUri(referenceBlob))
      }

      if (referenceImageFile) {
        imageDataUris.push(await blobToBase64DataUri(referenceImageFile))
      }

      if (items.length === 1) {
        imageDataUris.push(await blobToBase64DataUri(items[0].blob))
      } else if (items.length >= 2) {
        const cols = Math.ceil(Math.sqrt(items.length))
        const collageBlob = await composeImages(
          items.map((i) => i.blob),
          cols,
        )
        imageDataUris.push(await blobToBase64DataUri(collageBlob))
      }

      if (imageDataUris.length === 0) {
        throw new Error('Provide a character or a reference image before generating')
      }

      const result = await generateVideo(prompt, imageDataUris, setProgress)

      // Download and persist the raw video immediately — before any
      // frame-cutting — so an expensive generation is never lost if the
      // user abandons the flow partway through.
      const res = await fetch(result.videoUri)
      if (!res.ok) throw new Error(`Failed to download generated video: ${res.status} ${res.statusText}`)
      const blob = await res.blob()

      await saveRawVideoGeneration({
        id: crypto.randomUUID(),
        prompt,
        videoBlob: blob,
        createdAt: Date.now(),
        kind: 'single',
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
        <Collapse
          items={[
            {
              key: 'prompt',
              label: 'Prompt preview',
              children: (
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{prompt}</Typography.Paragraph>
              ),
            },
          ]}
        />
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
