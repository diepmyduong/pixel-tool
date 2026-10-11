import { useEffect, useRef, useState } from 'react'
import { Button, InputNumber, Space, Switch, Typography } from 'antd'
import {
  CaretRightOutlined,
  DownloadOutlined,
  PauseOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  SwapOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons'
import {
  exportCanvasSize,
  frameFileName,
  fullPosition,
  type CellTransform,
  type GridSliceCell,
} from './useGridSlice'

interface GridSlicePlayerProps {
  cells: GridSliceCell[]
  onTransformChange: (cellIndex: number, patch: Partial<CellTransform>) => void
  onApplyToAll: (patch: Partial<CellTransform>) => void
  onResetTransforms: () => void
  smoothScale: boolean
  onSmoothScaleChange: (smooth: boolean) => void
  frameWidth: number | null
  frameHeight: number | null
  onFrameSizeChange: (width: number | null, height: number | null) => void
  exporting: boolean
  onDownloadSheet: (columns: number) => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8

const MAX_STAGE_SIZE = 320
const STAGE_PADDING = 4
const THUMB_SIZE = 64

/**
 * Frame review for one image's sliced cells: play/loop them as an animation,
 * step through frames, and nudge each frame's content inside its own cell —
 * drag on the stage or use the arrow keys (Shift = 10px) — and scale it
 * (+/- keys, 5% steps). An onion skin of the previous frame helps line frames
 * up while paused. Can also export all frames as one sprite-sheet image.
 */
export default function GridSlicePlayer({
  cells,
  onTransformChange,
  onApplyToAll,
  onResetTransforms,
  smoothScale,
  onSmoothScaleChange,
  frameWidth,
  frameHeight,
  onFrameSizeChange,
  exporting,
  onDownloadSheet,
}: GridSlicePlayerProps) {
  const [sheetColumns, setSheetColumns] = useState<number | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [frameMs, setFrameMs] = useState(150)
  const [onion, setOnion] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null)

  const frameCount = cells.length
  const current = cells[Math.min(frame, frameCount - 1)]
  // The stage uses the same layout as the export, auto-fitted so every
  // frame's whole content is visible, plus a little padding.
  const autoSize = exportCanvasSize(cells, null, null)
  const downloadSize = exportCanvasSize(cells, frameWidth, frameHeight)
  const stageW = autoSize.width + STAGE_PADDING * 2
  const stageH = autoSize.height + STAGE_PADDING * 2
  const cropped = downloadSize.width < autoSize.width || downloadSize.height < autoSize.height
  const [zoom, setZoom] = useState(() => Math.max(1, Math.floor(MAX_STAGE_SIZE / Math.max(stageW, stageH))))

  useEffect(() => {
    if (frame >= frameCount) setFrame(0)
  }, [frame, frameCount])

  useEffect(() => {
    if (!playing || frameCount === 0) return
    const timer = setInterval(() => {
      setFrame((i) => {
        if (i + 1 < frameCount) return i + 1
        if (loop) return 0
        setPlaying(false)
        return i
      })
    }, frameMs)
    return () => clearInterval(timer)
  }, [playing, loop, frameMs, frameCount])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !current) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    function drawCell(cell: GridSliceCell) {
      if (!ctx) return
      const { x, y } = fullPosition(cell, stageW, stageH)
      ctx.drawImage(cell.full, x * zoom, y * zoom, cell.full.width * zoom, cell.full.height * zoom)
    }

    const prev = cells[(frame - 1 + frameCount) % frameCount]
    if (onion && !playing && frameCount > 1 && prev) {
      ctx.globalAlpha = 0.3
      drawCell(prev)
      ctx.globalAlpha = 1
    }
    drawCell(current)
  }, [cells, current, frame, frameCount, onion, playing, stageW, stageH, zoom])

  if (!current) return null

  function nudge(dx: number, dy: number) {
    onTransformChange(current.index, { offsetX: current.offsetX + dx, offsetY: current.offsetY + dy })
  }

  function setScale(scale: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 100) / 100))
    onTransformChange(current.index, { scale: clamped })
  }

  /** Sets rotation normalized to (-180, 180]. */
  function setRotation(degrees: number) {
    let r = Math.round(degrees) % 360
    if (r > 180) r -= 360
    if (r <= -180) r += 360
    onTransformChange(current.index, { rotation: r })
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    setPlaying(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    dragRef.current = { pointerX: e.clientX, pointerY: e.clientY, offsetX: current.offsetX, offsetY: current.offsetY }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = Math.round((e.clientX - drag.pointerX) / zoom)
    const dy = Math.round((e.clientY - drag.pointerY) / zoom)
    onTransformChange(current.index, { offsetX: drag.offsetX + dx, offsetY: drag.offsetY + dy })
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      setPlaying(false)
      nudge(move[0], move[1])
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault()
      setPlaying(false)
      setScale(current.scale + (e.key === '-' ? -0.05 : 0.05))
    } else if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
      e.preventDefault()
      setPlaying(false)
      const amount = e.shiftKey ? 15 : 1
      setRotation(current.rotation + (e.key === '[' || e.key === '{' ? -amount : amount))
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault()
      onTransformChange(current.index, { flipX: !current.flipX })
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault()
      onTransformChange(current.index, { flipY: !current.flipY })
    } else if (e.key === ',' || e.key === '.') {
      e.preventDefault()
      setPlaying(false)
      setFrame((i) => (i + (e.key === '.' ? 1 : -1) + frameCount) % frameCount)
    }
  }

  function step(delta: number) {
    setPlaying(false)
    setFrame((i) => (i + delta + frameCount) % frameCount)
  }

  return (
    <div style={{ marginTop: 16 }}>
      <Space align="start" wrap size="large">
        <Space direction="vertical" size="small">
          <canvas
            ref={canvasRef}
            width={stageW * zoom}
            height={stageH * zoom}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            title="Drag or use arrow keys (Shift = 10px) to move this frame's content. , / . = prev/next frame"
            style={{
              display: 'block',
              cursor: 'move',
              imageRendering: 'pixelated',
              border: '1px solid #333',
              background: 'repeating-conic-gradient(#80808033 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
              outline: 'none',
            }}
          />
          <Space wrap size="small">
            <Button size="small" icon={<StepBackwardOutlined />} onClick={() => step(-1)} />
            <Button
              size="small"
              type="primary"
              icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
              onClick={() => {
                if (!playing && !loop && frame >= frameCount - 1) setFrame(0)
                setPlaying(!playing)
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button size="small" icon={<StepForwardOutlined />} onClick={() => step(1)} />
            <Typography.Text type="secondary">
              {frame + 1}/{frameCount}
            </Typography.Text>
          </Space>
        </Space>

        <Space direction="vertical" size="small">
          <Space size="small" wrap>
            <Switch checked={loop} onChange={setLoop} checkedChildren="Loop" unCheckedChildren="Once" size="small" />
            <Switch checked={onion} onChange={setOnion} checkedChildren="Onion" unCheckedChildren="Onion" size="small" />
          </Space>
          <Space size="small">
            <Typography.Text type="secondary">Frame</Typography.Text>
            <InputNumber
              size="small"
              min={16}
              max={2000}
              step={10}
              value={frameMs}
              onChange={(value) => setFrameMs(value ?? frameMs)}
              addonAfter="ms"
              style={{ width: 110 }}
            />
            <Typography.Text type="secondary">Zoom</Typography.Text>
            <InputNumber
              size="small"
              min={1}
              max={20}
              value={zoom}
              onChange={(value) => setZoom(value ?? zoom)}
              addonAfter="x"
              style={{ width: 80 }}
            />
          </Space>
          <Typography.Text strong>Frame {frame + 1}</Typography.Text>
          <Space size="small" wrap>
            <Typography.Text type="secondary">Position</Typography.Text>
            <InputNumber
              size="small"
              value={current.offsetX}
              onChange={(value) => onTransformChange(current.index, { offsetX: value ?? 0 })}
              addonBefore="X"
              style={{ width: 100 }}
            />
            <InputNumber
              size="small"
              value={current.offsetY}
              onChange={(value) => onTransformChange(current.index, { offsetY: value ?? 0 })}
              addonBefore="Y"
              style={{ width: 100 }}
            />
          </Space>
          <Space size="small" wrap>
            <Typography.Text type="secondary">Size</Typography.Text>
            <Button size="small" onClick={() => setScale(current.scale - 0.05)}>
              −
            </Button>
            <InputNumber
              size="small"
              min={MIN_SCALE * 100}
              max={MAX_SCALE * 100}
              step={5}
              value={Math.round(current.scale * 100)}
              onChange={(value) => setScale((value ?? 100) / 100)}
              addonAfter="%"
              style={{ width: 100 }}
            />
            <Button size="small" onClick={() => setScale(current.scale + 0.05)}>
              +
            </Button>
          </Space>
          <Space size="small" wrap>
            <Typography.Text type="secondary">Rotate</Typography.Text>
            <Button
              size="small"
              icon={<RotateLeftOutlined />}
              title="-90°"
              onClick={() => setRotation(current.rotation - 90)}
            />
            <Button size="small" title="-1°" onClick={() => setRotation(current.rotation - 1)}>
              −1°
            </Button>
            <InputNumber
              size="small"
              min={-180}
              max={180}
              step={1}
              value={current.rotation}
              onChange={(value) => setRotation(value ?? 0)}
              addonAfter="°"
              style={{ width: 100 }}
            />
            <Button size="small" title="+1°" onClick={() => setRotation(current.rotation + 1)}>
              +1°
            </Button>
            <Button
              size="small"
              icon={<RotateRightOutlined />}
              title="+90°"
              onClick={() => setRotation(current.rotation + 90)}
            />
          </Space>
          <Space size="small" wrap>
            <Typography.Text type="secondary">Flip</Typography.Text>
            <Button
              size="small"
              type={current.flipX ? 'primary' : 'default'}
              icon={<SwapOutlined />}
              onClick={() => onTransformChange(current.index, { flipX: !current.flipX })}
            >
              Horizontal
            </Button>
            <Button
              size="small"
              type={current.flipY ? 'primary' : 'default'}
              icon={<SwapOutlined rotate={90} />}
              onClick={() => onTransformChange(current.index, { flipY: !current.flipY })}
            >
              Vertical
            </Button>
          </Space>
          <Space size="small" wrap>
            <Button
              size="small"
              onClick={() =>
                onApplyToAll({
                  scale: current.scale,
                  rotation: current.rotation,
                  flipX: current.flipX,
                  flipY: current.flipY,
                })
              }
            >
              Apply size/rotate/flip to all
            </Button>
            <Button
              size="small"
              onClick={() =>
                onTransformChange(current.index, {
                  offsetX: 0,
                  offsetY: 0,
                  scale: 1,
                  rotation: 0,
                  flipX: false,
                  flipY: false,
                })
              }
            >
              Reset frame
            </Button>
            <Button size="small" onClick={onResetTransforms}>
              Reset all frames
            </Button>
            <Switch
              size="small"
              checked={smoothScale}
              onChange={onSmoothScaleChange}
              checkedChildren="Smooth"
              unCheckedChildren="Pixel"
            />
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Drag the frame or click it and use arrow keys (Shift = 10px), +/− to resize, [ / ] to rotate 1° (Shift = 15°),
            H / V to flip, , / . to change frame.
            <br />
            Pixel = crisp nearest-neighbor (best at 200%, 300%…, 90° turns); Smooth = cleaner at odd sizes/angles.
          </Typography.Text>
          <Space size="small" wrap style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">Download size (W x H)</Typography.Text>
            <InputNumber
              size="small"
              min={1}
              max={4096}
              placeholder={`${autoSize.width}`}
              value={frameWidth}
              onChange={(value) => onFrameSizeChange(value, frameHeight)}
              addonBefore="W"
              style={{ width: 100 }}
            />
            <InputNumber
              size="small"
              min={1}
              max={4096}
              placeholder={`${autoSize.height}`}
              value={frameHeight}
              onChange={(value) => onFrameSizeChange(frameWidth, value)}
              addonBefore="H"
              style={{ width: 100 }}
            />
            <Button size="small" onClick={() => onFrameSizeChange(null, null)}>
              Auto (fit all)
            </Button>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Download = exactly what the player shows, every frame on one {downloadSize.width} x {downloadSize.height}{' '}
            canvas. Empty = auto-fit so nothing is cropped.
          </Typography.Text>
          {cropped && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Download size is smaller than the content ({autoSize.width} x {autoSize.height}) — edges will be cropped.
            </Typography.Text>
          )}
          <Space size="small" wrap>
            <Typography.Text type="secondary">Sheet columns</Typography.Text>
            <InputNumber
              size="small"
              min={1}
              max={frameCount}
              placeholder={`${frameCount}`}
              value={sheetColumns}
              onChange={(value) => setSheetColumns(value)}
              style={{ width: 80 }}
            />
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={() => onDownloadSheet(sheetColumns ?? 0)}
            >
              Download sprite sheet
            </Button>
          </Space>
        </Space>
      </Space>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {cells.map((cell, i) => {
          const selected = i === frame
          const moved =
            cell.offsetX !== 0 ||
            cell.offsetY !== 0 ||
            cell.scale !== 1 ||
            cell.rotation !== 0 ||
            cell.flipX ||
            cell.flipY
          return (
            <div
              key={cell.index}
              onClick={() => {
                setPlaying(false)
                setFrame(i)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                border: selected ? '2px solid #1677ff' : '1px solid #333',
                borderRadius: 4,
                padding: 4,
                width: THUMB_SIZE + 16,
                cursor: 'pointer',
              }}
            >
              <img
                src={cell.url}
                alt={`Cell ${cell.index}`}
                style={{
                  maxWidth: THUMB_SIZE,
                  maxHeight: THUMB_SIZE,
                  imageRendering: 'pixelated',
                  background: 'repeating-conic-gradient(#80808033 0% 25%, transparent 0% 50%) 50% / 12px 12px',
                }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>
                {frameFileName(cell)}
              </Typography.Text>
              {moved && (
                <Typography.Text style={{ fontSize: 10, color: '#1677ff' }}>
                  {cell.offsetX},{cell.offsetY}
                  {cell.scale !== 1 && ` · ${Math.round(cell.scale * 100)}%`}
                  {cell.rotation !== 0 && ` · ${cell.rotation}°`}
                  {cell.flipX && ' · ↔'}
                  {cell.flipY && ' · ↕'}
                </Typography.Text>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
