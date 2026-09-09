import { useRef, useState } from 'react'
import type { CropBox } from './useFreeCropBoxes'

interface FreeCropEditorProps {
  image: HTMLImageElement
  boxes: CropBox[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddBox: (rect: { x: number; y: number; width: number; height: number }) => void
  onUpdateBoxRect: (id: string, rect: { x: number; y: number; width: number; height: number }) => void
}

type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const MIN_BOX_SIZE = 4
const MAX_DISPLAY_WIDTH = 900

/**
 * Renders the source image at a size that fits the editor viewport while
 * tracking the display-to-natural pixel scale factor, so pointer coordinates
 * (drawing a new box, dragging/resizing an existing one) convert cleanly to
 * native pixel rects stored on each CropBox — avoiding the fractional-coord
 * letterboxing pitfall VideoV2Preview.tsx had to work around, since here the
 * image always fills its display box exactly (no objectFit letterboxing).
 */
export default function FreeCropEditor({ image, boxes, selectedId, onSelect, onAddBox, onUpdateBoxRect }: FreeCropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const displayWidth = Math.min(MAX_DISPLAY_WIDTH, image.naturalWidth)
  const scale = displayWidth / image.naturalWidth
  const displayHeight = image.naturalHeight * scale

  const dragRef = useRef<
    | { mode: 'draw'; startX: number; startY: number }
    | { mode: 'move' | HandlePos; id: string; startX: number; startY: number; startRect: CropBox }
    | null
  >(null)
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  function toNative(clientX: number, clientY: number): { x: number; y: number } {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  function clampRect(rect: { x: number; y: number; width: number; height: number }) {
    const width = Math.max(MIN_BOX_SIZE, Math.min(rect.width, image.naturalWidth))
    const height = Math.max(MIN_BOX_SIZE, Math.min(rect.height, image.naturalHeight))
    const x = Math.min(Math.max(0, rect.x), image.naturalWidth - width)
    const y = Math.min(Math.max(0, rect.y), image.naturalHeight - height)
    return { x, y, width, height }
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return
    onSelect(null)
    const native = toNative(e.clientX, e.clientY)
    dragRef.current = { mode: 'draw', startX: native.x, startY: native.y }
    setDrawRect({ x: native.x, y: native.y, width: 0, height: 0 })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleBoxPointerDown(id: string, mode: 'move' | HandlePos) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect(id)
      const box = boxes.find((b) => b.id === id)
      if (!box) return
      const native = toNative(e.clientX, e.clientY)
      dragRef.current = { mode, id, startX: native.x, startY: native.y, startRect: box }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const native = toNative(e.clientX, e.clientY)

    if (drag.mode === 'draw') {
      const x = Math.min(drag.startX, native.x)
      const y = Math.min(drag.startY, native.y)
      const width = Math.abs(native.x - drag.startX)
      const height = Math.abs(native.y - drag.startY)
      setDrawRect({ x, y, width, height })
      return
    }

    const dx = native.x - drag.startX
    const dy = native.y - drag.startY
    const r = drag.startRect

    if (drag.mode === 'move') {
      onUpdateBoxRect(drag.id, clampRect({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height }))
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
    onUpdateBoxRect(drag.id, clampRect({ x, y, width, height }))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    if (drag?.mode === 'draw' && drawRect && drawRect.width >= MIN_BOX_SIZE && drawRect.height >= MIN_BOX_SIZE) {
      onAddBox(clampRect(drawRect))
    }
    dragRef.current = null
    setDrawRect(null)
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

  return (
    <div
      ref={containerRef}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'relative',
        width: displayWidth,
        height: displayHeight,
        maxWidth: '100%',
        backgroundImage: `url(${image.src})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        border: '1px solid #d9d9d9',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {boxes.map((box) => {
        const selected = box.id === selectedId
        return (
          <div
            key={box.id}
            onPointerDown={handleBoxPointerDown(box.id, 'move')}
            style={{
              position: 'absolute',
              left: box.x * scale,
              top: box.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              border: selected ? '2px solid #1677ff' : '1px dashed #52c41a',
              cursor: 'move',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -18,
                left: 0,
                fontSize: 11,
                color: '#fff',
                background: selected ? '#1677ff' : '#52c41a',
                padding: '0 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {box.group || 'untitled'} #{box.order}
            </div>
            {selected &&
              handles.map((h) => (
                <div
                  key={h.pos}
                  onPointerDown={handleBoxPointerDown(box.id, h.pos)}
                  style={{ ...handleStyle(h.cursor), left: h.left, top: h.top }}
                />
              ))}
          </div>
        )
      })}
      {drawRect && (
        <div
          style={{
            position: 'absolute',
            left: drawRect.x * scale,
            top: drawRect.y * scale,
            width: drawRect.width * scale,
            height: drawRect.height * scale,
            border: '2px dashed #1677ff',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
