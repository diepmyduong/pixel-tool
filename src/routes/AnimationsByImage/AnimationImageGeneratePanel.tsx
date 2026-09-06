import { Alert, Button, Card, Progress, Space } from 'antd'
import type { JobProgress } from '../../lib/spriteApi'

interface AnimationImageGeneratePanelProps {
  status: 'idle' | 'generating' | 'error'
  progress: JobProgress | null
  error: string | null
  onGenerate: () => void
}

export default function AnimationImageGeneratePanel({
  status,
  progress,
  error,
  onGenerate,
}: AnimationImageGeneratePanelProps) {
  return (
    <Card title="Generate">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button type="primary" onClick={onGenerate} loading={status === 'generating'} block>
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
