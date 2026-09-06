import { useEffect, useState } from 'react'
import { Button, Space, Typography } from 'antd'

const FRAME_DURATION_MS = 100

interface AnimationPlayerProps {
  frameUrls: string[]
  size?: number
}

/** Loops a set of frames at the game's 0.1s/frame cadence so a sprite strip can be reviewed as motion, not stills. */
export default function AnimationPlayer({ frameUrls, size = 96 }: AnimationPlayerProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setIndex(0)
    setPlaying(false)
  }, [frameUrls])

  useEffect(() => {
    if (!playing || frameUrls.length === 0) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % frameUrls.length), FRAME_DURATION_MS)
    return () => clearInterval(timer)
  }, [playing, frameUrls])

  if (frameUrls.length === 0) return null

  return (
    <Space direction="vertical" align="center" size={4}>
      <img
        src={frameUrls[index]}
        alt={`frame ${index + 1}`}
        style={{ width: size, height: size, objectFit: 'contain', background: '#eee', imageRendering: 'pixelated' }}
      />
      <Space size={4}>
        <Button size="small" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Stop' : 'Play'}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {index + 1}/{frameUrls.length}
        </Typography.Text>
      </Space>
    </Space>
  )
}
