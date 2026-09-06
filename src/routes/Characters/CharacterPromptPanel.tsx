import { Button, Card, Input, Space, Typography, message } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt } from '../../lib/promptBuilder'

const { TextArea } = Input

interface CharacterPromptPanelProps {
  name: string
  onNameChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  styleTemplate: string
  onStyleTemplateChange: (value: string) => void
}

export default function CharacterPromptPanel({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  styleTemplate,
  onStyleTemplateChange,
}: CharacterPromptPanelProps) {
  const prompt = buildCharacterPrompt(description, styleTemplate)

  return (
    <Card title="Character">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text strong>Name</Typography.Text>
          <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Rook" />
        </div>

        <div>
          <Typography.Text strong>Description</Typography.Text>
          <TextArea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={4}
            placeholder="e.g. a small stocky red robot with a round head and glowing blue eyes"
          />
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
              onClick={() => {
                navigator.clipboard.writeText(prompt)
                message.success('Prompt copied')
              }}
            >
              Copy
            </Button>
          </Space>
          <TextArea value={prompt} readOnly rows={8} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </div>
      </Space>
    </Card>
  )
}
