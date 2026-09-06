import { useCallback, useMemo, useState } from 'react'
import { Col, Row, Typography, message } from 'antd'
import type { View } from '../../types'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt } from '../../lib/promptBuilder'
import { saveCharacter } from '../../lib/db'
import CharacterPromptPanel from './CharacterPromptPanel'
import CharacterGeneratePanel from './CharacterGeneratePanel'
import CharacterVersionPicker from './CharacterVersionPicker'
import CharacterGallery from './CharacterGallery'
import CharacterRawGenerationHistory from './CharacterRawGenerationHistory'

export default function CharactersPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [styleTemplate, setStyleTemplate] = useState(DEFAULT_STYLE_TEMPLATE)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [historyKey, setHistoryKey] = useState(0)

  const prompt = useMemo(() => buildCharacterPrompt(description, styleTemplate), [description, styleTemplate])

  const handleVersionChosen = useCallback(
    async (viewBlobs: Record<View, Blob>) => {
      if (!name.trim()) {
        message.error('Enter a character name before saving')
        return
      }
      await saveCharacter({
        id: crypto.randomUUID(),
        name: name.trim(),
        description,
        styleTemplate,
        prompt,
        viewBlobs,
        createdAt: Date.now(),
      })
      setGeneratedImageUrl(null)
      setRefreshKey((k) => k + 1)
    },
    [name, description, styleTemplate, prompt],
  )

  const handleGenerated = useCallback((url: string) => {
    setGeneratedImageUrl(url)
    setHistoryKey((k) => k + 1)
  }, [])

  return (
    <div>
      <Typography.Title level={3}>Characters</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
          <CharacterPromptPanel
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            styleTemplate={styleTemplate}
            onStyleTemplateChange={setStyleTemplate}
          />
          <div style={{ marginTop: 16 }}>
            <CharacterGeneratePanel prompt={prompt} onGenerated={handleGenerated} />
          </div>
          <CharacterRawGenerationHistory refreshKey={historyKey} onSelect={setGeneratedImageUrl} />
        </Col>
        <Col span={14}>
          {generatedImageUrl ? (
            <CharacterVersionPicker imageUrl={generatedImageUrl} onVersionChosen={handleVersionChosen} />
          ) : (
            <CharacterGallery refreshKey={refreshKey} />
          )}
        </Col>
      </Row>
    </div>
  )
}
