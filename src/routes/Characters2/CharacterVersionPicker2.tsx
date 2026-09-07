import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Modal, Progress, Select, Space, Tag, Typography, Upload, message } from 'antd'
import { StopOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'
import type { Direction8 } from '../../types'
import { DIRECTION8_ORDER } from '../../types'
import { CHAR2_GRID_COLS, CHAR2_GRID_ROWS } from '../../lib/grid'
import { canvasToBlob, blobToBase64DataUri, chromaKey, sliceCells } from '../../lib/imageProcessing'
import { buildCharacter2VideoPrompt, type Character2Pose } from '../../lib/promptBuilder'
import { generateVideo, type JobProgress } from '../../lib/spriteApi'
import { saveRawVideoGeneration } from '../../lib/db'
import { useGridBoundaries2 } from '../../lib/useGridBoundaries2'
import GridBoundaryOverlay2 from '../../lib/GridBoundaryOverlay2'

interface CharacterVersionPicker2Props {
  imageUrl: string
  description: string
  onVersionChosen: (blobs: { standBlobs: Record<Direction8, Blob>; runBlobs: Record<Direction8, Blob> }) => void
}

type VideoCellKey = `${number}-${Character2Pose}`

interface VideoCellState {
  status: 'idle' | 'generating' | 'done' | 'error'
  progress: JobProgress | null
  videoUrl: string | null
  error: string | null
}

const IDLE_VIDEO_CELL: VideoCellState = { status: 'idle', progress: null, videoUrl: null, error: null }

// Trims a few pixels off each sliced cell's edges to drop stray grid-line /
// anti-alias fringe pixels the AI sometimes draws right at cell boundaries.
const SLICE_INSET_PX = 6

const DIRECTION_OPTIONS = DIRECTION8_ORDER.map((d) => ({ value: d, label: d }))

/** Where a row's stand/run pose image comes from: a cell of the sliced sheet, or a separately uploaded image. */
type ImageRef = { source: 'grid'; cellIndex: number } | { source: 'upload'; uploadIndex: number }

function sameRef(a: ImageRef | undefined, b: ImageRef): boolean {
  if (!a) return false
  if (a.source !== b.source) return false
  return a.source === 'grid' && b.source === 'grid' ? a.cellIndex === b.cellIndex : a.source === 'upload' && b.source === 'upload' && a.uploadIndex === b.uploadIndex
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

export default function CharacterVersionPicker2({ imageUrl, description, onVersionChosen }: CharacterVersionPicker2Props) {
  const grid = useGridBoundaries2(CHAR2_GRID_COLS, CHAR2_GRID_ROWS, imageUrl)
  const [sliced, setSliced] = useState<(HTMLCanvasElement | undefined)[] | null>(null)
  // Maps a sliced row index -> the direction the user says that row is.
  // Not assumed from DIRECTION8_ORDER by position, since add/remove row can
  // change the row count away from the standard 8.
  const [rowDirections, setRowDirections] = useState<Record<number, Direction8>>({})
  // Maps a sliced row index -> where that row's stand/run pose image comes
  // from. Not fixed to col 0/1, and not limited to the row's own cells or
  // even the sliced grid: the AI sometimes draws each pose across 2 columns
  // (e.g. 4 columns total, run starting at col 2), draws a better pose in a
  // different row entirely, or draws it wrong altogether — so the user can
  // point either slot at any cell in the whole sliced grid, or at a
  // separately uploaded replacement image.
  const [rowStandRef, setRowStandRef] = useState<Record<number, ImageRef>>({})
  const [rowRunRef, setRowRunRef] = useState<Record<number, ImageRef>>({})
  const [uploadedCanvases, setUploadedCanvases] = useState<HTMLCanvasElement[]>([])
  const [saving, setSaving] = useState(false)
  // Which row+slot ("stand" or "run") the "choose from any cell" modal is
  // currently editing; null when the modal is closed.
  const [pickerTarget, setPickerTarget] = useState<{ row: number; slot: 'stand' | 'run' } | null>(null)
  // Per-(row, pose) video generation state, keyed "row-pose" — independent
  // of rowDirections/rowStandRef/rowRunRef so a slow video job never blocks
  // editing the stand/run image assignment underneath it.
  const [videoCells, setVideoCells] = useState<Record<VideoCellKey, VideoCellState>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  // Bumped every time a cell's generation (re)starts or is stopped, so a
  // late-arriving poll/download from a stopped run can tell it's stale and
  // discard its result instead of overwriting whatever the cell moved on to.
  // The API has no cancel endpoint — the server job keeps running — so
  // "Stop" only abandons the client-side wait, it can't actually cancel it.
  const generationTokens = useRef<Record<VideoCellKey, number>>({})

  useEffect(() => {
    setSliced(null)
    setRowDirections({})
    setRowStandRef({})
    setRowRunRef({})
    setUploadedCanvases([])
    setVideoCells({})
    generationTokens.current = {}
  }, [imageUrl])

  function canvasForRef(ref: ImageRef | undefined): HTMLCanvasElement | undefined {
    if (!ref) return undefined
    return ref.source === 'grid' ? sliced?.[ref.cellIndex] : uploadedCanvases[ref.uploadIndex]
  }

  function videoCellState(row: number, pose: Character2Pose): VideoCellState {
    return videoCells[`${row}-${pose}`] ?? IDLE_VIDEO_CELL
  }

  function updateVideoCell(row: number, pose: Character2Pose, patch: Partial<VideoCellState>) {
    const key: VideoCellKey = `${row}-${pose}`
    setVideoCells((prev) => ({ ...prev, [key]: { ...(prev[key] ?? IDLE_VIDEO_CELL), ...patch } }))
  }

  function stopVideoForCell(row: number, pose: Character2Pose) {
    const key: VideoCellKey = `${row}-${pose}`
    generationTokens.current[key] = (generationTokens.current[key] ?? 0) + 1
    updateVideoCell(row, pose, { status: 'idle', progress: null, error: null })
  }

  async function generateVideoForCell(row: number, pose: Character2Pose) {
    const direction = rowDirections[row]
    const canvas = canvasForRef(pose === 'stand' ? rowStandRef[row] : rowRunRef[row])
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
      const prompt = buildCharacter2VideoPrompt(pose, direction, description)
      // videoMode "frame" pins the reference image as the literal starting
      // frame (image-to-video); the default "component" mode only treats it
      // as a loose style reference, which is why stand/run cells kept
      // drifting off their sheet pose instead of animating from it.
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

      updateVideoCell(row, pose, { status: 'done', videoUrl: URL.createObjectURL(videoBlob) })
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
        await generateVideoForCell(row, 'stand')
        await generateVideoForCell(row, 'run')
      }
    } finally {
      setGeneratingAll(false)
    }
  }

  async function handleSlice() {
    if (!grid.colBoundaries || !grid.rowBoundaries) return
    const cells = await sliceCells(
      imageUrl,
      grid.cols,
      grid.rows,
      grid.colBoundaries,
      grid.rowBoundaries,
      null,
      SLICE_INSET_PX,
    )
    for (const canvas of cells) {
      if (canvas) chromaKey(canvas)
    }
    setSliced(cells)
    setRowDirections(
      Object.fromEntries(Array.from({ length: grid.rows }, (_, row) => [row, DIRECTION8_ORDER[row % 8]])),
    )
    const defaultRunCol = grid.cols >= 4 ? 2 : Math.min(1, grid.cols - 1)
    setRowStandRef(
      Object.fromEntries(
        Array.from({ length: grid.rows }, (_, row) => [row, { source: 'grid', cellIndex: row * grid.cols + 0 }]),
      ),
    )
    setRowRunRef(
      Object.fromEntries(
        Array.from({ length: grid.rows }, (_, row) => [
          row,
          { source: 'grid', cellIndex: row * grid.cols + defaultRunCol },
        ]),
      ),
    )
    setUploadedCanvases([])
  }

  async function handleUploadForPicker(file: File): Promise<boolean> {
    if (!pickerTarget) return false
    try {
      const canvas = await fileToCanvas(file)
      chromaKey(canvas)
      let uploadIndex = -1
      setUploadedCanvases((prev) => {
        uploadIndex = prev.length
        return [...prev, canvas]
      })
      const setter = pickerTarget.slot === 'stand' ? setRowStandRef : setRowRunRef
      setter((prev) => ({ ...prev, [pickerTarget.row]: { source: 'upload', uploadIndex } }))
      setPickerTarget(null)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
    return false
  }

  async function handleUse() {
    if (!sliced) return
    const usedDirections = Object.values(rowDirections)
    const missing = DIRECTION8_ORDER.filter((d) => !usedDirections.includes(d))
    if (missing.length > 0) {
      message.error(`Assign a row to every direction — missing: ${missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      const standBlobs = {} as Record<Direction8, Blob>
      const runBlobs = {} as Record<Direction8, Blob>
      for (let row = 0; row < grid.rows; row++) {
        const direction = rowDirections[row]
        if (!direction) continue
        const standCanvas = canvasForRef(rowStandRef[row])
        const runCanvas = canvasForRef(rowRunRef[row])
        if (!standCanvas || !runCanvas) throw new Error(`Missing sliced cell for row ${row + 1}`)
        standBlobs[direction] = await canvasToBlob(standCanvas)
        runBlobs[direction] = await canvasToBlob(runCanvas)
      }
      onVersionChosen({ standBlobs, runBlobs })
      message.success('Saved character')
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Pick this sheet">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <GridBoundaryOverlay2 imageUrl={imageUrl} alt="Generated character grid" grid={grid} />

        <Typography.Text type="secondary">
          Drag any red line to align it with the actual cell boundary in the generated image. If
          the AI drew an extra or a missing direction, use "Add row"/"Remove row" (or "Add
          column"/"Remove column") to match the grid to what was actually generated, then slice.
        </Typography.Text>

        <Space wrap>
          <Button onClick={grid.handleAutoAlignRows} disabled={!grid.rowBoundaries}>
            Auto-align rows from first two
          </Button>
          <Button onClick={grid.handleAddRow} disabled={!grid.rowBoundaries}>
            Add row
          </Button>
          <Button onClick={grid.handleRemoveRow} disabled={!grid.rowBoundaries || grid.rows <= 1}>
            Remove row
          </Button>
          <Button onClick={grid.handleAddCol} disabled={!grid.colBoundaries}>
            Add column
          </Button>
          <Button onClick={grid.handleRemoveCol} disabled={!grid.colBoundaries || grid.cols <= 1}>
            Remove column
          </Button>
          <Button type="primary" onClick={handleSlice} disabled={!grid.rowBoundaries || !grid.colBoundaries}>
            Slice grid
          </Button>
        </Space>

        {sliced && (
          <Card
            size="small"
            title="Stand / Run per direction — click a thumbnail to pick a different cell from the whole sheet"
            extra={
              <Space>
                <Button
                  size="small"
                  icon={<VideoCameraOutlined />}
                  loading={generatingAll}
                  onClick={handleGenerateAllVideos}
                >
                  Generate all videos
                </Button>
                <Button size="small" type="primary" loading={saving} onClick={handleUse}>
                  Use this sheet
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {Array.from({ length: grid.rows }, (_, row) => {
                const standCanvas = canvasForRef(rowStandRef[row])
                const runCanvas = canvasForRef(rowRunRef[row])
                return (
                  <div key={row} style={{ display: 'flex', gap: 24 }}>
                    <Space align="start">
                      <Select
                        style={{ width: 140 }}
                        value={rowDirections[row]}
                        options={DIRECTION_OPTIONS}
                        onChange={(value) => setRowDirections((prev) => ({ ...prev, [row]: value }))}
                      />
                      {(
                        [
                          ['stand', standCanvas, 'blue'],
                          ['run', runCanvas, 'green'],
                        ] as const
                      ).map(([slot, canvas, color]) => (
                        <div key={slot} style={{ textAlign: 'center', width: 140 }}>
                          <img
                            onClick={() => setPickerTarget({ row, slot })}
                            src={canvas?.toDataURL('image/png')}
                            alt={slot}
                            style={{
                              width: 72,
                              height: 72,
                              objectFit: 'contain',
                              background: '#eee',
                              cursor: 'pointer',
                              border: `2px solid ${color === 'blue' ? '#1677ff' : '#52c41a'}`,
                            }}
                          />
                          <div>
                            <Tag color={color}>{slot}</Tag>
                          </div>
                        </div>
                      ))}
                    </Space>

                    <Space size="middle" style={{ flex: 1 }} align="start">
                      {(['stand', 'run'] as const).map((slot) => {
                        const videoState = videoCellState(row, slot)
                        return (
                          <div key={slot} style={{ width: 200 }}>
                            <Space>
                              <Button
                                size="small"
                                icon={<VideoCameraOutlined />}
                                loading={videoState.status === 'generating'}
                                onClick={() => generateVideoForCell(row, slot)}
                              >
                                {videoState.status === 'done' || videoState.status === 'error'
                                  ? 'Regenerate'
                                  : 'Generate video'}
                              </Button>
                              {videoState.status === 'generating' && (
                                <Button size="small" danger icon={<StopOutlined />} onClick={() => stopVideoForCell(row, slot)}>
                                  Stop
                                </Button>
                              )}
                            </Space>
                            {videoState.status === 'generating' && videoState.progress && (
                              <Progress
                                percent={videoState.progress.progress}
                                status="active"
                                size="small"
                                format={() => videoState.progress!.status}
                              />
                            )}
                            {videoState.status === 'error' && videoState.error && (
                              <Alert type="error" message={videoState.error} style={{ marginTop: 4, textAlign: 'left' }} />
                            )}
                            {videoState.videoUrl && (
                              <video
                                src={videoState.videoUrl}
                                controls
                                loop
                                style={{ width: '100%', marginTop: 4, background: '#000' }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </Space>
                  </div>
                )
              })}
            </Space>
          </Card>
        )}

        {sliced && (
          <Modal
            title={pickerTarget ? `Pick the ${pickerTarget.slot} image for row ${pickerTarget.row + 1}` : ''}
            open={pickerTarget !== null}
            onCancel={() => setPickerTarget(null)}
            footer={null}
            width={720}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Upload accept="image/*" maxCount={1} showUploadList={false} beforeUpload={handleUploadForPicker}>
                <Button icon={<UploadOutlined />}>Upload image instead</Button>
              </Upload>

              {uploadedCanvases.length > 0 && (
                <div>
                  <Typography.Text type="secondary">Previously uploaded</Typography.Text>
                  <div>
                    <Space wrap>
                      {uploadedCanvases.map((canvas, uploadIndex) => {
                        const ref: ImageRef = { source: 'upload', uploadIndex }
                        const selected =
                          pickerTarget && sameRef((pickerTarget.slot === 'stand' ? rowStandRef : rowRunRef)[pickerTarget.row], ref)
                        return (
                          <img
                            key={uploadIndex}
                            onClick={() => {
                              if (!pickerTarget) return
                              const setter = pickerTarget.slot === 'stand' ? setRowStandRef : setRowRunRef
                              setter((prev) => ({ ...prev, [pickerTarget.row]: ref }))
                              setPickerTarget(null)
                            }}
                            src={canvas.toDataURL('image/png')}
                            alt={`uploaded ${uploadIndex + 1}`}
                            style={{
                              width: 56,
                              height: 56,
                              objectFit: 'contain',
                              background: '#eee',
                              cursor: 'pointer',
                              border: selected ? '2px solid #1677ff' : '1px solid #ddd',
                            }}
                          />
                        )
                      })}
                    </Space>
                  </div>
                </div>
              )}

              <Typography.Text type="secondary">Or pick a cell from the sheet</Typography.Text>
              {Array.from({ length: grid.rows }, (_, row) => (
                <Space key={row} wrap>
                  {Array.from({ length: grid.cols }, (_, col) => {
                    const cellIndex = row * grid.cols + col
                    const canvas = sliced[cellIndex]
                    if (!canvas) return null
                    const ref: ImageRef = { source: 'grid', cellIndex }
                    const selected =
                      pickerTarget && sameRef((pickerTarget.slot === 'stand' ? rowStandRef : rowRunRef)[pickerTarget.row], ref)
                    return (
                      <img
                        key={col}
                        onClick={() => {
                          if (!pickerTarget) return
                          const setter = pickerTarget.slot === 'stand' ? setRowStandRef : setRowRunRef
                          setter((prev) => ({ ...prev, [pickerTarget.row]: ref }))
                          setPickerTarget(null)
                        }}
                        src={canvas.toDataURL('image/png')}
                        alt={`row ${row + 1} col ${col + 1}`}
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: 'contain',
                          background: '#eee',
                          cursor: 'pointer',
                          border: selected ? '2px solid #1677ff' : '1px solid #ddd',
                        }}
                      />
                    )
                  })}
                </Space>
              ))}
            </Space>
          </Modal>
        )}
      </Space>
    </Card>
  )
}
