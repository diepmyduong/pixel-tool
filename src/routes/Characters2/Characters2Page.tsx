import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Col, Row, Tabs, Typography } from 'antd'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt2 } from '../../lib/promptBuilder'
import CharacterPromptPanel2 from './CharacterPromptPanel2'
import CharacterGeneratePanel2 from './CharacterGeneratePanel2'
import CharacterRawGenerationHistory2 from './CharacterRawGenerationHistory2'
import Character2VideoHistoryPage from './Character2VideoHistoryPage'
import Character2SpriteSheetsPage from './Character2SpriteSheetsPage'
import PickSheetCard from './PickSheetCard'
import DirectionVideosCard from './DirectionVideosCard'
import { useCharacter2Sheet } from './useCharacter2Sheet'

interface GenerateTabProps {
  onVideoSaved: () => void
}

function GenerateTab({ onVideoSaved }: GenerateTabProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [styleTemplate, setStyleTemplate] = useState(DEFAULT_STYLE_TEMPLATE)
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generatedImageBlob, setGeneratedImageBlob] = useState<Blob | null>(null)
  const [flow2RequestId, setFlow2RequestId] = useState<string | undefined>(undefined)
  const [historyKey, setHistoryKey] = useState(0)

  const prompt = useMemo(() => buildCharacterPrompt2(description, styleTemplate), [description, styleTemplate])

  useEffect(() => {
    return () => {
      if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
    }
  }, [referenceImageUrl])

  const handleReferenceImageChange = useCallback(
    (file: File | null) => {
      if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
      setReferenceImageFile(file)
      setReferenceImageUrl(file ? URL.createObjectURL(file) : null)
    },
    [referenceImageUrl],
  )

  // Mints a fresh, page-owned object URL for a blob and swaps it in for the
  // previous one — never reuses a URL created (and lifecycle-owned) by a
  // child component, since that component can revoke it later out from under
  // this page (e.g. CharacterRawGenerationHistory2 revokes every URL it
  // handed out whenever its own list refetches), which previously left
  // generatedImageUrl pointing at a revoked blob: URL that 404s the moment
  // Slice Grid tries to load it.
  function adoptGeneratedImage(blob: Blob, nextFlow2RequestId: string | undefined) {
    const url = URL.createObjectURL(blob)
    setGeneratedImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setGeneratedImageBlob(blob)
    setFlow2RequestId(nextFlow2RequestId)
  }

  const handleGenerated = useCallback((url: string, nextFlow2RequestId: string | undefined) => {
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => adoptGeneratedImage(blob, nextFlow2RequestId))
    setHistoryKey((k) => k + 1)
  }, [])

  const handleHistorySelect = useCallback((blob: Blob, nextFlow2RequestId: string | undefined) => {
    adoptGeneratedImage(blob, nextFlow2RequestId)
  }, [])

  // Swapping in the upscaled image changes generatedImageUrl, which resets
  // useCharacter2Sheet's grid state (it keys off imageUrl) — upscaling is
  // meant to happen before slicing for exactly this reason: do it first,
  // then align/slice against the sharper source.
  const handleUpscaled = useCallback((blob: Blob) => {
    adoptGeneratedImage(blob, flow2RequestId)
  }, [flow2RequestId])

  const sheet = useCharacter2Sheet({
    imageUrl: generatedImageUrl ?? '',
    imageBlob: generatedImageBlob ?? new Blob(),
    name,
    description,
    onVideoSaved,
  })

  return (
    <div>
      <Row gutter={24}>
        <Col span={10}>
          <Card title="Character">
            <CharacterPromptPanel2
              name={name}
              onNameChange={setName}
              description={description}
              onDescriptionChange={setDescription}
              styleTemplate={styleTemplate}
              onStyleTemplateChange={setStyleTemplate}
              referenceImageUrl={referenceImageUrl}
              onReferenceImageChange={handleReferenceImageChange}
            />
            <CharacterGeneratePanel2
              prompt={prompt}
              referenceImageFile={referenceImageFile}
              onGenerated={handleGenerated}
            />
            <CharacterRawGenerationHistory2 refreshKey={historyKey} onSelect={handleHistorySelect} />
          </Card>
        </Col>
        <Col span={14}>
          {generatedImageUrl && generatedImageBlob && (
            <PickSheetCard
              imageUrl={generatedImageUrl}
              flow2RequestId={flow2RequestId}
              onUpscaled={handleUpscaled}
              sheet={sheet}
            />
          )}
        </Col>
      </Row>

      {generatedImageUrl && generatedImageBlob && sheet.sliced && (
        <div style={{ marginTop: 24 }}>
          <DirectionVideosCard sheet={sheet} />
        </div>
      )}
    </div>
  )
}

export default function Characters2Page() {
  const [videoHistoryKey, setVideoHistoryKey] = useState(0)

  const handleVideoSaved = useCallback(() => {
    setVideoHistoryKey((k) => k + 1)
  }, [])

  return (
    <div>
      <Typography.Title level={3}>Characters-2</Typography.Title>
      <Tabs
        items={[
          {
            key: 'generate',
            label: 'Generate',
            children: <GenerateTab onVideoSaved={handleVideoSaved} />,
          },
          {
            key: 'history',
            label: 'Video history',
            children: (
              <Character2VideoHistoryPage
                refreshKey={videoHistoryKey}
                onSpriteSheetSaved={handleVideoSaved}
              />
            ),
          },
          {
            key: 'sprite-sheets',
            label: 'Sprite Sheets',
            children: (
              <Character2SpriteSheetsPage
                refreshKey={videoHistoryKey}
                onSpriteSheetSaved={handleVideoSaved}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
