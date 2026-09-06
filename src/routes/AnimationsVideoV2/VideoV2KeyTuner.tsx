import { useEffect, useRef, useState } from 'react'
import { Button, Card, Slider, Space, Typography } from 'antd'
import { chromaKey, canvasToBlob } from '../../lib/imageProcessing'
import type { CutFrame } from './VideoV2FrameCutter'
import VideoV2Preview from './VideoV2Preview'

const DEFAULT_INNER = 90
const DEFAULT_OUTER = 140
const DEBOUNCE_MS = 200

interface VideoV2KeyTunerProps {
  frames: CutFrame[]
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  onBack: () => void
  onContinue: (frames: CutFrame[]) => void
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

// Re-keys ONE frame starting from its rawBlob (never from a previously-keyed
// blob) so repeated threshold changes never compound chromaKey's despill.
async function rekeyFrame(frame: CutFrame, inner: number, outer: number): Promise<CutFrame> {
  const rawUrl = URL.createObjectURL(frame.rawBlob)
  try {
    const img = await loadImage(rawUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(img, 0, 0)
    chromaKey(canvas, inner, outer)
    const keyedBlob = await canvasToBlob(canvas)
    const url = URL.createObjectURL(keyedBlob)
    return { ...frame, keyedBlob, url }
  } finally {
    URL.revokeObjectURL(rawUrl)
  }
}

export default function VideoV2KeyTuner({
  frames,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  onBack,
  onContinue,
}: VideoV2KeyTunerProps) {
  const [inner, setInner] = useState(DEFAULT_INNER)
  const [outer, setOuter] = useState(DEFAULT_OUTER)
  const [keyedFrames, setKeyedFrames] = useState<CutFrame[]>(frames)
  const [rekeying, setRekeying] = useState(false)
  // keyedFrames starts out identity-shared with the incoming `frames` prop
  // (the cutter's own frames/URLs). Save must stay disabled until the first
  // re-key lands and replaces it with this component's own frames/URLs —
  // otherwise Save would revoke URLs the still-mounted cutter is displaying.
  const [hasRekeyed, setHasRekeyed] = useState(false)

  // Guards two hazards at once:
  // - stale-result race: only the response from the MOST RECENT re-key run
  //   is applied; an in-flight run superseded by a newer slider settle is
  //   discarded when it resolves.
  // - object URL leaks: the object URLs THIS COMPONENT CREATED are tracked
  //   here so they can be revoked once (and only once) the run that replaces
  //   them actually lands, instead of on every keystroke of the drag.
  //   Starts empty (not the incoming `frames[].url`s) — those URLs are owned
  //   by the cutter, which stays mounted underneath and still needs them; the
  //   first debounced re-key produces this component's own URLs to track.
  const runIdRef = useRef(0)
  const currentUrlsRef = useRef<string[]>([])

  async function rekeyAll(nextInner: number, nextOuter: number) {
    const runId = ++runIdRef.current
    setRekeying(true)
    // Always re-derive from the ORIGINAL `frames` prop (rawBlob lives there),
    // never from `keyedFrames` — that is what prevents compounding despill.
    const next = await Promise.all(frames.map((f) => rekeyFrame(f, nextInner, nextOuter)))
    if (runId !== runIdRef.current) {
      // A newer run started while this one was in flight — drop this result
      // and revoke the URLs it just created so nothing leaks.
      next.forEach((f) => URL.revokeObjectURL(f.url))
      return
    }
    const staleUrls = currentUrlsRef.current
    currentUrlsRef.current = next.map((f) => f.url)
    setKeyedFrames(next)
    setRekeying(false)
    setHasRekeyed(true)
    staleUrls.forEach((url) => URL.revokeObjectURL(url))
  }

  // Debounced re-key: rapid slider drags collapse into one pass at the final
  // value. The effect itself does not run rekeyAll synchronously — it only
  // schedules it, and the cleanup cancels the pending schedule when inner/outer
  // change again before the timer fires.
  useEffect(() => {
    const timer = setTimeout(() => {
      rekeyAll(inner, outer)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner, outer, frames])

  // Revoke every remaining displayed URL on unmount only (not on every
  // re-key — rekeyAll already revokes superseded URLs as each run lands).
  useEffect(() => {
    return () => {
      currentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function handleInnerChange(value: number) {
    setInner(Math.min(value, outer))
  }

  function handleOuterChange(value: number) {
    setOuter(Math.max(value, inner))
  }

  return (
    <Card title="Tune chroma key">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text>Inner threshold — fully transparent below this distance from green</Typography.Text>
          <Slider min={0} max={255} value={inner} onChange={handleInnerChange} />
        </div>
        <div>
          <Typography.Text>Outer threshold — untouched above this</Typography.Text>
          <Slider min={0} max={255} value={outer} onChange={handleOuterChange} />
        </div>

        <Typography.Text type="secondary">
          {keyedFrames.length} frame{keyedFrames.length === 1 ? '' : 's'}
          {rekeying ? ' · re-keying…' : ''}
        </Typography.Text>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {keyedFrames.map((frame, index) => (
            <div
              key={frame.id}
              style={{
                width: 140,
                height: 140,
                background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
              }}
            >
              <img
                src={frame.url}
                alt={`keyed frame ${index + 1}`}
                style={{ width: 140, height: 140, objectFit: 'contain' }}
              />
            </div>
          ))}
        </div>

        {keyedFrames.length > 0 && (
          <VideoV2Preview
            frameUrls={keyedFrames.map((f) => f.url)}
            frameDurationSeconds={frameDurationSeconds}
            onFrameDurationSecondsChange={onFrameDurationSecondsChange}
            loop={loop}
            onLoopChange={onLoopChange}
          />
        )}

        <Space>
          <Button onClick={onBack}>Back to frame cutting</Button>
          <Button
            type="primary"
            disabled={rekeying || !hasRekeyed || keyedFrames.length === 0}
            onClick={() => onContinue(keyedFrames)}
          >
            Continue to Sprite Sheet Editor
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
