import { useEffect, useState } from 'react'
import { Col, Row, Typography, message } from 'antd'
import type { Character, Item, StateGroup, VideoAnimation } from '../../types'
import { getCharacter, listItems, saveVideoAnimation } from '../../lib/db'
import VideoV2SetupPanel from './VideoV2SetupPanel'
import VideoV2GeneratePanel from './VideoV2GeneratePanel'
import VideoV2History from './VideoV2History'
import VideoV2FrameCutter, { type CutFrame } from './VideoV2FrameCutter'
import VideoV2KeyTuner from './VideoV2KeyTuner'
import VideoV2SpriteSheetEditor from './VideoV2SpriteSheetEditor'
import VideoV2Gallery from './VideoV2Gallery'

type Step = 'cut' | 'tune' | 'sheet'

interface SetupSnapshot {
  characterId: string | null
  itemIds: string[]
  state: StateGroup
  groupName: string
  actionDescription: string
  referenceImageFile: File | null
}

export default function AnimationsVideoV2Page() {
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [itemIds, setItemIds] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
  const [state, setState] = useState<StateGroup>('stand_run')
  const [groupName, setGroupName] = useState('')
  const [actionDescription, setActionDescription] = useState('')

  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null)
  const [rawVideoBlob, setRawVideoBlob] = useState<Blob | null>(null)
  // Setup (character/items/state/groupName/actionDescription) snapshotted the
  // moment a video is accepted, so later edits to the still-live setup fields
  // above cannot mislabel the record this video eventually saves as. The
  // setup panel is also disabled while a video is loaded so the UI matches.
  const [setupSnapshot, setSetupSnapshot] = useState<SetupSnapshot | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  // Owned here (not just inside the cutter) so Task 5 can read the final
  // stack for saving without threading a ref through the cutter.
  const [cutFrames, setCutFrames] = useState<CutFrame[]>([])
  const [frameDurationSeconds, setFrameDurationSeconds] = useState(0.1)
  const [loop, setLoop] = useState(true)
  const [step, setStep] = useState<Step>('cut')

  const [sheetFrames, setSheetFrames] = useState<CutFrame[]>([])
  const [sheetMargin, setSheetMargin] = useState(4)
  const [sheetFrameOffsets, setSheetFrameOffsets] = useState<{ x: number; y: number }[]>([])

  useEffect(() => {
    if (!characterId) {
      setCharacter(null)
      return
    }
    getCharacter(characterId).then((c) => setCharacter(c ?? null))
  }, [characterId])

  useEffect(() => {
    if (itemIds.length === 0) {
      setItems([])
      return
    }
    listItems().then((all) => setItems(all.filter((i) => itemIds.includes(i.id))))
  }, [itemIds])

  // Revoke the previous object URL whenever rawVideoUrl is replaced, and the
  // current one on unmount.
  useEffect(() => {
    return () => {
      if (rawVideoUrl) URL.revokeObjectURL(rawVideoUrl)
    }
  }, [rawVideoUrl])

  useEffect(() => {
    return () => {
      if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
    }
  }, [referenceImageUrl])

  function handleReferenceImageChange(file: File | null) {
    if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
    setReferenceImageFile(file)
    setReferenceImageUrl(file ? URL.createObjectURL(file) : null)
  }

  // Shared by handleVideoReady/handleHistorySelect: a new raw video means any
  // frames cut from a PREVIOUS video are no longer valid, so the cut stack is
  // cleared and the cutter remounted clean, exactly like handleDiscard does.
  function resetCutStackForNewVideo() {
    cutFrames.forEach((f) => URL.revokeObjectURL(f.url))
    setCutFrames([])
    setStep('cut')
    setRefreshKey((k) => k + 1)
  }

  function snapshotSetup(): SetupSnapshot {
    return { characterId, itemIds, state, groupName, actionDescription, referenceImageFile }
  }

  function handleVideoReady(blob: Blob) {
    setRawVideoBlob(blob)
    setRawVideoUrl(URL.createObjectURL(blob))
    setSetupSnapshot(snapshotSetup())
    resetCutStackForNewVideo()
    setHistoryKey((k) => k + 1)
  }

  function handleHistorySelect(blob: Blob) {
    setRawVideoBlob(blob)
    setRawVideoUrl(URL.createObjectURL(blob))
    setSetupSnapshot(snapshotSetup())
    resetCutStackForNewVideo()
  }

  function handleDiscard() {
    setRawVideoUrl(null)
    setRawVideoBlob(null)
    setSetupSnapshot(null)
    setCutFrames([])
    setStep('cut')
    setRefreshKey((k) => k + 1)
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

  async function handleSave() {
    if (
      (!setupSnapshot?.characterId && !setupSnapshot?.referenceImageFile) ||
      !rawVideoBlob ||
      sheetFrames.length === 0
    )
      return

    const animation: VideoAnimation = {
      id: crypto.randomUUID(),
      characterId: setupSnapshot.characterId,
      itemIds: setupSnapshot.itemIds,
      state: setupSnapshot.state,
      groupName: setupSnapshot.groupName.trim() || undefined,
      actionDescription: setupSnapshot.actionDescription,
      frameBlobs: sheetFrames.map((f) => f.keyedBlob),
      frameTimestamps: sheetFrames.map((f) => f.timestamp),
      frameDurationSeconds,
      loop,
      rawVideoBlob,
      createdAt: Date.now(),
      sheetMargin,
      frameOffsets: sheetFrameOffsets,
    }
    await saveVideoAnimation(animation)

    // Safe to revoke: the tuner disables Continue until its first re-key
    // lands, by which point `sheetFrames` (its keyedFrames, threaded through
    // unchanged by the sheet editor) holds URLs the tuner created itself, not
    // the cutter's — so this never touches the still-mounted cutter's <img> URLs.
    sheetFrames.forEach((f) => URL.revokeObjectURL(f.url))
    setRawVideoUrl(null)
    setRawVideoBlob(null)
    setSetupSnapshot(null)
    setCutFrames([])
    setSheetFrames([])
    setSheetFrameOffsets([])
    setSheetMargin(4)
    setStep('cut')
    setRefreshKey((k) => k + 1)
    message.success('Animation saved')
  }

  return (
    <div>
      <Typography.Title level={3}>Animations (Video v2)</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
          <VideoV2SetupPanel
            characterId={characterId}
            onCharacterIdChange={setCharacterId}
            itemIds={itemIds}
            onItemIdsChange={setItemIds}
            state={state}
            onStateChange={setState}
            groupName={groupName}
            onGroupNameChange={setGroupName}
            actionDescription={actionDescription}
            onActionDescriptionChange={setActionDescription}
            referenceImageUrl={referenceImageUrl}
            onReferenceImageChange={handleReferenceImageChange}
            disabled={!!rawVideoUrl}
          />
          <div style={{ marginTop: 16 }}>
            {(character || referenceImageFile) && !rawVideoUrl && (
              <VideoV2GeneratePanel
                character={character}
                referenceImageFile={referenceImageFile}
                items={items}
                state={state}
                actionDescription={actionDescription}
                onVideoReady={handleVideoReady}
              />
            )}
            {/* Gated on a picked character or reference image for the same reason the
                generate panel is: the snapshot taken when a video is accepted is what
                gets saved, and a snapshot with neither makes Save a silent no-op later on. */}
            {(character || referenceImageFile) && !rawVideoUrl && (
              <VideoV2History refreshKey={historyKey} onSelect={handleHistorySelect} />
            )}
          </div>
        </Col>
        <Col span={14}>
          {rawVideoUrl && rawVideoBlob && (
            // Kept mounted (just hidden) while on the "tune" step, rather than
            // conditionally rendered, so its internal frames/duration/loop state
            // is never lost — "Back to frame cutting" needs no restore logic.
            <div style={{ display: step === 'cut' ? 'block' : 'none' }}>
              <VideoV2FrameCutter
                key={refreshKey}
                videoUrl={rawVideoUrl}
                state={setupSnapshot?.state ?? state}
                onStackChange={handleStackChange}
                onBack={handleDiscard}
                onContinue={() => setStep('tune')}
              />
            </div>
          )}
          {rawVideoUrl && step === 'tune' && (
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
          {rawVideoUrl && step === 'sheet' && (
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
              onSave={handleSave}
            />
          )}
          {/* cutFrames/frameDurationSeconds/loop are lifted here (not just held inside
              the cutter) so Task 5's save step can read the final stack directly off
              the page without threading a ref through the cutter. */}
          {rawVideoUrl && step === 'cut' && cutFrames.length > 0 && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Stack ready to save: {cutFrames.length} frames, {frameDurationSeconds.toFixed(2)}s/frame,{' '}
              {loop ? 'looping' : 'once'}
            </Typography.Text>
          )}
          {!rawVideoUrl && <VideoV2Gallery characterId={characterId} refreshKey={refreshKey} />}
        </Col>
      </Row>
    </div>
  )
}
