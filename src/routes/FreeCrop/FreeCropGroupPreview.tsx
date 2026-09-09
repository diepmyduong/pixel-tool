import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { scaleToFitCentered, type CropBox, type CropSource, type FreeCropBoxes } from './useFreeCropBoxes'

interface FreeCropGroupPreviewProps {
  groupName: string
  boxes: CropBox[]
  freeCrop: FreeCropBoxes
  showSourceTags: boolean
}

const PREVIEW_SIZE = 120
const FRAME_THUMB_SIZE = 44

/**
 * Grid of small thumbnails, one per decoded GIF frame of this box's source,
 * cropped to the box's own rect — click a thumbnail to toggle whether that
 * frame is included when this box's animation is previewed/exported.
 * Selected frames are highlighted; unselected ones are dimmed.
 */
function FreeCropBoxFramePicker({
  box,
  source,
  freeCrop,
}: {
  box: CropBox
  source: CropSource
  freeCrop: FreeCropBoxes
}) {
  const [thumbUrls, setThumbUrls] = useState<string[]>([])

  const boxRectKey = `${box.x}:${box.y}:${box.width}:${box.height}`

  useEffect(() => {
    let cancelled = false
    const frames = freeCrop.cropBoxAcrossAllGifFrames(box)
    Promise.all(
      frames.map(async (canvas) => {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
        })
        return URL.createObjectURL(blob)
      }),
    ).then((urls) => {
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u))
        return
      }
      setThumbUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u))
        return urls
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxRectKey, source.gifFrames, freeCrop.chromaKeyColors.join(',')])

  useEffect(() => {
    return () => {
      thumbUrls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = source.gifFrames?.length ?? 0
  const selected = box.selectedFrameIndices ?? Array.from({ length: total }, (_, i) => i)
  const selectedSet = new Set(selected)

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Space size={4} wrap style={{ marginTop: 6 }}>
        {thumbUrls.map((url, i) => {
          const isSelected = selectedSet.has(i)
          return (
            <div
              key={i}
              onClick={() => freeCrop.toggleBoxFrame(box.id, i)}
              title={`Frame ${i + 1}`}
              style={{
                width: FRAME_THUMB_SIZE,
                height: FRAME_THUMB_SIZE,
                border: isSelected ? '2px solid #1677ff' : '1px solid #d9d9d9',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: 'pointer',
                opacity: isSelected ? 1 : 0.35,
                background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 10px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={url} alt={`Frame ${i + 1}`} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </div>
          )
        })}
      </Space>
      <Space size="small" style={{ marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {selected.length}/{total} frames selected
        </Typography.Text>
        <Button
          size="small"
          type="link"
          style={{ padding: 0, fontSize: 11, height: 'auto' }}
          onClick={() => freeCrop.setBoxFrameSelection(box.id, null)}
        >
          Select all
        </Button>
        <Button
          size="small"
          type="link"
          style={{ padding: 0, fontSize: 11, height: 'auto' }}
          onClick={() => freeCrop.setBoxFrameSelection(box.id, [])}
        >
          Clear
        </Button>
      </Space>
    </div>
  )
}

/** Small self-contained play/loop preview for one group's ordered frames, cropped fresh from the source image on each render of the box list. */
export default function FreeCropGroupPreview({ groupName, boxes, freeCrop, showSourceTags }: FreeCropGroupPreviewProps) {
  const [frameUrls, setFrameUrls] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [durationSeconds, setDurationSeconds] = useState(0.3)

  const boxesKey = boxes
    .map((b) => `${b.id}:${b.x}:${b.y}:${b.width}:${b.height}:${b.order}:${b.sourceId}:${b.selectedFrameIndices?.join(',') ?? 'all'}`)
    .join('|')
  const isGif = freeCrop.groupHasGifFrames(boxes)

  useEffect(() => {
    let cancelled = false
    const orderedBoxes = boxes.slice().sort((a, b) => a.order - b.order)
    // Each box resolves against its OWN source (may differ per box in a
    // cross-source group) — for a GIF-sourced box, its selected decoded
    // frames of that box's own GIF, in order, so Play shows the real
    // (possibly hand-trimmed) animation rather than one static crop repeated.
    const resolved = orderedBoxes.flatMap((box) => {
      const frames = freeCrop.resolveBoxFrames(box)
      return frames.kind === 'gif' ? frames.canvases : [frames.canvas]
    })
    // Boxes may come from differently-sized sources — scale every frame up
    // (never down, aspect preserved) to match the group's largest frame so
    // the preview matches what the strip/ZIP export actually produces.
    const cellWidth = Math.max(...resolved.map((c) => c.width))
    const cellHeight = Math.max(...resolved.map((c) => c.height))
    const canvases = resolved.map((c) => scaleToFitCentered(c, cellWidth, cellHeight))
    Promise.all(
      canvases.map(async (canvas) => {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
        })
        return URL.createObjectURL(blob)
      }),
    ).then((urls) => {
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u))
        return
      }
      setFrameUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u))
        return urls
      })
      setIndex(0)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxesKey, freeCrop.chromaKeyColors.join(','), freeCrop.sources])

  useEffect(() => {
    return () => {
      frameUrls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!playing || frameUrls.length === 0) return
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = i + 1
        if (next >= frameUrls.length) {
          if (!loop) setPlaying(false)
          return loop ? 0 : i
        }
        return next
      })
    }, durationSeconds * 1000)
    return () => clearInterval(timer)
  }, [playing, frameUrls, loop, durationSeconds])

  const currentUrl = frameUrls[index]

  return (
    <Space direction="vertical" size="small" style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
      <Typography.Text strong>{groupName}</Typography.Text>
      <div
        style={{
          width: PREVIEW_SIZE,
          height: PREVIEW_SIZE,
          background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {currentUrl && (
          <img src={currentUrl} alt={groupName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <Space wrap size="small">
        <Button
          size="small"
          onClick={() => {
            if (index >= frameUrls.length - 1) setIndex(0)
            setPlaying(true)
          }}
          disabled={playing || frameUrls.length === 0}
        >
          Play
        </Button>
        <Button size="small" onClick={() => setPlaying(false)} disabled={!playing}>
          Stop
        </Button>
        <Typography.Text type="secondary">
          {frameUrls.length === 0 ? 0 : index + 1}/{frameUrls.length}
        </Typography.Text>
      </Space>
      <Space wrap size="small">
        <Switch checked={loop} onChange={setLoop} checkedChildren="Loop" unCheckedChildren="Once" size="small" />
        <InputNumber
          size="small"
          min={0.02}
          max={1}
          step={0.05}
          value={durationSeconds}
          onChange={(value) => setDurationSeconds(value ?? durationSeconds)}
          addonAfter="s"
          style={{ width: 100 }}
        />
      </Space>
      <Space wrap size="small">
        <Button size="small" onClick={() => freeCrop.downloadGroupStrip(groupName)}>
          Download sprite strip
        </Button>
        {isGif && (
          <Button size="small" onClick={() => freeCrop.downloadGroupZip(groupName)}>
            Download as ZIP (numbered frames)
          </Button>
        )}
      </Space>

      <Space direction="vertical" style={{ width: PREVIEW_SIZE * 2 }} size={4}>
        {boxes
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((box) => {
            const boxSource = freeCrop.sources.find((s) => s.id === box.sourceId)
            return (
              <div
                key={box.id}
                onClick={() => {
                  if (box.sourceId !== freeCrop.activeSourceId) freeCrop.setActiveSourceId(box.sourceId)
                  freeCrop.setSelectedId(box.id)
                }}
                style={{
                  border: box.id === freeCrop.selectedId ? '1px solid #1677ff' : '1px solid #f0f0f0',
                  borderRadius: 4,
                  padding: 6,
                  cursor: 'pointer',
                }}
              >
                <Space size="small" align="center">
                  <Input
                    size="small"
                    placeholder="group name"
                    value={box.group}
                    onChange={(e) => freeCrop.updateBoxGroup(box.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 120 }}
                  />
                  <InputNumber
                    size="small"
                    min={1}
                    value={box.order}
                    onChange={(value) => freeCrop.updateBoxOrder(box.id, value ?? box.order)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 56 }}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      freeCrop.deleteBox(box.id)
                    }}
                  />
                </Space>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {Math.round(box.width)}x{Math.round(box.height)} @ ({Math.round(box.x)},{Math.round(box.y)})
                  </Typography.Text>
                  {showSourceTags && boxSource && (
                    <Tag style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px' }}>{boxSource.name}</Tag>
                  )}
                </div>
                {boxSource?.gifFrames && (
                  <FreeCropBoxFramePicker box={box} source={boxSource} freeCrop={freeCrop} />
                )}
              </div>
            )
          })}
      </Space>
    </Space>
  )
}
