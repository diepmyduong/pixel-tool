import { useState } from 'react'
import { message } from 'antd'
import JSZip from 'jszip'
import { canvasToBlob, chromaKey, type ChromaKeyColor } from '../../lib/imageProcessing'
import { decodeGifFrames, type DecodedGifFrame } from './gifDecoder'

export interface CropBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  group: string
  order: number
  sourceId: string
  /**
   * For a box whose source is a GIF: which decoded frame indices (into that
   * source's gifFrames array) to actually crop/export, in the order given —
   * null means "use every decoded frame" (the default). Lets the user
   * hand-pick exactly which frames belong in the animation instead of only
   * being able to downsample to an even N.
   */
  selectedFrameIndices: number[] | null
}

/** One uploaded reference image or GIF. Boxes are drawn/edited against whichever source is active; each source scrubs its own GIF frame position independently. */
export interface CropSource {
  id: string
  file: File
  name: string
  image: HTMLImageElement | null
  gifFrames: DecodedGifFrame[] | null
  frameIndex: number
}

// Above this many decoded GIF frames, a single sprite strip would be
// absurdly wide (and slow to compose/export), so group export switches to a
// numbered-frames ZIP instead. Chosen so a handful of short walk-cycle GIFs
// still export as one convenient strip, while longer clips don't produce an
// unusable multi-thousand-pixel-wide PNG.
const GIF_STRIP_FRAME_LIMIT = 30

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

function boxFilenamePart(box: CropBox): string {
  const group = box.group.trim() || 'untitled'
  return `${group}_${box.order}`.replace(/[^a-z0-9_-]+/gi, '_')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** A crop resolved to its own source's reference frame(s) — a static-image single canvas, or every decoded GIF frame in order for a GIF source. */
type ResolvedFrames = { kind: 'static'; canvas: HTMLCanvasElement } | { kind: 'gif'; canvases: HTMLCanvasElement[] }

/**
 * Scales a canvas up (never down) to fit within targetWidth x targetHeight,
 * preserving aspect ratio, then centers it on a targetWidth x targetHeight
 * canvas — the "largest wins, others scale up" cross-source rule. A canvas
 * already at or above target size in both dimensions passes through
 * untouched (just re-centered), matching the old no-scaling centered
 * behavior in the single-source case.
 */
export function scaleToFitCentered(canvas: HTMLCanvasElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const scale = Math.max(1, Math.max(targetWidth / canvas.width, targetHeight / canvas.height))
  const drawWidth = canvas.width * scale
  const drawHeight = canvas.height * scale
  const out = document.createElement('canvas')
  out.width = targetWidth
  out.height = targetHeight
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, (targetWidth - drawWidth) / 2, (targetHeight - drawHeight) / 2, drawWidth, drawHeight)
  return out
}

/**
 * All state/logic for the Free Crop tool: an arbitrary array of independent,
 * native-pixel-coordinate crop boxes over one or more uploaded sources,
 * grouped by a free-text group name into ordered animation sequences. Kept
 * separate from the page component so the page stays a pure render/
 * interaction layer.
 *
 * Each source may be a static image or a GIF. For a GIF, all decoded frames
 * are composited up front (see gifDecoder.ts) and `image` tracks whichever
 * frame is currently scrubbed to (frame 0 initially) — boxes are drawn/
 * edited against that single reference frame exactly like the static-image
 * case, since a character's on-screen position doesn't move between frames.
 *
 * A box's `sourceId` pins it to the source it was drawn on, so a group can
 * freely mix boxes from different sources (e.g. combining frames cropped
 * from two separate reference images into one animation) — export/preview
 * always resolves a box against its own source, never the currently active
 * one.
 */
export function useFreeCropBoxes() {
  const [sources, setSources] = useState<CropSource[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<CropBox[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chromaKeyColors, setChromaKeyColors] = useState<ChromaKeyColor[]>([])
  const [exporting, setExporting] = useState(false)
  const [gifLoading, setGifLoading] = useState(false)

  /** Toggles one decoded GIF frame index in/out of a box's selection. Starts from "all frames" (every index up to the source's frame count) the first time a frame is deselected, so toggling one frame off doesn't silently drop the rest. */
  function toggleBoxFrame(id: string, frameIndex: number) {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const source = sources.find((s) => s.id === b.sourceId)
        const total = source?.gifFrames?.length ?? 0
        const current = b.selectedFrameIndices ?? Array.from({ length: total }, (_, i) => i)
        const next = current.includes(frameIndex)
          ? current.filter((i) => i !== frameIndex)
          : [...current, frameIndex].sort((x, y) => x - y)
        return { ...b, selectedFrameIndices: next.length === total ? null : next }
      }),
    )
  }

  function setBoxFrameSelection(id: string, indices: number[] | null) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, selectedFrameIndices: indices } : b)))
  }

  const activeSource = sources.find((s) => s.id === activeSourceId)

  function updateSource(id: string, patch: Partial<CropSource>) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  /** Decodes each newly-added file (same per-file logic the old single-file useEffect ran) and appends it as a source, auto-activating the first source ever added. */
  async function addSources(files: File[]) {
    if (files.length === 0) return
    const newSources: CropSource[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      image: null,
      gifFrames: null,
      frameIndex: 0,
    }))
    setSources((prev) => [...prev, ...newSources])
    setActiveSourceId((prev) => prev ?? newSources[0].id)

    for (const source of newSources) {
      if (isGifFile(source.file)) {
        setGifLoading(true)
        try {
          const frames = await decodeGifFrames(source.file)
          updateSource(source.id, { gifFrames: frames })
          const url = frames[0]?.canvas.toDataURL('image/png')
          if (url) updateSource(source.id, { image: await loadImage(url) })
        } catch (err) {
          message.error(err instanceof Error ? err.message : String(err))
        } finally {
          setGifLoading(false)
        }
      } else {
        const url = URL.createObjectURL(source.file)
        try {
          const img = await loadImage(url)
          updateSource(source.id, { image: img })
        } finally {
          URL.revokeObjectURL(url)
        }
      }
    }
  }

  /** Removes an uploaded source and every box drawn against it, switching the active tab to another remaining source if the removed one was active. */
  function removeSource(sourceId: string) {
    setSources((prev) => prev.filter((s) => s.id !== sourceId))
    setBoxes((prev) => prev.filter((b) => b.sourceId !== sourceId))
    setSelectedId((prev) => {
      const box = boxes.find((b) => b.id === prev)
      return box && box.sourceId === sourceId ? null : prev
    })
    setActiveSourceId((prev) => {
      if (prev !== sourceId) return prev
      const remaining = sources.filter((s) => s.id !== sourceId)
      return remaining[0]?.id ?? null
    })
  }

  function setSourceFrameIndex(sourceId: string, frameIndex: number) {
    const source = sources.find((s) => s.id === sourceId)
    if (!source?.gifFrames || source.gifFrames.length === 0) return
    const frame = source.gifFrames[Math.min(frameIndex, source.gifFrames.length - 1)]
    loadImage(frame.canvas.toDataURL('image/png')).then((img) => {
      updateSource(sourceId, { frameIndex, image: img })
    })
  }

  function addBox(rect: { x: number; y: number; width: number; height: number }) {
    if (!activeSourceId) throw new Error('No active source')
    const id = crypto.randomUUID()
    const nextOrder = boxes.length + 1
    setBoxes((prev) => [
      ...prev,
      {
        id,
        ...rect,
        group: `group-${prev.length + 1}`,
        order: nextOrder,
        sourceId: activeSourceId,
        selectedFrameIndices: null,
      },
    ])
    setSelectedId(id)
    return id
  }

  function updateBoxRect(id: string, rect: { x: number; y: number; width: number; height: number }) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...rect } : b)))
  }

  function updateBoxGroup(id: string, group: string) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, group } : b)))
  }

  function updateBoxOrder(id: string, order: number) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, order } : b)))
  }

  function deleteBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id))
    setSelectedId((prev) => (prev === id ? null : prev))
  }

  function groupedBoxes(): Map<string, CropBox[]> {
    const groups = new Map<string, CropBox[]>()
    for (const box of boxes) {
      const key = box.group.trim() || 'untitled'
      const list = groups.get(key) ?? []
      list.push(box)
      groups.set(key, list)
    }
    for (const list of groups.values()) list.sort((a, b) => a.order - b.order)
    return groups
  }

  function cropBoxFromSource(box: CropBox, source: CanvasImageSource): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(box.width))
    canvas.height = Math.max(1, Math.round(box.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height)
    chromaKey(canvas, chromaKeyColors)
    return canvas
  }

  function sourceForBox(box: CropBox): CropSource {
    const source = sources.find((s) => s.id === box.sourceId)
    if (!source) throw new Error('Box references a missing source')
    return source
  }

  /** Crops a box against its OWN source's current reference frame — used for the active-source editor and single-frame exports. */
  function cropBoxToCanvas(box: CropBox): HTMLCanvasElement {
    const source = sourceForBox(box)
    if (!source.image) throw new Error('Source image not loaded yet')
    return cropBoxFromSource(box, source.image)
  }

  /** Crops one box from every decoded GIF frame of its own source, in frame order, ignoring any frame selection — used to render the full thumbnail picker so every frame is choosable regardless of current selection. */
  function cropBoxAcrossAllGifFrames(box: CropBox): HTMLCanvasElement[] {
    const source = sourceForBox(box)
    if (!source.gifFrames) return []
    return source.gifFrames.map((f) => cropBoxFromSource(box, f.canvas))
  }

  /**
   * Crops one box from its own source's decoded GIF frames — empty if that
   * box's source isn't a GIF. Only the frame indices in `box.selectedFrameIndices`
   * are cropped, in that order (null means every decoded frame, in order),
   * so a user can hand-pick exactly which frames make it into the animation.
   */
  function cropBoxAcrossGifFrames(box: CropBox): HTMLCanvasElement[] {
    const source = sourceForBox(box)
    if (!source.gifFrames) return []
    const indices = box.selectedFrameIndices ?? source.gifFrames.map((_, i) => i)
    return indices.map((i) => cropBoxFromSource(box, source.gifFrames![i].canvas))
  }

  /** Resolves a box to its full frame set for compose/preview purposes, respecting whether its own source is a GIF or static image. */
  function resolveBoxFrames(box: CropBox): ResolvedFrames {
    const source = sourceForBox(box)
    if (source.gifFrames) return { kind: 'gif', canvases: cropBoxAcrossGifFrames(box) }
    return { kind: 'static', canvas: cropBoxToCanvas(box) }
  }

  /**
   * Composes a group's boxes (in order) into one horizontal strip. Each
   * box's crop may come from a differently-sized source, so every frame is
   * scaled up (never down, aspect preserved) to match the group's largest
   * frame dimensions before compositing — otherwise mixed-source groups
   * would letterbox/misalign instead of reading as one consistent strip.
   */
  async function composeGroupStrip(groupBoxes: CropBox[]): Promise<Blob> {
    const frames = groupBoxes.map((b) => cropBoxToCanvas(b))
    const cellWidth = Math.max(...frames.map((f) => f.width))
    const cellHeight = Math.max(...frames.map((f) => f.height))
    const scaled = frames.map((f) => scaleToFitCentered(f, cellWidth, cellHeight))
    const canvas = document.createElement('canvas')
    canvas.width = scaled.length * cellWidth
    canvas.height = cellHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.imageSmoothingEnabled = false
    scaled.forEach((frame, i) => ctx.drawImage(frame, i * cellWidth, 0))
    return canvasToBlob(canvas)
  }

  /**
   * GIF-flow generalization of composeGroupStrip: for each box in the group
   * (in order), crops it from every decoded GIF frame of ITS OWN source, in
   * order — box 1 across all its source's frames, then box 2 across all its
   * source's frames, etc. Each box may belong to a different source (and
   * different GIF frame count/size), so cells are sized independently before
   * being scaled up to the shared max cell size. The common single-source,
   * single-box case reduces to "this character's full animation as a strip".
   */
  async function composeGifGroupStrip(groupBoxes: CropBox[]): Promise<Blob> {
    const cells = groupBoxes.flatMap((box) => cropBoxAcrossGifFrames(box))
    const cellWidth = Math.max(...cells.map((c) => c.width))
    const cellHeight = Math.max(...cells.map((c) => c.height))
    const scaled = cells.map((c) => scaleToFitCentered(c, cellWidth, cellHeight))
    const canvas = document.createElement('canvas')
    canvas.width = scaled.length * cellWidth
    canvas.height = cellHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.imageSmoothingEnabled = false
    scaled.forEach((cell, i) => ctx.drawImage(cell, i * cellWidth, 0))
    return canvasToBlob(canvas)
  }

  async function composeGifGroupZip(groupBoxes: CropBox[]): Promise<Blob> {
    const zip = new JSZip()
    for (const box of groupBoxes) {
      const framesForBox = cropBoxAcrossGifFrames(box)
      for (let i = 0; i < framesForBox.length; i++) {
        const blob = await canvasToBlob(framesForBox[i])
        const suffix = groupBoxes.length > 1 ? `_${boxFilenamePart(box)}` : ''
        zip.file(`frame_${String(i + 1).padStart(3, '0')}${suffix}.png`, blob)
      }
    }
    return zip.generateAsync({ type: 'blob' })
  }

  /** True if any box in the group resolves to a GIF source (drives strip-vs-zip choice and the group preview's animation). */
  function groupHasGifFrames(groupBoxes: CropBox[]): boolean {
    return groupBoxes.some((b) => sourceForBox(b).gifFrames !== null)
  }

  /** Max number of frames any single box in the group will actually export (respecting each box's own frame selection), for the strip-vs-zip size threshold and preview info. */
  function groupMaxGifFrameCount(groupBoxes: CropBox[]): number {
    return Math.max(0, ...groupBoxes.map((b) => (b.selectedFrameIndices ?? sourceForBox(b).gifFrames ?? []).length))
  }

  async function downloadGroupStrip(groupName: string) {
    const list = groupedBoxes().get(groupName)
    if (!list || list.length === 0) return
    const safeName = groupName.replace(/[^a-z0-9_-]+/gi, '_')
    try {
      if (groupHasGifFrames(list)) {
        if (groupMaxGifFrameCount(list) > GIF_STRIP_FRAME_LIMIT) {
          const blob = await composeGifGroupZip(list)
          downloadBlob(blob, `${safeName}_frames.zip`)
        } else {
          const blob = await composeGifGroupStrip(list)
          downloadBlob(blob, `${safeName}_strip.png`)
        }
        return
      }
      const blob = await composeGroupStrip(list)
      downloadBlob(blob, `${safeName}_strip.png`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
  }

  /** Always-ZIP variant for a GIF-sourced group, regardless of frame count — exposed for the "Download as ZIP" button so the user isn't limited to the strip/ZIP auto-choice above. */
  async function downloadGroupZip(groupName: string) {
    const list = groupedBoxes().get(groupName)
    if (!list || list.length === 0 || !groupHasGifFrames(list)) return
    const safeName = groupName.replace(/[^a-z0-9_-]+/gi, '_')
    try {
      const blob = await composeGifGroupZip(list)
      downloadBlob(blob, `${safeName}_frames.zip`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function downloadAllAsZip() {
    if (boxes.length === 0) {
      message.error('No boxes to export yet')
      return
    }
    setExporting(true)
    try {
      const zip = new JSZip()
      for (const box of boxes) {
        const source = sourceForBox(box)
        if (source.gifFrames) {
          const framesForBox = cropBoxAcrossGifFrames(box)
          for (let i = 0; i < framesForBox.length; i++) {
            const blob = await canvasToBlob(framesForBox[i])
            zip.file(`${boxFilenamePart(box)}/frame_${String(i + 1).padStart(3, '0')}.png`, blob)
          }
        } else {
          const canvas = cropBoxToCanvas(box)
          const blob = await canvasToBlob(canvas)
          zip.file(`${boxFilenamePart(box)}.png`, blob)
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `free_crop_frames_${Date.now()}.zip`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return {
    sources,
    activeSourceId,
    setActiveSourceId,
    activeSource,
    addSources,
    removeSource,
    setSourceFrameIndex,
    boxes,
    selectedId,
    setSelectedId,
    chromaKeyColors,
    setChromaKeyColors,
    exporting,
    addBox,
    updateBoxRect,
    updateBoxGroup,
    updateBoxOrder,
    deleteBox,
    groupedBoxes,
    cropBoxToCanvas,
    cropBoxAcrossGifFrames,
    cropBoxAcrossAllGifFrames,
    resolveBoxFrames,
    groupHasGifFrames,
    groupMaxGifFrameCount,
    toggleBoxFrame,
    setBoxFrameSelection,
    downloadGroupStrip,
    downloadGroupZip,
    downloadAllAsZip,
    gifLoading,
    gifStripFrameLimit: GIF_STRIP_FRAME_LIMIT,
  }
}

export type FreeCropBoxes = ReturnType<typeof useFreeCropBoxes>
