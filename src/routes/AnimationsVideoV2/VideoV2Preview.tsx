import { useEffect, useRef, useState } from 'react'
import { Button, InputNumber, Space, Switch, Tooltip, Typography, message } from 'antd'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons'
import type { CropRatioRect } from '../../lib/imageProcessing'

interface VideoV2PreviewProps {
  frameUrls: string[]
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  size?: number
  /**
   * When provided, shows a draggable/resizable crop box over the preview
   * and an "Apply crop" button. Only wired up in VideoV2FrameCutter — the
   * crop is meant to happen once, right after cutting, before the frames
   * flow into key tuning and the sprite sheet editor.
   */
  onApplyCrop?: (rect: CropRatioRect) => void
}

const DEFAULT_CROP: CropRatioRect = { x: 0.1, y: 0, width: 0.8, height: 1 }
const MIN_CROP_FRACTION = 0.05
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

// Only used when cropping (onApplyCrop) is active — a plain preview never
// needs to zoom in, it's the drag-precision problem this solves.
const ZOOM_LEVELS = [1, 1.5, 2, 3, 4]
const DEFAULT_ZOOM_INDEX = 1 // 1.5x — a bit roomier than the base size without needing a scroll area
const LOUPE_SIZE = 140
const LOUPE_SCALE = 3

export default function VideoV2Preview({
  frameUrls,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  size = 200,
  onApplyCrop,
}: VideoV2PreviewProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [crop, setCrop] = useState<CropRatioRect>(DEFAULT_CROP)
  // Zoom only ever applies to the crop UI — it enlarges the preview box
  // itself (not just a magnifying overlay) so dragging the box/handles is
  // more precise on a source frame that's otherwise shown tiny at `size`.
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const displaySize = onApplyCrop ? size * ZOOM_LEVELS[zoomIndex] : size
  // Cursor position (relative to the display box) while dragging, so the
  // floating loupe can track it; null hides the loupe.
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null)
  // The image is shown with objectFit: 'contain' inside the displaySize x
  // displaySize box, so unless the source is exactly square it doesn't fill
  // the box — there's letterboxing on two sides. The crop box must be drawn
  // over (and dragged within) that actual displayed image rect, not the
  // outer box, or its on-screen position won't match the fractional
  // coordinates applied to the real image in cropBlobByRatio.
  const [imageRect, setImageRect] = useState({ left: 0, top: 0, width: displaySize, height: displaySize })
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | HandlePos; startX: number; startY: number; startRect: CropRatioRect } | null>(
    null,
  )

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const naturalRatio = img.naturalWidth / img.naturalHeight
    let width: number, height: number
    if (naturalRatio > 1) {
      width = displaySize
      height = displaySize / naturalRatio
    } else {
      height = displaySize
      width = displaySize * naturalRatio
    }
    setImageRect({ left: (displaySize - width) / 2, top: (displaySize - height) / 2, width, height })
  }

  // Re-measure whenever the zoom level changes (the loaded <img> element
  // doesn't re-fire onLoad just because its CSS size changed).
  useEffect(() => {
    const img = boxRef.current?.querySelector('img')
    if (img && img.complete) handleImgLoad({ currentTarget: img } as React.SyntheticEvent<HTMLImageElement>)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySize])

  useEffect(() => {
    if (!playing || frameUrls.length === 0) return
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = i + 1
        if (next >= frameUrls.length) {
          if (!loop) setPlaying(false)
          return loop ? 0 : i
        }
        return next
      })
    }, frameDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [playing, frameUrls, loop, frameDurationSeconds])

  // Callers pass a fresh `.map()` array every render, so compare a joined key
  // of the actual URLs rather than array identity — otherwise any unrelated
  // parent re-render (e.g. nudging the duration InputNumber) would reset
  // playback to frame 0 and stop it.
  const framesKey = frameUrls.join('|')
  useEffect(() => {
    setIndex(0)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey])

  function handlePlay() {
    if (index >= frameUrls.length - 1) setIndex(0)
    setPlaying(true)
  }

  function clampRect(rect: CropRatioRect): CropRatioRect {
    const width = Math.min(1, Math.max(MIN_CROP_FRACTION, rect.width))
    const height = Math.min(1, Math.max(MIN_CROP_FRACTION, rect.height))
    const x = Math.min(1 - width, Math.max(0, rect.x))
    const y = Math.min(1 - height, Math.max(0, rect.y))
    return { x, y, width, height }
  }

  function handlePointerDown(mode: 'move' | HandlePos) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: crop }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) {
      setLoupePos(null)
      return
    }
    const boxEl = boxRef.current
    if (boxEl) {
      const rect = boxEl.getBoundingClientRect()
      setLoupePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    const dx = (e.clientX - drag.startX) / imageRect.width
    const dy = (e.clientY - drag.startY) / imageRect.height
    const r = drag.startRect

    if (drag.mode === 'move') {
      setCrop(clampRect({ ...r, x: r.x + dx, y: r.y + dy }))
      return
    }

    let { x, y, width, height } = r
    if (drag.mode.includes('n')) {
      height = r.height - dy
      y = r.y + dy
    }
    if (drag.mode.includes('s')) {
      height = r.height + dy
    }
    if (drag.mode.includes('w')) {
      width = r.width - dx
      x = r.x + dx
    }
    if (drag.mode.includes('e')) {
      width = r.width + dx
    }
    setCrop(clampRect({ x, y, width, height }))
  }

  function handlePointerUp() {
    dragRef.current = null
    setLoupePos(null)
  }

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    background: '#1677ff',
    border: '1px solid #fff',
    borderRadius: 2,
    cursor,
  })

  const handles: { pos: HandlePos; left: string; top: string; cursor: string }[] = [
    { pos: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
    { pos: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
    { pos: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
    { pos: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
    { pos: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
    { pos: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
    { pos: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
    { pos: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
  ]

  const currentUrl = frameUrls[index]

  return (
    <Space direction="vertical" align="center">
      {onApplyCrop && (
        <Space size="small">
          <Tooltip title="Zoom out">
            <Button
              size="small"
              icon={<MinusOutlined />}
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
            />
          </Tooltip>
          <Typography.Text type="secondary" style={{ width: 36, textAlign: 'center', display: 'inline-block' }}>
            {ZOOM_LEVELS[zoomIndex]}x
          </Typography.Text>
          <Tooltip title="Zoom in">
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              onClick={() => setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
            />
          </Tooltip>
        </Space>
      )}
      <div style={{ position: 'relative', width: displaySize, maxWidth: '100%' }}>
        <div
          ref={boxRef}
          onPointerMove={onApplyCrop ? handlePointerMove : undefined}
          onPointerUp={onApplyCrop ? handlePointerUp : undefined}
          onPointerLeave={onApplyCrop ? () => setLoupePos(null) : undefined}
          style={{
            position: 'relative',
            width: displaySize,
            height: displaySize,
            maxWidth: '100%',
            overflow: 'hidden',
            background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 20px 20px',
          }}
        >
          {currentUrl && (
            <img
              src={currentUrl}
              alt={`preview frame ${index + 1}`}
              onLoad={handleImgLoad}
              style={{ width: displaySize, height: displaySize, objectFit: 'contain' }}
            />
          )}
          {onApplyCrop && (
            <div
              onPointerDown={handlePointerDown('move')}
              style={{
                position: 'absolute',
                left: imageRect.left + crop.x * imageRect.width,
                top: imageRect.top + crop.y * imageRect.height,
                width: crop.width * imageRect.width,
                height: crop.height * imageRect.height,
                border: '2px dashed #1677ff',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                cursor: 'move',
                boxSizing: 'border-box',
              }}
            >
              {handles.map((h) => (
                <div
                  key={h.pos}
                  onPointerDown={handlePointerDown(h.pos)}
                  style={{ ...handleStyle(h.cursor), left: h.left, top: h.top }}
                />
              ))}
            </div>
          )}
        </div>
        {/* Rendered as a sibling of the overflow:hidden image box (not
            nested inside it) so the loupe can float outside the preview's
            edges — e.g. above the top edge while dragging a handle near the
            top — without being clipped by that box's own overflow. */}
        {onApplyCrop && loupePos && currentUrl && (
          <div
            style={{
              position: 'absolute',
              left: loupePos.x - LOUPE_SIZE / 2,
              top: loupePos.y - LOUPE_SIZE - 16,
              width: LOUPE_SIZE,
              height: LOUPE_SIZE,
              borderRadius: '50%',
              border: '2px solid #1677ff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
              overflow: 'hidden',
              backgroundColor: '#eee',
              backgroundImage: `url(${currentUrl})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${imageRect.width * LOUPE_SCALE}px ${imageRect.height * LOUPE_SCALE}px`,
              backgroundPosition: `${-((loupePos.x - imageRect.left) * LOUPE_SCALE - LOUPE_SIZE / 2)}px ${-(
                (loupePos.y - imageRect.top) * LOUPE_SCALE -
                LOUPE_SIZE / 2
              )}px`,
            }}
          >
            {/* The crop box's 4 edges, redrawn at the loupe's own scale/pan
                so whichever edge is near the cursor shows exactly where the
                cut line falls — the magnified image alone doesn't make that
                boundary visible since it's not a feature of the pixels. */}
            {(() => {
              const cx = loupePos.x - imageRect.left
              const cy = loupePos.y - imageRect.top
              const edges = [
                { key: 'left', axis: 'v' as const, pos: crop.x * imageRect.width },
                { key: 'right', axis: 'v' as const, pos: (crop.x + crop.width) * imageRect.width },
                { key: 'top', axis: 'h' as const, pos: crop.y * imageRect.height },
                { key: 'bottom', axis: 'h' as const, pos: (crop.y + crop.height) * imageRect.height },
              ]
              return edges.map((edge) => {
                const offset = (edge.pos - (edge.axis === 'v' ? cx : cy)) * LOUPE_SCALE + LOUPE_SIZE / 2
                if (offset < 0 || offset > LOUPE_SIZE) return null
                return (
                  <div
                    key={edge.key}
                    style={
                      edge.axis === 'v'
                        ? { position: 'absolute', left: offset, top: 0, width: 0, height: '100%', borderLeft: '1px solid #ff4d4f' }
                        : { position: 'absolute', top: offset, left: 0, height: 0, width: '100%', borderTop: '1px solid #ff4d4f' }
                    }
                  />
                )
              })
            })()}
          </div>
        )}
      </div>
      <Space wrap>
        <Button onClick={handlePlay} disabled={playing || frameUrls.length === 0}>
          Play
        </Button>
        <Button onClick={() => setPlaying(false)} disabled={!playing}>
          Stop
        </Button>
        <Typography.Text type="secondary">
          Frame {frameUrls.length === 0 ? 0 : index + 1}/{frameUrls.length}
        </Typography.Text>
        <Switch checked={loop} onChange={onLoopChange} checkedChildren="Loop" unCheckedChildren="Once" />
        <InputNumber
          size="small"
          min={0.02}
          max={1}
          step={0.05}
          value={frameDurationSeconds}
          onChange={(value) => onFrameDurationSecondsChange(value ?? frameDurationSeconds)}
          addonAfter="s"
        />
      </Space>
      {onApplyCrop && (
        <Space wrap>
          <Typography.Text type="secondary">
            Drag the box to select the region to keep — everything outside it is discarded from every frame.
          </Typography.Text>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              onApplyCrop(crop)
              message.success('Crop applied to every frame')
            }}
          >
            Apply crop
          </Button>
        </Space>
      )}
    </Space>
  )
}
