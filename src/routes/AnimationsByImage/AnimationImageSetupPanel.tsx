import { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Card, Input, Select, Space, Typography } from 'antd'
import type { Character, Item, StateGroup } from '../../types'
import { primaryViewBlob } from '../../types'
import { listAnimationGroups, listCharacters, listItems } from '../../lib/db'
import { ACTION_DIRECTION_CHOICES, type ActionDirection } from '../../lib/promptBuilder'
import { useThumbnailUrls } from '../../lib/useThumbnailUrls'

const { TextArea } = Input

const STATE_OPTIONS: { value: StateGroup; label: string }[] = [
  { value: 'stand_run', label: 'Stand / Run' },
  { value: 'attack', label: 'Attack' },
  { value: 'roll', label: 'Roll' },
]

const ACTION_DIRECTION_OPTIONS = ACTION_DIRECTION_CHOICES.map((value) => ({ value, label: value }))

interface AnimationImageSetupPanelProps {
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
  actionDirection: ActionDirection
  onActionDirectionChange: (value: ActionDirection) => void
}

export default function AnimationImageSetupPanel({
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
  actionDirection,
  onActionDirectionChange,
}: AnimationImageSetupPanelProps) {
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
          <Typography.Text strong>Character</Typography.Text>
          <Select
            style={{ width: '100%' }}
            placeholder="Select a character"
            value={characterId ?? undefined}
            onChange={onCharacterIdChange}
            options={characterOptions}
            optionRender={(option) => renderThumbOption(option.data)}
            labelRender={(props) => renderThumbOption(characterOptions.find((o) => o.value === props.value) ?? props)}
          />
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
          />
        </div>

        <div>
          <Typography.Text strong>State</Typography.Text>
          <Select style={{ width: '100%' }} value={state} onChange={onStateChange} options={STATE_OPTIONS} />
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
          />
          <Typography.Text type="secondary">
            Free-form label to group related animations together for easier searching later.
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong>Action direction</Typography.Text>
          <Select
            style={{ width: '100%' }}
            value={actionDirection}
            onChange={onActionDirectionChange}
            options={ACTION_DIRECTION_OPTIONS}
          />
          <Typography.Text type="secondary">
            The path the weapon/tool/limb travels, independent from which way the character is
            facing — e.g. a character facing right can still swing a hoe top-to-bottom into the
            ground.
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong>Action description (optional)</Typography.Text>
          <TextArea
            value={actionDescription}
            onChange={(e) => onActionDescriptionChange(e.target.value)}
            rows={3}
            placeholder="e.g. using the watering can to water a plant in front of them"
          />
          <Typography.Text type="secondary">
            Overrides the generic description for the selected state — useful when an item
            changes what the action actually looks like (e.g. "attack" while holding a watering
            can should describe watering, not swinging a weapon).
          </Typography.Text>
        </div>

        <Typography.Text type="secondary">
          One generation produces a 16:9 sheet with 4 rows — one per direction. The AI is asked
          for 8 frames per row but may not draw exactly that many; set the actual column count
          in the picker before slicing.
        </Typography.Text>
      </Space>
    </Card>
  )
}
