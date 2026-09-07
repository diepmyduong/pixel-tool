import { useEffect, useMemo, useRef, useState } from 'react'
import { computeUniformBoundaries } from './imageProcessing'

interface NaturalSize {
  width: number
  height: number
}

type DragTarget = { axis: 'row' | 'col'; index: number } | null

/**
 * Character-2 fork of useGridBoundaries: same draggable-line behavior, plus
 * the ability to add/remove a row or column line at runtime — the AI
 * sometimes draws one direction extra/short, or the wrong column count, so
 * the grid the user is slicing against needs to grow/shrink independently
 * of the CHAR2_GRID_ROWS/COLS constants that seeded it.
 */
export function useGridBoundaries2(initialCols: number, initialRows: number, imageUrl: string) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null)
  const [displaySize, setDisplaySize] = useState<NaturalSize | null>(null)
  const [rowBoundaries, setRowBoundaries] = useState<number[] | null>(null)
  const [colBoundaries, setColBoundaries] = useState<number[] | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)

  useEffect(() => {
    setNaturalSize(null)
    setDisplaySize(null)
    setRowBoundaries(null)
    setColBoundaries(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const natural = { width: img.naturalWidth, height: img.naturalHeight }
    setNaturalSize(natural)
    setDisplaySize({ width: img.clientWidth, height: img.clientHeight })
    setRowBoundaries(computeUniformBoundaries(initialRows, natural.height))
    setColBoundaries(computeUniformBoundaries(initialCols, natural.width))
  }

  const rows = rowBoundaries ? rowBoundaries.length - 1 : initialRows
  const cols = colBoundaries ? colBoundaries.length - 1 : initialCols

  const scaleY = naturalSize && displaySize ? displaySize.height / naturalSize.height : 1
  const scaleX = naturalSize && displaySize ? displaySize.width / naturalSize.width : 1
  const displayRowLines = useMemo(() => rowBoundaries?.map((y) => y * scaleY) ?? [], [rowBoundaries, scaleY])
  const displayColLines = useMemo(() => colBoundaries?.map((x) => x * scaleX) ?? [], [colBoundaries, scaleX])

  function toNaturalY(clientOffsetY: number): number {
    if (!naturalSize || !displaySize) return clientOffsetY
    return Math.round((clientOffsetY / displaySize.height) * naturalSize.height)
  }

  function toNaturalX(clientOffsetX: number): number {
    if (!naturalSize || !displaySize) return clientOffsetX
    return Math.round((clientOffsetX / displaySize.width) * naturalSize.width)
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragTarget) return
    const rect = e.currentTarget.getBoundingClientRect()

    if (dragTarget.axis === 'row') {
      if (!rowBoundaries) return
      const y = toNaturalY(e.clientY - rect.top)
      const next = [...rowBoundaries]
      const min = dragTarget.index > 0 ? next[dragTarget.index - 1] + 1 : 0
      const max = dragTarget.index < next.length - 1 ? next[dragTarget.index + 1] - 1 : y
      next[dragTarget.index] = Math.min(Math.max(y, min), max)
      setRowBoundaries(next)
    } else {
      if (!colBoundaries) return
      const x = toNaturalX(e.clientX - rect.left)
      const next = [...colBoundaries]
      const min = dragTarget.index > 0 ? next[dragTarget.index - 1] + 1 : 0
      const max = dragTarget.index < next.length - 1 ? next[dragTarget.index + 1] - 1 : x
      next[dragTarget.index] = Math.min(Math.max(x, min), max)
      setColBoundaries(next)
    }
  }

  function handleOverlayMouseUp() {
    setDragTarget(null)
  }

  function handleAutoAlignRows() {
    if (!rowBoundaries) return
    const rowHeight = rowBoundaries[1] - rowBoundaries[0]
    setRowBoundaries(rowBoundaries.map((_, i) => Math.round(rowBoundaries[0] + i * rowHeight)))
  }

  function handleAutoAlignCols() {
    if (!colBoundaries) return
    const colWidth = colBoundaries[1] - colBoundaries[0]
    setColBoundaries(colBoundaries.map((_, i) => Math.round(colBoundaries[0] + i * colWidth)))
  }

  /** Appends one more row line, splitting the last row's span in two. */
  function handleAddRow() {
    if (!rowBoundaries || !naturalSize) return
    const last = rowBoundaries[rowBoundaries.length - 1]
    const secondLast = rowBoundaries[rowBoundaries.length - 2] ?? 0
    const span = last - secondLast
    const newLast = last + Math.max(span, 1)
    setRowBoundaries([...rowBoundaries, Math.min(newLast, naturalSize.height)])
  }

  /**
   * Removes the last row, merging its span into the row above rather than
   * just dropping the last boundary — dropping it would leave the new last
   * boundary sitting wherever the removed row's start happened to be, not
   * at the image's actual bottom edge, so the freed-up strip of image below
   * it could never be reclaimed by dragging.
   */
  function handleRemoveRow() {
    if (!rowBoundaries || rowBoundaries.length <= 2) return
    setRowBoundaries([...rowBoundaries.slice(0, -2), rowBoundaries[rowBoundaries.length - 1]])
  }

  /** Appends one more column line, splitting the last column's span in two. */
  function handleAddCol() {
    if (!colBoundaries || !naturalSize) return
    const last = colBoundaries[colBoundaries.length - 1]
    const secondLast = colBoundaries[colBoundaries.length - 2] ?? 0
    const span = last - secondLast
    const newLast = last + Math.max(span, 1)
    setColBoundaries([...colBoundaries, Math.min(newLast, naturalSize.width)])
  }

  /**
   * Removes the last column, merging its span into the column before it —
   * see handleRemoveRow for why the boundary before the dropped one must be
   * replaced by the true right edge rather than just truncating the array.
   */
  function handleRemoveCol() {
    if (!colBoundaries || colBoundaries.length <= 2) return
    setColBoundaries([...colBoundaries.slice(0, -2), colBoundaries[colBoundaries.length - 1]])
  }

  const draggableRowIndices = useMemo(() => new Set(Array.from({ length: rows - 1 }, (_, i) => i + 1)), [rows])
  const draggableColIndices = useMemo(() => new Set(Array.from({ length: cols - 1 }, (_, i) => i + 1)), [cols])

  return {
    imgRef,
    displaySize,
    rows,
    cols,
    rowBoundaries,
    colBoundaries,
    displayRowLines,
    displayColLines,
    draggableRowIndices,
    draggableColIndices,
    handleImageLoad,
    handleOverlayMouseMove,
    handleOverlayMouseUp,
    handleAutoAlignRows,
    handleAutoAlignCols,
    handleAddRow,
    handleRemoveRow,
    handleAddCol,
    handleRemoveCol,
    setDragTarget,
  }
}
