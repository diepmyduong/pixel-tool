import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Empty, Input, Pagination, Space, Typography } from 'antd'
import type { Item } from '../../types'
import { listItems } from '../../lib/db'

interface ItemGalleryProps {
  refreshKey: number
}

const PAGE_SIZE = 12

function ItemGallery({ refreshKey }: ItemGalleryProps) {
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    listItems().then((list) => {
      if (cancelled) return
      setItems(list)
      setUrls((prevUrls) => {
        const nextUrls: Record<string, string> = {}
        for (const item of list) {
          nextUrls[item.id] = prevUrls[item.id] ?? URL.createObjectURL(item.blob)
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

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [items, search],
  )
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  if (items.length === 0) {
    return <Empty description="No items saved yet" />
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
      {pageItems.length === 0 && <Empty description="No items match your search" />}
      <Space wrap size="middle">
        {pageItems.map((item) => (
          <Card key={item.id} size="small" style={{ width: 120, textAlign: 'center' }}>
            <img
              src={urls[item.id]}
              alt={item.name}
              style={{ width: 80, height: 80, objectFit: 'contain', background: '#eee' }}
            />
            <Typography.Text style={{ display: 'block', marginTop: 8 }}>{item.name}</Typography.Text>
          </Card>
        ))}
      </Space>
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

export default memo(ItemGallery)
