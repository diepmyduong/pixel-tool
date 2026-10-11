import { useEffect, useState } from 'react'
import { Button, Card, Empty, Space, Typography, Upload, message } from 'antd'
import { DeleteOutlined, DownloadOutlined, ScissorOutlined, UploadOutlined } from '@ant-design/icons'
import type { Character2UploadedVideo } from '../../types'
import {
  deleteCharacter2UploadedVideo,
  listCharacter2UploadedVideos,
  saveCharacter2UploadedVideo,
} from '../../lib/db'
import Character2CutFramesModal from './Character2CutFramesModal'

/**
 * One uploaded video's card: plays the source video, lets it be cut into a
 * sprite sheet via the same Cut -> Tune -> Sheet pipeline the generated
 * (direction, pose) videos use, and shows/downloads the saved sheet once one
 * exists.
 */
function UploadedVideoCard({
  video,
  onUpdated,
  onDeleted,
}: {
  video: Character2UploadedVideo
  onUpdated: () => void
  onDeleted: () => void
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState<string | null>(null)
  const [cutting, setCutting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(video.videoBlob)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [video.videoBlob])

  useEffect(() => {
    if (!video.spriteSheetBlob) {
      setSheetUrl(null)
      return
    }
    const url = URL.createObjectURL(video.spriteSheetBlob)
    setSheetUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [video.spriteSheetBlob])

  async function handleSaveSpriteSheetToHistory(blob: Blob) {
    await saveCharacter2UploadedVideo({ ...video, spriteSheetBlob: blob })
    message.success('Sprite sheet saved')
    onUpdated()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteCharacter2UploadedVideo(video.id)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card
      size="small"
      title={video.name}
      style={{ width: 320 }}
      extra={
        <Button size="small" danger icon={<DeleteOutlined />} loading={deleting} onClick={handleDelete} />
      }
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {new Date(video.createdAt).toLocaleString()}
      </Typography.Text>
      {videoUrl && <video src={videoUrl} controls loop style={{ width: '100%', background: '#000' }} />}
      <Space style={{ marginTop: 8 }} wrap>
        <Button size="small" icon={<ScissorOutlined />} onClick={() => setCutting(true)}>
          Cut frames
        </Button>
        {videoUrl && (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              const a = document.createElement('a')
              a.href = videoUrl
              a.download = `${video.name.replace(/[^a-z0-9_-]+/gi, '_')}.mp4`
              a.click()
            }}
          >
            Download video
          </Button>
        )}
      </Space>

      {sheetUrl && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text strong>Saved sprite sheet</Typography.Text>
          <img
            src={sheetUrl}
            alt={`${video.name} sprite sheet`}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
            }}
          />
          <Button
            size="small"
            icon={<DownloadOutlined />}
            style={{ marginTop: 4 }}
            onClick={() => {
              const a = document.createElement('a')
              a.href = sheetUrl
              a.download = `${video.name.replace(/[^a-z0-9_-]+/gi, '_')}_sheet.png`
              a.click()
            }}
          >
            Download sheet
          </Button>
        </div>
      )}

      {cutting && videoUrl && (
        <Character2CutFramesModal
          open
          videoUrl={videoUrl}
          title={video.name}
          onSaveSpriteSheetBlob={handleSaveSpriteSheetToHistory}
          onClose={() => setCutting(false)}
        />
      )}
    </Card>
  )
}

/**
 * "Video" tab: upload one or more video files from disk (independent of any
 * generated sheet) and cut each one into a sprite sheet via the same
 * pipeline used for direction/pose-generated videos. Every uploaded video
 * and its resulting sheet (once saved) persists in IndexedDB across reloads.
 */
export default function Character2VideoUploadPage() {
  const [videos, setVideos] = useState<Character2UploadedVideo[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const list = await listCharacter2UploadedVideos()
    setVideos(list.sort((a, b) => b.createdAt - a.createdAt))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleUpload(file: File): Promise<boolean> {
    await saveCharacter2UploadedVideo({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      videoBlob: file,
      createdAt: Date.now(),
    })
    await refresh()
    return false
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Upload accept="video/*" multiple showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />}>Upload video(s)</Button>
        </Upload>
      </Space>

      {!loading && videos.length === 0 && (
        <Empty description="Upload one or more videos to cut into sprite sheets" />
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {videos.map((video) => (
          <UploadedVideoCard key={video.id} video={video} onUpdated={refresh} onDeleted={refresh} />
        ))}
      </div>
    </div>
  )
}
