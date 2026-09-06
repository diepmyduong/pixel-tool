import { useState } from 'react'
import { Alert, Button, Space } from 'antd'
import type { Character } from '../../types'
import { listImageAnimationsForCharacter } from '../../lib/db'
import {
  SHEET_FRAME_COUNT,
  SHEET_FRAME_SIZE,
  composeSpriteSheet,
  downloadBlob,
  type MissingSlot,
} from '../../lib/spriteSheet'

interface SpriteSheetExportButtonProps {
  character: Character
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'character'
}

function describeMissing(missing: MissingSlot[]): string {
  return missing
    .map((m) => `${m.state}/${m.direction} (${m.found}/${m.expected})`)
    .join(', ')
}

export default function SpriteSheetExportButton({ character }: SpriteSheetExportButtonProps) {
  const [exporting, setExporting] = useState(false)
  const [missing, setMissing] = useState<MissingSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    setMissing(null)
    try {
      const animations = await listImageAnimationsForCharacter(character.id)
      const { blob, missing } = await composeSpriteSheet(animations)
      downloadBlob(blob, `${slugify(character.name)}_sheet.png`)
      setMissing(missing)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <Button block loading={exporting} onClick={handleExport}>
        Export Sprite Sheet ({SHEET_FRAME_COUNT} x {SHEET_FRAME_SIZE}px)
      </Button>
      {error && <Alert type="error" showIcon message={error} />}
      {missing?.length === 0 && (
        <Alert type="success" showIcon message="Exported all 60 frames." />
      )}
      {missing && missing.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Exported with transparent gaps"
          description={`Missing frames: ${describeMissing(missing)}`}
        />
      )}
    </Space>
  )
}
