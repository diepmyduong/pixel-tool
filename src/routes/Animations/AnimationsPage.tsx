import { useEffect, useState } from 'react'
import { Col, Row, Typography } from 'antd'
import type { Character, Direction, Item, StateGroup } from '../../types'
import { DIRECTION_ORDER, frameCountForState } from '../../lib/grid'
import type { SquareCellRect } from '../../lib/useSquareCellGrid'
import { getCharacter, listItems, saveAnimation } from '../../lib/db'
import AnimationSetupPanel from './AnimationSetupPanel'
import AnimationGeneratePanel from './AnimationGeneratePanel'
import AnimationRawGenerationHistory from './AnimationRawGenerationHistory'
import AnimationGridAligner from './AnimationGridAligner'
import FrameTimelineEditor from './FrameTimelineEditor'
import AnimationGallery from './AnimationGallery'

type DirectionResult = { frameBlobs: Blob[]; audioBlob: Blob; frameTimestamps: number[] }
type CellRects = [[SquareCellRect, SquareCellRect], [SquareCellRect, SquareCellRect]]

export default function AnimationsPage() {
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [itemIds, setItemIds] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [state, setState] = useState<StateGroup>('stand_run')
  const [groupName, setGroupName] = useState('')
  const [actionDescription, setActionDescription] = useState('')

  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null)
  const [rawVideoBlob, setRawVideoBlob] = useState<Blob | null>(null)
  const [cellRects, setCellRects] = useState<CellRects | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [historyKey, setHistoryKey] = useState(0)

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

  function handleVideoReady(blob: Blob) {
    setRawVideoBlob(blob)
    setRawVideoUrl(URL.createObjectURL(blob))
    setHistoryKey((k) => k + 1)
  }

  function handleHistorySelect(blob: Blob) {
    setRawVideoBlob(blob)
    setRawVideoUrl(URL.createObjectURL(blob))
  }

  function handleAligned(rects: CellRects) {
    setCellRects(rects)
  }

  async function handleExtracted(resultsByDirection: Record<Direction, DirectionResult>) {
    if (!characterId || !rawVideoBlob) return
    for (const direction of DIRECTION_ORDER) {
      const result = resultsByDirection[direction]
      await saveAnimation({
        id: crypto.randomUUID(),
        characterId,
        itemIds,
        state,
        direction,
        groupName: groupName.trim() || undefined,
        frameBlobs: result.frameBlobs,
        audioBlob: result.audioBlob,
        rawVideoBlob,
        frameTimestamps: result.frameTimestamps,
        createdAt: Date.now(),
      })
    }
    setRawVideoUrl(null)
    setRawVideoBlob(null)
    setCellRects(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div>
      <Typography.Title level={3}>Animations</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
          <AnimationSetupPanel
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
          />
          <div style={{ marginTop: 16 }}>
            {character && !rawVideoUrl && (
              <AnimationGeneratePanel
                character={character}
                items={items}
                state={state}
                actionDescription={actionDescription}
                onVideoReady={handleVideoReady}
              />
            )}
            {!rawVideoUrl && (
              <AnimationRawGenerationHistory refreshKey={historyKey} onSelect={handleHistorySelect} />
            )}
          </div>
        </Col>
        <Col span={14}>
          {rawVideoUrl && !cellRects && <AnimationGridAligner videoUrl={rawVideoUrl} onAligned={handleAligned} />}
          {rawVideoUrl && cellRects && (
            <FrameTimelineEditor
              videoUrl={rawVideoUrl}
              cellRects={cellRects}
              state={state}
              frameCount={frameCountForState(state)}
              onExtracted={handleExtracted}
            />
          )}
          {!rawVideoUrl && <AnimationGallery characterId={characterId} refreshKey={refreshKey} />}
        </Col>
      </Row>
    </div>
  )
}
