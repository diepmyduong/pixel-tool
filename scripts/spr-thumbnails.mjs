// One-off: export the first frame of every .spr file in a directory as a
// same-name .png in a separate output directory, so Windows Explorer shows
// a real thumbnail without touching the source files.
//
// Usage: node scripts/spr-thumbnails.mjs "<source-directory>" "<output-directory>"

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { deflateSync } from 'node:zlib'

const HEADER_SIZE = 32

function parseSprFirstFrame(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const bytes = buffer
  if (bytes.length < HEADER_SIZE || bytes[0] !== 0x53 || bytes[1] !== 0x50 || bytes[2] !== 0x52) {
    throw new Error('Not an SPR file')
  }
  const u16 = (at) => view.getUint16(at, true)
  const frameCount = u16(12)
  const colors = u16(14)
  if (frameCount === 0) throw new Error('No frames')

  const paletteStart = HEADER_SIZE
  const tableStart = paletteStart + colors * 3
  const dataStart = tableStart + frameCount * 8
  if (dataStart > bytes.length) throw new Error('SPR file is truncated')

  const offset = view.getUint32(tableStart, true)
  const length = view.getUint32(tableStart + 4, true)
  const start = dataStart + offset
  const end = Math.min(start + length, bytes.length)
  if (start + 8 > bytes.length) throw new Error('SPR frame 0 is out of bounds')

  const fw = u16(start)
  const fh = u16(start + 2)
  if (fw === 0 || fh === 0) throw new Error('Empty frame')
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
  return { width: fw, height: fh, pixels }
}

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const idatData = deflateSync(raw)

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = process.argv[2]
const outDir = process.argv[3]
if (!dir || !outDir) {
  console.error('Usage: node scripts/spr-thumbnails.mjs "<source-directory>" "<output-directory>"')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.spr'))
console.log(`Found ${files.length} .spr files`)

let ok = 0
let skipped = 0
let failed = 0

for (const file of files) {
  const full = join(dir, file)
  const pngPath = join(outDir, basename(file, '.spr') + '.png')
  try {
    statSync(pngPath)
    skipped++
    continue
  } catch {
    // doesn't exist, proceed
  }
  try {
    const buf = readFileSync(full)
    const frame = parseSprFirstFrame(buf)
    const png = encodePng(frame.width, frame.height, frame.pixels)
    writeFileSync(pngPath, png)
    ok++
  } catch (err) {
    failed++
    console.error(`FAILED ${file}: ${err.message}`)
  }
  if ((ok + failed) % 500 === 0) console.log(`progress: ${ok + failed}/${files.length}`)
}

console.log(`Done. ok=${ok} skipped(existing)=${skipped} failed=${failed}`)
