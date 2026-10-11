import { useEffect, useRef, useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { DeleteOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { SliceShape } from './useGridSlice'

interface GridSliceShapeEditorProps {
  image: HTMLImageElement
  tool: 'rect' | 'polygon'
  shapes: SliceShape[]
  onChange: (shapes: SliceShape[]) => void
}

interface Point {
  x: number
  y: number
}

type Drag =
  /** Creating or resizing a rect: the rect spans from the fixed anchor to the pointer. */
  | { kind: 'rect-anchor'; shapeId: string; anchor: Point }
  | { kind: 'vertex'; shapeId: string; vertex: number }
  | { kind: 'move'; shapeId: string; start: Point; orig: SliceShape }

const MAX_DISPLAY_WIDTH = 900
const HANDLE_PX = 5
const MIN_RECT = 2

function makeShapeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function shapeBounds(shape: SliceShape): { x: number; y: number; width: number; height: number } {
  if (shape.kind === 'rect') return shape
  const xs = shape.points.map((p) => p.x)
  const ys = shape.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * Free-form cut editor drawn as an SVG over the source image, in image-pixel
 * coordinates (viewBox = natural size). Rect tool: drag on empty space to
 * draw a box, drag its body to move, drag a corner to resize. Polygon tool:
 * click to drop points, close by clicking the first point / Enter / "Finish",
 * Backspace removes the last point, Esc cancels. Either tool can select,
 * move and delete any existing shape; the shape number is its frame order.
 */
export default function GridSliceShapeEditor({ image, tool, shapes, onChange }: GridSliceShapeEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Point[]>([])
  const [hover, setHover] = useState<Point | null>(null)

  const W = image.naturalWidth
  const H = image.naturalHeight
  const displayWidth = Math.min(MAX_DISPLAY_WIDTH, W)
  const scale = displayWidth / W
  const handleR = HANDLE_PX / scale

  // Switching tools abandons a half-drawn polygon.
  useEffect(() => setDraft([]), [tool])

  function toImage(e: { clientX: number; clientY: number }): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return { x: Math.round(Math.min(W, Math.max(0, x))), y: Math.round(Math.min(H, Math.max(0, y))) }
  }

  function updateShape(id: string, next: SliceShape) {
    onChange(shapes.map((s) => (s.id === id ? next : s)))
  }

  function removeShape(id: string) {
    onChange(shapes.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function reorderSelected(delta: number) {
    const i = shapes.findIndex((s) => s.id === selectedId)
    const j = i + delta
    if (i < 0 || j < 0 || j >= shapes.length) return
    const next = shapes.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  function finishDraft() {
    if (draft.length < 3) return
    const shape: SliceShape = { id: makeShapeId(), kind: 'polygon', points: draft }
    onChange([...shapes, shape])
    setSelectedId(shape.id)
    setDraft([])
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.focus()
    const p = toImage(e)
    const target = e.target as SVGElement
    const shapeId = target.dataset.shapeId
    const handle = target.dataset.handle

    if (tool === 'polygon' && draft.length > 0) {
      const first = draft[0]
      if (draft.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= handleR * 1.5) finishDraft()
      else setDraft([...draft, p])
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const shape = shapes.find((s) => s.id === shapeId)
    if (shape && handle !== undefined) {
      setSelectedId(shape.id)
      if (shape.kind === 'rect') {
        // Corner handles 0..3 = TL, TR, BR, BL; the anchor is the opposite corner.
        const corners = [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.width, y: shape.y },
          { x: shape.x + shape.width, y: shape.y + shape.height },
          { x: shape.x, y: shape.y + shape.height },
        ]
        dragRef.current = { kind: 'rect-anchor', shapeId: shape.id, anchor: corners[(Number(handle) + 2) % 4] }
      } else {
        dragRef.current = { kind: 'vertex', shapeId: shape.id, vertex: Number(handle) }
      }
    } else if (shape) {
      setSelectedId(shape.id)
      dragRef.current = { kind: 'move', shapeId: shape.id, start: p, orig: shape }
    } else if (tool === 'rect') {
      const created: SliceShape = { id: makeShapeId(), kind: 'rect', x: p.x, y: p.y, width: 0, height: 0 }
      onChange([...shapes, created])
      setSelectedId(created.id)
      dragRef.current = { kind: 'rect-anchor', shapeId: created.id, anchor: p }
    } else {
      setSelectedId(null)
      setDraft([p])
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toImage(e)
    if (tool === 'polygon' && draft.length > 0) setHover(p)
    const drag = dragRef.current
    if (!drag) return
    const shape = shapes.find((s) => s.id === drag.shapeId)
    if (!shape) return
    if (drag.kind === 'rect-anchor' && shape.kind === 'rect') {
      updateShape(shape.id, {
        ...shape,
        x: Math.min(drag.anchor.x, p.x),
        y: Math.min(drag.anchor.y, p.y),
        width: Math.abs(p.x - drag.anchor.x),
        height: Math.abs(p.y - drag.anchor.y),
      })
    } else if (drag.kind === 'vertex' && shape.kind === 'polygon') {
      updateShape(shape.id, { ...shape, points: shape.points.map((pt, i) => (i === drag.vertex ? p : pt)) })
    } else if (drag.kind === 'move') {
      // Clamp the whole shape inside the image.
      const b = shapeBounds(drag.orig)
      const dx = Math.min(W - b.x - b.width, Math.max(-b.x, p.x - drag.start.x))
      const dy = Math.min(H - b.y - b.height, Math.max(-b.y, p.y - drag.start.y))
      const orig = drag.orig
      updateShape(
        shape.id,
        orig.kind === 'rect'
          ? { ...orig, x: orig.x + dx, y: orig.y + dy }
          : { ...orig, points: orig.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
      )
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.kind !== 'rect-anchor') return
    // Drop accidental click-sized rects.
    const shape = shapes.find((s) => s.id === drag.shapeId)
    if (shape?.kind === 'rect' && (shape.width < MIN_RECT || shape.height < MIN_RECT)) removeShape(shape.id)
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Escape') {
      setDraft([])
      setSelectedId(null)
    } else if (e.key === 'Enter') {
      finishDraft()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      if (draft.length > 0) setDraft(draft.slice(0, -1))
      else if (selectedId) removeShape(selectedId)
    } else {
      return
    }
    e.preventDefault()
  }

  const selectedIndex = shapes.findIndex((s) => s.id === selectedId)
  const draftPreview = hover && draft.length > 0 ? [...draft, hover] : draft

  return (
    <div>
      <Space wrap size="small" style={{ marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {tool === 'rect'
            ? 'Drag on the image to draw a box. Drag a box to move it, drag a corner to resize.'
            : 'Click to add points; click the first point or press Enter to close. Backspace = undo point, Esc = cancel. Drag points to adjust.'}
        </Typography.Text>
        {tool === 'polygon' && draft.length >= 3 && (
          <Button size="small" type="primary" onClick={finishDraft}>
            Finish polygon
          </Button>
        )}
        {selectedIndex >= 0 && (
          <>
            <Typography.Text>Frame {selectedIndex + 1}</Typography.Text>
            <Button size="small" icon={<LeftOutlined />} disabled={selectedIndex === 0} onClick={() => reorderSelected(-1)}>
              Earlier
            </Button>
            <Button
              size="small"
              icon={<RightOutlined />}
              disabled={selectedIndex === shapes.length - 1}
              onClick={() => reorderSelected(1)}
            >
              Later
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeShape(selectedId!)}>
              Delete
            </Button>
          </>
        )}
        {shapes.length > 0 && (
          <Button
            size="small"
            danger
            onClick={() => {
              onChange([])
              setSelectedId(null)
            }}
          >
            Clear shapes ({shapes.length})
          </Button>
        )}
      </Space>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'block',
          width: displayWidth,
          maxWidth: '100%',
          height: 'auto',
          aspectRatio: `${W} / ${H}`,
          border: '1px solid #d9d9d9',
          cursor: 'crosshair',
          userSelect: 'none',
          touchAction: 'none',
          outline: 'none',
        }}
      >
        <image href={image.src} width={W} height={H} style={{ imageRendering: 'pixelated' }} />

        {shapes.map((shape, i) => {
          const selected = shape.id === selectedId
          const color = selected ? '#fa541c' : '#1677ff'
          const b = shapeBounds(shape)
          const common = {
            'data-shape-id': shape.id,
            fill: selected ? 'rgba(250, 84, 28, 0.15)' : 'rgba(22, 119, 255, 0.12)',
            stroke: color,
            strokeWidth: 2,
            vectorEffect: 'non-scaling-stroke' as const,
            style: { cursor: 'move' },
          }
          const handles =
            shape.kind === 'rect'
              ? [
                  { x: shape.x, y: shape.y },
                  { x: shape.x + shape.width, y: shape.y },
                  { x: shape.x + shape.width, y: shape.y + shape.height },
                  { x: shape.x, y: shape.y + shape.height },
                ]
              : shape.points
          return (
            <g key={shape.id}>
              {shape.kind === 'rect' ? (
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} {...common} />
              ) : (
                <polygon points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />
              )}
              <text
                x={b.x + 3 / scale}
                y={b.y + 14 / scale}
                fontSize={13 / scale}
                fontWeight="bold"
                fill="#fff"
                stroke="#000"
                strokeWidth={3 / scale}
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {i + 1}
              </text>
              {selected &&
                handles.map((h, hi) => (
                  <circle
                    key={hi}
                    data-shape-id={shape.id}
                    data-handle={hi}
                    cx={h.x}
                    cy={h.y}
                    r={handleR}
                    fill="#fff"
                    stroke={color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: shape.kind === 'rect' ? (hi % 2 === 0 ? 'nwse-resize' : 'nesw-resize') : 'pointer' }}
                  />
                ))}
            </g>
          )
        })}

        {draft.length > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            <polyline
              points={draftPreview.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(82, 196, 26, 0.12)"
              stroke="#52c41a"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            {draft.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === 0 && draft.length >= 3 ? handleR * 1.5 : handleR}
                fill={i === 0 ? '#52c41a' : '#fff'}
                stroke="#52c41a"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}
