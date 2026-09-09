import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import type { Item2VideoEntry, Direction8 } from '../../types'
import { DIRECTION8_ORDER } from '../../types'
import { canvasToBlob, blobToBase64DataUri, chromaKey, sliceCells } from '../../lib/imageProcessing'
import { buildItem2VideoPrompt, type Item2Pose } from '../../lib/promptBuilder'
import { generateVideo, type JobProgress } from '../../lib/spriteApi'
import { getItem2VideoSession, saveItem2VideoSession, saveRawVideoGeneration } from '../../lib/db'
import { downloadVideosAsZip } from '../../lib/videoZip'
import { useGridBoundaries2 } from '../../lib/useGridBoundaries2'
import { ITEM2_GRID_ROWS, ITEM2_POSE_ORDER } from '../../lib/grid'

export type { Item2Pose }
export const POSE_ORDER = ITEM2_POSE_ORDER

export type VideoCellKey = `${number}-${Item2Pose}`

export interface VideoCellState {
  status: 'idle' | 'generating' | 'done' | 'error'
  progress: JobProgress | null
  videoUrl: string | null
  videoBlob: Blob | null
  error: string | null
}

const IDLE_VIDEO_CELL: VideoCellState = {
  status: 'idle',
  progress: null,
  videoUrl: null,
  videoBlob: null,
  error: null,
}

// Trims a few pixels off each sliced cell's edges to drop stray grid-line /
// anti-alias fringe pixels the AI sometimes draws right at cell boundaries.
const SLICE_INSET_PX = 6

// The generation prompt (buildItemPrompt2) asks for a strict 2-column sheet
// (stand/attacked), but the model often draws each pose across more than 1
// column, so the picker's starting grid is seeded wider than the prompt to
// match what actually comes back — the row/column controls still let it be
// adjusted either way.
const INITIAL_SLICE_COLS = 4

/** Where a row's pose image comes from: a cell of the sliced sheet, or a separately uploaded image. */
export type ImageRef = { source: 'grid'; cellIndex: number } | { source: 'upload'; uploadIndex: number }

export function sameRef(a: ImageRef | undefined, b: ImageRef): boolean {
  if (!a) return false
  if (a.source !== b.source) return false
  return a.source === 'grid' && b.source === 'grid'
    ? a.cellIndex === b.cellIndex
    : a.source === 'upload' && b.source === 'upload' && a.uploadIndex === b.uploadIndex
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(url)
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

interface UseItem2SheetArgs {
  imageUrl: string
  imageBlob: Blob
  name: string
  description: string
  onVideoSaved: () => void
}

/**
 * All state/logic for the Item-2 "Pick this sheet" + "Stand/Attacked per
 * direction" screens, lifted out of the components so the two card UIs can
 * be placed independently in the page layout (the direction-videos card
 * needs to span the full page width, outside the narrow column the sheet
 * picker lives in) while still sharing one source of truth. Mirrors
 * useCharacter2Sheet, with the 3-pose stand/run/attack set collapsed to 2
 * poses (stand/attacked).
 */
export function useItem2Sheet({ imageUrl, imageBlob, name, description, onVideoSaved }: UseItem2SheetArgs) {
  const grid = useGridBoundaries2(INITIAL_SLICE_COLS, ITEM2_GRID_ROWS, imageUrl)
  const [sliced, setSliced] = useState<(HTMLCanvasElement | undefined)[] | null>(null)
  // Maps a sliced row index -> the direction the user says that row is.
  // Not assumed from DIRECTION8_ORDER by position, since add/remove row can
  // change the row count away from the standard 8.
  const [rowDirections, setRowDirections] = useState<Record<number, Direction8>>({})
  // Maps a sliced row index -> pose -> where that (row, pose) image comes
  // from. Not fixed to a specific column, and not limited to the row's own
  // cells or even the sliced grid: the AI sometimes draws each pose across
  // multiple columns, draws a better pose in a different row entirely, or
  // draws it wrong altogether — so the user can point any pose slot at any
  // cell in the whole sliced grid, or at a separately uploaded replacement.
  const [rowPoseRef, setRowPoseRef] = useState<Record<number, Partial<Record<Item2Pose, ImageRef>>>>({})
  const [uploadedCanvases, setUploadedCanvases] = useState<HTMLCanvasElement[]>([])
  // Which row+pose the "choose from any cell" modal is currently editing; null when the modal is closed.
  const [pickerTarget, setPickerTarget] = useState<{ row: number; pose: Item2Pose } | null>(null)
  // Per-(row, pose) video generation state, keyed "row-pose" — independent
  // of rowDirections/rowPoseRef so a slow video job never blocks editing the
  // pose image assignment underneath it.
  const [videoCells, setVideoCells] = useState<Record<VideoCellKey, VideoCellState>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [zippingAll, setZippingAll] = useState(false)
  const [cutTarget, setCutTarget] = useState<{ key: VideoCellKey; url: string; title: string } | null>(null)
  // Per-(row, pose) prompt override — absent means "use buildItem2VideoPrompt's
  // auto-generated prompt", so editing one cell's prompt never affects the
  // others, and a cell reverts to the auto prompt if its override is cleared.
  const [customPrompts, setCustomPrompts] = useState<Record<VideoCellKey, string>>({})
  // Bumped every time a cell's generation (re)starts or is stopped, so a
  // late-arriving poll/download from a stopped run can tell it's stale and
  // discard its result instead of overwriting whatever the cell moved on to.
  // The API has no cancel endpoint — the server job keeps running — so
  // "Stop" only abandons the client-side wait, it can't actually cancel it.
  const generationTokens = useRef<Record<VideoCellKey, number>>({})
  // One video session per sheet image, created lazily on the first
  // successful video generation and reused (by id) for every subsequent
  // video from this same sheet, so "Video history" shows one entry per
  // sheet with all of its videos rather than one entry per video.
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    setSliced(null)
    setRowDirections({})
    setRowPoseRef({})
    setUploadedCanvases([])
    setVideoCells({})
    setCustomPrompts({})
    generationTokens.current = {}
    sessionIdRef.current = null
  }, [imageUrl])

  function getEffectivePrompt(row: number, pose: Item2Pose): string {
    const key: VideoCellKey = `${row}-${pose}`
    const direction = rowDirections[row]
    return customPrompts[key] ?? (direction ? buildItem2VideoPrompt(pose, direction, description) : '')
  }

  function setCustomPrompt(row: number, pose: Item2Pose, prompt: string) {
    const key: VideoCellKey = `${row}-${pose}`
    setCustomPrompts((prev) => ({ ...prev, [key]: prompt }))
  }

  function resetCustomPrompt(row: number, pose: Item2Pose) {
    const key: VideoCellKey = `${row}-${pose}`
    setCustomPrompts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function canvasForRef(ref: ImageRef | undefined): HTMLCanvasElement | undefined {
    if (!ref) return undefined
    return ref.source === 'grid' ? sliced?.[ref.cellIndex] : uploadedCanvases[ref.uploadIndex]
  }

  function canvasForPose(row: number, pose: Item2Pose): HTMLCanvasElement | undefined {
    return canvasForRef(rowPoseRef[row]?.[pose])
  }

  function setPoseRef(row: number, pose: Item2Pose, ref: ImageRef) {
    setRowPoseRef((prev) => ({ ...prev, [row]: { ...prev[row], [pose]: ref } }))
  }

  function videoCellState(row: number, pose: Item2Pose): VideoCellState {
    return videoCells[`${row}-${pose}`] ?? IDLE_VIDEO_CELL
  }

  function updateVideoCell(row: number, pose: Item2Pose, patch: Partial<VideoCellState>) {
    const key: VideoCellKey = `${row}-${pose}`
    setVideoCells((prev) => ({ ...prev, [key]: { ...(prev[key] ?? IDLE_VIDEO_CELL), ...patch } }))
  }

  function stopVideoForCell(row: number, pose: Item2Pose) {
    const key: VideoCellKey = `${row}-${pose}`
    generationTokens.current[key] = (generationTokens.current[key] ?? 0) + 1
    updateVideoCell(row, pose, { status: 'idle', progress: null, error: null })
  }

  /** Appends one video to this sheet's session, creating the session on first use. */
  async function appendToSession(entry: Item2VideoEntry) {
    const now = Date.now()
    if (!sessionIdRef.current) {
      const id = crypto.randomUUID()
      sessionIdRef.current = id
      await saveItem2VideoSession({
        id,
        name,
        description,
        sheetImageBlob: imageBlob,
        videos: [entry],
        createdAt: now,
        updatedAt: now,
      })
    } else {
      const existing = await getItem2VideoSession(sessionIdRef.current)
      if (!existing) return
      await saveItem2VideoSession({
        ...existing,
        videos: [...existing.videos, entry],
        updatedAt: now,
      })
    }
    onVideoSaved()
  }

  async function generateVideoForCell(row: number, pose: Item2Pose) {
    const direction = rowDirections[row]
    const canvas = canvasForPose(row, pose)
    if (!direction || !canvas) {
      message.error(`Row ${row + 1} has no ${pose} image to use as reference`)
      return
    }
    const key: VideoCellKey = `${row}-${pose}`
    const token = (generationTokens.current[key] ?? 0) + 1
    generationTokens.current[key] = token
    const isStale = () => generationTokens.current[key] !== token

    updateVideoCell(row, pose, { status: 'generating', progress: null, error: null })
    try {
      const blob = await canvasToBlob(canvas)
      const referenceDataUri = await blobToBase64DataUri(blob)
      const prompt = getEffectivePrompt(row, pose)
      // videoMode "frame" pins the reference image as the literal starting
      // frame (image-to-video); the default "component" mode only treats it
      // as a loose style reference, which is why cells kept drifting off
      // their sheet pose instead of animating from it.
      const result = await generateVideo(
        prompt,
        [referenceDataUri],
        (progress) => {
          if (!isStale()) updateVideoCell(row, pose, { progress })
        },
        'frame',
      )
      if (isStale()) return
      const res = await fetch(result.videoUri)
      if (!res.ok) throw new Error(`Failed to download generated video: ${res.status} ${res.statusText}`)
      const videoBlob = await res.blob()
      if (isStale()) return

      await saveRawVideoGeneration({
        id: crypto.randomUUID(),
        prompt,
        videoBlob,
        createdAt: Date.now(),
        kind: 'single',
      })
      if (isStale()) return

      await appendToSession({ direction, pose, prompt, videoBlob, createdAt: Date.now() })
      if (isStale()) return

      updateVideoCell(row, pose, { status: 'done', videoUrl: URL.createObjectURL(videoBlob), videoBlob })
    } catch (err) {
      if (isStale()) return
      updateVideoCell(row, pose, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleGenerateAllVideos() {
    setGeneratingAll(true)
    try {
      for (let row = 0; row < grid.rows; row++) {
        if (!rowDirections[row]) continue
        for (const pose of POSE_ORDER) {
          await generateVideoForCell(row, pose)
        }
      }
    } finally {
      setGeneratingAll(false)
    }
  }

  async function handleDownloadAllZip() {
    const entries: Item2VideoEntry[] = []
    for (let row = 0; row < grid.rows; row++) {
      const direction = rowDirections[row]
      if (!direction) continue
      for (const pose of POSE_ORDER) {
        const cell = videoCellState(row, pose)
        if (cell.videoBlob) entries.push({ direction, pose, prompt: '', videoBlob: cell.videoBlob, createdAt: Date.now() })
      }
    }
    if (entries.length === 0) {
      message.error('No generated videos to download yet')
      return
    }
    setZippingAll(true)
    try {
      await downloadVideosAsZip(entries, `${(name || 'item').replace(/[^a-z0-9_-]+/gi, '_')}_videos_${Date.now()}.zip`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setZippingAll(false)
    }
  }

  async function handleSlice() {
    if (!grid.colBoundaries || !grid.rowBoundaries) return
    // Cells are kept with their original chroma-key green background, not
    // keyed to transparent here: they're sent as video-generation reference
    // images, and the API needs to see the flat green background to key it
    // out itself — a transparent reference would just look like empty space.
    const cells = await sliceCells(
      imageUrl,
      grid.cols,
      grid.rows,
      grid.colBoundaries,
      grid.rowBoundaries,
      null,
      SLICE_INSET_PX,
    )
    setSliced(cells)
    setRowDirections(
      Object.fromEntries(Array.from({ length: grid.rows }, (_, row) => [row, DIRECTION8_ORDER[row % 8]])),
    )
    // Default column guess per pose: stand always starts at column 0, and
    // attacked always defaults to the LAST column — the AI reliably puts the
    // damaged pose at the end of the row even when it draws more or fewer
    // columns than expected, while spreading the remaining poses evenly
    // across whatever's left in between avoids poses defaulting to the
    // same column on a narrow sheet.
    const lastCol = grid.cols - 1
    const middleSpan = Math.max(1, Math.floor(lastCol / Math.max(1, POSE_ORDER.length - 1)))
    const defaultColForPose = (poseIndex: number) =>
      poseIndex === POSE_ORDER.length - 1 ? lastCol : Math.min(poseIndex * middleSpan, lastCol)
    setRowPoseRef(
      Object.fromEntries(
        Array.from({ length: grid.rows }, (_, row) => [
          row,
          Object.fromEntries(
            POSE_ORDER.map((pose, poseIndex) => [
              pose,
              { source: 'grid', cellIndex: row * grid.cols + defaultColForPose(poseIndex) },
            ]),
          ),
        ]),
      ),
    )
    setUploadedCanvases([])
  }

  async function handleUploadForPicker(file: File): Promise<boolean> {
    if (!pickerTarget) return false
    try {
      const canvas = await fileToCanvas(file)
      chromaKey(canvas, ['green'])
      let uploadIndex = -1
      setUploadedCanvases((prev) => {
        uploadIndex = prev.length
        return [...prev, canvas]
      })
      setPoseRef(pickerTarget.row, pickerTarget.pose, { source: 'upload', uploadIndex })
      setPickerTarget(null)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
    return false
  }

  return {
    grid,
    sliced,
    rowDirections,
    setRowDirections,
    rowPoseRef,
    uploadedCanvases,
    pickerTarget,
    setPickerTarget,
    videoCellState,
    generatingAll,
    zippingAll,
    cutTarget,
    setCutTarget,
    canvasForRef,
    canvasForPose,
    setPoseRef,
    getEffectivePrompt,
    setCustomPrompt,
    resetCustomPrompt,
    customPrompts,
    stopVideoForCell,
    generateVideoForCell,
    handleGenerateAllVideos,
    handleDownloadAllZip,
    handleSlice,
    handleUploadForPicker,
  }
}

export type Item2Sheet = ReturnType<typeof useItem2Sheet>
