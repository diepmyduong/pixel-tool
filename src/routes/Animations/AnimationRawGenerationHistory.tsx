import { memo, useEffect, useState } from 'react'
import { Card, Space } from 'antd'
import type { RawVideoGeneration } from '../../types'
import { listRawVideoGenerationsByKind } from '../../lib/db'

interface AnimationRawGenerationHistoryProps {
  refreshKey: number
  onSelect: (videoBlob: Blob) => void
}

function AnimationRawGenerationHistory({ refreshKey, onSelect }: AnimationRawGenerationHistoryProps) {
  const [generations, setGenerations] = useState<RawVideoGeneration[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    listRawVideoGenerationsByKind('grid_2x2').then((list) => {
      if (cancelled) return
      const sorted = list.sort((a, b) => b.createdAt - a.createdAt)
      setGenerations(sorted)
      setUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url))
        return Object.fromEntries(sorted.map((gen) => [gen.id, URL.createObjectURL(gen.videoBlob)]))
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
    <Card title="Past video generations" size="small" style={{ marginTop: 16 }}>
      <Space wrap>
        {generations.map((gen) => (
          <video
            key={gen.id}
            src={urls[gen.id]}
            onClick={() => onSelect(gen.videoBlob)}
            muted
            style={{ width: 120, height: 68, objectFit: 'cover', cursor: 'pointer', border: '1px solid #eee' }}
          />
        ))}
      </Space>
    </Card>
  )
}

export default memo(AnimationRawGenerationHistory)
