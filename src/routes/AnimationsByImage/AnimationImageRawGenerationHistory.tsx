import { memo, useEffect, useState } from 'react'
import { Card, Space } from 'antd'
import type { RawGeneration } from '../../types'
import { listRawGenerations } from '../../lib/db'

interface AnimationImageRawGenerationHistoryProps {
  refreshKey: number
  onSelect: (imageUrl: string) => void
}

function AnimationImageRawGenerationHistory({ refreshKey, onSelect }: AnimationImageRawGenerationHistoryProps) {
  const [generations, setGenerations] = useState<RawGeneration[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    listRawGenerations('animation').then((list) => {
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
          <img
            key={gen.id}
            src={urls[gen.id]}
            onClick={() => onSelect(urls[gen.id])}
            alt="past generation"
            style={{ width: 68, height: 120, objectFit: 'cover', cursor: 'pointer', border: '1px solid #eee' }}
          />
        ))}
      </Space>
    </Card>
  )
}

export default memo(AnimationImageRawGenerationHistory)
