import { Button, Input, Space, Typography, Upload, message } from 'antd'
import { CopyOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { DEFAULT_STYLE_TEMPLATE } from '../../lib/styleTemplate'
import { buildCharacterPrompt2 } from '../../lib/promptBuilder'

const { TextArea } = Input

interface CharacterPromptPanel2Props {
  name: string
  onNameChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  styleTemplate: string
  onStyleTemplateChange: (value: string) => void
  referenceImageUrl: string | null
  onReferenceImageChange: (file: File | null) => void
}

export default function CharacterPromptPanel2({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  styleTemplate,
  onStyleTemplateChange,
  referenceImageUrl,
  onReferenceImageChange,
}: CharacterPromptPanel2Props) {
  const prompt = buildCharacterPrompt2(description, styleTemplate)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text strong>Name</Typography.Text>
          <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Rook" />
        </div>

        <div>
          <Typography.Text strong>Reference image (optional)</Typography.Text>
          <div>
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                onReferenceImageChange(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />}>{referenceImageUrl ? 'Replace image' : 'Upload image'}</Button>
            </Upload>
            {referenceImageUrl && (
              <Space style={{ marginTop: 8 }}>
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, background: '#eee' }}
                />
                <Button size="small" danger onClick={() => onReferenceImageChange(null)}>
                  Remove
                </Button>
              </Space>
            )}
          </div>
          <Typography.Text type="secondary">
            An image of the character sent alongside the prompt as an extra visual reference for generation.
          </Typography.Text>
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
  )
}
