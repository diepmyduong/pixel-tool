import { memo, useEffect, useMemo, useState } from 'react'
import { Button, Card, Collapse, Empty, Space, Tag, Typography, message } from 'antd'
import { DownloadOutlined, ScissorOutlined } from '@ant-design/icons'
import type { Character2VideoEntry, Character2VideoSession } from '../../types'
import { listCharacter2VideoSessions } from '../../lib/db'
import { downloadVideosAsZip } from '../../lib/videoZip'
import Character2CutFramesModal from './Character2CutFramesModal'

interface Character2VideoHistoryPageProps {
  refreshKey: number
  onSpriteSheetSaved?: () => void
}

const POSE_COLOR: Record<Character2VideoEntry['pose'], string> = {
  stand: 'blue',
  run: 'green',
  attack: 'volcano',
}

function sessionZipFilename(session: Character2VideoSession): string {
  const safeName = (session.name || 'character').replace(/[^a-z0-9_-]+/gi, '_')
  return `${safeName}_videos_${session.id.slice(0, 8)}.zip`
}

function SessionCard({ session, onSessionUpdated }: { session: Character2VideoSession; onSessionUpdated: () => void }) {
  const [urls, setUrls] = useState<string[]>([])
  const [zipping, setZipping] = useState(false)
  const [cutTarget, setCutTarget] = useState<{ index: number; url: string } | null>(null)

  useEffect(() => {
    const created = session.videos.map((v) => URL.createObjectURL(v.videoBlob))
    setUrls(created)
    return () => {
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [session])

  async function handleDownloadAll() {
    setZipping(true)
    try {
      await downloadVideosAsZip(session.videos, sessionZipFilename(session))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setZipping(false)
    }
  }

  return (
    <Card
      size="small"
      title={`${session.name || 'Untitled'} — ${session.videos.length} video${session.videos.length === 1 ? '' : 's'}`}
      extra={
        <Button
          size="small"
          icon={<DownloadOutlined />}
          loading={zipping}
          disabled={session.videos.length === 0}
          onClick={handleDownloadAll}
        >
          Download all (.zip)
        </Button>
      }
    >
      <Typography.Text type="secondary">{new Date(session.createdAt).toLocaleString()}</Typography.Text>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        {session.videos.map((video, index) => (
          <div key={index} style={{ width: 300 }}>
            <Space size={4} style={{ marginBottom: 4 }}>
              <Tag color={POSE_COLOR[video.pose]}>{video.pose}</Tag>
              <Tag>{video.direction}</Tag>
            </Space>
            {urls[index] && (
              <video src={urls[index]} controls loop style={{ width: '100%', background: '#000' }} />
            )}
            <Space style={{ marginTop: 4 }}>
              <Button
                size="small"
                icon={<ScissorOutlined />}
                onClick={() => urls[index] && setCutTarget({ index, url: urls[index] })}
              >
                Cut frames
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = urls[index]
                  a.download = `${video.direction}_${video.pose}.mp4`
                  a.click()
                }}
              >
                Download
              </Button>
            </Space>
          </div>
        ))}
      </div>

      {cutTarget && (
        <Character2CutFramesModal
          open
          videoUrl={cutTarget.url}
          title={`${session.videos[cutTarget.index].direction}-${session.videos[cutTarget.index].pose}`}
          saveTarget={{ sessionId: session.id, videoIndex: cutTarget.index }}
          onSpriteSheetSaved={onSessionUpdated}
          onClose={() => setCutTarget(null)}
        />
      )}
    </Card>
  )
}

function Character2VideoHistoryPage({ refreshKey, onSpriteSheetSaved }: Character2VideoHistoryPageProps) {
  const [sessions, setSessions] = useState<Character2VideoSession[]>([])
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listCharacter2VideoSessions().then((list) => {
      if (cancelled) return
      setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey, localRefreshKey])

  function handleSessionUpdated() {
    setLocalRefreshKey((k) => k + 1)
    onSpriteSheetSaved?.()
  }

  const items = useMemo(
    () =>
      sessions.map((session) => ({
        key: session.id,
        label: `${session.name || 'Untitled'} (${session.videos.length} videos) — ${new Date(session.updatedAt).toLocaleString()}`,
        children: <SessionCard session={session} onSessionUpdated={handleSessionUpdated} />,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions],
  )

  if (sessions.length === 0) {
    return <Empty description="No video sessions yet — generate a video from a sheet first" />
  }

  return <Collapse items={items} defaultActiveKey={sessions[0]?.id ? [sessions[0].id] : []} />
}

export default memo(Character2VideoHistoryPage)
