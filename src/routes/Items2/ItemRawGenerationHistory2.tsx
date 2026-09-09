import { memo, useEffect, useState } from 'react'
import { Button, Divider, Image, Space, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { RawGeneration } from '../../types'
import { listRawGenerations, saveRawGeneration } from '../../lib/db'

interface ItemRawGenerationHistory2Props {
  refreshKey: number
  onSelect: (imageBlob: Blob, flow2RequestId: string | undefined) => void
}

function ItemRawGenerationHistory2({ refreshKey, onSelect }: ItemRawGenerationHistory2Props) {
  const [generations, setGenerations] = useState<RawGeneration[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listRawGenerations('item2').then((list) => {
      if (cancelled) return
      const sorted = list.sort((a, b) => b.createdAt - a.createdAt)
      setGenerations(sorted)
      setUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url))
        return Object.fromEntries(sorted.map((gen) => [gen.id, URL.createObjectURL(gen.imageBlob)]))
      })
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey, localRefreshKey])

  useEffect(() => {
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUpload(file: File): Promise<boolean> {
    setUploading(true)
    try {
      await saveRawGeneration({
        id: crypto.randomUUID(),
        kind: 'item2',
        prompt: '',
        imageBlob: file,
        createdAt: Date.now(),
      })
      setLocalRefreshKey((k) => k + 1)
      message.success('Image uploaded')
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
    return false
  }

  return (
    <>
      <Divider titlePlacement="left" plain>
        Past generations
      </Divider>
      <Upload accept="image/*" maxCount={1} showUploadList={false} beforeUpload={handleUpload}>
        <Button size="small" icon={<UploadOutlined />} loading={uploading}>
          Upload image
        </Button>
      </Upload>
      <div style={{ marginTop: 12 }}>
        {generations.length === 0 ? (
          <Typography.Text type="secondary">No generations yet — upload an image to pick from here.</Typography.Text>
        ) : (
          <Space wrap>
            {generations.map((gen) => (
              <div
                key={gen.id}
                onClick={() => onSelect(gen.imageBlob, gen.flow2RequestId)}
                style={{ cursor: 'pointer', border: '1px solid #eee' }}
              >
                <Image src={urls[gen.id]} width={60} height={100} style={{ objectFit: 'cover' }} preview={false} />
              </div>
            ))}
          </Space>
        )}
      </div>
    </>
  )
}

export default memo(ItemRawGenerationHistory2)
