import { useEffect, useMemo, useRef, useState } from 'react'

interface NaturalSize {
  width: number
  height: number
}

export interface SquareCellRect {
  sx: number
  sy: number
  size: number
}

type DragTarget = { kind: 'rowSplit' } | { kind: 'cellCenterX'; row: number; col: number } | null

/**
 * Drives the animation grid-alignment UI: one horizontal line splits the
 * frame into a top and bottom row, and each row holds two square cells
 * (size = that row's height) whose horizontal center the user drags
 * independently — because the AI doesn't reliably center each character
 * copy in its half of the frame, unlike the uniform grids used for
 * Character/Item sheets. Cell size is derived, never dragged directly, so
 * every cell in the same row always stays square and equal-sized.
 */
export function useSquareCellGrid(imageUrl: string) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null)
  const [displaySize, setDisplaySize] = useState<NaturalSize | null>(null)
  const [rowSplitY, setRowSplitY] = useState<number | null>(null)
  // centerX[row][col], row 0 = top, col 0/1 = left/right cell in that row
  const [centerX, setCenterX] = useState<[[number, number], [number, number]] | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)

  useEffect(() => {
    setNaturalSize(null)
    setDisplaySize(null)
    setRowSplitY(null)
    setCenterX(null)
  }, [imageUrl])

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const natural = { width: img.naturalWidth, height: img.naturalHeight }
    setNaturalSize(natural)
    setDisplaySize({ width: img.clientWidth, height: img.clientHeight })
    setRowSplitY(Math.round(natural.height / 2))
    setCenterX([
      [natural.width * 0.25, natural.width * 0.75],
      [natural.width * 0.25, natural.width * 0.75],
    ])
  }

  const scaleY = naturalSize && displaySize ? displaySize.height / naturalSize.height : 1
  const scaleX = naturalSize && displaySize ? displaySize.width / naturalSize.width : 1

  const rowHeights: [number, number] | null =
    naturalSize && rowSplitY !== null ? [rowSplitY, naturalSize.height - rowSplitY] : null

  const cellRects: [[SquareCellRect, SquareCellRect], [SquareCellRect, SquareCellRect]] | null = useMemo(() => {
    if (!naturalSize || rowSplitY === null || !rowHeights || !centerX) return null
    return [
      [0, 1].map((col) => {
        const size = rowHeights[0]
        return { sx: Math.round(centerX[0][col] - size / 2), sy: 0, size: Math.round(size) }
      }) as [SquareCellRect, SquareCellRect],
      [0, 1].map((col) => {
        const size = rowHeights[1]
        return { sx: Math.round(centerX[1][col] - size / 2), sy: Math.round(rowSplitY), size: Math.round(size) }
      }) as [SquareCellRect, SquareCellRect],
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, rowSplitY, rowHeights, centerX])

  function toNaturalY(clientOffsetY: number): number {
    if (!naturalSize || !displaySize) return clientOffsetY
    return Math.round((clientOffsetY / displaySize.height) * naturalSize.height)
  }

  function toNaturalX(clientOffsetX: number): number {
    if (!naturalSize || !displaySize) return clientOffsetX
    return Math.round((clientOffsetX / displaySize.width) * naturalSize.width)
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragTarget || !naturalSize) return
    const rect = e.currentTarget.getBoundingClientRect()

    if (dragTarget.kind === 'rowSplit') {
      const y = toNaturalY(e.clientY - rect.top)
      setRowSplitY(Math.min(Math.max(y, 1), naturalSize.height - 1))
      return
    }

    if (dragTarget.kind === 'cellCenterX' && centerX) {
      const x = toNaturalX(e.clientX - rect.left)
      const next: [[number, number], [number, number]] = [
        [centerX[0][0], centerX[0][1]],
        [centerX[1][0], centerX[1][1]],
      ]
      next[dragTarget.row][dragTarget.col] = Math.min(Math.max(x, 0), naturalSize.width)
      setCenterX(next)
    }
  }

  function handleOverlayMouseUp() {
    setDragTarget(null)
  }

  const displayRowSplitY = useMemo(() => (rowSplitY !== null ? rowSplitY * scaleY : null), [rowSplitY, scaleY])

  const displayCellRects = useMemo(() => {
    if (!cellRects) return null
    return cellRects.map((row) =>
      row.map((cell) => ({
        sx: cell.sx * scaleX,
        sy: cell.sy * scaleY,
        size: cell.size * scaleX,
      })),
    ) as [[SquareCellRect, SquareCellRect], [SquareCellRect, SquareCellRect]]
  }, [cellRects, scaleX, scaleY])

  return {
    imgRef,
    displaySize,
    rowSplitY,
    cellRects,
    displayRowSplitY,
    displayCellRects,
    handleImageLoad,
    handleOverlayMouseMove,
    handleOverlayMouseUp,
    setDragTarget,
  }
}
