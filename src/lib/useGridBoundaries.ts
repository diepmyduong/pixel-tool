import { useEffect, useMemo, useRef, useState } from 'react'
import { computeUniformBoundaries } from './imageProcessing'

interface NaturalSize {
  width: number
  height: number
}

type DragTarget = { axis: 'row' | 'col'; index: number } | null

/**
 * Drives the draggable grid-boundary overlay shared by the Character and
 * Item grid pickers: computes uniform row/col boundaries from the loaded
 * image, lets any interior line be dragged independently (clamped so cells
 * never invert), and offers an "auto-align rows from first two" shortcut
 * that re-derives the rest assuming even row spacing.
 */
export function useGridBoundaries(cols: number, rows: number, imageUrl: string) {
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
  }, [imageUrl])

  // Re-derive uniform boundaries whenever the requested row/col count
  // changes after the image has already loaded (e.g. the user correcting
  // the Columns input to match what the AI actually drew) — handleImageLoad
  // only fires once per image, so it can't pick this up on its own.
  useEffect(() => {
    if (!naturalSize) return
    setRowBoundaries(computeUniformBoundaries(rows, naturalSize.height))
    setColBoundaries(computeUniformBoundaries(cols, naturalSize.width))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, naturalSize])

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const natural = { width: img.naturalWidth, height: img.naturalHeight }
    setNaturalSize(natural)
    setDisplaySize({ width: img.clientWidth, height: img.clientHeight })
    setRowBoundaries(computeUniformBoundaries(rows, natural.height))
    setColBoundaries(computeUniformBoundaries(cols, natural.width))
  }

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

  const draggableRowIndices = useMemo(() => new Set(Array.from({ length: rows - 1 }, (_, i) => i + 1)), [rows])
  const draggableColIndices = useMemo(() => new Set(Array.from({ length: cols - 1 }, (_, i) => i + 1)), [cols])

  return {
    imgRef,
    displaySize,
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
    setDragTarget,
  }
}
