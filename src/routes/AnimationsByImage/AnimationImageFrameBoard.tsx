import { useMemo, useState } from 'react'
import { Button, Card, Col, Row, Space, Tag, Typography, message } from 'antd'
import AnimationPlayer from './AnimationPlayer'
import type { Direction, StateGroup } from '../../types'
import { ANIM_IMG_SLOT_COUNT, animationImageCellsForDirection, DIRECTION_ORDER } from '../../lib/grid'
import { canvasToBlob } from '../../lib/imageProcessing'

interface AnimationImageFrameBoardProps {
  cells: (HTMLCanvasElement | undefined)[]
  cols: number
  state: StateGroup
  onSaved: (framesByDirection: Record<Direction, Blob[]>) => Promise<void>
}

const SLOT_SIZE = 160
const POOL_SIZE = 160

/**
 * Mirrors ItemAssignBoard's two-panel pattern: a bucket per direction on the
 * left shows its filled slots (in order, with a live player) so all four
 * directions can be reviewed at once, and the right panel is the pool of
 * generated frames for whichever direction is active — click a pool frame to
 * drop it into the active slot. The same frame can fill more than one slot
 * (a row can come up short on usable frames; repeating one beats blocking).
 */
export default function AnimationImageFrameBoard({ cells, cols, state, onSaved }: AnimationImageFrameBoardProps) {
  const slotCount = ANIM_IMG_SLOT_COUNT[state]
  const [activeDirection, setActiveDirection] = useState<Direction>('up')
  const [activeSlotIndex, setActiveSlotIndex] = useState(0)
  const [slots, setSlots] = useState<Record<Direction, (number | null)[]>>(() =>
    Object.fromEntries(DIRECTION_ORDER.map((d) => [d, Array(slotCount).fill(null)])) as Record<
      Direction,
      (number | null)[]
    >,
  )
  const [saving, setSaving] = useState(false)

  const dataUrls = useMemo(() => cells.map((canvas) => canvas?.toDataURL('image/png')), [cells])

  function assignSlot(direction: Direction, slotIndex: number, cellIndex: number) {
    setSlots((prev) => {
      const next = { ...prev, [direction]: [...prev[direction]] }
      next[direction][slotIndex] = cellIndex
      return next
    })
  }

  function clearSlot(direction: Direction, slotIndex: number) {
    setSlots((prev) => {
      const next = { ...prev, [direction]: [...prev[direction]] }
      next[direction][slotIndex] = null
      return next
    })
  }

  function handlePoolFrameClick(cellIndex: number) {
    assignSlot(activeDirection, activeSlotIndex, cellIndex)
    setActiveSlotIndex((i) => Math.min(i + 1, slotCount - 1))
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const framesByDirection = {} as Record<Direction, Blob[]>
      for (const direction of DIRECTION_ORDER) {
        const blobs: Blob[] = []
        for (const cellIndex of slots[direction]) {
          if (cellIndex === null) continue
          const canvas = cells[cellIndex]
          if (!canvas) continue
          blobs.push(await canvasToBlob(canvas))
        }
        if (blobs.length > 0) framesByDirection[direction] = blobs
      }
      if (Object.keys(framesByDirection).length === 0) {
        message.warning('Fill in at least one slot before saving')
        return
      }
      await onSaved(framesByDirection)
      message.success('Saved animations')
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const poolCells = animationImageCellsForDirection(cols, activeDirection)
  const totalFilled = DIRECTION_ORDER.reduce((sum, d) => sum + slots[d].filter((s) => s !== null).length, 0)

  return (
    <Card
      title="Pick frames"
      extra={
        <Button type="primary" onClick={handleSaveAll} disabled={totalFilled === 0} loading={saving}>
          Save these frames
        </Button>
      }
    >
      <Typography.Text type="secondary">
        Click a direction to review it, click one of its slots to make it active, then click a
        frame on the right to fill it — in the order that plays smoothest. The same frame can fill
        more than one slot.
      </Typography.Text>

      <Row gutter={24} style={{ marginTop: 16 }}>
        <Col span={10}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {DIRECTION_ORDER.map((direction) => {
              const dirSlots = slots[direction]
              const filled = dirSlots.filter((s) => s !== null).length
              const isActive = direction === activeDirection
              const playerUrls = dirSlots
                .map((cellIndex) => (cellIndex !== null ? dataUrls[cellIndex] : undefined))
                .filter((url): url is string => !!url)
              return (
                <Card
                  key={direction}
                  size="small"
                  title={
                    <Space>
                      <span>{direction}</span>
                      <Tag color={filled === slotCount ? 'green' : 'default'}>
                        {filled}/{slotCount}
                      </Tag>
                    </Space>
                  }
                  onClick={() => setActiveDirection(direction)}
                  style={{ cursor: 'pointer', border: isActive ? '2px solid #1677ff' : '1px solid #f0f0f0' }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <Space wrap style={{ flex: 1 }}>
                      {dirSlots.map((cellIndex, i) => {
                        const url = cellIndex !== null ? dataUrls[cellIndex] : undefined
                        const isActiveSlot = isActive && i === activeSlotIndex
                        return (
                          <div
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveDirection(direction)
                              setActiveSlotIndex(i)
                            }}
                            style={{
                              width: SLOT_SIZE,
                              height: SLOT_SIZE,
                              background: '#eee',
                              cursor: 'pointer',
                              position: 'relative',
                              outline: isActiveSlot ? '3px solid #fa8c16' : '1px dashed #999',
                            }}
                          >
                            {url ? (
                              <img
                                src={url}
                                alt={`${direction} slot ${i + 1}`}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  imageRendering: 'pixelated',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#999',
                                  fontSize: 12,
                                }}
                              >
                                {i + 1}
                              </div>
                            )}
                            {url && (
                              <Button
                                size="small"
                                danger
                                onClick={(e) => {
                                  e.stopPropagation()
                                  clearSlot(direction, i)
                                }}
                                style={{ position: 'absolute', top: -8, right: -8, minWidth: 18, padding: '0 4px' }}
                              >
                                x
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </Space>
                    <AnimationPlayer frameUrls={playerUrls} size={SLOT_SIZE} />
                  </div>
                </Card>
              )
            })}
          </Space>
        </Col>

        <Col span={14}>
          <Card size="small" title={`Generated frames — ${activeDirection}`}>
            <Space wrap>
              {poolCells.map((cell) => {
                const url = dataUrls[cell.cellIndex]
                if (!url) return null
                return (
                  <img
                    key={cell.cellIndex}
                    src={url}
                    alt={`${activeDirection} frame ${(cell.frameIndex ?? 0) + 1}`}
                    onClick={() => handlePoolFrameClick(cell.cellIndex)}
                    style={{
                      width: POOL_SIZE,
                      height: POOL_SIZE,
                      objectFit: 'contain',
                      background: '#eee',
                      cursor: 'pointer',
                      outline: '1px solid #ccc',
                      imageRendering: 'pixelated',
                    }}
                  />
                )
              })}
            </Space>
          </Card>
        </Col>
      </Row>
    </Card>
  )
}
