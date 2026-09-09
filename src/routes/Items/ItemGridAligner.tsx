import { Button, Card, Space, Typography } from 'antd'
import { ITEM_GRID_COLS, ITEM_GRID_ROWS } from '../../lib/grid'
import { chromaKey, sliceCells } from '../../lib/imageProcessing'
import { useGridBoundaries } from '../../lib/useGridBoundaries'
import GridBoundaryOverlay from '../../lib/GridBoundaryOverlay'

const SLICE_INSET_PX = 6

interface ItemGridAlignerProps {
  imageUrl: string
  onSliced: (cells: (HTMLCanvasElement | undefined)[]) => void
}

export default function ItemGridAligner({ imageUrl, onSliced }: ItemGridAlignerProps) {
  const grid = useGridBoundaries(ITEM_GRID_COLS, ITEM_GRID_ROWS, imageUrl)

  async function handleSlice() {
    if (!grid.colBoundaries || !grid.rowBoundaries) return
    const cells = await sliceCells(
      imageUrl,
      ITEM_GRID_COLS,
      ITEM_GRID_ROWS,
      grid.colBoundaries,
      grid.rowBoundaries,
      null,
      SLICE_INSET_PX,
    )
    for (const canvas of cells) {
      if (canvas) chromaKey(canvas, ['green'])
    }
    onSliced(cells)
  }

  return (
    <Card title="Align grid">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <GridBoundaryOverlay imageUrl={imageUrl} alt="Generated item grid" grid={grid} />

        <Typography.Text type="secondary">
          Drag any red line to align it with the actual cell boundary in the generated image. For
          quick fixes, drag just row 1 and row 2's lines into place, then click "Auto-align rows"
          to space the rest evenly — you can still fine-tune any individual line afterward.
        </Typography.Text>

        <Space>
          <Button onClick={grid.handleAutoAlignRows} disabled={!grid.rowBoundaries}>
            Auto-align rows from first two
          </Button>
          <Button type="primary" onClick={handleSlice} disabled={!grid.rowBoundaries || !grid.colBoundaries}>
            Slice grid
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
