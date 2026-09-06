import { useEffect, useState } from 'react'
import { Button, Card, Slider, Space, Switch, Tabs, Typography } from 'antd'
import type { Direction, StateGroup } from '../../types'
import { defaultFrameFractions, DIRECTION_ORDER, directionCell } from '../../lib/grid'
import type { SquareCellRect } from '../../lib/useSquareCellGrid'
import { chromaKey, canvasToBlob } from '../../lib/imageProcessing'
import { extractFrame, getVideoDuration } from '../../lib/videoProcessing'
import AudioRangePicker from './AudioRangePicker'

const FRAME_DURATION_SECONDS = 0.1

interface FrameTimelineEditorProps {
  videoUrl: string
  cellRects: [[SquareCellRect, SquareCellRect], [SquareCellRect, SquareCellRect]]
  state: StateGroup
  frameCount: number
  onExtracted: (resultsByDirection: Record<Direction, { frameBlobs: Blob[]; audioBlob: Blob; frameTimestamps: number[] }>) => void
}

function AnimationPreview({ frameUrls, size = 320 }: { frameUrls: string[]; size?: number }) {
  const [index, setIndex] = useState(0)
  const [loop, setLoop] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing || frameUrls.length === 0) return
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = i + 1
        if (next >= frameUrls.length) {
          if (!loop) setPlaying(false)
          return loop ? 0 : i
        }
        return next
      })
    }, FRAME_DURATION_SECONDS * 1000)
    return () => clearInterval(timer)
  }, [playing, frameUrls, loop])

  useEffect(() => {
    setIndex(0)
    setPlaying(false)
  }, [frameUrls])

  function handlePlay() {
    if (index >= frameUrls.length - 1) setIndex(0)
    setPlaying(true)
  }

  return (
    <Space direction="vertical" align="center">
      <img
        src={frameUrls[index]}
        alt={`preview frame ${index + 1}`}
        style={{ width: size, height: size, objectFit: 'contain', background: '#eee' }}
      />
      <Space>
        <Button onClick={handlePlay} disabled={playing}>
          Play
        </Button>
        <Button onClick={() => setPlaying(false)} disabled={!playing}>
          Stop
        </Button>
        <Typography.Text type="secondary">
          Frame {index + 1}/{frameUrls.length}
        </Typography.Text>
        <Switch checked={loop} onChange={setLoop} checkedChildren="Loop" unCheckedChildren="Once" />
      </Space>
    </Space>
  )
}

type FrameResult = { frameBlobs: Blob[]; frameTimestamps: number[] }
type DirectionResult = { frameBlobs: Blob[]; audioBlob: Blob; frameTimestamps: number[] }

type Step = 'markers' | 'audio' | 'preview'

export default function FrameTimelineEditor({
  videoUrl,
  cellRects,
  state,
  frameCount,
  onExtracted,
}: FrameTimelineEditorProps) {
  const [step, setStep] = useState<Step>('markers')
  const [duration, setDuration] = useState<number | null>(null)
  const [timestamps, setTimestamps] = useState<number[]>([])
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [extracting, setExtracting] = useState(false)
  const [framesByDirection, setFramesByDirection] = useState<Record<Direction, FrameResult> | null>(null)
  const [frameUrlsByDirection, setFrameUrlsByDirection] = useState<Record<Direction, string[]> | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  // Preview always drawn from the up-facing cell — good enough to check
  // marker timing, since all 4 directions share the same timeline.
  const previewCell = directionCell('up')
  const previewRect = cellRects[previewCell.row][previewCell.col]

  useEffect(() => {
    getVideoDuration(videoUrl).then((d) => {
      setDuration(d)
      const fractions = defaultFrameFractions(state, frameCount)
      setTimestamps(fractions.map((f) => d * f))
    })
  }, [videoUrl, frameCount, state])

  useEffect(() => {
    if (duration === null || timestamps.length === 0) return
    timestamps.forEach((timestamp, index) => {
      refreshPreview(index, timestamp)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration])

  useEffect(() => {
    return () => {
      Object.values(previews).forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (frameUrlsByDirection) {
        Object.values(frameUrlsByDirection).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshPreview(index: number, timestamp: number) {
    const canvas = await extractFrame(videoUrl, timestamp, previewRect)
    const blob = await canvasToBlob(canvas)
    setPreviews((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index])
      return { ...prev, [index]: URL.createObjectURL(blob) }
    })
  }

  function handleMarkerChange(index: number, value: number) {
    setTimestamps((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    refreshPreview(index, value)
  }

  async function handleExtractFrames() {
    setExtracting(true)
    try {
      const byDirection = {} as Record<Direction, FrameResult>
      for (const direction of DIRECTION_ORDER) {
        const cell = directionCell(direction)
        const rect = cellRects[cell.row][cell.col]
        const frameBlobs: Blob[] = []
        for (const timestamp of timestamps) {
          const canvas = await extractFrame(videoUrl, timestamp, rect)
          chromaKey(canvas)
          frameBlobs.push(await canvasToBlob(canvas))
        }
        byDirection[direction] = { frameBlobs, frameTimestamps: timestamps }
      }

      setFramesByDirection(byDirection)
      setFrameUrlsByDirection(
        Object.fromEntries(
          DIRECTION_ORDER.map((d) => [d, byDirection[d].frameBlobs.map((b) => URL.createObjectURL(b))]),
        ) as Record<Direction, string[]>,
      )
      setStep('audio')
    } finally {
      setExtracting(false)
    }
  }

  function handleAudioConfirmed(blob: Blob) {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(blob)
    setAudioUrl(URL.createObjectURL(blob))
    setStep('preview')
  }

  function handleConfirm() {
    if (!framesByDirection || !audioBlob) return
    const result = {} as Record<Direction, DirectionResult>
    for (const direction of DIRECTION_ORDER) {
      result[direction] = { ...framesByDirection[direction], audioBlob }
    }
    onExtracted(result)
  }

  function handleBackToMarkers() {
    if (frameUrlsByDirection) {
      Object.values(frameUrlsByDirection).forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
    }
    setFrameUrlsByDirection(null)
    setFramesByDirection(null)
    setStep('markers')
  }

  if (duration === null) {
    return (
      <Card title="Frame timeline">
        <Typography.Text type="secondary">Loading video...</Typography.Text>
      </Card>
    )
  }

  if (step === 'audio') {
    return (
      <AudioRangePicker
        videoUrl={videoUrl}
        duration={duration}
        targetDurationSeconds={frameCount * FRAME_DURATION_SECONDS}
        onConfirmed={handleAudioConfirmed}
      />
    )
  }

  if (step === 'preview' && frameUrlsByDirection && audioUrl) {
    return (
      <Card title="Preview — all 4 directions">
        <Typography.Text type="secondary">
          Review each direction's extracted animation below. If any doesn't look right, go back
          and adjust the markers.
        </Typography.Text>
        <Tabs
          style={{ marginTop: 16 }}
          items={DIRECTION_ORDER.map((direction) => ({
            key: direction,
            label: direction,
            children: (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <AnimationPreview frameUrls={frameUrlsByDirection[direction]} />
              </div>
            ),
          }))}
        />
        <audio controls src={audioUrl} style={{ display: 'block', width: '100%', marginTop: 16 }} />
        <Space style={{ marginTop: 16, width: '100%' }}>
          <Button onClick={handleBackToMarkers} block>
            Back to markers
          </Button>
          <Button type="primary" onClick={handleConfirm} block>
            Save all 4 animations
          </Button>
        </Space>
      </Card>
    )
  }

  return (
    <Card title="Frame timeline — all 4 directions">
      <Typography.Text type="secondary">
        All 4 directions share the same timing — one set of markers extracts frames from every
        panel at once. Thumbnails preview the "up" panel.
      </Typography.Text>

      <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
        <AnimationPreview
          frameUrls={timestamps.map((_, i) => previews[i]).filter((u): u is string => !!u)}
          size={200}
        />

        {timestamps.map((timestamp, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src={previews[index]}
              alt={`frame ${index + 1}`}
              style={{ width: 100, height: 100, objectFit: 'contain', background: '#eee', flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <Typography.Text>
                Frame {index + 1}
                {state === 'stand_run' && (index === 0 ? ' (stand)' : ' (run)')}
              </Typography.Text>
              <Slider
                min={0}
                max={duration}
                step={0.01}
                value={timestamp}
                onChange={(value) => handleMarkerChange(index, value)}
              />
            </div>
          </div>
        ))}

        <Button type="primary" onClick={handleExtractFrames} loading={extracting} block>
          Extract frames (4 directions)
        </Button>
      </Space>
    </Card>
  )
}
