import { useCallback, useEffect, useMemo, useState } from 'react'
import { Col, Row, Tabs, Typography } from 'antd'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt2 } from '../../lib/promptBuilder'
import CharacterPromptPanel2 from './CharacterPromptPanel2'
import CharacterGeneratePanel2 from './CharacterGeneratePanel2'
import CharacterVersionPicker2 from './CharacterVersionPicker2'
import CharacterRawGenerationHistory2 from './CharacterRawGenerationHistory2'
import Character2VideoHistoryPage from './Character2VideoHistoryPage'

export default function Characters2Page() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [styleTemplate, setStyleTemplate] = useState(DEFAULT_STYLE_TEMPLATE)
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generatedImageBlob, setGeneratedImageBlob] = useState<Blob | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [videoHistoryKey, setVideoHistoryKey] = useState(0)

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
  function adoptGeneratedImage(blob: Blob) {
    const url = URL.createObjectURL(blob)
    setGeneratedImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setGeneratedImageBlob(blob)
  }

  const handleGenerated = useCallback((url: string) => {
    fetch(url)
      .then((res) => res.blob())
      .then(adoptGeneratedImage)
    setHistoryKey((k) => k + 1)
  }, [])

  const handleHistorySelect = useCallback((blob: Blob) => {
    adoptGeneratedImage(blob)
  }, [])

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
            children: (
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
                  <CharacterRawGenerationHistory2 refreshKey={historyKey} onSelect={handleHistorySelect} />
                </Col>
                <Col span={14}>
                  {generatedImageUrl && generatedImageBlob && (
                    <CharacterVersionPicker2
                      imageUrl={generatedImageUrl}
                      imageBlob={generatedImageBlob}
                      name={name}
                      description={description}
                      onVideoSaved={handleVideoSaved}
                    />
                  )}
                </Col>
              </Row>
            ),
          },
          {
            key: 'history',
            label: 'Video history',
            children: <Character2VideoHistoryPage refreshKey={videoHistoryKey} />,
          },
        ]}
      />
    </div>
  )
}
