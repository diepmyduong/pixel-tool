import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Slider, Space, Switch, Typography } from 'antd'
import type { CutFrame } from './VideoV2FrameCutter'
import {
  VIDEO_SHEET_FRAME_SIZE,
  composeFrameStrip,
  composeOriginalFrameStrip,
  downloadFrameStrip,
  fitFrameWithOffset,
  loadFrameCanvas,
} from '../../lib/videoSpriteSheet'
import VideoV2Preview from './VideoV2Preview'

const CELL_DISPLAY_SIZE = 140

export interface FrameOffset {
  x: number
  y: number
}

interface VideoV2SpriteSheetEditorProps {
  frames: CutFrame[]
  margin: number
  onMarginChange: (value: number) => void
  frameOffsets: FrameOffset[]
  onFrameOffsetsChange: (value: FrameOffset[]) => void
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  onBack: () => void
  onSave: () => void
  saveLabel?: string
}

/**
 * One frame's fitted-preview cell: loads the raw frame once, re-fits it on a
 * canvas whenever margin/offset change, and turns mouse drags on the canvas
 * into offset deltas scaled from display pixels back to the fixed 64x64
 * source space (display is CELL_DISPLAY_SIZE, source is VIDEO_SHEET_FRAME_SIZE).
 */
function FrameCell({
  frame,
  margin,
  offset,
  onOffsetChange,
  pixelated,
}: {
  frame: CutFrame
  margin: number
  offset: FrameOffset
  onOffsetChange: (offset: FrameOffset) => void
  pixelated: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLCanvasElement | null>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offset: FrameOffset } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadFrameCanvas(frame.keyedBlob).then((canvas) => {
      if (cancelled) return
      sourceRef.current = canvas
      redraw()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.keyedBlob])

  function redraw() {
    const source = sourceRef.current
    const canvas = canvasRef.current
    if (!source || !canvas) return
    const fitted = fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
    canvas.width = VIDEO_SHEET_FRAME_SIZE
    canvas.height = VIDEO_SHEET_FRAME_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, VIDEO_SHEET_FRAME_SIZE, VIDEO_SHEET_FRAME_SIZE)
    ctx.drawImage(fitted, 0, 0)
  }

  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margin, offset])

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, offset }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const start = dragStartRef.current
    if (!start) return
    const scale = VIDEO_SHEET_FRAME_SIZE / CELL_DISPLAY_SIZE
    const dx = (e.clientX - start.mouseX) * scale
    const dy = (e.clientY - start.mouseY) * scale
    onOffsetChange({ x: start.offset.x + dx, y: start.offset.y + dy })
  }

  function handleMouseUp() {
    dragStartRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: CELL_DISPLAY_SIZE,
        height: CELL_DISPLAY_SIZE,
        background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
        cursor: 'grab',
        imageRendering: pixelated ? 'pixelated' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}

export default function VideoV2SpriteSheetEditor({
  frames,
  margin,
  onMarginChange,
  frameOffsets,
  onFrameOffsetsChange,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  onBack,
  onSave,
  saveLabel = 'Save animation',
}: VideoV2SpriteSheetEditorProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportingOriginal, setExportingOriginal] = useState(false)
  // Defaults to smooth (browser's normal image scaling) rather than the
  // hard-edged pixelated look, since the sharp-pixel rendering only matters
  // when actually checking pixel-level alignment — most of the time in this
  // editor is spent looking at overall composition/positioning.
  const [pixelatedPreview, setPixelatedPreview] = useState(false)

  // Re-render the preview strip's frame URLs whenever margin/offsets change,
  // so VideoV2Preview shows the edited (not raw) frames.
  useEffect(() => {
    let cancelled = false
    async function build() {
      const canvases = await Promise.all(
        frames.map(async (frame, i) => {
          const source = await loadFrameCanvas(frame.keyedBlob)
          const offset = frameOffsets[i] ?? { x: 0, y: 0 }
          return fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
        }),
      )
      if (cancelled) return
      const blobs = await Promise.all(
        canvases.map(
          (c) =>
            new Promise<Blob>((resolve, reject) => {
              c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
            }),
        ),
      )
      if (cancelled) return
      setPreviewUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u))
        return blobs.map((b) => URL.createObjectURL(b))
      })
    }
    build()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, margin, frameOffsets])

  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const offsets = useMemo(() => frames.map((_, i) => frameOffsets[i] ?? { x: 0, y: 0 }), [frames, frameOffsets])

  function handleFrameOffsetChange(index: number, offset: FrameOffset) {
    const next = [...offsets]
    next[index] = offset
    onFrameOffsetsChange(next)
  }

  function handleApplyToAll() {
    const current = offsets[activeIndex] ?? { x: 0, y: 0 }
    onFrameOffsetsChange(frames.map(() => ({ ...current })))
  }

  async function handleExport() {
    setExporting(true)
    try {
      const canvases = await Promise.all(
        frames.map(async (frame, i) => {
          const source = await loadFrameCanvas(frame.keyedBlob)
          const offset = offsets[i]
          return fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
        }),
      )
      const blob = await composeFrameStrip(canvases)
      downloadFrameStrip(blob, `animation_sheet_${Date.now()}.png`)
    } finally {
      setExporting(false)
    }
  }

  /**
   * Exports the frames at their original captured size — no fit/margin/
   * offset applied, unlike handleExport's 64x64 pixel-art strip — for cases
   * where the source resolution should be preserved as-is.
   */
  async function handleExportOriginal() {
    setExportingOriginal(true)
    try {
      const canvases = await Promise.all(frames.map((frame) => loadFrameCanvas(frame.keyedBlob)))
      const blob = await composeOriginalFrameStrip(canvases)
      downloadFrameStrip(blob, `animation_sheet_original_${Date.now()}.png`)
    } finally {
      setExportingOriginal(false)
    }
  }

  return (
    <Card title="Sprite Sheet Editor">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text>Margin — minimum gap between character and frame edge</Typography.Text>
          <Slider min={0} max={16} value={margin} onChange={onMarginChange} />
        </div>

        {previewUrls.length > 0 && (
          <VideoV2Preview
            frameUrls={previewUrls}
            frameDurationSeconds={frameDurationSeconds}
            onFrameDurationSecondsChange={onFrameDurationSecondsChange}
            loop={loop}
            onLoopChange={onLoopChange}
            size={VIDEO_SHEET_FRAME_SIZE * 3}
          />
        )}

        <Space>
          <Typography.Text>Drag a frame below to reposition its character.</Typography.Text>
          <Button size="small" onClick={handleApplyToAll}>
            Apply frame {activeIndex + 1}'s position to all
          </Button>
          <Button size="small" loading={exporting} onClick={handleExport}>
            Export Sprite Sheet ({frames.length} x {VIDEO_SHEET_FRAME_SIZE}px)
          </Button>
          <Button size="small" loading={exportingOriginal} onClick={handleExportOriginal}>
            Export original size
          </Button>
          <Space size="small">
            <Switch checked={pixelatedPreview} onChange={setPixelatedPreview} size="small" />
            <Typography.Text type="secondary">Pixelated preview</Typography.Text>
          </Space>
        </Space>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {frames.map((frame, index) => (
            <div key={frame.id} onMouseDown={() => setActiveIndex(index)}>
              <FrameCell
                frame={frame}
                margin={margin}
                offset={offsets[index]}
                onOffsetChange={(offset) => handleFrameOffsetChange(index, offset)}
                pixelated={pixelatedPreview}
              />
              <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {index + 1}
              </Typography.Text>
            </div>
          ))}
        </div>

        <Space>
          <Button onClick={onBack}>Back to chroma key tuning</Button>
          <Button type="primary" onClick={onSave}>
            {saveLabel}
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
