import { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Button, Card, Input, Select, Space, Typography, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { Character, Item, StateGroup } from '../../types'
import { primaryViewBlob } from '../../types'
import { STATE_ORDER } from '../../lib/grid'
import { listAnimationGroups, listCharacters, listItems } from '../../lib/db'
import { useThumbnailUrls } from '../../lib/useThumbnailUrls'

const { TextArea } = Input

const STATE_LABELS: Record<StateGroup, string> = {
  stand_run: 'Stand / Run',
  attack: 'Attack',
  roll: 'Roll',
}

const STATE_OPTIONS = STATE_ORDER.map((s) => ({ value: s.state, label: STATE_LABELS[s.state] }))

interface VideoV2SetupPanelProps {
  characterId: string | null
  onCharacterIdChange: (id: string | null) => void
  itemIds: string[]
  onItemIdsChange: (ids: string[]) => void
  state: StateGroup
  onStateChange: (state: StateGroup) => void
  groupName: string
  onGroupNameChange: (value: string) => void
  actionDescription: string
  onActionDescriptionChange: (value: string) => void
  referenceImageUrl: string | null
  onReferenceImageChange: (file: File | null) => void
  disabled?: boolean
}

export default function VideoV2SetupPanel({
  characterId,
  onCharacterIdChange,
  itemIds,
  onItemIdsChange,
  state,
  onStateChange,
  groupName,
  onGroupNameChange,
  actionDescription,
  onActionDescriptionChange,
  referenceImageUrl,
  onReferenceImageChange,
  disabled = false,
}: VideoV2SetupPanelProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [groupOptions, setGroupOptions] = useState<{ value: string }[]>([])

  useEffect(() => {
    listCharacters().then(setCharacters)
    listItems().then(setItems)
    listAnimationGroups().then((groups) => setGroupOptions(groups.map((g) => ({ value: g }))))
  }, [])

  const characterThumbUrls = useThumbnailUrls(characters, (c) => primaryViewBlob(c.viewBlobs))
  const itemThumbUrls = useThumbnailUrls(items, (i) => i.blob)

  const characterOptions = useMemo(
    () =>
      characters.map((c) => ({
        value: c.id,
        label: c.name,
        thumbUrl: characterThumbUrls[c.id],
      })),
    [characters, characterThumbUrls],
  )
  const itemOptions = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: i.name,
        thumbUrl: itemThumbUrls[i.id],
      })),
    [items, itemThumbUrls],
  )

  function renderThumbOption(option: { label?: unknown; thumbUrl?: string }) {
    return (
      <Space>
        {option.thumbUrl && (
          <img
            src={option.thumbUrl}
            alt=""
            style={{ width: 24, height: 24, objectFit: 'cover', background: '#eee', borderRadius: 4 }}
          />
        )}
        {option.label as string}
      </Space>
    )
  }

  return (
    <Card title="Setup">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text strong>Character (optional if a reference image is provided)</Typography.Text>
          <Select
            style={{ width: '100%' }}
            placeholder="Select a character"
            value={characterId ?? undefined}
            onChange={onCharacterIdChange}
            options={characterOptions}
            optionRender={(option) => renderThumbOption(option.data)}
            labelRender={(props) => renderThumbOption(characterOptions.find((o) => o.value === props.value) ?? props)}
            disabled={disabled}
          />
        </div>

        <div>
          <Typography.Text strong>Reference image (optional)</Typography.Text>
          <div>
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              disabled={disabled}
              beforeUpload={(file) => {
                onReferenceImageChange(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />} disabled={disabled}>
                {referenceImageUrl ? 'Replace image' : 'Upload image'}
              </Button>
            </Upload>
            {referenceImageUrl && (
              <Space style={{ marginTop: 8 }}>
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, background: '#eee' }}
                />
                <Button size="small" danger onClick={() => onReferenceImageChange(null)} disabled={disabled}>
                  Remove
                </Button>
              </Space>
            )}
          </div>
          <Typography.Text type="secondary">
            An external image sent alongside (or instead of) the selected character as an extra visual
            reference for generation.
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong>Items (optional)</Typography.Text>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Select items"
            value={itemIds}
            onChange={onItemIdsChange}
            options={itemOptions}
            optionRender={(option) => renderThumbOption(option.data)}
            disabled={disabled}
          />
        </div>

        <div>
          <Typography.Text strong>State</Typography.Text>
          <Select
            style={{ width: '100%' }}
            value={state}
            onChange={onStateChange}
            options={STATE_OPTIONS}
            disabled={disabled}
          />
          <div>
            <Typography.Text type="secondary">Right-facing only — flip horizontally for left.</Typography.Text>
          </div>
        </div>

        <div>
          <Typography.Text strong>Group name (optional)</Typography.Text>
          <AutoComplete
            style={{ width: '100%' }}
            value={groupName}
            onChange={onGroupNameChange}
            options={groupOptions}
            filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            placeholder="e.g. combo-1, boss-fight"
            disabled={disabled}
          />
          <Typography.Text type="secondary">
            Free-form label to group related animations together for easier searching later.
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong>Action description (optional)</Typography.Text>
          <TextArea
            value={actionDescription}
            onChange={(e) => onActionDescriptionChange(e.target.value)}
            rows={3}
            placeholder="e.g. using the watering can to water a plant in front of them"
            disabled={disabled}
          />
          <Typography.Text type="secondary">
            Overrides the generic description for the selected state — useful when an item
            changes what the action actually looks like (e.g. "attack" while holding a watering
            can should describe watering, not swinging a weapon).
          </Typography.Text>
        </div>
      </Space>
    </Card>
  )
}
