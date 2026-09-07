import { memo, useState } from 'react'
import { Alert, Button, Card, InputNumber, Progress, Space, Typography } from 'antd'
import { blobToBase64DataUri } from '../../lib/imageProcessing'
import { generateImage, type JobProgress } from '../../lib/spriteApi'
import { saveRawGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'done' | 'error'

const MIN_REQUEST_COUNT = 1
const MAX_REQUEST_COUNT = 10

interface CharacterGeneratePanel2Props {
  prompt: string
  referenceImageFile: File | null
  onGenerated: (imageUrl: string) => void
}

function CharacterGeneratePanel2({ prompt, referenceImageFile, onGenerated }: CharacterGeneratePanel2Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestCount, setRequestCount] = useState(1)
  const [completedCount, setCompletedCount] = useState(0)

  async function handleGenerate() {
    setStatus('generating')
    setError(null)
    setProgress(null)
    setCompletedCount(0)
    try {
      const images = referenceImageFile ? [await blobToBase64DataUri(referenceImageFile)] : undefined

      // Sent sequentially, not in parallel — same prompt/reference repeated
      // N times, each its own independent job against the same API the
      // single-request path uses, so N runaway concurrent jobs never fire
      // from one click. Each result is shown the moment it lands rather than
      // waiting for the whole batch, so the user isn't staring at a blank
      // panel through several minutes of sequential generation.
      for (let i = 0; i < requestCount; i++) {
        const result = await generateImage(prompt, setProgress, images)
        // Download and keep a local object URL: the proxy's imageUrl is
        // cross-origin (no CORS headers), which taints any canvas drawn from
        // it directly — reading pixels back out (chroma-key, slicing) throws
        // a SecurityError. A same-origin blob: URL avoids that, and matches
        // the "persist AI results locally" requirement.
        const res = await fetch(result.imageUrl)
        if (!res.ok) throw new Error(`Failed to download generated image: ${res.status} ${res.statusText}`)
        const blob = await res.blob()

        // Persist the raw result immediately, before the user has picked a
        // version from it — a generation must never be lost just because the
        // user closes the tab before finishing selection.
        await saveRawGeneration({
          id: crypto.randomUUID(),
          kind: 'character2',
          prompt,
          imageBlob: blob,
          createdAt: Date.now(),
        })

        setCompletedCount(i + 1)
        onGenerated(URL.createObjectURL(blob))
      }

      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="Generate">
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>Number of requests</Typography.Text>
          <InputNumber
            style={{ width: '100%' }}
            min={MIN_REQUEST_COUNT}
            max={MAX_REQUEST_COUNT}
            value={requestCount}
            onChange={(value) => setRequestCount(value ?? MIN_REQUEST_COUNT)}
            disabled={status === 'generating'}
          />
          <Typography.Text type="secondary">
            Sends the same prompt this many times, one request after another; each result is saved
            separately below in "Past generations".
          </Typography.Text>
        </div>
        <Button type="primary" onClick={handleGenerate} loading={status === 'generating'} block>
          Generate
        </Button>
        {status === 'generating' && requestCount > 1 && (
          <Typography.Text type="secondary">
            Request {Math.min(completedCount + 1, requestCount)} of {requestCount}
          </Typography.Text>
        )}
        {status === 'generating' && progress && (
          <Progress percent={progress.progress} status="active" format={() => progress.status} />
        )}
        {status === 'error' && error && <Alert type="error" message="Generation failed" description={error} />}
      </Space>
    </Card>
  )
}

export default memo(CharacterGeneratePanel2)
