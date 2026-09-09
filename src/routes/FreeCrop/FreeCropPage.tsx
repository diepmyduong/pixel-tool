import { useEffect, useState } from 'react'
import { Button, Card, Checkbox, Empty, Slider, Space, Tabs, Typography, Upload } from 'antd'
import { PauseCircleOutlined, PlayCircleOutlined, UploadOutlined } from '@ant-design/icons'
import { useFreeCropBoxes } from './useFreeCropBoxes'
import FreeCropEditor from './FreeCropEditor'
import FreeCropGroupPreview from './FreeCropGroupPreview'
import type { ChromaKeyColor } from '../../lib/imageProcessing'

const CHROMA_KEY_OPTIONS: { label: string; value: ChromaKeyColor }[] = [
  { label: 'Green', value: 'green' },
  { label: 'Black', value: 'black' },
  { label: 'Gray', value: 'gray' },
  { label: 'Blue', value: 'blue' },
  { label: 'White', value: 'white' },
]

export default function FreeCropPage() {
  const freeCrop = useFreeCropBoxes()
  const [gifPlaying, setGifPlaying] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (freeCrop.selectedId) freeCrop.deleteBox(freeCrop.selectedId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [freeCrop])

  // Raw-GIF preview playback for the active source, at each decoded frame's
  // own delay — stops automatically if the active source is switched/cleared
  // or its frames change. Switching sources always stops playback (below).
  const activeSource = freeCrop.activeSource
  const gifFrames = activeSource?.gifFrames ?? null
  const activeSourceId = activeSource?.id ?? null
  useEffect(() => {
    if (!gifPlaying || !gifFrames || gifFrames.length === 0 || !activeSourceId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    function step(i: number) {
      if (cancelled || !gifFrames || !activeSourceId) return
      freeCrop.setSourceFrameIndex(activeSourceId, i)
      timer = setTimeout(() => step((i + 1) % gifFrames.length), gifFrames[i].delayMs)
    }
    step(activeSource?.frameIndex ?? 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifPlaying, gifFrames, activeSourceId])

  // antd calls beforeUpload once per selected file, each time with the FULL
  // batch as fileList — only act on the first callback of a batch (identified
  // by referential equality of the file at index 0) so a multi-file selection
  // adds each file exactly once instead of once per file in the batch.
  function handleUpload(file: File, fileList: File[]): boolean {
    if (fileList[0] === file) {
      setGifPlaying(false)
      freeCrop.addSources(fileList)
    }
    return false
  }

  const groups = freeCrop.groupedBoxes()
  const hasSources = freeCrop.sources.length > 0
  const showSourceTabs = freeCrop.sources.length > 1
  const activeBoxes = freeCrop.boxes.filter((b) => b.sourceId === freeCrop.activeSourceId)

  return (
    <div>
      <Typography.Title level={3}>Free Crop</Typography.Title>
      <Typography.Paragraph type="secondary">
        Upload sprite sheet images or animated GIFs, draw arbitrary rectangular boxes, group boxes into animations
        (even across different uploaded sources), and export cropped frames or per-group sprite strips.
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }}>
        <Upload accept="image/*,.gif" multiple showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />}>{hasSources ? 'Add more images' : 'Upload images'}</Button>
        </Upload>
        {hasSources && (
          <>
            <Space size="small">
              <Typography.Text type="secondary">Remove background color(s)</Typography.Text>
              <Checkbox.Group
                options={CHROMA_KEY_OPTIONS}
                value={freeCrop.chromaKeyColors}
                onChange={(values) => freeCrop.setChromaKeyColors(values as ChromaKeyColor[])}
              />
            </Space>
            <Button
              type="primary"
              loading={freeCrop.exporting}
              onClick={freeCrop.downloadAllAsZip}
              disabled={freeCrop.boxes.length === 0}
            >
              Download all frames as ZIP
            </Button>
          </>
        )}
      </Space>

      {!hasSources && <Empty description="Upload one or more images or GIFs to start drawing crop boxes" />}

      {hasSources && showSourceTabs && (
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={freeCrop.activeSourceId ?? undefined}
          onChange={(key) => {
            setGifPlaying(false)
            freeCrop.setActiveSourceId(key)
          }}
          onEdit={(key, action) => {
            if (action === 'remove' && typeof key === 'string') {
              setGifPlaying(false)
              freeCrop.removeSource(key)
            }
          }}
          items={freeCrop.sources.map((source) => ({ key: source.id, label: source.name, closable: true }))}
          style={{ marginBottom: 8 }}
        />
      )}

      {hasSources && freeCrop.gifLoading && !activeSource?.image && <Empty description="Decoding GIF frames..." />}

      {hasSources && activeSource?.image && (
        <>
          <Card size="small" title="Draw boxes on the image" style={{ overflow: 'auto', marginBottom: 16 }}>
            {activeSource.gifFrames && (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                This is an animated GIF: draw one box around each character's fixed on-screen position — it will be
                cropped from every decoded frame automatically to produce that character's full animation.
              </Typography.Text>
            )}
            <FreeCropEditor
              image={activeSource.image}
              boxes={activeBoxes}
              selectedId={freeCrop.selectedId}
              onSelect={freeCrop.setSelectedId}
              onAddBox={freeCrop.addBox}
              onUpdateBoxRect={freeCrop.updateBoxRect}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              Drag on empty space to draw a new box. Click a box to select it, drag its body to move it or its handles
              to resize it. Press Delete/Backspace to remove the selected box. Boxes with no group name are grouped
              under "untitled" below.
            </Typography.Paragraph>
            {activeSource.gifFrames && (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Space>
                  <Button
                    size="small"
                    icon={gifPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => setGifPlaying((p) => !p)}
                  >
                    {gifPlaying ? 'Stop' : 'Play'}
                  </Button>
                  <Typography.Text type="secondary">
                    Frame {activeSource.frameIndex + 1}/{activeSource.gifFrames.length}
                  </Typography.Text>
                </Space>
                <Slider
                  min={0}
                  max={activeSource.gifFrames.length - 1}
                  step={1}
                  value={activeSource.frameIndex}
                  onChange={(value) => {
                    setGifPlaying(false)
                    freeCrop.setSourceFrameIndex(activeSource.id, value)
                  }}
                />
              </Space>
            )}
          </Card>

          <Card size="small" title="Group previews">
            {groups.size === 0 && (
              <Empty description="Draw boxes and assign group names to preview" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {Array.from(groups.entries()).map(([groupName, groupBoxes]) => (
                <FreeCropGroupPreview
                  key={groupName}
                  groupName={groupName}
                  boxes={groupBoxes}
                  freeCrop={freeCrop}
                  showSourceTags={showSourceTabs}
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
