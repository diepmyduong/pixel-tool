import { useState } from 'react'
import { message } from 'antd'
import JSZip from 'jszip'
import { canvasToBlob } from '../../lib/imageProcessing'

export interface GridSliceCell {
  index: number
  /** The untouched crop straight from the source image. */
  raw: HTMLCanvasElement
  /** Pixel shift of the content inside its own frame (transparent fill, content past the edge is clipped). */
  offsetX: number
  offsetY: number
  /** Content zoom around the frame's center (1 = 100%); the frame size itself never changes. */
  scale: number
  /** Content rotation around its center, degrees clockwise. */
  rotation: number
  flipX: boolean
  flipY: boolean
  /** The frame the offsets are relative to (image's Download size, or this cell's own cut size); frames are aligned on its center. */
  frameW: number
  frameH: number
  /** The whole transformed content, never clipped — what the player/thumbnails show. */
  full: HTMLCanvasElement
  /** Position of `full`'s top-left relative to the frame's top-left. */
  fullX: number
  fullY: number
  /** Data URL of `full`. */
  url: string
}

/** How an image is cut: an even/draggable grid, or free-form shapes the user draws. */
export type GridSliceMode = 'grid' | 'rect' | 'polygon'

/** A user-drawn cut region, in source-image pixels. Array order = frame order. */
export type SliceShape =
  | { id: string; kind: 'rect'; x: number; y: number; width: number; height: number }
  | { id: string; kind: 'polygon'; points: { x: number; y: number }[] }

export interface GridSliceImage {
  id: string
  file: File
  image: HTMLImageElement
  imageUrl: string
  /** This image's own grid size; starts from the shared default and can be changed per image. */
  rows: number
  cols: number
  /** Interior horizontal/vertical divider positions, as fractions of image height/width (0..1), draggable independently of `rows`/`cols`. */
  rowLines: number[]
  colLines: number[]
  /** 'grid' slices by rowLines/colLines; 'rect'/'polygon' slice by `shapes` (the mode only picks the drawing tool — both kinds can coexist). */
  mode: GridSliceMode
  shapes: SliceShape[]
  /** Bilinear vs nearest-neighbor when a frame's content is scaled. */
  smoothScale: boolean
  /** Download canvas size for every frame of this image (frames centered, not stretched); null = auto-fit so nothing is cropped. Only affects exports. */
  frameWidth: number | null
  frameHeight: number | null
  cells: GridSliceCell[]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Resizes a canvas to fixed output dimensions (nearest-neighbor, for pixel art). Null width/height keeps that axis's own size. */
function resizeCanvas(canvas: HTMLCanvasElement, width: number | null, height: number | null): HTMLCanvasElement {
  if (width === null && height === null) return canvas
  const outWidth = width ?? canvas.width
  const outHeight = height ?? canvas.height
  if (outWidth === canvas.width && outHeight === canvas.height) return canvas
  const out = document.createElement('canvas')
  out.width = outWidth
  out.height = outHeight
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, 0, 0, outWidth, outHeight)
  return out
}

/** Evenly-spaced interior line positions (fractions of 0..1) for `count` cells — e.g. count=4 gives [0.25, 0.5, 0.75]. */
function evenLines(count: number): number[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) => (i + 1) / count)
}

/** Sorted [0, ...lines, 1] boundary list a set of interior line fractions divides the 0..1 span into. */
function boundaries(lines: number[]): number[] {
  return [0, ...[...lines].sort((a, b) => a - b), 1]
}

/** Export file name of one frame: frame_1.png, frame_2.png, ... */
export function frameFileName(cell: GridSliceCell): string {
  return `frame_${cell.index}.png`
}

function baseNameOf(img: GridSliceImage): string {
  return img.file.name.replace(/\.[^./]+$/, '')
}

export interface CellTransform {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
}

const IDENTITY: CellTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, flipX: false, flipY: false }

function isIdentity(t: CellTransform): boolean {
  return (Object.keys(IDENTITY) as (keyof CellTransform)[]).every((k) => t[k] === IDENTITY[k])
}

/** Per-image settings that affect how every cell is rendered. */
interface RenderOptions {
  smoothScale: boolean
  frameWidth: number | null
  frameHeight: number | null
}

/** Scaled content size and the top-left where it sits (before rotate/flip) inside an outW x outH frame. */
function contentPlacement(raw: HTMLCanvasElement, t: CellTransform, outW: number, outH: number) {
  const w = Math.round(raw.width * t.scale)
  const h = Math.round(raw.height * t.scale)
  const x = Math.round((outW - w) / 2) + t.offsetX
  const y = Math.round((outH - h) / 2) + t.offsetY
  return { w, h, x, y }
}

/**
 * Draws `raw` scaled, flipped and rotated around its center, then shifted by
 * the offset, into a transparent outW x outH canvas with the content
 * centered (anything past the edges is clipped). `smooth` picks bilinear
 * (clean at odd scales/angles like 75% or 15°) vs nearest-neighbor (crisp
 * pixel art, best at whole-number scales and 90° turns).
 */
function renderTransform(
  raw: HTMLCanvasElement,
  t: CellTransform,
  outW: number,
  outH: number,
  smooth: boolean
): HTMLCanvasElement {
  if (isIdentity(t) && outW === raw.width && outH === raw.height) return raw
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = smooth && (t.scale !== 1 || t.rotation % 90 !== 0)
  ctx.imageSmoothingQuality = 'high'
  const { w, h, x, y } = contentPlacement(raw, t, outW, outH)
  // Top-left snapped to whole pixels (as without rotation), then pivot on the content's center.
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((t.rotation * Math.PI) / 180)
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1)
  ctx.drawImage(raw, -w / 2, -h / 2, w, h)
  return out
}

function makeCell(index: number, raw: HTMLCanvasElement, t: CellTransform, opts: RenderOptions): GridSliceCell {
  const frameW = opts.frameWidth ?? raw.width
  const frameH = opts.frameHeight ?? raw.height

  // The whole transformed content on a canvas just big enough for it (same
  // parity as the content so it stays on whole pixels), plus where it sits
  // relative to the frame. Player, thumbnails and exports all draw this.
  const { w, h, x, y } = contentPlacement(raw, t, frameW, frameH)
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  let fullW = Math.ceil(w * cos + h * sin - 1e-6)
  let fullH = Math.ceil(w * sin + h * cos - 1e-6)
  if ((fullW - w) % 2 !== 0) fullW++
  if ((fullH - h) % 2 !== 0) fullH++
  fullW = Math.max(1, fullW)
  fullH = Math.max(1, fullH)
  const full = renderTransform(raw, { ...t, offsetX: 0, offsetY: 0 }, fullW, fullH, opts.smoothScale)

  return {
    index,
    raw,
    ...t,
    frameW,
    frameH,
    full,
    fullX: x - (fullW - w) / 2,
    fullY: y - (fullH - h) / 2,
    url: full.toDataURL('image/png'),
  }
}

function transformOf(cell: GridSliceCell): CellTransform {
  const { offsetX, offsetY, scale, rotation, flipX, flipY } = cell
  return { offsetX, offsetY, scale, rotation, flipX, flipY }
}

/**
 * Size of the canvas every frame of an image is exported on, with frames
 * aligned on their frame centers — the same layout the player shows. An axis
 * with a Download size uses it (content past it is cropped); an unset axis
 * auto-fits the union of all frames' content so nothing is ever cropped.
 */
export function exportCanvasSize(
  cells: GridSliceCell[],
  frameWidth: number | null,
  frameHeight: number | null
): { width: number; height: number } {
  const half = (axis: 'x' | 'y') =>
    Math.max(
      0.5,
      ...cells.map((c) => {
        const f = axis === 'x' ? c.frameW : c.frameH
        const pos = axis === 'x' ? c.fullX : c.fullY
        const size = axis === 'x' ? c.full.width : c.full.height
        return Math.max(f / 2, f / 2 - pos, pos + size - f / 2)
      })
    )
  return {
    width: frameWidth ?? Math.ceil(half('x') * 2),
    height: frameHeight ?? Math.ceil(half('y') * 2),
  }
}

/** Where a cell's `full` canvas goes on a width x height canvas whose center is the frame center. */
export function fullPosition(cell: GridSliceCell, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.floor((width - cell.frameW) / 2) + cell.fullX,
    y: Math.floor((height - cell.frameH) / 2) + cell.fullY,
  }
}

/** Renders every frame of an image onto same-size export canvases (see exportCanvasSize). */
function renderExportFrames(img: GridSliceImage): HTMLCanvasElement[] {
  const { width, height } = exportCanvasSize(img.cells, img.frameWidth, img.frameHeight)
  return img.cells.map((cell) => {
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    const { x, y } = fullPosition(cell, width, height)
    ctx.drawImage(cell.full, x, y)
    return out
  })
}

function cropGrid(img: GridSliceImage): HTMLCanvasElement[] {
  // Snap cut lines to whole pixels: a fractional source rect drawn into a
  // rounded-size canvas gets resampled, duplicating/dropping pixel rows.
  const yBounds = boundaries(img.rowLines).map((f) => Math.round(f * img.image.height))
  const xBounds = boundaries(img.colLines).map((f) => Math.round(f * img.image.width))
  const out: HTMLCanvasElement[] = []
  for (let r = 0; r < yBounds.length - 1; r++) {
    for (let c = 0; c < xBounds.length - 1; c++) {
      const sx = xBounds[c]
      const sy = yBounds[r]
      const sw = xBounds[c + 1] - sx
      const sh = yBounds[r + 1] - sy
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, sw)
      canvas.height = Math.max(1, sh)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get 2D context')
      ctx.drawImage(img.image, -sx, -sy)
      out.push(canvas)
    }
  }
  return out
}

/**
 * Crops one shape: a rect is a plain crop; a polygon is cropped to its
 * bounding box with everything outside the outline made transparent.
 *
 * The polygon is applied as a hard 0/255 mask via `destination-in`, so each
 * pixel is either kept exactly as in the source (including its own soft
 * alpha edges) or removed — never partially faded by an antialiased clip,
 * and the source's own transparency is never thresholded.
 */
function cropShape(image: HTMLImageElement, shape: SliceShape): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  if (shape.kind === 'rect') {
    canvas.width = Math.max(1, Math.round(shape.width))
    canvas.height = Math.max(1, Math.round(shape.height))
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, shape.x, shape.y, shape.width, shape.height, 0, 0, canvas.width, canvas.height)
    return canvas
  }
  const xs = shape.points.map((p) => p.x)
  const ys = shape.points.map((p) => p.y)
  const minX = Math.floor(Math.min(...xs))
  const minY = Math.floor(Math.min(...ys))
  canvas.width = Math.max(1, Math.ceil(Math.max(...xs)) - minX)
  canvas.height = Math.max(1, Math.ceil(Math.max(...ys)) - minY)
  ctx.drawImage(image, -minX, -minY)

  const mask = document.createElement('canvas')
  mask.width = canvas.width
  mask.height = canvas.height
  const maskCtx = mask.getContext('2d')
  if (!maskCtx) throw new Error('Could not get 2D context')
  maskCtx.fillStyle = '#fff'
  maskCtx.beginPath()
  shape.points.forEach((p, i) =>
    i === 0 ? maskCtx.moveTo(p.x - minX, p.y - minY) : maskCtx.lineTo(p.x - minX, p.y - minY)
  )
  maskCtx.closePath()
  maskCtx.fill()
  const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height)
  for (let i = 3; i < maskData.data.length; i += 4) maskData.data[i] = maskData.data[i] >= 128 ? 255 : 0
  maskCtx.putImageData(maskData, 0, 0)

  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  return canvas
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * All state/logic for the Grid Slice tool: upload one or more images, each
 * with its own rows x cols (defaulting to the shared rows x cols) and its own
 * independently draggable set of dividing lines, review the resulting
 * cells per image, then download everything together as one ZIP numbered in
 * row-major order per image.
 */
export function useGridSlice() {
  const [images, setImages] = useState<GridSliceImage[]>([])
  const [rows, setRowsState] = useState(2)
  const [cols, setColsState] = useState(2)
  const [slicing, setSlicing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportWidth, setExportWidth] = useState<number | null>(null)
  const [exportHeight, setExportHeight] = useState<number | null>(null)

  // Changing the shared row/col count sets the default for new uploads and
  // applies it to every existing image (re-spacing their lines evenly);
  // per-image counts can then be tweaked individually via setImageGrid.
  function setRows(value: number) {
    setRowsState(value)
    setImages((prev) => prev.map((img) => ({ ...img, rows: value, rowLines: evenLines(value) })))
  }
  function setCols(value: number) {
    setColsState(value)
    setImages((prev) => prev.map((img) => ({ ...img, cols: value, colLines: evenLines(value) })))
  }

  /** Changes one image's row or column count, re-spacing that axis's lines evenly. */
  function setImageGrid(id: string, axis: 'row' | 'col', value: number) {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img
        return axis === 'row'
          ? { ...img, rows: value, rowLines: evenLines(value) }
          : { ...img, cols: value, colLines: evenLines(value) }
      })
    )
  }

  async function addSource(newFile: File) {
    const url = URL.createObjectURL(newFile)
    try {
      const img = await loadImage(url)
      setImages((prev) => [
        ...prev,
        {
          id: makeId(),
          file: newFile,
          image: img,
          imageUrl: url,
          rows,
          cols,
          rowLines: evenLines(rows),
          colLines: evenLines(cols),
          mode: 'grid',
          shapes: [],
          smoothScale: false,
          frameWidth: null,
          frameHeight: null,
          cells: [],
        },
      ])
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
      URL.revokeObjectURL(url)
    }
  }

  function removeSource(id: string) {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.imageUrl)
      return prev.filter((img) => img.id !== id)
    })
  }

  function clearAll() {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.imageUrl))
      return []
    })
  }

  /** Drags interior line `index` (into rowLines or colLines) of a specific image to a new fraction, clamped so it can't cross its neighbors. */
  function moveLine(id: string, axis: 'row' | 'col', index: number, fraction: number) {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img
        const key = axis === 'row' ? 'rowLines' : 'colLines'
        const sorted = [...img[key]].sort((a, b) => a - b)
        const minBound = index > 0 ? sorted[index - 1] + 0.001 : 0.001
        const maxBound = index < sorted.length - 1 ? sorted[index + 1] - 0.001 : 0.999
        sorted[index] = Math.min(maxBound, Math.max(minBound, fraction))
        return { ...img, [key]: sorted }
      })
    )
  }

  function resetLines(id?: string) {
    setImages((prev) =>
      prev.map((img) =>
        id === undefined || img.id === id
          ? { ...img, rowLines: evenLines(img.rows), colLines: evenLines(img.cols) }
          : img
      )
    )
  }

  /** Merges `patch` into the transform of one cell (by 1-based `cellIndex`) of one image. */
  function setCellTransform(id: string, cellIndex: number, patch: Partial<CellTransform>) {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img
        return {
          ...img,
          cells: img.cells.map((cell) => {
            if (cell.index !== cellIndex) return cell
            const current = transformOf(cell)
            const next = { ...current, ...patch }
            const same = (Object.keys(next) as (keyof CellTransform)[]).every((k) => next[k] === current[k])
            return same ? cell : makeCell(cell.index, cell.raw, next, img)
          }),
        }
      })
    )
  }

  /** Applies `patch` (e.g. one scale for every frame) to all cells of one image. */
  function setAllCellTransforms(id: string, patch: Partial<CellTransform>) {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              cells: img.cells.map((cell) =>
                makeCell(cell.index, cell.raw, { ...transformOf(cell), ...patch }, img)
              ),
            }
          : img
      )
    )
  }

  function resetCellTransforms(id: string) {
    setAllCellTransforms(id, IDENTITY)
  }

  /** Changes per-image render options and re-renders that image's cells with them. */
  function setRenderOptions(id: string, patch: Partial<RenderOptions>) {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img
        const next = { ...img, ...patch }
        return { ...next, cells: img.cells.map((cell) => makeCell(cell.index, cell.raw, transformOf(cell), next)) }
      })
    )
  }

  function setSmoothScale(id: string, smooth: boolean) {
    setRenderOptions(id, { smoothScale: smooth })
  }

  /** Sets one image's output frame size (null per axis = each frame's own cut size). */
  function setFrameSize(id: string, frameWidth: number | null, frameHeight: number | null) {
    setRenderOptions(id, { frameWidth, frameHeight })
  }

  function sliceGrid() {
    if (images.length === 0) return
    if (images.some((img) => img.mode === 'grid' && (img.rows < 1 || img.cols < 1))) {
      message.error('Rows and columns must be at least 1')
      return
    }
    setSlicing(true)
    try {
      setImages((prev) =>
        prev.map((img) => {
          const raws = img.mode === 'grid' ? cropGrid(img) : img.shapes.map((shape) => cropShape(img.image, shape))
          // Keep offsets/scales from a previous slice with the same frame count so tweaking lines/shapes doesn't lose alignment work.
          const keepTransforms = img.cells.length === raws.length
          return {
            ...img,
            cells: raws.map((raw, i) =>
              makeCell(i + 1, raw, keepTransforms ? transformOf(img.cells[i]) : IDENTITY, img)
            ),
          }
        })
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSlicing(false)
    }
  }

  function setImageMode(id: string, mode: GridSliceMode) {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, mode } : img)))
  }

  /** Replaces an image's whole shape list (the shape editor owns add/move/resize/reorder/delete). */
  function setShapes(id: string, shapes: SliceShape[]) {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, shapes } : img)))
  }

  /** Zips the given images' cells — flat when there's one image, one folder per image otherwise. */
  async function exportZip(targets: GridSliceImage[], zipName: string) {
    const withCells = targets.filter((img) => img.cells.length > 0)
    if (withCells.length === 0) {
      message.error('No sliced images to export yet')
      return
    }
    setExporting(true)
    try {
      const zip = new JSZip()
      const multiImage = withCells.length > 1
      for (const img of withCells) {
        const folder = multiImage ? zip.folder(baseNameOf(img)) ?? zip : zip
        const frames = renderExportFrames(img)
        for (let i = 0; i < img.cells.length; i++) {
          const blob = await canvasToBlob(resizeCanvas(frames[i], exportWidth, exportHeight))
          folder.file(frameFileName(img.cells[i]), blob)
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, zipName)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  /**
   * Packs one image's frames into a single sprite-sheet PNG: every slot is
   * the export canvas size (Download size, or auto-fit), frames laid out like
   * the player shows them, left-to-right then top-to-bottom
   * over `columns` columns (0 = one horizontal strip).
   */
  async function downloadSpriteSheet(id: string, columns = 0) {
    const img = images.find((i) => i.id === id)
    if (!img || img.cells.length === 0) {
      message.error('No sliced images to export yet')
      return
    }
    setExporting(true)
    try {
      const frames = renderExportFrames(img).map((frame) => resizeCanvas(frame, exportWidth, exportHeight))
      const slotW = Math.max(...frames.map((f) => f.width))
      const slotH = Math.max(...frames.map((f) => f.height))
      const cols = columns > 0 ? Math.min(columns, frames.length) : frames.length
      const rowCount = Math.ceil(frames.length / cols)
      const sheet = document.createElement('canvas')
      sheet.width = slotW * cols
      sheet.height = slotH * rowCount
      const ctx = sheet.getContext('2d')
      if (!ctx) throw new Error('Could not get 2D context')
      frames.forEach((frame, i) => {
        const x = (i % cols) * slotW + Math.floor((slotW - frame.width) / 2)
        const y = Math.floor(i / cols) * slotH + Math.floor((slotH - frame.height) / 2)
        ctx.drawImage(frame, x, y)
      })
      const blob = await canvasToBlob(sheet)
      downloadBlob(blob, `${baseNameOf(img)}_sheet_${cols}x${rowCount}_${slotW}x${slotH}.png`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  function downloadAllAsZip() {
    return exportZip(images, `grid_slice_${Date.now()}.zip`)
  }

  /** Downloads only the cells cut from one source image, as `<name>_slices.zip`. */
  function downloadImageAsZip(id: string) {
    const target = images.find((img) => img.id === id)
    if (!target) return
    return exportZip([target], `${baseNameOf(target)}_slices.zip`)
  }

  const totalCells = images.reduce((sum, img) => sum + img.cells.length, 0)

  return {
    images,
    rows,
    setRows,
    cols,
    setCols,
    setImageGrid,
    moveLine,
    resetLines,
    totalCells,
    slicing,
    exporting,
    exportWidth,
    setExportWidth,
    exportHeight,
    setExportHeight,
    addSource,
    removeSource,
    clearAll,
    sliceGrid,
    downloadAllAsZip,
    downloadImageAsZip,
    setCellTransform,
    setAllCellTransforms,
    setSmoothScale,
    setFrameSize,
    downloadSpriteSheet,
    setImageMode,
    setShapes,
    resetCellTransforms,
  }
}

export type GridSlice = ReturnType<typeof useGridSlice>
