import { useEffect, useState } from 'react'
import { Col, Row, Typography } from 'antd'
import type { Character, Direction, Item, StateGroup } from '../../types'
import { DIRECTION_ORDER } from '../../lib/grid'
import { getCharacter, listItems, saveImageAnimation } from '../../lib/db'
import type { ActionDirection } from '../../lib/promptBuilder'
import AnimationImageSetupPanel from './AnimationImageSetupPanel'
import AnimationImageGeneratePanel from './AnimationImageGeneratePanel'
import AnimationImageRawGenerationHistory from './AnimationImageRawGenerationHistory'
import AnimationImageGridAligner from './AnimationImageGridAligner'
import AnimationImageFrameBoard from './AnimationImageFrameBoard'
import AnimationImageGallery from './AnimationImageGallery'
import SpriteSheetExportButton from './SpriteSheetExportButton'
import { useAnimationImageGeneration } from './useAnimationImageGeneration'

export default function AnimationsByImagePage() {
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [itemIds, setItemIds] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [state, setState] = useState<StateGroup>('stand_run')
  const [groupName, setGroupName] = useState('')
  const [actionDescription, setActionDescription] = useState('')
  const [actionDirection, setActionDirection] = useState<ActionDirection>('same as facing')

  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [slicedCells, setSlicedCells] = useState<(HTMLCanvasElement | undefined)[] | null>(null)
  const [slicedCols, setSlicedCols] = useState(0)
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

  function handleGenerated(url: string) {
    setGeneratedImageUrl(url)
    setSlicedCells(null)
    setHistoryKey((k) => k + 1)
  }

  const { status, progress, error, generate } = useAnimationImageGeneration(handleGenerated)

  function handleGenerate() {
    if (!character) return
    generate({ character, items, state, actionDescription, actionDirection })
  }

  function handleRegenerate() {
    if (!character) return
    setGeneratedImageUrl(null)
    handleGenerate()
  }

  function handleSliced(cells: (HTMLCanvasElement | undefined)[], cols: number) {
    setSlicedCells(cells)
    setSlicedCols(cols)
  }

  async function handleFramesSaved(framesByDirection: Record<Direction, Blob[]>) {
    if (!characterId) return
    for (const direction of DIRECTION_ORDER) {
      const frameBlobs = framesByDirection[direction]
      if (!frameBlobs) continue
      await saveImageAnimation({
        id: crypto.randomUUID(),
        characterId,
        itemIds,
        state,
        direction,
        groupName: groupName.trim() || undefined,
        frameBlobs,
        createdAt: Date.now(),
      })
    }
    setGeneratedImageUrl(null)
    setSlicedCells(null)
    setRefreshKey((k) => k + 1)
  }

  if (slicedCells) {
    return (
      <div>
        <Typography.Title level={3}>Animations by Image</Typography.Title>
        <AnimationImageFrameBoard
          cells={slicedCells}
          cols={slicedCols}
          state={state}
          onSaved={handleFramesSaved}
        />
      </div>
    )
  }

  return (
    <div>
      <Typography.Title level={3}>Animations by Image</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
          <AnimationImageSetupPanel
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
            actionDirection={actionDirection}
            onActionDirectionChange={setActionDirection}
          />
          <div style={{ marginTop: 16 }}>
            {character && !generatedImageUrl && (
              <AnimationImageGeneratePanel
                status={status}
                progress={progress}
                error={error}
                onGenerate={handleGenerate}
              />
            )}
            {character && !generatedImageUrl && (
              <div style={{ marginTop: 16 }}>
                <SpriteSheetExportButton character={character} />
              </div>
            )}
            {!generatedImageUrl && (
              <AnimationImageRawGenerationHistory refreshKey={historyKey} onSelect={setGeneratedImageUrl} />
            )}
          </div>
        </Col>
        <Col span={14}>
          {generatedImageUrl ? (
            <AnimationImageGridAligner
              imageUrl={generatedImageUrl}
              onSliced={handleSliced}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <AnimationImageGallery characterId={characterId} refreshKey={refreshKey} />
          )}
        </Col>
      </Row>
    </div>
  )
}
