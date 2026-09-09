import type { Direction, Direction8, StateGroup, View } from '../types'
import { DIRECTION8_ORDER, VIEW_ORDER } from '../types'

export const SOURCE_ASPECT_RATIO = '9:16'

export const CHAR_GRID_COLS = 6
export const CHAR_GRID_ROWS = 11
export const CHAR_GRID_CELLS = CHAR_GRID_COLS * CHAR_GRID_ROWS // 66
export const CHAR_VERSIONS = 10

export interface CharacterCell {
  cellIndex: number
  row: number
  col: number
  version: number | null // 1-based version number, or null if reserved
  view: View | null
}

/**
 * Rows 0-8: 9 full versions (1-9), one version per row, 6 views per row.
 * Rows 9-10: version 10, first 3 views in row 9 cols 0-2, last 3 views in
 * row 10 cols 0-2. Cols 3-5 of rows 9-10 are a reserved 2x3 block (empty,
 * left for the generator to fill with watermark-dodge noise).
 */
export function buildCharacterLayout(): CharacterCell[] {
  const cells: CharacterCell[] = []
  for (let row = 0; row < CHAR_GRID_ROWS; row++) {
    for (let col = 0; col < CHAR_GRID_COLS; col++) {
      const cellIndex = row * CHAR_GRID_COLS + col
      if (row < 9) {
        const version = row + 1
        const view = VIEW_ORDER[col]
        cells.push({ cellIndex, row, col, version, view })
        continue
      }
      // rows 9-10: version 10
      if (col < 3) {
        const view = row === 9 ? VIEW_ORDER[col] : VIEW_ORDER[col + 3]
        cells.push({ cellIndex, row, col, version: 10, view })
        continue
      }
      cells.push({ cellIndex, row, col, version: null, view: null })
    }
  }
  return cells
}

export const CHARACTER_LAYOUT = buildCharacterLayout()

export function versionCells(version: number): CharacterCell[] {
  return CHARACTER_LAYOUT.filter((c) => c.version === version)
}

// --- Characters-2: 3 columns (stand / run / attack) x 8 direction rows, one character version per sheet ---
export const CHAR2_GRID_COLS = 3
export const CHAR2_GRID_ROWS = DIRECTION8_ORDER.length // 8
export const CHAR2_GRID_CELLS = CHAR2_GRID_COLS * CHAR2_GRID_ROWS // 24

export type Character2Pose = 'stand' | 'run' | 'attack'
export const CHARACTER2_POSE_ORDER: Character2Pose[] = ['stand', 'run', 'attack']

export interface Character2Cell {
  cellIndex: number
  row: number
  col: number
  direction: Direction8
  pose: Character2Pose
}

/** Col 0 = standing pose, col 1 = running pose, one row per direction in DIRECTION8_ORDER. */
export function buildCharacter2Layout(): Character2Cell[] {
  const cells: Character2Cell[] = []
  for (let row = 0; row < CHAR2_GRID_ROWS; row++) {
    for (let col = 0; col < CHAR2_GRID_COLS; col++) {
      const cellIndex = row * CHAR2_GRID_COLS + col
      cells.push({
        cellIndex,
        row,
        col,
        direction: DIRECTION8_ORDER[row],
        pose: CHARACTER2_POSE_ORDER[col],
      })
    }
  }
  return cells
}

export const CHARACTER2_LAYOUT = buildCharacter2Layout()

export const ITEM_GRID_COLS = 6
export const ITEM_GRID_ROWS = 11
export const ITEM_GRID_CELLS = ITEM_GRID_COLS * ITEM_GRID_ROWS // 66

export const STATE_ORDER: { state: StateGroup; frameCount: number }[] = [
  { state: 'stand_run', frameCount: 6 },
  { state: 'attack', frameCount: 4 },
  { state: 'roll', frameCount: 5 },
]

export function frameCountForState(state: StateGroup): number {
  const entry = STATE_ORDER.find((s) => s.state === state)
  if (!entry) throw new Error(`Unknown state: ${state}`)
  return entry.frameCount
}

/**
 * All 4 directions run simultaneously, each pinned to a fixed cell of the
 * 2x2 grid the animation video is composed of (16:9 frame split into 4
 * cells: top-left/top-right/bottom-left/bottom-right).
 */
export const DIRECTION_ORDER: Direction[] = ['up', 'right', 'down', 'left']

// --- Animation-by-image grid ---
// One generated 16:9 sheet covers a single state (stand_run/attack/roll):
// N cols = N frames of one direction's action, rows 0-3 = the 4 directions.
//
// The AI doesn't reliably honor a requested column count, so the actual
// column count is read off the generated sheet by the user (via a "Columns"
// input in the picker) rather than assumed fixed — buildAnimationImageLayout
// takes cols as a parameter instead of reading a shared constant.
export const ANIM_IMG_GRID_COLS_DEFAULT = 10
export const ANIM_IMG_GRID_ROWS = 4
export const ANIM_IMG_ASPECT_RATIO = '16:9'

/** Final kept-frame slot count per direction, by state — fixed regardless of how many frames were generated. */
export const ANIM_IMG_SLOT_COUNT: Record<StateGroup, number> = {
  stand_run: 6,
  attack: 4,
  roll: 5,
}

export interface AnimationImageCell {
  cellIndex: number
  row: number
  col: number
  direction: Direction | null // null if a row falls outside DIRECTION_ORDER
  frameIndex: number | null // 0-based within the direction's row
}

export function buildAnimationImageLayout(cols: number): AnimationImageCell[] {
  const cells: AnimationImageCell[] = []
  for (let row = 0; row < ANIM_IMG_GRID_ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const cellIndex = row * cols + col
      const direction = DIRECTION_ORDER[row] ?? null
      cells.push({
        cellIndex,
        row,
        col,
        direction,
        frameIndex: direction ? col : null,
      })
    }
  }
  return cells
}

export function animationImageCellsForDirection(cols: number, direction: Direction): AnimationImageCell[] {
  return buildAnimationImageLayout(cols).filter((c) => c.direction === direction)
}

export const ANIMATION_VIDEO_SECONDS = 8

/** Returns the {row, col} (0-based) of the 2x2 grid cell reserved for `direction`. */
export function directionCell(direction: Direction): { row: number; col: number } {
  const index = DIRECTION_ORDER.indexOf(direction)
  return { row: index < 2 ? 0 : 1, col: index % 2 === 0 ? 0 : 1 }
}

/**
 * Matches buildAnimationPrompt's segment structure: the first 15% of the
 * clip is a still idle pose, the remaining 85% is the repeating action.
 * Only stand_run reserves its first frame for that idle pose (frame 0 =
 * stand, frames 1-5 = run); other states just spread every frame across the
 * action portion, since they have no idle-first concept.
 */
export function defaultFrameFractions(state: StateGroup, frameCount: number): number[] {
  const idleFrac = 0.15
  if (state === 'stand_run' && frameCount > 1) {
    const runFrames = frameCount - 1
    return [
      idleFrac / 2,
      ...Array.from({ length: runFrames }, (_, i) => idleFrac + (1 - idleFrac) * (i / (runFrames - 1 || 1))),
    ]
  }
  return Array.from(
    { length: frameCount },
    (_, i) => idleFrac + (1 - idleFrac) * (i / (frameCount - 1 || 1)),
  )
}

// --- Animation video v2 ---
// One video = one right-facing character, centered, no camera move. Frame
// count is chosen by hand while scrubbing, so this is a recommendation shown
// in the UI, not a limit.
export const VIDEO_V2_DEFAULT_FRAME_DURATION_SECONDS = 0.1

export function recommendedFrameCount(state: StateGroup): number {
  return ANIM_IMG_SLOT_COUNT[state]
}
