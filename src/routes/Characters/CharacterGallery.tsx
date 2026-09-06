import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Empty, Input, Pagination, Space, Tag, Typography } from 'antd'
import type { Character, View } from '../../types'
import { VIEW_ORDER } from '../../types'
import { listCharacters } from '../../lib/db'

export interface CharacterGalleryHandle {
  refresh: () => void
}

interface CharacterGalleryProps {
  refreshKey: number
}

const PAGE_SIZE = 10

function CharacterGallery({ refreshKey }: CharacterGalleryProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [viewUrls, setViewUrls] = useState<Record<string, Record<View, string>>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    listCharacters().then((list) => {
      if (cancelled) return
      setCharacters(list)
      setViewUrls((prevUrls) => {
        const nextUrls: Record<string, Record<View, string>> = {}
        for (const character of list) {
          nextUrls[character.id] =
            prevUrls[character.id] ??
            (Object.fromEntries(VIEW_ORDER.map((view) => [view, URL.createObjectURL(character.viewBlobs[view])])) as Record<View, string>)
        }
        for (const [id, urls] of Object.entries(prevUrls)) {
          if (!nextUrls[id]) Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
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
      Object.values(viewUrls).forEach((urls) => Object.values(urls).forEach((url) => URL.revokeObjectURL(url)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(
    () => characters.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
    [characters, search],
  )
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  if (characters.length === 0) {
    return <Empty description="No characters saved yet" />
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Input.Search
        placeholder="Search by name"
        allowClear
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      {pageItems.length === 0 && <Empty description="No characters match your search" />}
      {pageItems.map((character) => (
        <Card key={character.id} size="small" title={character.name}>
          <Space>
            {VIEW_ORDER.map((view) => (
              <div key={view} style={{ textAlign: 'center' }}>
                <img
                  src={viewUrls[character.id]?.[view]}
                  alt={view}
                  style={{ width: 64, height: 64, objectFit: 'contain', background: '#eee' }}
                />
                <div>
                  <Tag>{view}</Tag>
                </div>
              </div>
            ))}
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {character.description}
          </Typography.Paragraph>
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

export default memo(CharacterGallery)
