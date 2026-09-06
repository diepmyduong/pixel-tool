import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Empty, Space, Tag, Typography } from 'antd'
import type { VideoAnimation } from '../../types'
import { listVideoAnimationsForCharacter } from '../../lib/db'

interface VideoV2GalleryProps {
  characterId: string | null
  refreshKey: number
}

const THUMB_FRAME_DURATION_MS = 100
const THUMB_SIZE = 96

interface VideoV2GalleryThumbnailProps {
  frameUrls: string[]
  size?: number
}

// A gallery card needs its preview animating on its own, with no play button —
// unlike VideoV2Preview (play/stop/loop-toggle/duration controls for the
// cutter and key tuner), which would be the wrong fit here without changing
// its two existing callers' behavior. Kept local and tiny instead.
function VideoV2GalleryThumbnail({ frameUrls, size = THUMB_SIZE }: VideoV2GalleryThumbnailProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (frameUrls.length === 0) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % frameUrls.length), THUMB_FRAME_DURATION_MS)
    return () => clearInterval(timer)
  }, [frameUrls])

  if (frameUrls.length === 0) return null

  return (
    <div
      style={{
        width: size,
        height: size,
        background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
      }}
    >
      <img
        src={frameUrls[index]}
        alt={`preview frame ${index + 1}`}
        style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated' }}
      />
    </div>
  )
}

function VideoV2Gallery({ characterId, refreshKey }: VideoV2GalleryProps) {
  const [animations, setAnimations] = useState<VideoAnimation[]>([])
  const [frameUrls, setFrameUrls] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!characterId) {
      setAnimations([])
      return
    }
    let cancelled = false
    listVideoAnimationsForCharacter(characterId).then((list) => {
      if (cancelled) return
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt)
      setAnimations(sorted)
      setFrameUrls((prev) => {
        Object.values(prev).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
        return Object.fromEntries(sorted.map((a) => [a.id, a.frameBlobs.map((b) => URL.createObjectURL(b))]))
      })
    })
    return () => {
      cancelled = true
    }
  }, [characterId, refreshKey])

  // Revoke every URL this component created on unmount (refresh-time revokes
  // already happen above, right before the replacement URLs are created).
  useEffect(() => {
    return () => {
      Object.values(frameUrls).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cards = useMemo(() => animations, [animations])

  if (!characterId) {
    return <Empty description="Select a character to see its Video v2 animations" />
  }
  if (cards.length === 0) {
    return <Empty description="No Video v2 animations saved yet" />
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {cards.map((animation) => (
        <Card
          key={animation.id}
          size="small"
          title={
            <Space>
              <Tag color="blue">{animation.state}</Tag>
              <Tag color={animation.groupName ? 'green' : 'default'}>{animation.groupName || 'Ungrouped'}</Tag>
            </Space>
          }
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <VideoV2GalleryThumbnail frameUrls={frameUrls[animation.id] ?? []} />
            <Space direction="vertical" size={2}>
              <Typography.Text>{animation.actionDescription}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {animation.frameBlobs.length} frame{animation.frameBlobs.length === 1 ? '' : 's'} ·{' '}
                {animation.frameDurationSeconds.toFixed(2)}s/frame · {animation.loop ? 'looping' : 'once'}
              </Typography.Text>
            </Space>
          </div>
        </Card>
      ))}
    </Space>
  )
}

export default memo(VideoV2Gallery)
