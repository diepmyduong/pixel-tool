import { memo, useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Space, Tag, Typography } from 'antd'
import { DownloadOutlined, ScissorOutlined } from '@ant-design/icons'
import type { Item2VideoEntry } from '../../types'
import { listItem2VideoSessions } from '../../lib/db'
import Item2CutFramesModal from './Item2CutFramesModal'

interface Item2SpriteSheetsPageProps {
  refreshKey: number
  onSpriteSheetSaved?: () => void
}

const POSE_COLOR: Record<Item2VideoEntry['pose'], string> = {
  stand: 'blue',
  attacked: 'volcano',
}

interface SheetItem {
  sessionId: string
  sessionName: string
  videoIndex: number
  direction: Item2VideoEntry['direction']
  pose: Item2VideoEntry['pose']
  sheetBlob: Blob
  videoBlob: Blob
  createdAt: number
}

/**
 * Flat list of every sprite sheet saved via VideoV2SpriteSheetEditor's "Save
 * to Video history" button, pulled out of each session's videos — kept
 * separate from Item2VideoHistoryPage (which only shows raw videos) so
 * finished sheets aren't buried among unfinished/uncut cells. Each card also
 * carries the source video + a "Cut frames" button so a saved sheet can be
 * redone from scratch without hunting the original video down in Video history.
 */
function Item2SpriteSheetsPage({ refreshKey, onSpriteSheetSaved }: Item2SpriteSheetsPageProps) {
  const [sheets, setSheets] = useState<SheetItem[]>([])
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const [sheetUrls, setSheetUrls] = useState<Record<string, string>>({})
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [cutTarget, setCutTarget] = useState<{ key: string; sessionId: string; videoIndex: number; url: string; title: string } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    listItem2VideoSessions().then((sessions) => {
      if (cancelled) return
      const items: SheetItem[] = []
      for (const session of sessions) {
        session.videos.forEach((video, videoIndex) => {
          if (!video.spriteSheetBlob) return
          items.push({
            sessionId: session.id,
            sessionName: session.name || 'Untitled',
            videoIndex,
            direction: video.direction,
            pose: video.pose,
            sheetBlob: video.spriteSheetBlob,
            videoBlob: video.videoBlob,
            createdAt: video.createdAt,
          })
        })
      }
      items.sort((a, b) => b.createdAt - a.createdAt)
      setSheets(items)
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey, localRefreshKey])

  useEffect(() => {
    const created = Object.fromEntries(
      sheets.map((s) => [`${s.sessionId}-${s.videoIndex}`, URL.createObjectURL(s.sheetBlob)]),
    )
    setSheetUrls(created)
    return () => {
      Object.values(created).forEach((u) => URL.revokeObjectURL(u))
    }
  }, [sheets])

  useEffect(() => {
    const created = Object.fromEntries(
      sheets.map((s) => [`${s.sessionId}-${s.videoIndex}`, URL.createObjectURL(s.videoBlob)]),
    )
    setVideoUrls(created)
    return () => {
      Object.values(created).forEach((u) => URL.revokeObjectURL(u))
    }
  }, [sheets])

  function handleSpriteSheetSaved() {
    setLocalRefreshKey((k) => k + 1)
    onSpriteSheetSaved?.()
  }

  const cards = useMemo(
    () =>
      sheets.map((sheet) => {
        const key = `${sheet.sessionId}-${sheet.videoIndex}`
        const sheetUrl = sheetUrls[key]
        const videoUrl = videoUrls[key]
        return (
          <Card key={key} size="small" style={{ width: 300 }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Space size={4}>
                <Tag color={POSE_COLOR[sheet.pose]}>{sheet.pose}</Tag>
                <Tag>{sheet.direction}</Tag>
              </Space>
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {sheet.sessionName}
              </Typography.Text>
              {sheetUrl && (
                <img
                  src={sheetUrl}
                  alt="Saved sprite sheet"
                  style={{
                    width: '100%',
                    background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 12px 12px',
                  }}
                />
              )}
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  if (!sheetUrl) return
                  const a = document.createElement('a')
                  a.href = sheetUrl
                  a.download = `${sheet.direction}_${sheet.pose}_sheet.png`
                  a.click()
                }}
              >
                Download
              </Button>

              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                Source video
              </Typography.Text>
              {videoUrl && (
                <video src={videoUrl} controls loop style={{ width: '100%', background: '#000' }} />
              )}
              <Button
                size="small"
                icon={<ScissorOutlined />}
                onClick={() =>
                  videoUrl &&
                  setCutTarget({
                    key,
                    sessionId: sheet.sessionId,
                    videoIndex: sheet.videoIndex,
                    url: videoUrl,
                    title: `${sheet.direction}-${sheet.pose}`,
                  })
                }
              >
                Cut frames (redo)
              </Button>
            </Space>
          </Card>
        )
      }),
    [sheets, sheetUrls, videoUrls],
  )

  if (sheets.length === 0) {
    return (
      <Empty description="No sprite sheets saved yet — use “Save to Video history” in the Sprite Sheet Editor" />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{cards}</div>
      {cutTarget && (
        <Item2CutFramesModal
          open
          videoUrl={cutTarget.url}
          title={cutTarget.title}
          saveTarget={{ sessionId: cutTarget.sessionId, videoIndex: cutTarget.videoIndex }}
          onSpriteSheetSaved={handleSpriteSheetSaved}
          onClose={() => setCutTarget(null)}
        />
      )}
    </>
  )
}

export default memo(Item2SpriteSheetsPage)
