import { useEffect, useState } from 'react'
import { Button, Card, Space, Typography } from 'antd'
import type { SquareCellRect } from '../../lib/useSquareCellGrid'
import { canvasToBlob } from '../../lib/imageProcessing'
import { captureFullFrame } from '../../lib/videoProcessing'
import { useSquareCellGrid } from '../../lib/useSquareCellGrid'
import SquareCellGridOverlay from '../../lib/SquareCellGridOverlay'

interface AnimationGridAlignerProps {
  videoUrl: string
  onAligned: (cellRects: [[SquareCellRect, SquareCellRect], [SquareCellRect, SquareCellRect]]) => void
}

export default function AnimationGridAligner({ videoUrl, onAligned }: AnimationGridAlignerProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    captureFullFrame(videoUrl, 0).then(async (canvas) => {
      if (cancelled) return
      const blob = await canvasToBlob(canvas)
      objectUrl = URL.createObjectURL(blob)
      setFrameUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoUrl])

  const grid = useSquareCellGrid(frameUrl ?? '')

  function handleConfirm() {
    if (!grid.cellRects) return
    onAligned(grid.cellRects)
  }

  if (!frameUrl) {
    return (
      <Card title="Align grid">
        <Typography.Text type="secondary">Loading video frame...</Typography.Text>
      </Card>
    )
  }

  return (
    <Card title="Align grid">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Typography.Text type="secondary">
          Drag the horizontal line to separate the top row from the bottom row, then drag each
          square's center line so it's centered on that character — square size follows its row's
          height automatically.
        </Typography.Text>

        <SquareCellGridOverlay imageUrl={frameUrl} alt="First frame of generated video" grid={grid} />

        <Button type="primary" onClick={handleConfirm} disabled={!grid.cellRects} block>
          Confirm grid
        </Button>
      </Space>
    </Card>
  )
}
