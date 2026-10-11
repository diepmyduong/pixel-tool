/**
 * Parser for Kingsoft-engine `.spr` sprites (JX / Võ Lâm Truyền Kỳ).
 *
 * Layout (little-endian):
 *   header   32 bytes: "SPR\0", width, height, centerX, centerY, frames,
 *            colors, directions, interval (all u16), 12 reserved bytes
 *   palette  colors × 3 bytes (R, G, B)
 *   offsets  frames × { u32 offset, u32 length } — offsets are relative to
 *            the end of this table
 *   frames   each: u16 width, height, offsetX, offsetY, then RLE pixels
 *
 * RLE: a stream of (count, alpha) byte pairs. alpha 0 = `count` transparent
 * pixels; otherwise the next `count` bytes are palette indices drawn with
 * that alpha. Pixels run left-to-right, wrapping at the frame width.
 */

export interface SprFrame {
  width: number
  height: number
  /** Position of the frame inside the sprite's full width × height canvas. */
  offsetX: number
  offsetY: number
  /** RGBA pixels, width × height × 4. */
  pixels: Uint8ClampedArray
}

export interface SprFile {
  width: number
  height: number
  centerX: number
  centerY: number
  directions: number
  /** Frame interval in game ticks (engine runs at ~18 fps); 0 = unspecified. */
  interval: number
  frames: SprFrame[]
}

const HEADER_SIZE = 32

export function parseSpr(buffer: ArrayBuffer): SprFile {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  if (bytes.length < HEADER_SIZE || bytes[0] !== 0x53 || bytes[1] !== 0x50 || bytes[2] !== 0x52) {
    throw new Error('Not an SPR file (missing "SPR" signature)')
  }
  const u16 = (at: number) => view.getUint16(at, true)
  const width = u16(4)
  const height = u16(6)
  const centerX = u16(8)
  const centerY = u16(10)
  const frameCount = u16(12)
  const colors = u16(14)
  const directions = u16(16)
  const interval = u16(18)

  const paletteStart = HEADER_SIZE
  const tableStart = paletteStart + colors * 3
  const dataStart = tableStart + frameCount * 8
  if (dataStart > bytes.length) throw new Error('SPR file is truncated')

  const frames: SprFrame[] = []
  for (let f = 0; f < frameCount; f++) {
    const offset = view.getUint32(tableStart + f * 8, true)
    const length = view.getUint32(tableStart + f * 8 + 4, true)
    const start = dataStart + offset
    const end = Math.min(start + length, bytes.length)
    if (start + 8 > bytes.length) throw new Error(`SPR frame ${f} is out of bounds`)
    const fw = u16(start)
    const fh = u16(start + 2)
    const pixels = new Uint8ClampedArray(fw * fh * 4)
    const total = fw * fh
    let p = 0
    let i = start + 8
    while (i + 1 < end && p < total) {
      const count = bytes[i]
      const alpha = bytes[i + 1]
      i += 2
      if (alpha === 0) {
        p += count
        continue
      }
      for (let k = 0; k < count && p < total && i < end; k++, p++, i++) {
        const c = paletteStart + bytes[i] * 3
        const o = p * 4
        pixels[o] = bytes[c]
        pixels[o + 1] = bytes[c + 1]
        pixels[o + 2] = bytes[c + 2]
        pixels[o + 3] = alpha
      }
    }
    frames.push({ width: fw, height: fh, offsetX: u16(start + 4), offsetY: u16(start + 6), pixels })
  }

  return { width, height, centerX, centerY, directions, interval, frames }
}
