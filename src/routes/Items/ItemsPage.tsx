import { useState } from 'react'
import { Col, Row, Typography } from 'antd'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildItemPrompt, parseItemNames } from '../../lib/promptBuilder'
import ItemPromptPanel from './ItemPromptPanel'
import ItemGeneratePanel from './ItemGeneratePanel'
import ItemGridAligner from './ItemGridAligner'
import ItemAssignBoard from './ItemAssignBoard'
import ItemGallery from './ItemGallery'
import ItemRawGenerationHistory from './ItemRawGenerationHistory'

export default function ItemsPage() {
  const [itemNamesText, setItemNamesText] = useState('')
  const [styleTemplate, setStyleTemplate] = useState(DEFAULT_STYLE_TEMPLATE)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [slicedCells, setSlicedCells] = useState<(HTMLCanvasElement | undefined)[] | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [historyKey, setHistoryKey] = useState(0)

  const itemNames = parseItemNames(itemNamesText)
  const prompt = itemNames.length > 0 ? buildItemPrompt(itemNames, styleTemplate) : ''

  function handleGenerated(url: string) {
    setGeneratedImageUrl(url)
    setSlicedCells(null)
    setHistoryKey((k) => k + 1)
  }

  function handleSaved() {
    setGeneratedImageUrl(null)
    setSlicedCells(null)
    setRefreshKey((k) => k + 1)
  }

  if (slicedCells) {
    return (
      <div>
        <Typography.Title level={3}>Items</Typography.Title>
        <ItemAssignBoard cells={slicedCells} itemNames={itemNames} prompt={prompt} onSaved={handleSaved} />
      </div>
    )
  }

  return (
    <div>
      <Typography.Title level={3}>Items</Typography.Title>
      <Row gutter={24}>
        <Col span={10}>
          <ItemPromptPanel
            itemNamesText={itemNamesText}
            onItemNamesTextChange={setItemNamesText}
            styleTemplate={styleTemplate}
            onStyleTemplateChange={setStyleTemplate}
          />
          <div style={{ marginTop: 16 }}>
            <ItemGeneratePanel prompt={prompt} disabled={itemNames.length === 0} onGenerated={handleGenerated} />
          </div>
          <ItemRawGenerationHistory refreshKey={historyKey} onSelect={setGeneratedImageUrl} />
        </Col>
        <Col span={14}>
          {generatedImageUrl ? (
            <ItemGridAligner imageUrl={generatedImageUrl} onSliced={setSlicedCells} />
          ) : (
            <ItemGallery refreshKey={refreshKey} />
          )}
        </Col>
      </Row>
    </div>
  )
}
