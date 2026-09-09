function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

export function computeUniformBoundaries(count: number, naturalSize: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Math.round((i * naturalSize) / count))
}

/**
 * Slices a source image using explicit per-column/row pixel boundaries
 * (length cols+1 / rows+1). Boundaries may come from computeUniformBoundaries
 * (auto) or from manual per-line dragging in the UI. `cellIndices` restricts
 * extraction to specific cells (row*cols+col); pass null to extract every
 * cell. `insetPx` shrinks each cell's crop rect inward on all four sides
 * (clamped so it never exceeds half the cell's width/height) — trims stray
 * grid-line pixels the AI drew right at the cell boundary that would
 * otherwise survive as a dark fringe around the sliced sprite.
 *
 * `imageUrl` must be same-origin (a blob:/object URL from an already-fetched
 * Blob, or a local asset) — loading directly from a cross-origin URL would
 * require that origin to send CORS headers or the canvas becomes tainted
 * and cannot be read back out via toBlob/getImageData.
 */
export async function sliceCells(
  imageUrl: string,
  cols: number,
  rows: number,
  colBoundaries: number[],
  rowBoundaries: number[],
  cellIndices: number[] | null,
  insetPx = 0,
): Promise<(HTMLCanvasElement | undefined)[]> {
  const img = await loadImage(imageUrl)
  const cells: (HTMLCanvasElement | undefined)[] = new Array(cols * rows)
  const wanted = cellIndices ?? Array.from({ length: cols * rows }, (_, i) => i)

  for (const cellIndex of wanted) {
    const row = Math.floor(cellIndex / cols)
    const col = cellIndex % cols
    const rawSx = colBoundaries[col]
    const rawSy = rowBoundaries[row]
    const rawSw = colBoundaries[col + 1] - rawSx
    const rawSh = rowBoundaries[row + 1] - rawSy

    const inset = Math.min(insetPx, Math.floor(rawSw / 2) - 1, Math.floor(rawSh / 2) - 1)
    const sx = rawSx + Math.max(inset, 0)
    const sy = rawSy + Math.max(inset, 0)
    const sw = rawSw - Math.max(inset, 0) * 2
    const sh = rawSh - Math.max(inset, 0) * 2

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    cells[cellIndex] = canvas
  }

  return cells
}

const CHROMA_KEY = { r: 0, g: 255, b: 0 }

/**
 * Removes near-green pixels to transparent, with a despill pass on
 * remaining edge pixels. Uses a soft falloff band (innerThreshold to
 * outerThreshold) instead of one hard cutoff: pixels closer to pure green
 * than innerThreshold are fully transparent, pixels farther than
 * outerThreshold are left untouched, and pixels in between are partially
 * transparent — this smooths the green-to-opaque boundary so a thin ring
 * of dark, semi-keyed pixels (grid-line/anti-alias fringe) doesn't survive
 * as a hard dark rim around the sprite.
 */
export function chromaKey(canvas: HTMLCanvasElement, innerThreshold = 90, outerThreshold = 140): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')

  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const dist = Math.sqrt((r - CHROMA_KEY.r) ** 2 + (g - CHROMA_KEY.g) ** 2 + (b - CHROMA_KEY.b) ** 2)

    if (dist < innerThreshold) {
      data[i + 3] = 0 // fully transparent
    } else if (dist < outerThreshold) {
      const falloff = (dist - innerThreshold) / (outerThreshold - innerThreshold)
      data[i + 3] = Math.round(data[i + 3] * falloff)
      if (g > r && g > b) {
        data[i + 1] = Math.round((r + b) / 2)
      }
    } else if (g > r && g > b) {
      // Despill: pixel survived the key but still leans green (edge fringe) — pull green
      // channel down toward the average of red/blue so no green halo remains.
      data[i + 1] = Math.round((r + b) / 2)
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Finds the tight bounding box of non-transparent pixels; null if the canvas is fully transparent. */
function opaqueBounds(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Normalizes a sliced (and already chroma-keyed) frame to a fixed
 * `size`x`size` canvas: the character's opaque silhouette is scaled down
 * (preserving aspect ratio, never up) to fit within `size - 2*margin`, then
 * centered on a fully transparent canvas — so every frame carries the same
 * even margin regardless of how large a pose the AI happened to draw in its
 * source cell, with no stretching/distortion.
 */
export function fitCanvasToFrame(canvas: HTMLCanvasElement, size: number, margin: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  const bounds = opaqueBounds(canvas)
  if (!bounds) return out

  const maxDim = size - margin * 2
  const scale = Math.min(maxDim / bounds.width, maxDim / bounds.height, 1)
  const drawWidth = bounds.width * scale
  const drawHeight = bounds.height * scale
  const dx = (size - drawWidth) / 2
  const dy = (size - drawHeight) / 2

  ctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, dx, dy, drawWidth, drawHeight)
  return out
}

/** A crop rectangle expressed as fractions (0-1) of the source image's width/height. */
export interface CropRatioRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Crops a blob to the given fractional rectangle, at the source's native
 * resolution (no resize) — used to re-crop every frame in a cut stack to a
 * shared region picked by dragging a box over the preview, which is defined
 * in ratio space so it applies correctly regardless of each frame's actual
 * pixel size.
 */
export async function cropBlobByRatio(blob: Blob, rect: CropRatioRect): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const sx = Math.round(rect.x * img.naturalWidth)
    const sy = Math.round(rect.y * img.naturalHeight)
    const sw = Math.max(1, Math.round(rect.width * img.naturalWidth))
    const sh = Math.max(1, Math.round(rect.height * img.naturalHeight))

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to convert canvas to blob'))
    }, 'image/png')
  })
}

export function blobToBase64DataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Composes multiple same-purpose images into a single grid image (e.g. a
 * character's 6 views into one 3x2 reference sheet) so a video-generation
 * API that accepts limited reference images gets full character coverage
 * in one image slot.
 */
export async function composeImages(blobs: Blob[], cols: number): Promise<Blob> {
  const rows = Math.ceil(blobs.length / cols)
  const images = await Promise.all(blobs.map((b) => loadImage(URL.createObjectURL(b))))
  const cellW = Math.max(...images.map((img) => img.naturalWidth))
  const cellH = Math.max(...images.map((img) => img.naturalHeight))

  const canvas = document.createElement('canvas')
  canvas.width = cellW * cols
  canvas.height = cellH * rows
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')

  images.forEach((img, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH)
  })

  return canvasToBlob(canvas)
}
