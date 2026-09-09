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
   * Removes one row and re-spreads the remaining rows evenly across the
   * same [first, last] span (first/last boundaries — i.e. the image's top
   * and bottom edges — never move). A naive version that just merged the
   * dropped row's span into its neighbor left the new last row several
   * times wider than the others whenever this was called more than once in
   * a row (each call kept compounding onto the same swollen last row),
   * badly misaligned from the sheet's actual cell content.
   */
  function handleRemoveRow() {
    if (!rowBoundaries || rowBoundaries.length <= 2) return
    const first = rowBoundaries[0]
    const last = rowBoundaries[rowBoundaries.length - 1]
    const nextCount = rowBoundaries.length - 2 // one fewer row than before
    const rowHeight = (last - first) / nextCount
    setRowBoundaries(Array.from({ length: nextCount + 1 }, (_, i) => Math.round(first + i * rowHeight)))
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
   * Removes one column and re-spreads the remaining columns evenly across
   * the same [first, last] span — see handleRemoveRow for why (a version
   * that merged the dropped column into its neighbor compounded into a
   * badly oversized last column after repeated calls).
   */
  function handleRemoveCol() {
    if (!colBoundaries || colBoundaries.length <= 2) return
    const first = colBoundaries[0]
    const last = colBoundaries[colBoundaries.length - 1]
    const nextCount = colBoundaries.length - 2 // one fewer column than before
    const colWidth = (last - first) / nextCount
    setColBoundaries(Array.from({ length: nextCount + 1 }, (_, i) => Math.round(first + i * colWidth)))
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
