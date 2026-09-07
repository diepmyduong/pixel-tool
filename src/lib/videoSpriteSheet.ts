export const VIDEO_SHEET_FRAME_SIZE = 64

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
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
 * Loads a frame blob onto an off-screen canvas at its natural size, for
 * feeding into fitFrameWithOffset. Kept separate from fitFrameWithOffset so
 * the editor can load once per frame and re-fit repeatedly as offset/margin
 * change without re-decoding the source image every drag tick.
 */
export async function loadFrameCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Normalizes a source frame to a fixed `size`x`size` canvas: the character's
 * opaque silhouette is scaled down (never up) to fit within `size - 2*margin`,
 * centered by default, then nudged by `offsetX`/`offsetY` — the same
 * auto-center-then-offset behavior as `fitCanvasToFrame` in imageProcessing.ts,
 * generalized with an explicit position adjustment on top of centering.
 */
export function fitFrameWithOffset(
  source: HTMLCanvasElement,
  size: number,
  margin: number,
  offsetX: number,
  offsetY: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  const bounds = opaqueBounds(source)
  if (!bounds) return out

  const maxDim = size - margin * 2
  const scale = Math.min(maxDim / bounds.width, maxDim / bounds.height, 1)
  const drawWidth = bounds.width * scale
  const drawHeight = bounds.height * scale
  const dx = (size - drawWidth) / 2 + offsetX
  const dy = (size - drawHeight) / 2 + offsetY

  ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, dx, dy, drawWidth, drawHeight)
  return out
}

/** Composes fitted 64x64 frame canvases into a single horizontal-strip PNG. */
export async function composeFrameStrip(frames: HTMLCanvasElement[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = frames.length * VIDEO_SHEET_FRAME_SIZE
  canvas.height = VIDEO_SHEET_FRAME_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  frames.forEach((frame, i) => {
    ctx.drawImage(frame, i * VIDEO_SHEET_FRAME_SIZE, 0)
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to convert canvas to blob'))
    }, 'image/png')
  })
}

/**
 * Composes frame canvases into a single horizontal-strip PNG at their
 * original captured size — no resize to VIDEO_SHEET_FRAME_SIZE, no margin,
 * no offset. Cells share one uniform width/height (the max across all
 * frames, since they're normally identical captures from the same video)
 * so the strip stays a regular grid; each frame is centered in its cell.
 */
export async function composeOriginalFrameStrip(frames: HTMLCanvasElement[]): Promise<Blob> {
  const cellWidth = Math.max(...frames.map((f) => f.width))
  const cellHeight = Math.max(...frames.map((f) => f.height))

  const canvas = document.createElement('canvas')
  canvas.width = frames.length * cellWidth
  canvas.height = cellHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  frames.forEach((frame, i) => {
    const dx = i * cellWidth + (cellWidth - frame.width) / 2
    const dy = (cellHeight - frame.height) / 2
    ctx.drawImage(frame, dx, dy)
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to convert canvas to blob'))
    }, 'image/png')
  })
}

export function downloadFrameStrip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
