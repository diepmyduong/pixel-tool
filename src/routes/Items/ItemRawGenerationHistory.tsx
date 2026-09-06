import { memo, useEffect, useState } from 'react'
import { Card, Image, Space } from 'antd'
import type { RawGeneration } from '../../types'
import { listRawGenerations } from '../../lib/db'

interface ItemRawGenerationHistoryProps {
  refreshKey: number
  onSelect: (imageUrl: string) => void
}

function ItemRawGenerationHistory({ refreshKey, onSelect }: ItemRawGenerationHistoryProps) {
  const [generations, setGenerations] = useState<RawGeneration[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    listRawGenerations('item').then((list) => {
      if (cancelled) return
      const sorted = list.sort((a, b) => b.createdAt - a.createdAt)
      setGenerations(sorted)
      setUrls((prevUrls) => {
        const nextUrls: Record<string, string> = {}
        for (const gen of sorted) {
          nextUrls[gen.id] = prevUrls[gen.id] ?? URL.createObjectURL(gen.imageBlob)
        }
        for (const [id, url] of Object.entries(prevUrls)) {
          if (!nextUrls[id]) URL.revokeObjectURL(url)
        }
        return nextUrls
      })
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (generations.length === 0) {
    return null
  }

  return (
    <Card title="Past generations" size="small" style={{ marginTop: 16 }}>
      <Space wrap>
        {generations.map((gen) => (
          <div
            key={gen.id}
            onClick={() => onSelect(urls[gen.id])}
            style={{ cursor: 'pointer', border: '1px solid #eee' }}
          >
            <Image src={urls[gen.id]} width={60} height={100} style={{ objectFit: 'cover' }} preview={false} />
          </div>
        ))}
      </Space>
    </Card>
  )
}

export default memo(ItemRawGenerationHistory)
