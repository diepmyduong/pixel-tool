import { useState } from 'react'
import { Button, Card, InputNumber, Space, Typography } from 'antd'
import { ANIM_IMG_GRID_COLS_DEFAULT, ANIM_IMG_GRID_ROWS } from '../../lib/grid'
import { chromaKey, fitCanvasToFrame, sliceCells } from '../../lib/imageProcessing'
import { useGridBoundaries } from '../../lib/useGridBoundaries'
import GridBoundaryOverlay from '../../lib/GridBoundaryOverlay'

const SLICE_INSET_PX = 6
const FRAME_SIZE_PX = 64
const FRAME_MARGIN_PX = 20

interface AnimationImageGridAlignerProps {
  imageUrl: string
  onSliced: (cells: (HTMLCanvasElement | undefined)[], cols: number) => void
  onRegenerate: () => void
}

export default function AnimationImageGridAligner({ imageUrl, onSliced, onRegenerate }: AnimationImageGridAlignerProps) {
  const [cols, setCols] = useState(ANIM_IMG_GRID_COLS_DEFAULT)
  const grid = useGridBoundaries(cols, ANIM_IMG_GRID_ROWS, imageUrl)

  async function handleSlice() {
    if (!grid.colBoundaries || !grid.rowBoundaries) return
    const cells = await sliceCells(
      imageUrl,
      cols,
      ANIM_IMG_GRID_ROWS,
      grid.colBoundaries,
      grid.rowBoundaries,
      null,
      SLICE_INSET_PX,
    )
    const framed = cells.map((canvas) =>
      canvas ? fitCanvasToFrame(chromaKey(canvas), FRAME_SIZE_PX, FRAME_MARGIN_PX) : undefined,
    )
    onSliced(framed, cols)
  }

  return (
    <Card title="Align grid">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space align="center">
          <Typography.Text strong>Columns</Typography.Text>
          <InputNumber min={2} max={16} value={cols} onChange={(v) => v && setCols(v)} />
          <Typography.Text type="secondary">
            Set this to match how many frames the AI actually drew per row before slicing.
          </Typography.Text>
        </Space>

        <GridBoundaryOverlay imageUrl={imageUrl} alt="Generated animation sheet" grid={grid} />

        <Typography.Text type="secondary">
          Drag any red line to align it with the actual cell boundary. Rows 1-4 are the four
          directions.
        </Typography.Text>

        <Space>
          <Button onClick={grid.handleAutoAlignRows} disabled={!grid.rowBoundaries}>
            Auto-align rows from first two
          </Button>
          <Button onClick={grid.handleAutoAlignCols} disabled={!grid.colBoundaries}>
            Auto-align cols from first two
          </Button>
          <Button type="primary" onClick={handleSlice} disabled={!grid.rowBoundaries || !grid.colBoundaries}>
            Slice grid
          </Button>
          <Button onClick={onRegenerate}>Regenerate</Button>
        </Space>
      </Space>
    </Card>
  )
}
