import type { Direction, ImageAnimation, StateGroup } from '../types'
import { ANIM_IMG_SLOT_COUNT, STATE_ORDER } from './grid'
import { canvasToBlob } from './imageProcessing'

export const SHEET_FRAME_SIZE = 64

/**
 * Export direction order, deliberately different from DIRECTION_ORDER (the
 * up/right/down/left row order of the generated source sheet): the engine
 * consuming the exported PNG indexes its animations right/up/left/down, so
 * the export remaps rather than making the generator match the engine.
 */
export const EXPORT_DIRECTION_ORDER: Direction[] = ['right', 'up', 'left', 'down']

export interface SheetSlot {
  state: StateGroup
  direction: Direction
  frameCount: number
  startIndex: number
}

/**
 * The 12 (state x direction) slots of the exported strip, in output order:
 * every state's 4 directions before the next state, each direction's frames
 * contiguous. Slot lengths come from ANIM_IMG_SLOT_COUNT, so the strip is
 * always the same length regardless of what has actually been generated.
 */
export function buildSheetLayout(): SheetSlot[] {
  const slots: SheetSlot[] = []
  let startIndex = 0
  for (const { state } of STATE_ORDER) {
    const frameCount = ANIM_IMG_SLOT_COUNT[state]
    for (const direction of EXPORT_DIRECTION_ORDER) {
      slots.push({ state, direction, frameCount, startIndex })
      startIndex += frameCount
    }
  }
  return slots
}

export const SHEET_LAYOUT = buildSheetLayout()
export const SHEET_FRAME_COUNT = SHEET_LAYOUT.reduce((sum, slot) => sum + slot.frameCount, 0)

export interface MissingSlot {
  state: StateGroup
  direction: Direction
  /** Frames found; 0 means the slot has no animation saved at all. */
  found: number
  expected: number
}

export interface SpriteSheetResult {
  blob: Blob
  missing: MissingSlot[]
}

function loadBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load frame'))
    }
    img.src = url
  })
}

/**
 * Picks the animation to export for a slot when a character has several for
 * the same state+direction (re-generations, different groups): the most
 * recent one, matching what the gallery shows as current.
 */
function pickAnimation(
  animations: ImageAnimation[],
  state: StateGroup,
  direction: Direction,
): ImageAnimation | undefined {
  return animations
    .filter((a) => a.state === state && a.direction === direction)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}

/**
 * Composes a character's image-animations into a single-row PNG strip of
 * 64x64 cells. Slots with no saved animation (or too few frames) are left
 * fully transparent and reported in `missing` rather than shifting later
 * frames left — the engine indexes frames by absolute position, so the
 * strip must keep its fixed length and offsets even when incomplete.
 */
export async function composeSpriteSheet(animations: ImageAnimation[]): Promise<SpriteSheetResult> {
  const canvas = document.createElement('canvas')
  canvas.width = SHEET_FRAME_COUNT * SHEET_FRAME_SIZE
  canvas.height = SHEET_FRAME_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  const missing: MissingSlot[] = []

  for (const slot of SHEET_LAYOUT) {
    const animation = pickAnimation(animations, slot.state, slot.direction)
    const frames = animation?.frameBlobs.slice(0, slot.frameCount) ?? []

    for (const [i, frame] of frames.entries()) {
      const img = await loadBlob(frame)
      ctx.drawImage(
        img,
        (slot.startIndex + i) * SHEET_FRAME_SIZE,
        0,
        SHEET_FRAME_SIZE,
        SHEET_FRAME_SIZE,
      )
    }

    if (frames.length < slot.frameCount) {
      missing.push({
        state: slot.state,
        direction: slot.direction,
        found: frames.length,
        expected: slot.frameCount,
      })
    }
  }

  return { blob: await canvasToBlob(canvas), missing }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
