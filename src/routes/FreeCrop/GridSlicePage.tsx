import { Button, Card, Empty, InputNumber, Segmented, Space, Typography, Upload } from 'antd'
import { CloseOutlined, DownloadOutlined, ScissorOutlined, UploadOutlined } from '@ant-design/icons'
import { useGridSlice, type GridSliceMode } from './useGridSlice'
import GridSliceEditor from './GridSliceEditor'
import GridSlicePlayer from './GridSlicePlayer'
import GridSliceShapeEditor from './GridSliceShapeEditor'

export default function GridSlicePage() {
  const gridSlice = useGridSlice()

  function handleUpload(file: File): boolean {
    gridSlice.addSource(file)
    return false
  }

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Upload one or more images and cut each one with a grid (rows/columns, draggable lines), free rectangles, or
        polygons made of clicked points. Then review the frames, adjust their positions, and download them as a
        numbered ZIP.
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }} wrap>
        <Upload accept="image/*" multiple showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />}>Upload images</Button>
        </Upload>
        {gridSlice.images.length > 0 && (
          <>
            <Space size="small">
              <Typography.Text type="secondary">All: Rows</Typography.Text>
              <InputNumber
                size="small"
                min={1}
                max={100}
                value={gridSlice.rows}
                onChange={(value) => gridSlice.setRows(value ?? 1)}
                style={{ width: 70 }}
              />
              <Typography.Text type="secondary">Columns</Typography.Text>
              <InputNumber
                size="small"
                min={1}
                max={100}
                value={gridSlice.cols}
                onChange={(value) => gridSlice.setCols(value ?? 1)}
                style={{ width: 70 }}
              />
            </Space>
            <Button type="primary" icon={<ScissorOutlined />} loading={gridSlice.slicing} onClick={gridSlice.sliceGrid}>
              Slice all
            </Button>
            <Button onClick={() => gridSlice.resetLines()}>Reset all lines</Button>
            <Button danger onClick={gridSlice.clearAll}>
              Clear all
            </Button>
            <Space size="small">
              <Typography.Text type="secondary" title="Stretches every exported frame of every image to this size">
                Stretch output to
              </Typography.Text>
              <InputNumber
                size="small"
                min={1}
                placeholder="Width"
                value={gridSlice.exportWidth ?? undefined}
                onChange={(value) => gridSlice.setExportWidth(value ?? null)}
                style={{ width: 90 }}
              />
              <Typography.Text type="secondary">x</Typography.Text>
              <InputNumber
                size="small"
                min={1}
                placeholder="Height"
                value={gridSlice.exportHeight ?? undefined}
                onChange={(value) => gridSlice.setExportHeight(value ?? null)}
                style={{ width: 90 }}
              />
              <Button
                size="small"
                onClick={() => {
                  gridSlice.setExportWidth(null)
                  gridSlice.setExportHeight(null)
                }}
              >
                Reset
              </Button>
            </Space>
            {gridSlice.totalCells > 0 && (
              <Button icon={<DownloadOutlined />} loading={gridSlice.exporting} onClick={gridSlice.downloadAllAsZip}>
                Download all as ZIP ({gridSlice.totalCells})
              </Button>
            )}
          </>
        )}
      </Space>

      {gridSlice.images.length === 0 && <Empty description="Upload images to start slicing them into a grid" />}

      {gridSlice.images.map((img) => (
        <Card
          key={img.id}
          size="small"
          title={img.file.name}
          extra={
            <Space wrap>
              <Segmented
                size="small"
                value={img.mode}
                onChange={(value) => gridSlice.setImageMode(img.id, value as GridSliceMode)}
                options={[
                  { label: 'Grid', value: 'grid' },
                  { label: 'Rectangle', value: 'rect' },
                  { label: 'Polygon', value: 'polygon' },
                ]}
              />
              {img.mode === 'grid' && (
                <>
                  <Typography.Text type="secondary">Rows</Typography.Text>
                  <InputNumber
                    size="small"
                    min={1}
                    max={100}
                    value={img.rows}
                    onChange={(value) => gridSlice.setImageGrid(img.id, 'row', value ?? 1)}
                    style={{ width: 64 }}
                  />
                  <Typography.Text type="secondary">Cols</Typography.Text>
                  <InputNumber
                    size="small"
                    min={1}
                    max={100}
                    value={img.cols}
                    onChange={(value) => gridSlice.setImageGrid(img.id, 'col', value ?? 1)}
                    style={{ width: 64 }}
                  />
                  <Typography.Text type="secondary">= {img.rows * img.cols}</Typography.Text>
                  <Button size="small" onClick={() => gridSlice.resetLines(img.id)}>
                    Reset lines
                  </Button>
                </>
              )}
              {img.cells.length > 0 && (
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  loading={gridSlice.exporting}
                  onClick={() => gridSlice.downloadImageAsZip(img.id)}
                >
                  Download ({img.cells.length})
                </Button>
              )}
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => gridSlice.removeSource(img.id)} />
            </Space>
          }
          style={{ marginBottom: 16, overflow: 'auto' }}
        >
          {img.mode === 'grid' ? (
            <GridSliceEditor
              image={img.image}
              rowLines={img.rowLines}
              colLines={img.colLines}
              onMoveLine={(axis, index, fraction) => gridSlice.moveLine(img.id, axis, index, fraction)}
            />
          ) : (
            <GridSliceShapeEditor
              image={img.image}
              tool={img.mode}
              shapes={img.shapes}
              onChange={(shapes) => gridSlice.setShapes(img.id, shapes)}
            />
          )}

          {img.cells.length > 0 && (
            <GridSlicePlayer
              cells={img.cells}
              onTransformChange={(cellIndex, patch) => gridSlice.setCellTransform(img.id, cellIndex, patch)}
              onApplyToAll={(patch) => gridSlice.setAllCellTransforms(img.id, patch)}
              onResetTransforms={() => gridSlice.resetCellTransforms(img.id)}
              smoothScale={img.smoothScale}
              onSmoothScaleChange={(smooth) => gridSlice.setSmoothScale(img.id, smooth)}
              frameWidth={img.frameWidth}
              frameHeight={img.frameHeight}
              onFrameSizeChange={(width, height) => gridSlice.setFrameSize(img.id, width, height)}
              exporting={gridSlice.exporting}
              onDownloadSheet={(columns) => gridSlice.downloadSpriteSheet(img.id, columns)}
            />
          )}
        </Card>
      ))}
    </div>
  )
}
