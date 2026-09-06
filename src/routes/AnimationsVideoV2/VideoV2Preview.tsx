import { useEffect, useState } from 'react'
import { Button, InputNumber, Space, Switch, Typography } from 'antd'

interface VideoV2PreviewProps {
  frameUrls: string[]
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  size?: number
}

export default function VideoV2Preview({
  frameUrls,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  size = 200,
}: VideoV2PreviewProps) {
  const [index, setIndex] = useState(0)
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
    }, frameDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [playing, frameUrls, loop, frameDurationSeconds])

  // Callers pass a fresh `.map()` array every render, so compare a joined key
  // of the actual URLs rather than array identity — otherwise any unrelated
  // parent re-render (e.g. nudging the duration InputNumber) would reset
  // playback to frame 0 and stop it.
  const framesKey = frameUrls.join('|')
  useEffect(() => {
    setIndex(0)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey])

  function handlePlay() {
    if (index >= frameUrls.length - 1) setIndex(0)
    setPlaying(true)
  }

  return (
    <Space direction="vertical" align="center">
      <div
        style={{
          width: size,
          height: size,
          background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 20px 20px',
        }}
      >
        {frameUrls[index] && (
          <img
            src={frameUrls[index]}
            alt={`preview frame ${index + 1}`}
            style={{ width: size, height: size, objectFit: 'contain' }}
          />
        )}
      </div>
      <Space wrap>
        <Button onClick={handlePlay} disabled={playing || frameUrls.length === 0}>
          Play
        </Button>
        <Button onClick={() => setPlaying(false)} disabled={!playing}>
          Stop
        </Button>
        <Typography.Text type="secondary">
          Frame {frameUrls.length === 0 ? 0 : index + 1}/{frameUrls.length}
        </Typography.Text>
        <Switch checked={loop} onChange={onLoopChange} checkedChildren="Loop" unCheckedChildren="Once" />
        <InputNumber
          size="small"
          min={0.02}
          max={1}
          step={0.05}
          value={frameDurationSeconds}
          onChange={(value) => onFrameDurationSecondsChange(value ?? frameDurationSeconds)}
          addonAfter="s"
        />
      </Space>
    </Space>
  )
}
