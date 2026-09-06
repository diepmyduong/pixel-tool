import { useEffect, useState } from 'react'
import { Button, Card, Slider, Space, Typography } from 'antd'
import { extractAudio } from '../../lib/videoProcessing'

interface AudioRangePickerProps {
  videoUrl: string
  duration: number
  targetDurationSeconds: number
  onConfirmed: (audioBlob: Blob) => void
}

export default function AudioRangePicker({
  videoUrl,
  duration,
  targetDurationSeconds,
  onConfirmed,
}: AudioRangePickerProps) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(duration, 2)])
  const [extracting, setExtracting] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExtract() {
    setExtracting(true)
    try {
      const [start, end] = range
      const span = Math.max(end - start, 0.01)
      const playbackRate = span / targetDurationSeconds
      const blob = await extractAudio(videoUrl, start, end, playbackRate)
      if (resultUrl) URL.revokeObjectURL(resultUrl)
      setResultBlob(blob)
      setResultUrl(URL.createObjectURL(blob))
    } finally {
      setExtracting(false)
    }
  }

  function handleConfirm() {
    if (resultBlob) onConfirmed(resultBlob)
  }

  return (
    <Card title="Pick the sound effect" size="small">
      <Typography.Text type="secondary">
        Play the full clip below, find the window with the clearest sound effect, then drag the
        range to select it. It will be sped up to match the {targetDurationSeconds.toFixed(2)}s
        animation.
      </Typography.Text>

      <audio controls src={videoUrl} style={{ display: 'block', width: '100%', marginTop: 12 }} />

      <div style={{ marginTop: 12 }}>
        <Typography.Text>
          Selected: {range[0].toFixed(2)}s – {range[1].toFixed(2)}s ({(range[1] - range[0]).toFixed(2)}s)
        </Typography.Text>
        <Slider
          range
          min={0}
          max={duration}
          step={0.01}
          value={range}
          onChange={(value) => setRange(value as [number, number])}
        />
      </div>

      <Space style={{ marginTop: 12 }}>
        <Button onClick={handleExtract} loading={extracting}>
          Extract &amp; speed up
        </Button>
        {resultUrl && (
          <Button type="primary" onClick={handleConfirm}>
            Use this audio
          </Button>
        )}
      </Space>

      {resultUrl && (
        <audio controls src={resultUrl} style={{ display: 'block', width: '100%', marginTop: 12 }} />
      )}
    </Card>
  )
}
