import { useState } from 'react'
import { Button, Card, Col, Empty, Row, Space, Tag, Typography, message } from 'antd'
import { canvasToBlob } from '../../lib/imageProcessing'
import { saveItem } from '../../lib/db'

interface ItemAssignBoardProps {
  cells: (HTMLCanvasElement | undefined)[]
  itemNames: string[]
  prompt: string
  onSaved: () => void
}

const THUMB_SIZE = 72

function CellThumb({
  canvas,
  cellIndex,
  selected,
  onClick,
}: {
  canvas: HTMLCanvasElement
  cellIndex: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <img
      key={cellIndex}
      onClick={onClick}
      src={canvas.toDataURL('image/png')}
      alt={`grid cell ${cellIndex}`}
      style={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        objectFit: 'contain',
        background: '#eee',
        border: selected ? '2px solid #1677ff' : '2px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    />
  )
}

/**
 * Two-panel assignment UI: item-name buckets on the left (click a bucket
 * to make it "active"), the pool of not-yet-assigned cells on the right.
 * Clicking a pooled cell while a bucket is active moves that cell into the
 * bucket; clicking an already-assigned cell (shown inside its bucket)
 * moves it back to the pool.
 */
export default function ItemAssignBoard({ cells, itemNames, prompt, onSaved }: ItemAssignBoardProps) {
  const [activeItem, setActiveItem] = useState<string | null>(itemNames[0] ?? null)
  // Maps cellIndex -> assigned item name. Absent = still in the pool.
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const validCellIndices = cells
    .map((canvas, cellIndex) => (canvas ? cellIndex : null))
    .filter((i): i is number => i !== null)

  const pooledCellIndices = validCellIndices.filter((i) => assignments[i] === undefined)
  const assignedCount = Object.keys(assignments).length

  function handlePoolCellClick(cellIndex: number) {
    if (!activeItem) return
    setAssignments((prev) => ({ ...prev, [cellIndex]: activeItem }))
  }

  function handleBucketCellClick(cellIndex: number) {
    setAssignments((prev) => {
      const next = { ...prev }
      delete next[cellIndex]
      return next
    })
  }

  async function handleSaveAll() {
    if (assignedCount === 0) return
    setSaving(true)
    try {
      for (const [cellIndexStr, name] of Object.entries(assignments)) {
        const canvas = cells[Number(cellIndexStr)]
        if (!canvas) continue
        const blob = await canvasToBlob(canvas)
        await saveItem({ id: crypto.randomUUID(), name, blob, prompt, createdAt: Date.now() })
      }
      message.success(`Saved ${assignedCount} item(s)`)
      onSaved()
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Assign cells to items"
      extra={
        <Space>
          <Tag color={assignedCount > 0 ? 'blue' : 'default'}>{assignedCount} assigned</Tag>
          <Button type="primary" onClick={handleSaveAll} disabled={assignedCount === 0} loading={saving}>
            Save assigned items
          </Button>
        </Space>
      }
    >
      <Typography.Text type="secondary">
        Click an item on the left to make it active, then click cells on the right to add them to
        it. Click an assigned cell (shown under its item) to send it back to the pool.
      </Typography.Text>

      <Row gutter={24} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {itemNames.map((name) => {
              const bucketCellIndices = validCellIndices.filter((i) => assignments[i] === name)
              const isActive = activeItem === name
              return (
                <Card
                  key={name}
                  size="small"
                  onClick={() => setActiveItem(name)}
                  title={name}
                  extra={<Tag>{bucketCellIndices.length}</Tag>}
                  style={{
                    cursor: 'pointer',
                    border: isActive ? '2px solid #1677ff' : '1px solid #f0f0f0',
                  }}
                >
                  {bucketCellIndices.length === 0 ? (
                    <Typography.Text type="secondary">
                      {isActive ? 'Active — click cells on the right to add them here' : 'No cells yet'}
                    </Typography.Text>
                  ) : (
                    <Space wrap>
                      {bucketCellIndices.map((cellIndex) => (
                        <CellThumb
                          key={cellIndex}
                          canvas={cells[cellIndex]!}
                          cellIndex={cellIndex}
                          selected
                          onClick={() => handleBucketCellClick(cellIndex)}
                        />
                      ))}
                    </Space>
                  )}
                </Card>
              )
            })}
          </Space>
        </Col>

        <Col span={16}>
          <Card size="small" title={`Unassigned cells (${pooledCellIndices.length})`}>
            {pooledCellIndices.length === 0 ? (
              <Empty description="All cells assigned" />
            ) : (
              <Space wrap>
                {pooledCellIndices.map((cellIndex) => (
                  <CellThumb
                    key={cellIndex}
                    canvas={cells[cellIndex]!}
                    cellIndex={cellIndex}
                    selected={false}
                    onClick={() => handlePoolCellClick(cellIndex)}
                  />
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  )
}
