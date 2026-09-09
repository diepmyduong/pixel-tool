import { memo, useState } from 'react'
import { Alert, Button, Divider, InputNumber, Progress, Space, Typography } from 'antd'
import { blobToBase64DataUri } from '../../lib/imageProcessing'
import { generateImage, type JobProgress } from '../../lib/spriteApi'
import { saveRawGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'done' | 'error'

const MIN_REQUEST_COUNT = 1
const MAX_REQUEST_COUNT = 10

interface ItemGeneratePanel2Props {
  prompt: string
  referenceImageFile: File | null
  onGenerated: (imageUrl: string, flow2RequestId: string | undefined) => void
}

function ItemGeneratePanel2({ prompt, referenceImageFile, onGenerated }: ItemGeneratePanel2Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [requestCount, setRequestCount] = useState(1)
  const [completedCount, setCompletedCount] = useState(0)
  // Per-request progress, keyed by index within the batch — a single shared
  // JobProgress can't represent N jobs running at once, since each request's
  // onProgress callback would overwrite whatever the others just reported.
  const [progressByRequest, setProgressByRequest] = useState<Record<number, JobProgress>>({})

  async function generateOne(images: string[] | undefined, index: number): Promise<void> {
    const result = await generateImage(prompt, (p) => setProgressByRequest((prev) => ({ ...prev, [index]: p })), images)
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
      kind: 'item2',
      prompt,
      imageBlob: blob,
      createdAt: Date.now(),
      flow2RequestId: result.flow2RequestId,
    })

    setCompletedCount((c) => c + 1)
    onGenerated(URL.createObjectURL(blob), result.flow2RequestId)
  }

  async function handleGenerate() {
    setStatus('generating')
    setError(null)
    setProgressByRequest({})
    setCompletedCount(0)
    try {
      const images = referenceImageFile ? [await blobToBase64DataUri(referenceImageFile)] : undefined

      // All N requests fire at once (same prompt/reference repeated) rather
      // than one after another — each result is saved and surfaced the
      // moment it lands, independent of whether earlier ones are still
      // running, so a slow request never blocks the fast ones from showing up.
      const results = await Promise.allSettled(
        Array.from({ length: requestCount }, (_, i) => generateOne(images, i)),
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length > 0) {
        setStatus('error')
        setError(
          failures
            .map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
            .join('; '),
        )
        return
      }

      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Divider titlePlacement="left" plain>
        Generate
      </Divider>
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
            Sends the same prompt this many times, all at once in parallel; each result is saved
            separately below in "Past generations" as soon as it lands.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={handleGenerate} loading={status === 'generating'} block>
          Generate
        </Button>
        {status === 'generating' && requestCount > 1 && (
          <Typography.Text type="secondary">
            {completedCount} of {requestCount} done
          </Typography.Text>
        )}
        {status === 'generating' &&
          Object.entries(progressByRequest).map(([index, p]) => (
            <Progress
              key={index}
              percent={p.progress}
              status="active"
              size="small"
              format={() => `#${Number(index) + 1}: ${p.status}`}
            />
          ))}
        {status === 'error' && error && <Alert type="error" message="Generation failed" description={error} />}
      </Space>
    </>
  )
}

export default memo(ItemGeneratePanel2)
