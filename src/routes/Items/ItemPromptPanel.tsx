import { Button, Card, Input, Space, Typography, message } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildItemPrompt, parseItemNames } from '../../lib/promptBuilder'

const { TextArea } = Input

interface ItemPromptPanelProps {
  itemNamesText: string
  onItemNamesTextChange: (value: string) => void
  styleTemplate: string
  onStyleTemplateChange: (value: string) => void
}

export default function ItemPromptPanel({
  itemNamesText,
  onItemNamesTextChange,
  styleTemplate,
  onStyleTemplateChange,
}: ItemPromptPanelProps) {
  const itemNames = parseItemNames(itemNamesText)
  const prompt = itemNames.length > 0 ? buildItemPrompt(itemNames, styleTemplate) : ''

  return (
    <Card title="Items">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text strong>Item names (one per line)</Typography.Text>
          <TextArea
            value={itemNamesText}
            onChange={(e) => onItemNamesTextChange(e.target.value)}
            rows={6}
            placeholder={'sword\nshield\npotion\nkey'}
          />
          <Typography.Text type="secondary">{itemNames.length} item(s)</Typography.Text>
        </div>

        <div>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text strong>Style template</Typography.Text>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => onStyleTemplateChange(DEFAULT_STYLE_TEMPLATE)}
            >
              Reset to default
            </Button>
          </Space>
          <TextArea value={styleTemplate} onChange={(e) => onStyleTemplateChange(e.target.value)} rows={5} />
        </div>

        <div>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text strong>Generated prompt</Typography.Text>
            <Button
              size="small"
              icon={<CopyOutlined />}
              disabled={!prompt}
              onClick={() => {
                navigator.clipboard.writeText(prompt)
                message.success('Prompt copied')
              }}
            >
              Copy
            </Button>
          </Space>
          <TextArea
            value={prompt || 'Enter at least one item name above to generate a prompt.'}
            readOnly
            rows={8}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      </Space>
    </Card>
  )
}
