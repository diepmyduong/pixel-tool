import type { useGridBoundaries } from './useGridBoundaries'

type GridBoundaries = ReturnType<typeof useGridBoundaries>

interface GridBoundaryOverlayProps {
  imageUrl: string
  alt: string
  grid: GridBoundaries
}

/** Renders the source image with a draggable row/column boundary overlay, backed by useGridBoundaries. */
export default function GridBoundaryOverlay({ imageUrl, alt, grid }: GridBoundaryOverlayProps) {
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
