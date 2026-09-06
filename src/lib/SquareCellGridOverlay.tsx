import type { useSquareCellGrid } from './useSquareCellGrid'

type SquareCellGrid = ReturnType<typeof useSquareCellGrid>

interface SquareCellGridOverlayProps {
  imageUrl: string
  alt: string
  grid: SquareCellGrid
}

/**
 * Renders the source frame with: one draggable horizontal line splitting
 * top/bottom rows, and one draggable vertical center-line per square cell
 * (cell size follows its row's height automatically — only the center
 * position is user-adjustable).
 */
export default function SquareCellGridOverlay({ imageUrl, alt, grid }: SquareCellGridOverlayProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        ref={grid.imgRef}
        src={imageUrl}
        onLoad={grid.handleImageLoad}
        style={{ maxWidth: '100%', display: 'block' }}
        alt={alt}
      />
      {grid.displaySize && grid.displayRowSplitY !== null && grid.displayCellRects && (
        <div
          style={{ position: 'absolute', inset: 0 }}
          onMouseMove={grid.handleOverlayMouseMove}
          onMouseUp={grid.handleOverlayMouseUp}
          onMouseLeave={grid.handleOverlayMouseUp}
        >
          <div
            onMouseDown={() => grid.setDragTarget({ kind: 'rowSplit' })}
            style={{
              position: 'absolute',
              top: grid.displayRowSplitY,
              left: 0,
              right: 0,
              height: 6,
              marginTop: -3,
              background: 'rgba(255,80,80,0.7)',
              cursor: 'row-resize',
            }}
          />
          {grid.displayCellRects.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div key={`${rowIndex}-${colIndex}`}>
                <div
                  style={{
                    position: 'absolute',
                    left: cell.sx,
                    top: cell.sy,
                    width: cell.size,
                    height: cell.size,
                    border: '2px solid rgba(255,255,255,0.8)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  onMouseDown={() => grid.setDragTarget({ kind: 'cellCenterX', row: rowIndex, col: colIndex })}
                  style={{
                    position: 'absolute',
                    left: cell.sx + cell.size / 2,
                    top: cell.sy,
                    bottom: 0,
                    width: 6,
                    marginLeft: -3,
                    background: 'rgba(255,80,80,0.7)',
                    cursor: 'col-resize',
                  }}
                />
              </div>
            )),
          )}
        </div>
      )}
    </div>
  )
}
