import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Empty, Input, Pagination, Space, Tag, Typography } from 'antd'
import type { Character2, Direction8 } from '../../types'
import { DIRECTION8_ORDER } from '../../types'
import { listCharacters2 } from '../../lib/db'

interface CharacterGallery2Props {
  refreshKey: number
}

const PAGE_SIZE = 10

function CharacterGallery2({ refreshKey }: CharacterGallery2Props) {
  const [characters, setCharacters] = useState<Character2[]>([])
  const [standUrls, setStandUrls] = useState<Record<string, Record<Direction8, string>>>({})
  const [runUrls, setRunUrls] = useState<Record<string, Record<Direction8, string>>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    listCharacters2().then((list) => {
      if (cancelled) return
      setCharacters(list)
      const buildUrls = (prev: Record<string, Record<Direction8, string>>, pick: (c: Character2) => Record<Direction8, Blob>) => {
        const next: Record<string, Record<Direction8, string>> = {}
        for (const character of list) {
          next[character.id] =
            prev[character.id] ??
            (Object.fromEntries(
              DIRECTION8_ORDER.map((d) => [d, URL.createObjectURL(pick(character)[d])]),
            ) as Record<Direction8, string>)
        }
        for (const [id, urls] of Object.entries(prev)) {
          if (!next[id]) Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
        }
        return next
      }
      setStandUrls((prev) => buildUrls(prev, (c) => c.standBlobs))
      setRunUrls((prev) => buildUrls(prev, (c) => c.runBlobs))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    return () => {
      Object.values(standUrls).forEach((urls) => Object.values(urls).forEach((url) => URL.revokeObjectURL(url)))
      Object.values(runUrls).forEach((urls) => Object.values(urls).forEach((url) => URL.revokeObjectURL(url)))
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
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">Stand</Typography.Text>
              <br />
              <Space wrap>
                {DIRECTION8_ORDER.map((direction) => (
                  <div key={direction} style={{ textAlign: 'center' }}>
                    <img
                      src={standUrls[character.id]?.[direction]}
                      alt={direction}
                      style={{ width: 56, height: 56, objectFit: 'contain', background: '#eee' }}
                    />
                    <div>
                      <Tag>{direction}</Tag>
                    </div>
                  </div>
                ))}
              </Space>
            </div>
            <div>
              <Typography.Text type="secondary">Run</Typography.Text>
              <br />
              <Space wrap>
                {DIRECTION8_ORDER.map((direction) => (
                  <div key={direction} style={{ textAlign: 'center' }}>
                    <img
                      src={runUrls[character.id]?.[direction]}
                      alt={direction}
                      style={{ width: 56, height: 56, objectFit: 'contain', background: '#eee' }}
                    />
                    <div>
                      <Tag>{direction}</Tag>
                    </div>
                  </div>
                ))}
              </Space>
            </div>
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

export default memo(CharacterGallery2)
