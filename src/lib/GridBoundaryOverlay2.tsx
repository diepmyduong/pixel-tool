import type { useGridBoundaries2 } from './useGridBoundaries2'

type GridBoundaries2 = ReturnType<typeof useGridBoundaries2>

interface GridBoundaryOverlay2Props {
  imageUrl: string
  alt: string
  grid: GridBoundaries2
}

/** Character-2 fork of GridBoundaryOverlay: renders the source image with a draggable row/column boundary overlay, backed by useGridBoundaries2. */
export default function GridBoundaryOverlay2({ imageUrl, alt, grid }: GridBoundaryOverlay2Props) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        ref={grid.imgRef}
        src={imageUrl}
        onLoad={grid.handleImageLoad}
        style={{ maxWidth: '100%', display: 'block' }}
        alt={alt}
      />
      {grid.displaySize && (
        <div
          style={{ position: 'absolute', inset: 0 }}
          onMouseMove={grid.handleOverlayMouseMove}
          onMouseUp={grid.handleOverlayMouseUp}
          onMouseLeave={grid.handleOverlayMouseUp}
        >
          {grid.displayColLines.map((x, i) => {
            const isDraggable = grid.draggableColIndices.has(i)
            return (
              <div
                key={`col-${i}`}
                onMouseDown={isDraggable ? () => grid.setDragTarget({ axis: 'col', index: i }) : undefined}
                style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  bottom: 0,
                  width: isDraggable ? 6 : 1,
                  marginLeft: isDraggable ? -3 : 0,
                  background: isDraggable ? 'rgba(255,80,80,0.7)' : 'rgba(255,255,255,0.6)',
                  cursor: isDraggable ? 'col-resize' : 'default',
                }}
              />
            )
          })}
          {grid.displayRowLines.map((y, i) => {
            const isDraggable = grid.draggableRowIndices.has(i)
            return (
              <div
                key={`row-${i}`}
                onMouseDown={isDraggable ? () => grid.setDragTarget({ axis: 'row', index: i }) : undefined}
                style={{
                  position: 'absolute',
                  top: y,
                  left: 0,
                  right: 0,
                  height: isDraggable ? 6 : 1,
                  marginTop: isDraggable ? -3 : 0,
                  background: isDraggable ? 'rgba(255,80,80,0.7)' : 'rgba(255,255,255,0.6)',
                  cursor: isDraggable ? 'row-resize' : 'default',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
