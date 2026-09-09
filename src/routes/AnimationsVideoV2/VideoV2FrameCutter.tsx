import { useEffect, useRef, useState } from 'react'
import { Button, Card, InputNumber, Slider, Space, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined, FastForwardOutlined, ScissorOutlined, StopOutlined } from '@ant-design/icons'
import type { StateGroup } from '../../types'
import { captureFullFrame, getVideoDuration } from '../../lib/videoProcessing'
import { chromaKey, canvasToBlob, cropBlobByRatio, type CropRatioRect } from '../../lib/imageProcessing'
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
  // How far the timeline auto-advances after each cut (manual or via "Auto
  // cut to end") — separate from frameDurationSeconds, which is the
  // resulting animation's playback speed, not the cutting step.
  const [cutStepSeconds, setCutStepSeconds] = useState(0.1)
  const [autoCutting, setAutoCutting] = useState(false)
  // Flipped to true by "Stop" to break out of the auto-cut loop between
  // iterations; auto-cut has no other cancellation point since each capture
  // is a real async video seek/draw that can't be aborted mid-flight.
  const autoCutStopRef = useRef(false)

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

  /** Captures the frame at `timestamp`, appends it to the stack, and returns it. */
  async function cutFrameAt(timestamp: number): Promise<CutFrame> {
    const canvas = await captureFullFrame(videoUrl, timestamp)
    const rawBlob = await canvasToBlob(canvas)
    chromaKey(canvas, ['green'])
    const keyedBlob = await canvasToBlob(canvas)
    const url = URL.createObjectURL(keyedBlob)
    const frame: CutFrame = { id: crypto.randomUUID(), timestamp, rawBlob, keyedBlob, url }
    setFrames((prev) => [...prev, frame])
    return frame
  }

  /** Advances the timeline/video element by cutStepSeconds, clamped to the clip's duration. */
  function advanceByCutStep(fromTime: number) {
    const next = Math.min(fromTime + cutStepSeconds, duration)
    setCurrentTime(next)
    if (videoRef.current) videoRef.current.currentTime = next
    return next
  }

  async function handleCutFrame() {
    setCutting(true)
    try {
      await cutFrameAt(currentTime)
      advanceByCutStep(currentTime)
    } finally {
      setCutting(false)
    }
  }

  async function handleAutoCutToEnd() {
    setAutoCutting(true)
    autoCutStopRef.current = false
    try {
      let time = currentTime
      // <= with a small epsilon so the very last step (which may land
      // within floating-point noise of `duration`) still gets cut instead
      // of being skipped for landing a hair past the end.
      while (time <= duration + 0.001 && !autoCutStopRef.current) {
        await cutFrameAt(time)
        if (time >= duration) break
        time = advanceByCutStep(time)
      }
    } finally {
      setAutoCutting(false)
    }
  }

  function handleStopAutoCut() {
    autoCutStopRef.current = true
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

  const [applyingCrop, setApplyingCrop] = useState(false)

  /**
   * Re-crops every frame in the stack to the same fractional rect, applied
   * once right after cutting and before frames flow into key tuning. Both
   * rawBlob and keyedBlob are cropped together (from the same rect) so the
   * tuner's re-key-from-rawBlob step stays in sync with what's displayed —
   * cropping only keyedBlob would leave rawBlob at the old, uncropped size.
   */
  async function handleApplyCrop(rect: CropRatioRect) {
    setApplyingCrop(true)
    try {
      const next = await Promise.all(
        frames.map(async (frame) => {
          const [rawBlob, keyedBlob] = await Promise.all([
            cropBlobByRatio(frame.rawBlob, rect),
            cropBlobByRatio(frame.keyedBlob, rect),
          ])
          URL.revokeObjectURL(frame.url)
          return { ...frame, rawBlob, keyedBlob, url: URL.createObjectURL(keyedBlob) }
        }),
      )
      setFrames(next)
    } finally {
      setApplyingCrop(false)
    }
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
        <Space wrap>
          <Typography.Text>Timestamp: {currentTime.toFixed(2)}s</Typography.Text>
          <Button
            type="primary"
            icon={<ScissorOutlined />}
            onClick={handleCutFrame}
            loading={cutting}
            disabled={autoCutting}
          >
            Cut this frame
          </Button>
          <Typography.Text>Step</Typography.Text>
          <InputNumber
            min={0.01}
            step={0.01}
            value={cutStepSeconds}
            onChange={(value) => setCutStepSeconds(value ?? 0.1)}
            style={{ width: 90 }}
            disabled={autoCutting}
          />
          <Typography.Text type="secondary">
            seconds — advances the timestamp by this much after each cut
          </Typography.Text>
          {!autoCutting ? (
            <Button icon={<FastForwardOutlined />} onClick={handleAutoCutToEnd} disabled={cutting}>
              Auto cut to end
            </Button>
          ) : (
            <Button danger icon={<StopOutlined />} onClick={handleStopAutoCut}>
              Stop
            </Button>
          )}
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
            onApplyCrop={applyingCrop ? undefined : handleApplyCrop}
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
