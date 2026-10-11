import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Checkbox, Empty, InputNumber, Segmented, Slider, Space, Typography, Upload, message } from 'antd'
import {
  CaretRightOutlined,
  CloseOutlined,
  DownloadOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { parseSpr, type SprFile } from '../../lib/spr'

interface SprSource {
  id: string
  name: string
  spr: SprFile
  /** Each frame composed onto the sprite's full width × height canvas. */
  canvases: HTMLCanvasElement[]
  /** Union bounding box of all frames' opaque content. */
  bounds: { x: number; y: number; width: number; height: number }
}

type CropMode = 'full' | 'trim'
type Background = 'checker' | 'black' | 'white'
type BlendMode = 'normal' | 'additive' | 'transparent'

const CHECKER =
  'repeating-conic-gradient(#cfcfcf 0% 25%, #ffffff 0% 50%) 50% / 16px 16px'
const BACKGROUNDS: Record<Background, string> = { checker: CHECKER, black: '#000', white: '#fff' }

/**
 * Approximates a real alpha channel for a frame baked for additive blending
 * (opaque pixels whose color IS the "how much this glows" signal, per
 * SprPage's additive-blend explanation above): for every already-opaque
 * pixel, sets alpha to the pixel's max RGB channel (brighter = more opaque,
 * near-black = nearly transparent) and un-premultiplies the color by that
 * new alpha so the hue stays correct under normal alpha compositing instead
 * of darkening toward black as alpha drops. This is a lossy approximation —
 * the true per-pixel alpha the effect was authored with isn't recoverable
 * from additive-baked data — but it's the standard trick for making an
 * additive sprite look reasonable composited over an arbitrary background.
 */
function canvasWithBrightnessAlpha(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const srcCtx = source.getContext('2d')
  const outCtx = out.getContext('2d')
  if (!srcCtx || !outCtx) return out
  const imageData = srcCtx.getImageData(0, 0, source.width, source.height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const alpha = Math.max(data[i], data[i + 1], data[i + 2])
    if (alpha === 0) {
      data[i + 3] = 0
      continue
    }
    data[i] = Math.min(255, Math.round((data[i] * 255) / alpha))
    data[i + 1] = Math.min(255, Math.round((data[i + 1] * 255) / alpha))
    data[i + 2] = Math.min(255, Math.round((data[i + 2] * 255) / alpha))
    data[i + 3] = alpha
  }
  outCtx.putImageData(imageData, 0, 0)
  return out
}

function buildSource(file: File, buffer: ArrayBuffer): SprSource {
  const spr = parseSpr(buffer)
  let minX = spr.width
  let minY = spr.height
  let maxX = 0
  let maxY = 0
  const canvases = spr.frames.map((f) => {
    const canvas = document.createElement('canvas')
    canvas.width = spr.width
    canvas.height = spr.height
    if (f.width > 0 && f.height > 0) {
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), f.offsetX, f.offsetY)
      minX = Math.min(minX, f.offsetX)
      minY = Math.min(minY, f.offsetY)
      maxX = Math.max(maxX, f.offsetX + f.width)
      maxY = Math.max(maxY, f.offsetY + f.height)
    }
    return canvas
  })
  const bounds =
    maxX > minX && maxY > minY
      ? { x: minX, y: minY, width: Math.min(maxX, spr.width) - minX, height: Math.min(maxY, spr.height) - minY }
      : { x: 0, y: 0, width: spr.width, height: spr.height }
  return { id: crypto.randomUUID(), name: file.name, spr, canvases, bounds }
}

/**
 * SPR tab: open Kingsoft-engine `.spr` sprites (JX / Võ Lâm), play them, and
 * export all frames as one PNG sprite sheet at a chosen frame size.
 */
export default function SprPage() {
  const [sources, setSources] = useState<SprSource[]>([])

  async function handleUpload(file: File): Promise<boolean> {
    try {
      const source = buildSource(file, await file.arrayBuffer())
      setSources((prev) => [...prev, source])
    } catch (err) {
      message.error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return false
  }

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Open Kingsoft-engine .spr sprites (JX / Võ Lâm Truyền Kỳ), play the animation, and export all frames as a PNG
        sprite sheet with a custom frame width and height.
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }}>
        <Upload accept=".spr" multiple showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />}>Upload .spr files</Button>
        </Upload>
        {sources.length > 0 && (
          <Button danger onClick={() => setSources([])}>
            Clear all
          </Button>
        )}
      </Space>

      {sources.length === 0 && <Empty description="Upload .spr files to view and export them" />}

      {sources.map((source) => (
        <SprViewer
          key={source.id}
          source={source}
          onRemove={() => setSources((prev) => prev.filter((s) => s.id !== source.id))}
        />
      ))}
    </div>
  )
}

function SprViewer({ source, onRemove }: { source: SprSource; onRemove: () => void }) {
  const { spr, canvases, bounds } = source
  const directions = Math.max(1, spr.directions)
  const framesPerDir = Math.max(1, Math.floor(canvases.length / directions))

  const [direction, setDirection] = useState(0)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [frameMs, setFrameMs] = useState(200)
  const [zoom, setZoom] = useState(1)
  const [background, setBackground] = useState<Background>('checker')
  // Many VLTK skill-effect .spr files (fire/glow) are authored as opaque
  // (alpha 0 or 255 only) RGBA where the "faded" edge of the effect is baked
  // in as near-black opaque pixels, meant to be additively blended onto the
  // game's scene (black contributes nothing when added) rather than alpha-
  // composited — alpha-compositing them normally leaves a hard dark fringe
  // around the effect, since the dark edge pixels are fully opaque, not
  // partially transparent. This toggle only affects the live preview canvas
  // (draws with globalCompositeOperation 'lighter' onto a black backdrop,
  // which is what additive blending needs to read correctly) — PNG export
  // always writes the frame's real stored RGBA untouched, since that's the
  // data a game engine's own additive-blend renderer expects to receive.
  const [blendMode, setBlendMode] = useState<BlendMode>('normal')
  const [cropMode, setCropMode] = useState<CropMode>('trim')
  const [outWidth, setOutWidth] = useState<number | null>(null)
  const [outHeight, setOutHeight] = useState<number | null>(null)
  const [keepAspect, setKeepAspect] = useState(true)
  const [smooth, setSmooth] = useState(true)
  const [columns, setColumns] = useState<number | null>(null)
  const [exportScope, setExportScope] = useState<'all' | 'direction'>('all')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const crop = cropMode === 'trim' ? bounds : { x: 0, y: 0, width: spr.width, height: spr.height }
  const frameW = outWidth ?? crop.width
  const frameH = outHeight ?? crop.height
  const frameIndex = direction * framesPerDir + frame

  const exportFrames = useMemo(() => {
    if (exportScope === 'direction') return canvases.slice(direction * framesPerDir, (direction + 1) * framesPerDir)
    return canvases
  }, [canvases, exportScope, direction, framesPerDir])
  const sheetCols = Math.max(1, Math.min(columns ?? framesPerDir, exportFrames.length))
  const sheetRows = Math.ceil(exportFrames.length / sheetCols)

  // Precomputes the brightness-alpha version of every frame once per source
  // (not per-frame-change) so switching to the "Transparent" preview mode or
  // scrubbing frames while it's active doesn't redo the pixel conversion
  // each time — same conversion downloadSheet(true) applies at export time,
  // so what's previewed here matches what gets downloaded.
  const transparentCanvases = useMemo(() => canvases.map(canvasWithBrightnessAlpha), [canvases])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setFrame((i) => (i + 1) % framesPerDir), frameMs)
    return () => clearInterval(timer)
  }, [playing, frameMs, framesPerDir])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const src = blendMode === 'transparent' ? transparentCanvases[frameIndex] : canvases[frameIndex]
    if (!canvas || !ctx || !src) return
    ctx.imageSmoothingEnabled = smooth
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (blendMode === 'additive') {
      // 'lighter' adds source+destination color per channel (clamped), so
      // black edge pixels contribute nothing and only truly bright pixels
      // show — matching how the game engine composites this effect. Needs
      // an opaque backdrop first since additive onto transparent still
      // leaves the dark pixels' alpha visible as a faint fringe.
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'lighter'
    } else {
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.drawImage(src, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
  }, [
    canvases,
    transparentCanvases,
    frameIndex,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    frameW,
    frameH,
    zoom,
    smooth,
    blendMode,
  ])

  function setWidth(value: number | null) {
    setOutWidth(value)
    if (keepAspect) setOutHeight(value == null ? null : Math.max(1, Math.round((value * crop.height) / crop.width)))
  }

  function setHeight(value: number | null) {
    setOutHeight(value)
    if (keepAspect) setOutWidth(value == null ? null : Math.max(1, Math.round((value * crop.width) / crop.height)))
  }

  function changeCropMode(mode: CropMode) {
    setCropMode(mode)
    setOutWidth(null)
    setOutHeight(null)
  }

  function downloadSheet(useBrightnessAlpha = false) {
    const frames = useBrightnessAlpha ? exportFrames.map(canvasWithBrightnessAlpha) : exportFrames
    const sheet = document.createElement('canvas')
    sheet.width = frameW * sheetCols
    sheet.height = frameH * sheetRows
    const ctx = sheet.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = smooth
    ctx.imageSmoothingQuality = 'high'
    frames.forEach((src, i) => {
      const x = (i % sheetCols) * frameW
      const y = Math.floor(i / sheetCols) * frameH
      ctx.drawImage(src, crop.x, crop.y, crop.width, crop.height, x, y, frameW, frameH)
    })
    sheet.toBlob((blob) => {
      if (!blob) return
      const base = source.name.replace(/\.spr$/i, '')
      const suffix = exportScope === 'direction' && directions > 1 ? `_dir${direction}` : ''
      const alphaSuffix = useBrightnessAlpha ? '_transparent' : ''
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${base}${suffix}${alphaSuffix}_${frameW}x${frameH}_${sheetCols}x${sheetRows}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  return (
    <Card
      size="small"
      title={source.name}
      extra={<Button size="small" danger icon={<CloseOutlined />} onClick={onRemove} />}
      style={{ marginBottom: 16 }}
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Canvas {spr.width}×{spr.height} · center ({spr.centerX}, {spr.centerY}) · {canvases.length} frames ·{' '}
        {directions} direction{directions > 1 ? 's' : ''} · content {bounds.width}×{bounds.height} at ({bounds.x},{' '}
        {bounds.y})
      </Typography.Text>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ maxWidth: '100%', overflow: 'auto' }}>
          <canvas
            ref={canvasRef}
            width={Math.max(1, Math.round(frameW * zoom))}
            height={Math.max(1, Math.round(frameH * zoom))}
            style={{ display: 'block', background: BACKGROUNDS[background], border: '1px solid #d9d9d9' }}
          />
        </div>

        <Space direction="vertical" size="middle" style={{ minWidth: 300, flex: 1 }}>
          <Space wrap>
            <Button size="small" icon={<StepBackwardOutlined />} onClick={() => {
              setPlaying(false)
              setFrame((i) => (i - 1 + framesPerDir) % framesPerDir)
            }} />
            <Button
              size="small"
              type="primary"
              icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button size="small" icon={<StepForwardOutlined />} onClick={() => {
              setPlaying(false)
              setFrame((i) => (i + 1) % framesPerDir)
            }} />
            <Typography.Text type="secondary">
              Frame {frame + 1}/{framesPerDir}
            </Typography.Text>
          </Space>
          <Slider
            min={0}
            max={framesPerDir - 1}
            value={frame}
            onChange={(value) => {
              setPlaying(false)
              setFrame(value)
            }}
          />
          <Space wrap>
            {directions > 1 && (
              <>
                <Typography.Text type="secondary">Direction</Typography.Text>
                <InputNumber
                  size="small"
                  min={0}
                  max={directions - 1}
                  value={direction}
                  onChange={(value) => setDirection(value ?? 0)}
                  style={{ width: 64 }}
                />
              </>
            )}
            <Typography.Text type="secondary">Frame ms</Typography.Text>
            <InputNumber size="small" min={16} max={2000} value={frameMs} onChange={(v) => setFrameMs(v ?? 200)} style={{ width: 80 }} />
            <Typography.Text type="secondary">Zoom</Typography.Text>
            <Segmented
              size="small"
              value={zoom}
              onChange={(v) => setZoom(v as number)}
              options={[0.5, 1, 2, 3].map((z) => ({ label: `${z}×`, value: z }))}
            />
            <Segmented
              size="small"
              value={background}
              onChange={(v) => setBackground(v as Background)}
              disabled={blendMode === 'additive'}
              options={[
                { label: 'Checker', value: 'checker' },
                { label: 'Black', value: 'black' },
                { label: 'White', value: 'white' },
              ]}
            />
            <Typography.Text type="secondary">Blend</Typography.Text>
            <Segmented
              size="small"
              value={blendMode}
              onChange={(v) => setBlendMode(v as BlendMode)}
              options={[
                { label: 'Normal', value: 'normal' },
                { label: 'Additive', value: 'additive' },
                { label: 'Transparent', value: 'transparent' },
              ]}
            />
          </Space>
          {blendMode === 'additive' && (
            <Typography.Text type="secondary" style={{ display: 'block' }}>
              Additive preview: dark edge pixels blend away against black, matching how the game composites glow/fire
              effects. Exported PNGs still contain the raw stored pixels (opaque dark fringe included) — apply an
              additive/"Add" or "Lighten" blend mode when using the exported sheet in-engine.
            </Typography.Text>
          )}
          {blendMode === 'transparent' && (
            <Typography.Text type="secondary" style={{ display: 'block' }}>
              Transparent preview: shows the same brightness-as-alpha approximation as the "Download transparent"
              button below — dark edge pixels fade out instead of staying opaque black. An approximation, not a
              lossless recovery of the original design.
            </Typography.Text>
          )}

          <Card size="small" title="Export sprite sheet (.png)">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space wrap>
                <Typography.Text type="secondary">Area</Typography.Text>
                <Segmented
                  size="small"
                  value={cropMode}
                  onChange={(v) => changeCropMode(v as CropMode)}
                  options={[
                    { label: `Trim to content (${bounds.width}×${bounds.height})`, value: 'trim' },
                    { label: `Full canvas (${spr.width}×${spr.height})`, value: 'full' },
                  ]}
                />
              </Space>
              <Space wrap>
                <Typography.Text type="secondary">Frame size</Typography.Text>
                <InputNumber size="small" min={1} max={4096} placeholder={String(crop.width)} value={outWidth ?? undefined} onChange={setWidth} style={{ width: 90 }} />
                <Typography.Text type="secondary">×</Typography.Text>
                <InputNumber size="small" min={1} max={4096} placeholder={String(crop.height)} value={outHeight ?? undefined} onChange={setHeight} style={{ width: 90 }} />
                <Checkbox checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)}>
                  Keep aspect
                </Checkbox>
                <Button size="small" onClick={() => {
                  setOutWidth(null)
                  setOutHeight(null)
                }}>
                  Reset
                </Button>
              </Space>
              <Space wrap>
                <Typography.Text type="secondary">Columns</Typography.Text>
                <InputNumber size="small" min={1} max={exportFrames.length} placeholder={String(framesPerDir)} value={columns ?? undefined} onChange={(v) => setColumns(v ?? null)} style={{ width: 70 }} />
                {directions > 1 && (
                  <Segmented
                    size="small"
                    value={exportScope}
                    onChange={(v) => setExportScope(v as 'all' | 'direction')}
                    options={[
                      { label: 'All directions', value: 'all' },
                      { label: `Direction ${direction} only`, value: 'direction' },
                    ]}
                  />
                )}
                <Checkbox checked={smooth} onChange={(e) => setSmooth(e.target.checked)}>
                  Smooth scaling
                </Checkbox>
              </Space>
              <Space wrap>
                <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadSheet(false)}>
                  Download PNG
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => downloadSheet(true)}>
                  Download transparent (from brightness)
                </Button>
                <Typography.Text type="secondary">
                  {exportFrames.length} frames · {sheetCols}×{sheetRows} grid · {frameW}×{frameH} per frame ·{' '}
                  {frameW * sheetCols}×{frameH * sheetRows} px
                </Typography.Text>
              </Space>
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                "Download transparent" approximates real transparency for effects baked for additive blending
                (dark edge pixels become faded instead of opaque black) by using each pixel's brightness as its
                alpha — an approximation, not a lossless recovery of the original design.
              </Typography.Text>
            </Space>
          </Card>
        </Space>
      </div>
    </Card>
  )
}
