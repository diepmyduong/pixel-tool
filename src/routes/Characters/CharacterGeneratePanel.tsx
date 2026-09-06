import { memo, useState } from 'react'
import { Alert, Button, Card, Progress, Space } from 'antd'
import { generateImage, type JobProgress } from '../../lib/spriteApi'
import { saveRawGeneration } from '../../lib/db'

type Status = 'idle' | 'generating' | 'done' | 'error'

interface CharacterGeneratePanelProps {
  prompt: string
  onGenerated: (imageUrl: string) => void
}

function CharacterGeneratePanel({ prompt, onGenerated }: CharacterGeneratePanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setStatus('generating')
    setError(null)
    setProgress(null)
    try {
      const result = await generateImage(prompt, setProgress)
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
        kind: 'character',
        prompt,
        imageBlob: blob,
        createdAt: Date.now(),
      })

      setStatus('done')
      onGenerated(URL.createObjectURL(blob))
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="Generate">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button type="primary" onClick={handleGenerate} loading={status === 'generating'} block>
          Generate
        </Button>
        {status === 'generating' && progress && (
          <Progress percent={progress.progress} status="active" format={() => progress.status} />
        )}
        {status === 'error' && error && <Alert type="error" message="Generation failed" description={error} />}
      </Space>
    </Card>
  )
}

export default memo(CharacterGeneratePanel)
