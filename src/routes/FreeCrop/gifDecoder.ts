import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'

export interface DecodedGifFrame {
  canvas: HTMLCanvasElement
  delayMs: number
}

function patchToCanvas(frame: ParsedFrame): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = frame.dims.width
  canvas.height = frame.dims.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  // frame.patch is typed with a SharedArrayBuffer-compatible backing store,
  // which the DOM ImageData constructor's stricter ArrayBuffer type rejects
  // under tsc -b's lib config — copy into a fresh Uint8ClampedArray to match.
  const patch = new Uint8ClampedArray(frame.patch)
  ctx.putImageData(new ImageData(patch, frame.dims.width, frame.dims.height), 0, 0)
  return canvas
}

/**
 * Decodes every frame of a GIF into a fully-composited canvas at the GIF's
 * logical screen size. gifuct-js frames are delta-encoded — each frame's
 * `.patch` only covers its own `.dims` rect, not the whole canvas — so frames
 * must be drawn sequentially onto a persistent canvas, honoring disposalType:
 * 2 clears this frame's own rect to transparent before the NEXT frame draws
 * (so it doesn't linger under whatever comes next), 3 restores the pixels
 * that were there right before this frame was drawn (used for things like a
 * blinking overlay that should reveal the background again), and 0/1 leave
 * the frame's pixels in place for the next frame to draw over. Getting this
 * wrong is the classic gifuct-js gotcha and shows up as garbled/ghosted GIFs.
 */
export async function decodeGifFrames(file: File): Promise<DecodedGifFrame[]> {
  const arrayBuffer = await file.arrayBuffer()
  const gif = parseGIF(arrayBuffer)
  const frames = decompressFrames(gif, true)

  const width = gif.lsd.width
  const height = gif.lsd.height

  const composite = document.createElement('canvas')
  composite.width = width
  composite.height = height
  const compositeCtx = composite.getContext('2d')
  if (!compositeCtx) throw new Error('Could not get 2D context')

  const result: DecodedGifFrame[] = []

  for (const frame of frames) {
    const disposalType = frame.disposalType
    // Snapshot before drawing this frame, only needed if this frame asks for
    // disposalType 3 (restore-to-previous) once it's done.
    const preDrawSnapshot =
      disposalType === 3 ? compositeCtx.getImageData(0, 0, width, height) : null

    const patchCanvas = patchToCanvas(frame)
    compositeCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(composite, 0, 0)
    result.push({ canvas, delayMs: frame.delay || 100 })

    if (disposalType === 2) {
      compositeCtx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
    } else if (disposalType === 3 && preDrawSnapshot) {
      compositeCtx.putImageData(preDrawSnapshot, 0, 0)
    }
    // disposalType 0/1: leave composite as-is, next frame draws over it.
  }

  return result
}
