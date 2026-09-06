import { useState } from 'react'
import { Button, Card, Space, Tag, Typography, message } from 'antd'
import type { View } from '../../types'
import { CHAR_GRID_COLS, CHAR_GRID_ROWS, CHAR_VERSIONS, versionCells } from '../../lib/grid'
import { canvasToBlob, chromaKey, sliceCells } from '../../lib/imageProcessing'
import { useGridBoundaries } from '../../lib/useGridBoundaries'
import GridBoundaryOverlay from '../../lib/GridBoundaryOverlay'

interface CharacterVersionPickerProps {
  imageUrl: string
  onVersionChosen: (viewBlobs: Record<View, Blob>) => void
}

// Trims a few pixels off each sliced cell's edges to drop stray grid-line /
// anti-alias fringe pixels the AI sometimes draws right at cell boundaries.
const SLICE_INSET_PX = 6

export default function CharacterVersionPicker({ imageUrl, onVersionChosen }: CharacterVersionPickerProps) {
  const grid = useGridBoundaries(CHAR_GRID_COLS, CHAR_GRID_ROWS, imageUrl)
  const [sliced, setSliced] = useState<(HTMLCanvasElement | undefined)[] | null>(null)
  const [savingVersion, setSavingVersion] = useState<number | null>(null)

  async function handleSlice() {
    if (!grid.colBoundaries || !grid.rowBoundaries) return
    const cells = await sliceCells(
      imageUrl,
      CHAR_GRID_COLS,
      CHAR_GRID_ROWS,
      grid.colBoundaries,
      grid.rowBoundaries,
      null,
      SLICE_INSET_PX,
    )
    for (const canvas of cells) {
      if (canvas) chromaKey(canvas)
    }
    setSliced(cells)
  }

  async function handleUseVersion(version: number) {
    if (!sliced) return
    setSavingVersion(version)
    try {
      const cells = versionCells(version)
      const viewBlobs = {} as Record<View, Blob>
      for (const cell of cells) {
        if (!cell.view) continue
        const canvas = sliced[cell.cellIndex]
        if (!canvas) throw new Error(`Missing sliced cell for view ${cell.view}`)
        viewBlobs[cell.view] = await canvasToBlob(canvas)
      }
      onVersionChosen(viewBlobs)
      message.success(`Saved character from version ${version}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingVersion(null)
    }
  }

  return (
    <Card title="Pick a version">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <GridBoundaryOverlay imageUrl={imageUrl} alt="Generated character grid" grid={grid} />

        <Typography.Text type="secondary">
          Drag any red line to align it with the actual cell boundary in the generated image —
          every row and column boundary can be moved independently, so uneven AI output can be
          corrected cell by cell. For quick fixes, drag just row 1 and row 2's lines into place,
          then click "Auto-align rows" to space the rest evenly from those two — you can still
          fine-tune any individual line afterward.
        </Typography.Text>

        <Space>
          <Button onClick={grid.handleAutoAlignRows} disabled={!grid.rowBoundaries}>
            Auto-align rows from first two
          </Button>
          <Button type="primary" onClick={handleSlice} disabled={!grid.rowBoundaries || !grid.colBoundaries}>
            Slice grid
          </Button>
        </Space>

        {sliced && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {Array.from({ length: CHAR_VERSIONS }, (_, i) => i + 1).map((version) => {
              const cells = versionCells(version)
              return (
                <Card
                  key={version}
                  size="small"
                  title={`Version ${version}`}
                  extra={
                    <Button
                      size="small"
                      type="primary"
                      loading={savingVersion === version}
                      onClick={() => handleUseVersion(version)}
                    >
                      Use this version
                    </Button>
                  }
                >
                  <Space>
                    {cells.map((cell) => {
                      const canvas = sliced[cell.cellIndex]
                      return (
                        <div key={cell.cellIndex} style={{ textAlign: 'center' }}>
                          {canvas && (
                            <img
                              src={canvas.toDataURL('image/png')}
                              alt={cell.view ?? ''}
                              style={{ width: 72, height: 72, objectFit: 'contain', background: '#eee' }}
                            />
                          )}
                          <div>
                            <Tag>{cell.view}</Tag>
                          </div>
                        </div>
                      )
                    })}
                  </Space>
                </Card>
              )
            })}
          </Space>
        )}
      </Space>
    </Card>
  )
}
