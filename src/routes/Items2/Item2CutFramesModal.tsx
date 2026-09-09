import { useState } from 'react'
import { Modal, message } from 'antd'
import VideoV2FrameCutter, { type CutFrame } from '../AnimationsVideoV2/VideoV2FrameCutter'
import VideoV2KeyTuner from '../AnimationsVideoV2/VideoV2KeyTuner'
import VideoV2SpriteSheetEditor from '../AnimationsVideoV2/VideoV2SpriteSheetEditor'
import { composeFrameStrip, downloadFrameStrip, fitFrameWithOffset, loadFrameCanvas, VIDEO_SHEET_FRAME_SIZE } from '../../lib/videoSpriteSheet'
import { getItem2VideoSession, saveItem2VideoSession } from '../../lib/db'

type Step = 'cut' | 'tune' | 'sheet'

interface Item2CutFramesModalProps {
  open: boolean
  videoUrl: string
  title: string
  onClose: () => void
  /**
   * Identifies which video this modal is cutting frames from, so "Save to
   * Video history" can write the resulting sprite sheet back onto that
   * exact Item2VideoEntry. Omitted when there's no session to save into
   * (there always is one, in practice, since a video only exists here after
   * it was already appended to a session) — the button just doesn't render
   * in that case.
   */
  saveTarget?: { sessionId: string; videoIndex: number }
  onSpriteSheetSaved?: () => void
}

/**
 * Same Cut -> Tune -> Sheet pipeline as Animations (Video v2), reused as-is
 * (same components) for one Item-2 cell's video. Unlike VideoV2's page flow,
 * there is no "save an Animation record" step at the end — the only output
 * here is a downloadable sprite-sheet PNG, since Item-2 videos aren't tied
 * to the Animation/VideoAnimation data model.
 */
export default function Item2CutFramesModal({
  open,
  videoUrl,
  title,
  onClose,
  saveTarget,
  onSpriteSheetSaved,
}: Item2CutFramesModalProps) {
  const [step, setStep] = useState<Step>('cut')
  const [cutFrames, setCutFrames] = useState<CutFrame[]>([])
  const [frameDurationSeconds, setFrameDurationSeconds] = useState(0.1)
  const [loop, setLoop] = useState(true)
  const [sheetFrames, setSheetFrames] = useState<CutFrame[]>([])
  const [sheetMargin, setSheetMargin] = useState(4)
  const [sheetFrameOffsets, setSheetFrameOffsets] = useState<{ x: number; y: number }[]>([])

  function handleClose() {
    cutFrames.forEach((f) => URL.revokeObjectURL(f.url))
    setCutFrames([])
    setSheetFrames([])
    setSheetFrameOffsets([])
    setSheetMargin(4)
    setStep('cut')
    onClose()
  }

  function handleStackChange(frames: CutFrame[], nextFrameDurationSeconds: number, nextLoop: boolean) {
    setCutFrames(frames)
    setFrameDurationSeconds(nextFrameDurationSeconds)
    setLoop(nextLoop)
  }

  function handleTuneContinue(frames: CutFrame[]) {
    setSheetFrames(frames)
    setSheetFrameOffsets(frames.map(() => ({ x: 0, y: 0 })))
    setStep('sheet')
  }

  async function handleExportSheet() {
    const canvases = await Promise.all(
      sheetFrames.map(async (frame, i) => {
        const source = await loadFrameCanvas(frame.keyedBlob)
        const offset = sheetFrameOffsets[i] ?? { x: 0, y: 0 }
        return fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, sheetMargin, offset.x, offset.y)
      }),
    )
    const blob = await composeFrameStrip(canvases)
    downloadFrameStrip(blob, `${title.replace(/[^a-z0-9_-]+/gi, '_')}_sheet_${Date.now()}.png`)
  }

  async function handleSaveSpriteSheetToHistory(blob: Blob) {
    if (!saveTarget) return
    const session = await getItem2VideoSession(saveTarget.sessionId)
    if (!session) {
      message.error('Could not find this video\'s session — it may have been deleted')
      return
    }
    const videos = [...session.videos]
    const entry = videos[saveTarget.videoIndex]
    if (!entry) {
      message.error('Could not find this video in its session')
      return
    }
    videos[saveTarget.videoIndex] = { ...entry, spriteSheetBlob: blob }
    await saveItem2VideoSession({ ...session, videos, updatedAt: Date.now() })
    message.success('Sprite sheet saved to Video history')
    onSpriteSheetSaved?.()
  }

  return (
    <Modal title={`Cut frames — ${title}`} open={open} onCancel={handleClose} footer={null} width={960}>
      {step === 'cut' && (
        <VideoV2FrameCutter
          videoUrl={videoUrl}
          state="stand_run"
          onStackChange={handleStackChange}
          onBack={handleClose}
          onContinue={() => setStep('tune')}
        />
      )}
      {step === 'tune' && (
        <VideoV2KeyTuner
          frames={cutFrames}
          frameDurationSeconds={frameDurationSeconds}
          onFrameDurationSecondsChange={setFrameDurationSeconds}
          loop={loop}
          onLoopChange={setLoop}
          onBack={() => setStep('cut')}
          onContinue={handleTuneContinue}
        />
      )}
      {step === 'sheet' && (
        <VideoV2SpriteSheetEditor
          frames={sheetFrames}
          margin={sheetMargin}
          onMarginChange={setSheetMargin}
          frameOffsets={sheetFrameOffsets}
          onFrameOffsetsChange={setSheetFrameOffsets}
          frameDurationSeconds={frameDurationSeconds}
          onFrameDurationSecondsChange={setFrameDurationSeconds}
          loop={loop}
          onLoopChange={setLoop}
          onBack={() => setStep('tune')}
          onSave={handleExportSheet}
          saveLabel="Export sprite sheet"
          onSaveSpriteSheetBlob={saveTarget ? handleSaveSpriteSheetToHistory : undefined}
        />
      )}
    </Modal>
  )
}
