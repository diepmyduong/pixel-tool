import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Empty, Input, Pagination, Space, Tag } from 'antd'
import type { Animation } from '../../types'
import { listAnimationsForCharacter } from '../../lib/db'

interface AnimationGalleryProps {
  characterId: string | null
  refreshKey: number
}

const PAGE_SIZE = 10

function AnimationGallery({ characterId, refreshKey }: AnimationGalleryProps) {
  const [animations, setAnimations] = useState<Animation[]>([])
  const [frameUrls, setFrameUrls] = useState<Record<string, string[]>>({})
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!characterId) {
      setAnimations([])
      return
    }
    let cancelled = false
    listAnimationsForCharacter(characterId).then((list) => {
      if (cancelled) return
      setAnimations(list)
      setFrameUrls((prev) => {
        Object.values(prev).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
        return Object.fromEntries(list.map((a) => [a.id, a.frameBlobs.map((b) => URL.createObjectURL(b))]))
      })
      setAudioUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url))
        return Object.fromEntries(list.map((a) => [a.id, URL.createObjectURL(a.audioBlob)]))
      })
    })
    return () => {
      cancelled = true
    }
  }, [characterId, refreshKey])

  useEffect(() => {
    return () => {
      Object.values(frameUrls).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
      Object.values(audioUrls).forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(
    () =>
      animations.filter((a) => (a.groupName ?? '').toLowerCase().includes(search.trim().toLowerCase())),
    [animations, search],
  )
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  if (!characterId) {
    return <Empty description="Select a character to see its animations" />
  }
  if (animations.length === 0) {
    return <Empty description="No animations saved yet" />
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Input.Search
        placeholder="Search by group name"
        allowClear
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      {pageItems.length === 0 && <Empty description="No animations match your search" />}
      {pageItems.map((animation) => (
        <Card
          key={animation.id}
          size="small"
          title={
            <Space>
              <Tag color="blue">{animation.state}</Tag>
              <Tag>{animation.direction}</Tag>
              <Tag color={animation.groupName ? 'green' : 'default'}>{animation.groupName || 'Ungrouped'}</Tag>
            </Space>
          }
        >
          <Space wrap>
            {frameUrls[animation.id]?.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`frame ${i + 1}`}
                style={{ width: 64, height: 64, objectFit: 'contain', background: '#eee' }}
              />
            ))}
          </Space>
          <audio controls src={audioUrls[animation.id]} style={{ display: 'block', marginTop: 8, width: '100%' }} />
        </Card>
      ))}
      {filtered.length > PAGE_SIZE && (
        <Pagination
          current={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onChange={setPage}
          style={{ textAlign: 'center' }}
        />
      )}
    </Space>
  )
}

export default memo(AnimationGallery)
