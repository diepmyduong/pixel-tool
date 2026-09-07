export type View =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'three_quarter_left'
  | 'three_quarter_right'

export const VIEW_ORDER: View[] = [
  'front',
  'back',
  'left',
  'right',
  'three_quarter_left',
  'three_quarter_right',
]

export function primaryViewBlob(viewBlobs: Record<View, Blob>): Blob | undefined {
  return viewBlobs.front ?? VIEW_ORDER.map((view) => viewBlobs[view]).find(Boolean)
}

export type StateGroup = 'stand_run' | 'attack' | 'roll'
export type Direction = 'right' | 'up' | 'left' | 'down'

/** The 8 movement-facing directions used by the Characters-2 sheet (4 cardinal + 4 diagonal). */
export type Direction8 =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up_left'
  | 'up_right'
  | 'down_left'
  | 'down_right'

export const DIRECTION8_ORDER: Direction8[] = [
  'up',
  'down',
  'left',
  'right',
  'up_left',
  'up_right',
  'down_left',
  'down_right',
]

export interface Character {
  id: string
  name: string
  description: string
  styleTemplate: string
  prompt: string
  viewBlobs: Record<View, Blob>
  createdAt: number
}

/**
 * "Characters-2" flow: instead of static front/back/3-quarter turnaround
 * views, each direction is captured twice — once standing (idle), once mid-run
 * — for a single character version (2 columns x 8 direction rows).
 */
export interface Character2 {
  id: string
  name: string
  description: string
  styleTemplate: string
  prompt: string
  standBlobs: Record<Direction8, Blob>
  runBlobs: Record<Direction8, Blob>
  createdAt: number
}

/**
 * Every raw image returned by the generation API, saved immediately on
 * generation success — before the user has picked a version/variant from
 * it — so a generation is never lost or re-paid-for just because the user
 * navigated away or the browser closed before finishing selection.
 */
export interface RawGeneration {
  id: string
  kind: 'character' | 'character2' | 'item' | 'animation'
  prompt: string
  imageBlob: Blob
  createdAt: number
}

export interface Item {
  id: string
  name: string
  blob: Blob
  prompt: string
  createdAt: number
}

/**
 * Every raw video returned by the video-generation API, saved immediately
 * on generation success — before the user has picked a direction or cut
 * any frames — so an expensive video generation is never lost or re-paid-for.
 */
export interface RawVideoGeneration {
  id: string
  prompt: string
  videoBlob: Blob
  createdAt: number
  /**
   * Which video flow produced this clip. Absent on rows written before the v2
   * flow existed — those are all 2x2 grid videos, so `undefined` reads as
   * 'grid_2x2'. Used to filter each flow's history picker to its own videos.
   */
  kind?: 'grid_2x2' | 'single'
}

export interface Animation {
  id: string
  characterId: string
  itemIds: string[]
  state: StateGroup
  direction: Direction
  groupName?: string
  frameBlobs: Blob[]
  audioBlob: Blob
  rawVideoBlob: Blob
  frameTimestamps: number[]
  createdAt: number
}

/**
 * A direction's 6-frame animation cut from a generated image sheet (the
 * "Animation by Image" flow) — no audio/video, since it's sliced from a
 * still 9:16 grid the same way Character/Item sheets are.
 */
export interface ImageAnimation {
  id: string
  characterId: string
  itemIds: string[]
  state: StateGroup
  direction: Direction
  groupName?: string
  frameBlobs: Blob[]
  createdAt: number
}

/**
 * One right-facing animation cut by hand from a single-character generated
 * video (the "Animation Video v2" flow). No direction field — this flow only
 * ever produces right-facing frames; left is obtained by flipping horizontally
 * at render time (Godot `flip_h`), so a mirrored copy is never stored. No
 * audio: the v2 prompt explicitly forbids music, and the flow has no audio step.
 */
export interface VideoAnimation {
  id: string
  characterId: string | null
  itemIds: string[]
  state: StateGroup
  groupName?: string
  actionDescription: string
  frameBlobs: Blob[]
  frameTimestamps: number[]
  frameDurationSeconds: number
  loop: boolean
  rawVideoBlob: Blob
  createdAt: number
  sheetMargin?: number
  frameOffsets?: { x: number; y: number }[]
}

/**
 * The user-approved first/last pose for one character+item+state action,
 * always drawn facing "right" — the reference pair fed into the full
 * 4-direction sheet generation (ImageAnimation) so the AI has a concrete
 * start/end pose to interpolate between instead of guessing from text alone.
 */
export interface AnimationFramePair {
  id: string
  characterId: string
  itemIds: string[]
  state: StateGroup
  actionDescription: string
  frameStartBlob: Blob
  frameEndBlob: Blob
  createdAt: number
}
