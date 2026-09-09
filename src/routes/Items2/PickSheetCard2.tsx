import { useState } from 'react'
import { Alert, Button, Card, Modal, Progress, Space, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { Item2Sheet, ImageRef } from './useItem2Sheet'
import { sameRef } from './useItem2Sheet'
import GridBoundaryOverlay2 from '../../lib/GridBoundaryOverlay2'
import { upsampleImage, type JobProgress } from '../../lib/spriteApi'

interface PickSheetCard2Props {
  imageUrl: string
  flow2RequestId: string | undefined
  onUpscaled: (blob: Blob) => void
  sheet: Item2Sheet
}

/** The grid-alignment card: drag lines, add/remove rows/cols, and slice — feeds the DirectionVideosCard2 rendered elsewhere in the page. */
export default function PickSheetCard2({ imageUrl, flow2RequestId, onUpscaled, sheet }: PickSheetCard2Props) {
  const { grid, sliced, pickerTarget, setPickerTarget, uploadedCanvases, rowPoseRef, setPoseRef, handleSlice, handleUploadForPicker } =
    sheet

  const [upscaling, setUpscaling] = useState<'2K' | '4K' | null>(null)
  const [upscaleProgress, setUpscaleProgress] = useState<JobProgress | null>(null)
  const [upscaleError, setUpscaleError] = useState<string | null>(null)

  async function handleUpscale(resolution: '2K' | '4K') {
    if (!flow2RequestId) {
      message.error('This image has no upscale reference (only freshly generated images can be upscaled)')
      return
    }
    setUpscaling(resolution)
    setUpscaleProgress(null)
    setUpscaleError(null)
    try {
      const blob = await upsampleImage(flow2RequestId, resolution, setUpscaleProgress)
      onUpscaled(blob)
      message.success(`Upscaled to ${resolution}`)
    } catch (err) {
      setUpscaleError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpscaling(null)
    }
  }

  return (
    <Card title="Pick this sheet">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <GridBoundaryOverlay2 imageUrl={imageUrl} alt="Generated item grid" grid={grid} />

        <Typography.Text type="secondary">
          Drag any red line to align it with the actual cell boundary in the generated image. If
          the AI drew an extra or a missing direction, use "Add row"/"Remove row" (or "Add
          column"/"Remove column") to match the grid to what was actually generated, then slice.
        </Typography.Text>

        <Space wrap>
          <Button onClick={grid.handleAutoAlignRows} disabled={!grid.rowBoundaries}>
            Auto-align rows from first two
          </Button>
          <Button onClick={grid.handleAddRow} disabled={!grid.rowBoundaries}>
            Add row
          </Button>
          <Button onClick={grid.handleRemoveRow} disabled={!grid.rowBoundaries || grid.rows <= 1}>
            Remove row
          </Button>
          <Button onClick={grid.handleAutoAlignCols} disabled={!grid.colBoundaries || grid.cols < 2}>
            Auto-align columns from first two
          </Button>
          <Button onClick={grid.handleAddCol} disabled={!grid.colBoundaries}>
            Add column
          </Button>
          <Button onClick={grid.handleRemoveCol} disabled={!grid.colBoundaries || grid.cols <= 1}>
            Remove column
          </Button>
          <Button type="primary" onClick={handleSlice} disabled={!grid.rowBoundaries || !grid.colBoundaries}>
            Slice grid
          </Button>
        </Space>

        <Space wrap>
          <Typography.Text strong>Upscale source image:</Typography.Text>
          <Button loading={upscaling === '2K'} disabled={!!upscaling} onClick={() => handleUpscale('2K')}>
            Upscale to 2K
          </Button>
          <Button loading={upscaling === '4K'} disabled={!!upscaling} onClick={() => handleUpscale('4K')}>
            Upscale to 4K
          </Button>
        </Space>
        {upscaling && upscaleProgress && (
          <Progress percent={upscaleProgress.progress} status="active" format={() => upscaleProgress.status} />
        )}
        {upscaleError && <Alert type="error" message="Upscale failed" description={upscaleError} />}
      </Space>

      {sliced && (
        <Modal
          title={pickerTarget ? `Pick the ${pickerTarget.pose} image for row ${pickerTarget.row + 1}` : ''}
          open={pickerTarget !== null}
          onCancel={() => setPickerTarget(null)}
          footer={null}
          width={720}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Upload accept="image/*" maxCount={1} showUploadList={false} beforeUpload={handleUploadForPicker}>
              <Button icon={<UploadOutlined />}>Upload image instead</Button>
            </Upload>

            {uploadedCanvases.length > 0 && (
              <div>
                <Typography.Text type="secondary">Previously uploaded</Typography.Text>
                <div>
                  <Space wrap>
                    {uploadedCanvases.map((canvas, uploadIndex) => {
                      const ref: ImageRef = { source: 'upload', uploadIndex }
                      const selected = pickerTarget && sameRef(rowPoseRef[pickerTarget.row]?.[pickerTarget.pose], ref)
                      return (
                        <img
                          key={uploadIndex}
                          onClick={() => {
                            if (!pickerTarget) return
                            setPoseRef(pickerTarget.row, pickerTarget.pose, ref)
                            setPickerTarget(null)
                          }}
                          src={canvas.toDataURL('image/png')}
                          alt={`uploaded ${uploadIndex + 1}`}
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: 'contain',
                            background: '#eee',
                            cursor: 'pointer',
                            border: selected ? '2px solid #1677ff' : '1px solid #ddd',
                          }}
                        />
                      )
                    })}
                  </Space>
                </div>
              </div>
            )}

            <Typography.Text type="secondary">Or pick a cell from the sheet</Typography.Text>
            {Array.from({ length: grid.rows }, (_, row) => (
              <Space key={row} wrap>
                {Array.from({ length: grid.cols }, (_, col) => {
                  const cellIndex = row * grid.cols + col
                  const canvas = sliced[cellIndex]
                  if (!canvas) return null
                  const ref: ImageRef = { source: 'grid', cellIndex }
                  const selected = pickerTarget && sameRef(rowPoseRef[pickerTarget.row]?.[pickerTarget.pose], ref)
                  return (
                    <img
                      key={col}
                      onClick={() => {
                        if (!pickerTarget) return
                        setPoseRef(pickerTarget.row, pickerTarget.pose, ref)
                        setPickerTarget(null)
                      }}
                      src={canvas.toDataURL('image/png')}
                      alt={`row ${row + 1} col ${col + 1}`}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: 'contain',
                        background: '#eee',
                        cursor: 'pointer',
                        border: selected ? '2px solid #1677ff' : '1px solid #ddd',
                      }}
                    />
                  )
                })}
              </Space>
            ))}
          </Space>
        </Modal>
      )}
    </Card>
  )
}
