import { useEffect, useRef, useState } from 'react'
import { Button, Card, Slider, Space, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined, ScissorOutlined } from '@ant-design/icons'
import type { StateGroup } from '../../types'
import { captureFullFrame, getVideoDuration } from '../../lib/videoProcessing'
import { chromaKey, canvasToBlob } from '../../lib/imageProcessing'
import { VIDEO_V2_DEFAULT_FRAME_DURATION_SECONDS, recommendedFrameCount } from '../../lib/grid'
import VideoV2Preview from './VideoV2Preview'

export interface CutFrame {
  id: string
  timestamp: number
  rawBlob: Blob // captureFullFrame output, not keyed — Task 4 re-keys from this
  keyedBlob: Blob // rawBlob after chromaKey at defaults (90/140)
  url: string // object URL of keyedBlob, for display
}

interface VideoV2FrameCutterProps {
  videoUrl: string
  state: StateGroup
  onStackChange: (frames: CutFrame[], frameDurationSeconds: number, loop: boolean) => void
  onBack: () => void
  onContinue: () => void
}

export default function VideoV2FrameCutter({
  videoUrl,
  state,
  onStackChange,
  onBack,
  onContinue,
}: VideoV2FrameCutterProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [cutting, setCutting] = useState(false)
  const [frames, setFrames] = useState<CutFrame[]>([])
  const [frameDurationSeconds, setFrameDurationSeconds] = useState(VIDEO_V2_DEFAULT_FRAME_DURATION_SECONDS)
  const [loop, setLoop] = useState(true)

  useEffect(() => {
    getVideoDuration(videoUrl).then(setDuration)
  }, [videoUrl])

  // Keep a ref mirroring the latest frames so the unmount cleanup below can
  // revoke every object URL without re-subscribing the effect on each cut
  // (a re-subscribed effect would revoke-then-recreate the same URLs).
  const framesRef = useRef<CutFrame[]>([])
  framesRef.current = frames

  // Revoke every remaining frame's object URL on unmount (per-frame deletes
  // and page-level "discard video" already revoke their own as they happen).
  useEffect(() => {
    return () => {
      framesRef.current.forEach((f) => URL.revokeObjectURL(f.url))
    }
  }, [])

  useEffect(() => {
    onStackChange(frames, frameDurationSeconds, loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, frameDurationSeconds, loop])

  function handleSliderChange(value: number) {
    setCurrentTime(value)
    if (videoRef.current) videoRef.current.currentTime = value
  }

  function handleSeekTo(timestamp: number) {
    setCurrentTime(timestamp)
    if (videoRef.current) videoRef.current.currentTime = timestamp
  }

  async function handleCutFrame() {
    setCutting(true)
    try {
      const canvas = await captureFullFrame(videoUrl, currentTime)
      const rawBlob = await canvasToBlob(canvas)
      chromaKey(canvas)
      const keyedBlob = await canvasToBlob(canvas)
      const url = URL.createObjectURL(keyedBlob)
      setFrames((prev) => [...prev, { id: crypto.randomUUID(), timestamp: currentTime, rawBlob, keyedBlob, url }])
    } finally {
      setCutting(false)
    }
  }

  function handleDelete(id: string) {
    setFrames((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((f) => f.id !== id)
    })
  }

  function handleMove(id: string, direction: -1 | 1) {
    setFrames((prev) => {
      const index = prev.findIndex((f) => f.id === id)
      const target = index + direction
      if (index === -1 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <Card title="Cut frames">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={{ width: '100%' }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
        <Slider min={0} max={duration} step={0.01} value={currentTime} onChange={handleSliderChange} />
        <Space>
          <Typography.Text>Timestamp: {currentTime.toFixed(2)}s</Typography.Text>
          <Button type="primary" icon={<ScissorOutlined />} onClick={handleCutFrame} loading={cutting}>
            Cut this frame
          </Button>
        </Space>

        <Typography.Text type="secondary">
          {frames.length} frame{frames.length === 1 ? '' : 's'} cut — {recommendedFrameCount(state)} recommended for{' '}
          {state}
        </Typography.Text>

        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {frames.map((frame, index) => (
            <div key={frame.id} style={{ flexShrink: 0, textAlign: 'center', width: 100 }}>
              <div
                onClick={() => handleSeekTo(frame.timestamp)}
                style={{
                  width: 100,
                  height: 100,
                  cursor: 'pointer',
                  background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
                }}
              >
                <img
                  src={frame.url}
                  alt={`cut frame ${index + 1}`}
                  style={{ width: 100, height: 100, objectFit: 'contain' }}
                />
              </div>
              <Typography.Text style={{ fontSize: 12 }}>
                #{index + 1} · {frame.timestamp.toFixed(2)}s
              </Typography.Text>
              <div>
                <Tooltip title="Move left">
                  <Button
                    size="small"
                    icon={<ArrowLeftOutlined />}
                    disabled={index === 0}
                    onClick={() => handleMove(frame.id, -1)}
                  />
                </Tooltip>
                <Tooltip title="Move right">
                  <Button
                    size="small"
                    icon={<ArrowRightOutlined />}
                    disabled={index === frames.length - 1}
                    onClick={() => handleMove(frame.id, 1)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(frame.id)} />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>

        {frames.length > 0 && (
          <VideoV2Preview
            frameUrls={frames.map((f) => f.url)}
            frameDurationSeconds={frameDurationSeconds}
            onFrameDurationSecondsChange={setFrameDurationSeconds}
            loop={loop}
            onLoopChange={setLoop}
          />
        )}

        <Space>
          <Button onClick={onBack}>Discard video</Button>
          <Button type="primary" disabled={frames.length === 0} onClick={onContinue}>
            Continue to key tuning
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
