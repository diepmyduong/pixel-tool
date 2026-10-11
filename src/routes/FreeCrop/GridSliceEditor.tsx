import { useRef } from 'react'

interface GridSliceEditorProps {
  image: HTMLImageElement
  rowLines: number[]
  colLines: number[]
  onMoveLine: (axis: 'row' | 'col', index: number, fraction: number) => void
}

const MAX_DISPLAY_WIDTH = 900

/**
 * Renders the source image with draggable horizontal/vertical divider lines
 * overlaid at `rowLines`/`colLines` fractions (0..1 of height/width). Each
 * line is a thin hit-target strip so it's easy to grab; dragging reports the
 * new fraction back via onMoveLine, which does the clamping against
 * neighboring lines.
 */
export default function GridSliceEditor({ image, rowLines, colLines, onMoveLine }: GridSliceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ axis: 'row' | 'col'; index: number } | null>(null)

  const displayWidth = Math.min(MAX_DISPLAY_WIDTH, image.naturalWidth)
  const scale = displayWidth / image.naturalWidth
  const displayHeight = image.naturalHeight * scale

  function handlePointerDown(axis: 'row' | 'col', index: number) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { axis, index }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (drag.axis === 'row') {
      onMoveLine('row', drag.index, (e.clientY - rect.top) / rect.height)
    } else {
      onMoveLine('col', drag.index, (e.clientX - rect.left) / rect.width)
    }
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  return (
    <div
      ref={containerRef}
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
      {rowLines.map((fraction, index) => (
        <div
          key={`row-${index}`}
          onPointerDown={handlePointerDown('row', index)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `calc(${fraction * 100}% - 6px)`,
            height: 12,
            cursor: 'ns-resize',
          }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, background: '#1677ff' }} />
        </div>
      ))}
      {colLines.map((fraction, index) => (
        <div
          key={`col-${index}`}
          onPointerDown={handlePointerDown('col', index)}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${fraction * 100}% - 6px)`,
            width: 12,
            cursor: 'ew-resize',
          }}
        >
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 6, width: 2, background: '#1677ff' }} />
        </div>
      ))}
    </div>
  )
}
