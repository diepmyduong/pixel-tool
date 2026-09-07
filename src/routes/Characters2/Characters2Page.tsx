import { useCallback, useEffect, useMemo, useState } from 'react'
import { Col, Row, Typography, message } from 'antd'
import type { Direction8 } from '../../types'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt2 } from '../../lib/promptBuilder'
import { saveCharacter2 } from '../../lib/db'
import CharacterPromptPanel2 from './CharacterPromptPanel2'
import CharacterGeneratePanel2 from './CharacterGeneratePanel2'
import CharacterVersionPicker2 from './CharacterVersionPicker2'
import CharacterGallery2 from './CharacterGallery2'
import CharacterRawGenerationHistory2 from './CharacterRawGenerationHistory2'

export default function Characters2Page() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [styleTemplate, setStyleTemplate] = useState(DEFAULT_STYLE_TEMPLATE)
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
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

  const handleVersionChosen = useCallback(
    async (blobs: { standBlobs: Record<Direction8, Blob>; runBlobs: Record<Direction8, Blob> }) => {
      if (!name.trim()) {
        message.error('Enter a character name before saving')
        return
      }
      await saveCharacter2({
        id: crypto.randomUUID(),
        name: name.trim(),
        description,
        styleTemplate,
        prompt,
        standBlobs: blobs.standBlobs,
        runBlobs: blobs.runBlobs,
        createdAt: Date.now(),
      })
      setGeneratedImageUrl(null)
      setRefreshKey((k) => k + 1)
    },
    [name, description, styleTemplate, prompt],
  )

  const handleGenerated = useCallback((url: string) => {
    setGeneratedImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setHistoryKey((k) => k + 1)
  }, [])

  return (
    <div>
      <Typography.Title level={3}>Characters-2</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
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
          <div style={{ marginTop: 16 }}>
            <CharacterGeneratePanel2
              prompt={prompt}
              referenceImageFile={referenceImageFile}
              onGenerated={handleGenerated}
            />
          </div>
          <CharacterRawGenerationHistory2 refreshKey={historyKey} onSelect={setGeneratedImageUrl} />
        </Col>
        <Col span={14}>
          {generatedImageUrl ? (
            <CharacterVersionPicker2
              imageUrl={generatedImageUrl}
              description={description}
              onVersionChosen={handleVersionChosen}
            />
          ) : (
            <CharacterGallery2 refreshKey={refreshKey} />
          )}
        </Col>
      </Row>
    </div>
  )
}
