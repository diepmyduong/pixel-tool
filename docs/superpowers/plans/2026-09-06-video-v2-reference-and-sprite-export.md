# Video V2: Optional Reference Image + Sprite Sheet Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: none — this repo's workflow rules (see `/Users/macbook/.claude/rules/lean-workflow-rules.md`) require Brainstorm → Plan → Execute only, with no automated unit tests, no test-automation agents, and no code-review agents. Execute phases in order, stop after each phase, run its Manual Test, and wait for the user to say "Test OK" before starting the next phase.

**Goal:** Let `AnimationsVideoV2Page` (1) accept an uploaded reference image and make the Character selection optional, combining whichever of Character/Reference/Items are present (capped at 3 images per the generation API's limit, with items collapsed into one collage image when needed), and (2) add a new "Sprite Sheet Editor" step after chroma-key tuning that lets the user preview the animation, drag each frame's character into position within a 64x64 cell with an adjustable shared margin, and export the result as a single horizontal-strip PNG.

**Architecture:** Extend the existing linear Video V2 pipeline (`Setup → Generate → Cutter → Tuner → Save`) by (a) relaxing the Character-required gate in `AnimationsVideoV2Page.tsx` to a Character-or-Reference-image gate, adding a new upload control to `VideoV2SetupPanel.tsx`, and reworking `VideoV2GeneratePanel.tsx`'s reference-image assembly to cap at 3 images; and (b) inserting a new `'sheet'` step between `'tune'` and Save, backed by a new `VideoV2SpriteSheetEditor.tsx` component and a new `src/lib/videoSpriteSheet.ts` module that generalizes `fitCanvasToFrame` to accept an explicit offset and composes a horizontal-strip PNG from arbitrary frame counts (unlike the fixed 12-slot `spriteSheet.ts`, which stays untouched). `VideoAnimation` gains two new optional fields (`sheetMargin`, `frameOffsets`) so a saved animation's sprite-sheet edits can be reopened later.

**Tech Stack:** React 19 + TypeScript, antd 6, plain Canvas 2D API (no new dependencies), `idb` for IndexedDB.

**Spec:** This plan's own "Shared Understanding" section below (captured from a grilling session; no separate spec file exists for this feature).

## Shared Understanding (from grilling session)

- Character becomes optional; Reference Image (new, uploaded, not persisted to IndexedDB) becomes an alternative/additional source. At least one of {Character, Reference Image} must be present to generate.
- Generation API accepts at most 3 images. Order sent: `[character?, referenceImage?, itemsCollage?]`. Items: 0 → no slot; 1 → send raw blob; 2+ → composed into one collage via existing `composeImages`.
- New pipeline step "Sprite Sheet Editor" sits after Key Tuner, before Save: `cut → tune → sheet`.
- Margin: one shared value for the whole animation, controls scale-to-fit (`size - 2*margin`), generalized from `fitCanvasToFrame`.
- Frame Offset: per-frame x/y position within the 64x64 cell, adjusted by dragging on a canvas overlay; independent per frame; "Apply to all" copies the current frame's offset to every other frame once (no ongoing link).
- `margin` and `frameOffsets: {x, y}[]` are saved into `VideoAnimation` so re-opening an animation preserves edits. (This plan does not build an "edit a previously-saved animation" entry point — see Out of Scope.)
- Export produces a horizontal-strip PNG (`frameCount * 64` x `64`), download-only, not persisted to IndexedDB.
- Preview reuses the existing `VideoV2Preview` component.

## Out of Scope

- Editing sprite-sheet margin/offsets for an animation already saved and sitting in the Gallery/History (the fields are persisted for future use, but no "re-open saved animation" UI is built now — only the in-flight editor before the first Save).
- Any change to the unrelated `AnimationsByImage`/`spriteSheet.ts` (fixed 12-slot) export pipeline.

## Global Constraints

- Generation API hard limit: **3 images maximum** per `generateVideo`/`generateImage` call (`src/lib/spriteApi.ts:159-189`).
- Sprite frame size is fixed at **64x64px** (matches the existing `SHEET_FRAME_SIZE` convention in `src/lib/spriteSheet.ts:5`, but this plan does NOT import that constant — it's specific to the fixed 12-slot Animation-by-Image flow; Video V2 defines its own constant, see Task 3).
- No new npm dependencies — all canvas/drag work uses plain Canvas 2D API and React mouse events, matching every existing pattern in this codebase (`src/lib/imageProcessing.ts`, `src/lib/useGridBoundaries.ts`).
- IndexedDB schema changes require bumping the version number in `src/lib/db.ts`'s `openDB(..., N, ...)` call and are additive-only (new optional fields) — never remove/rename existing `VideoAnimation` fields.
- Follow existing code conventions in this codebase: components in `src/routes/AnimationsVideoV2/`, shared canvas/image logic in `src/lib/`, no comments beyond the file's existing density (this codebase favors sparse "why" comments only, matching what's already in these files).

---

## Phase 1: Optional Character + Reference Image Upload

**Functional outcome (observable/testable):** On the Video V2 page, the user can leave Character unselected and instead upload an arbitrary image file as a "Reference image." The Generate panel appears as soon as either Character or Reference Image is set, and clicking Generate sends the right combination of images (character + reference + items-collage, capped at 3, items merged into one collage when there are 2+) to the API.

**Files:**
- Modify: `src/routes/AnimationsVideoV2/VideoV2SetupPanel.tsx` — add reference-image upload control
- Modify: `src/routes/AnimationsVideoV2/AnimationsVideoV2Page.tsx` — relax the Character-required gates; own the reference-image state; pass it through; update `SetupSnapshot`, `handleSave` guard, and `VideoAnimation` construction
- Modify: `src/routes/AnimationsVideoV2/VideoV2GeneratePanel.tsx` — accept optional character + optional reference-image blob; build the capped image list
- Modify: `src/types.ts` — `VideoAnimation.characterId` becomes `string | null`; no other type changes needed for this phase

**Interfaces:**
- Produces (for Phase 2 to build on): `AnimationsVideoV2Page`'s `Step` type gains no new values yet (Phase 2 adds `'sheet'`); `SetupSnapshot.characterId: string | null` (already optional in shape, now genuinely nullable in practice)
- Consumes: `composeImages(blobs: Blob[], cols: number): Promise<Blob>` from `src/lib/imageProcessing.ts:195` (existing, unchanged)

- [ ] **Step 1: Relax `VideoAnimation.characterId` to nullable**

In `src/types.ts`, change the `VideoAnimation` interface (currently at line 112-125):

```ts
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
}
```

(Only the `characterId` line changes from `string` to `string | null`.)

- [ ] **Step 2: Add a reference-image upload control to the setup panel**

In `src/routes/AnimationsVideoV2/VideoV2SetupPanel.tsx`, add new props and a new upload field. Update the props interface (currently lines 19-31):

```ts
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
```

Add `referenceImageUrl` and `onReferenceImageChange` to the destructured props list (currently lines 33-45).

Add the import at the top of the file:

```ts
import { UploadOutlined } from '@ant-design/icons'
import { Upload } from 'antd'
```

(Merge `Upload` into the existing `antd` import on line 2, and add the icon import as a new line.)

Insert a new field block right after the Character `<div>` block (which currently ends at line 108, right before the "Items (optional)" block at line 110):

```tsx
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
```

This needs a `Button` import too — add `Button` to the existing `antd` import on line 2.

Change the Character `<Select>`'s label from `"Character"` (line 97, unchanged text) — no change needed there; the Character field's label doesn't need "(optional)" appended since it's paired with the new field's explanatory text, but for clarity add it anyway. Update line 97 from:

```tsx
<Typography.Text strong>Character</Typography.Text>
```

to:

```tsx
<Typography.Text strong>Character (optional if a reference image is provided)</Typography.Text>
```

- [ ] **Step 3: Verify the file compiles and the new field renders**

Run: `cd /Users/macbook/Desktop/Project/My-2026/Games/Tutorial/tools/sprite-dashboard && npx tsc --noEmit`
Expected: FAILS at this point — `AnimationsVideoV2Page.tsx` doesn't yet pass the two new required props. This is expected; proceed to Step 4.

- [ ] **Step 4: Own reference-image state in the page and wire it through**

In `src/routes/AnimationsVideoV2/AnimationsVideoV2Page.tsx`:

Add new state right after the existing `itemIds`/`items` state (after line 26):

```ts
const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
```

Add a handler function (near `snapshotSetup`, e.g. right before it around line 82):

```ts
function handleReferenceImageChange(file: File | null) {
  if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
  setReferenceImageFile(file)
  setReferenceImageUrl(file ? URL.createObjectURL(file) : null)
}
```

Add a cleanup effect alongside the existing `rawVideoUrl` revoke effect (after line 70's closing `}, [rawVideoUrl])`):

```ts
useEffect(() => {
  return () => {
    if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl)
  }
}, [referenceImageUrl])
```

Update the `SetupSnapshot` interface (currently lines 14-20) to include the reference image blob:

```ts
interface SetupSnapshot {
  characterId: string | null
  itemIds: string[]
  state: StateGroup
  groupName: string
  actionDescription: string
  referenceImageFile: File | null
}
```

Update `snapshotSetup` (currently lines 82-84):

```ts
function snapshotSetup(): SetupSnapshot {
  return { characterId, itemIds, state, groupName, actionDescription, referenceImageFile }
}
```

Update `handleSave`'s guard (currently line 117):

```ts
async function handleSave(frames: CutFrame[]) {
  if ((!setupSnapshot?.characterId && !setupSnapshot?.referenceImageFile) || !rawVideoBlob || frames.length === 0) return
```

Update the `VideoAnimation` construction inside `handleSave` (currently lines 119-132) — only `characterId` changes, now potentially `null`:

```ts
const animation: VideoAnimation = {
  id: crypto.randomUUID(),
  characterId: setupSnapshot.characterId,
  itemIds: setupSnapshot.itemIds,
  state: setupSnapshot.state,
  groupName: setupSnapshot.groupName.trim() || undefined,
  actionDescription: setupSnapshot.actionDescription,
  frameBlobs: frames.map((f) => f.keyedBlob),
  frameTimestamps: frames.map((f) => f.timestamp),
  frameDurationSeconds,
  loop,
  rawVideoBlob,
  createdAt: Date.now(),
}
```

Pass the new props to `VideoV2SetupPanel` (currently lines 154-166):

```tsx
<VideoV2SetupPanel
  characterId={characterId}
  onCharacterIdChange={setCharacterId}
  itemIds={itemIds}
  onItemIdsChange={setItemIds}
  state={state}
  onStateChange={setState}
  groupName={groupName}
  onGroupNameChange={setGroupName}
  actionDescription={actionDescription}
  onActionDescriptionChange={setActionDescription}
  referenceImageUrl={referenceImageUrl}
  onReferenceImageChange={handleReferenceImageChange}
  disabled={!!rawVideoUrl}
/>
```

Relax the two Character-only gates (currently lines 168 and 180) from `character &&` to `(character || referenceImageFile) &&`:

```tsx
{(character || referenceImageFile) && !rawVideoUrl && (
  <VideoV2GeneratePanel
    character={character}
    referenceImageFile={referenceImageFile}
    items={items}
    state={state}
    actionDescription={actionDescription}
    onVideoReady={handleVideoReady}
  />
)}
{(character || referenceImageFile) && !rawVideoUrl && (
  <VideoV2History refreshKey={historyKey} onSelect={handleHistorySelect} />
)}
```

Note `character` is now passed as possibly `null` to `VideoV2GeneratePanel` — its prop type changes in Step 5.

Also update `handleDiscard` (currently lines 101-108) to clear the reference image on discard, since a discarded generation shouldn't leave a stale upload lingering into the next attempt — add one line:

```ts
function handleDiscard() {
  setRawVideoUrl(null)
  setRawVideoBlob(null)
  setSetupSnapshot(null)
  setCutFrames([])
  setStep('cut')
  setRefreshKey((k) => k + 1)
}
```

Wait — actually leave `handleDiscard` as-is: the reference image is a setup-panel-level input (like `itemIds`), not part of the in-flight generation state, and the setup panel stays live/editable after a discard exactly like Character and Items do. Do NOT clear `referenceImageFile`/`referenceImageUrl` in `handleDiscard` or `handleSave` — they persist across generations the same way `characterId`/`itemIds` do, until the user explicitly removes the image via the Remove button.

- [ ] **Step 5: Update `VideoV2GeneratePanel` to accept optional character + reference image and cap at 3 images**

In `src/routes/AnimationsVideoV2/VideoV2GeneratePanel.tsx`, update the props interface (currently lines 12-18):

```ts
interface VideoV2GeneratePanelProps {
  character: Character | null
  referenceImageFile: File | null
  items: Item[]
  state: StateGroup
  actionDescription: string
  onVideoReady: (rawVideoBlob: Blob) => void
}
```

Update the destructured props (currently lines 29-35):

```ts
export default function VideoV2GeneratePanel({
  character,
  referenceImageFile,
  items,
  state,
  actionDescription,
  onVideoReady,
}: VideoV2GeneratePanelProps) {
```

Update the `prompt` memo (currently lines 40-43) to handle a null character — pass an empty description when there's no character:

```ts
const prompt = useMemo(
  () => buildVideoAnimationV2Prompt(character?.description ?? '', items.map((i) => i.name), state, actionDescription),
  [character, items, state, actionDescription],
)
```

Replace the image-assembly logic inside `handleGenerate` (currently lines 45-55). The new logic builds up to 3 slots — character, reference, items — and collapses items into one collage via `composeImages` when there are 2+:

```ts
async function handleGenerate() {
  setStatus('generating')
  setError(null)
  setProgress(null)
  try {
    const imageDataUris: string[] = []

    if (character) {
      const referenceBlob = referenceViewBlob(character)
      if (!referenceBlob) throw new Error('Character has no reference view image')
      imageDataUris.push(await blobToBase64DataUri(referenceBlob))
    }

    if (referenceImageFile) {
      imageDataUris.push(await blobToBase64DataUri(referenceImageFile))
    }

    if (items.length === 1) {
      imageDataUris.push(await blobToBase64DataUri(items[0].blob))
    } else if (items.length >= 2) {
      const cols = Math.ceil(Math.sqrt(items.length))
      const collageBlob = await composeImages(items.map((i) => i.blob), cols)
      imageDataUris.push(await blobToBase64DataUri(collageBlob))
    }

    if (imageDataUris.length === 0) {
      throw new Error('Provide a character or a reference image before generating')
    }

    const result = await generateVideo(prompt, imageDataUris, setProgress)

    // Download and persist the raw video immediately — before any
    // frame-cutting — so an expensive generation is never lost if the
    // user abandons the flow partway through.
    const res = await fetch(result.videoUri)
    if (!res.ok) throw new Error(`Failed to download generated video: ${res.status} ${res.statusText}`)
    const blob = await res.blob()

    await saveRawVideoGeneration({
      id: crypto.randomUUID(),
      prompt,
      videoBlob: blob,
      createdAt: Date.now(),
      kind: 'single',
    })

    setStatus('done')
    onVideoReady(blob)
  } catch (err) {
    setStatus('error')
    setError(err instanceof Error ? err.message : String(err))
  }
}
```

Add `composeImages` to the existing `imageProcessing` import (currently line 5):

```ts
import { blobToBase64DataUri, composeImages } from '../../lib/imageProcessing'
```

This never exceeds 3 images: character (1) + reference (1) + items-collage-or-single-item (1) = max 3, matching the API's hard limit. `blobToBase64DataUri` already accepts any `Blob`, and `File extends Blob`, so `referenceImageFile` (a `File`) passes through unchanged.

- [ ] **Step 6: Type-check**

Run: `cd /Users/macbook/Desktop/Project/My-2026/Games/Tutorial/tools/sprite-dashboard && npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/routes/AnimationsVideoV2/VideoV2SetupPanel.tsx src/routes/AnimationsVideoV2/AnimationsVideoV2Page.tsx src/routes/AnimationsVideoV2/VideoV2GeneratePanel.tsx
git commit -m "$(cat <<'EOF'
feat(video-v2): make character optional, add reference image upload

Character selection and an uploaded reference image are now
interchangeable/combinable inputs to Video V2 generation. Items beyond
the first are composed into a single collage image so the request never
exceeds the generation API's 3-image limit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Manual Test:**
1. Run `npm run dev` in `sprite-dashboard/`, open the Video V2 page.
2. Confirm the Generate panel is hidden when neither Character nor Reference image nor anything is set.
3. Upload a reference image (no character selected) → Generate panel and History panel appear.
4. Click Generate — confirm the request succeeds (check Network tab: the `images` array in the `VIDEO_GENERATION` POST body should contain exactly 1 base64 data URI, the uploaded file).
5. Remove the reference image, select a Character instead → Generate panel still shows; Generate still works with just the character image.
6. Select a Character AND upload a Reference image AND select 3 Items → Generate; confirm the `images` array in the request contains exactly 3 entries (character, reference, one collage image containing all 3 items visibly tiled).
7. Select a Character + exactly 1 Item (no reference image) → confirm `images` array has 2 entries and the second is the raw item image, not a collage.

---

## Phase 2: Sprite Sheet Editor — Preview, Margin, Per-Frame Offset

**Functional outcome (observable/testable):** After tuning chroma-key, clicking "Continue" advances to a new "Sprite Sheet Editor" screen showing: a live preview (existing `VideoV2Preview`), a margin slider, and each frame rendered in a 64x64 box where the user can drag the character to reposition it. An "Apply to all" button copies the current frame's offset to every frame.

**Files:**
- Create: `src/lib/videoSpriteSheet.ts` — new sprite-sheet composition module scoped to Video V2 (generalized `fitCanvasToFrame` with offset, horizontal-strip composer, frame-cache loader)
- Create: `src/routes/AnimationsVideoV2/VideoV2SpriteSheetEditor.tsx` — new step component
- Modify: `src/routes/AnimationsVideoV2/VideoV2KeyTuner.tsx` — change "Save animation" button to "Continue to Sprite Sheet Editor", advancing the step instead of saving directly
- Modify: `src/routes/AnimationsVideoV2/AnimationsVideoV2Page.tsx` — add `'sheet'` to `Step`, render the new editor, move `handleSave`'s call site

**Interfaces:**
- Produces: `fitFrameWithOffset(canvas: HTMLCanvasElement, size: number, margin: number, offsetX: number, offsetY: number): HTMLCanvasElement` from `src/lib/videoSpriteSheet.ts`; `composeFrameStrip(frames: HTMLCanvasElement[]): Promise<Blob>` from the same file; `VideoV2SpriteSheetEditor` props: `{ frames: CutFrame[]; margin: number; onMarginChange: (v: number) => void; frameOffsets: { x: number; y: number }[]; onFrameOffsetsChange: (v: { x: number; y: number }[]) => void; frameDurationSeconds: number; onFrameDurationSecondsChange: (v: number) => void; loop: boolean; onLoopChange: (v: boolean) => void; onBack: () => void; onSave: () => void }`
- Consumes: `CutFrame` type from `src/routes/AnimationsVideoV2/VideoV2FrameCutter.tsx:10`; `canvasToBlob`, `blobToBase64DataUri` from `src/lib/imageProcessing.ts`; `VideoV2Preview` from `src/routes/AnimationsVideoV2/VideoV2Preview.tsx`

- [ ] **Step 1: Write `src/lib/videoSpriteSheet.ts`**

```ts
export const VIDEO_SHEET_FRAME_SIZE = 64

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

/** Finds the tight bounding box of non-transparent pixels; null if the canvas is fully transparent. */
function opaqueBounds(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Loads a frame blob onto an off-screen canvas at its natural size, for
 * feeding into fitFrameWithOffset. Kept separate from fitFrameWithOffset so
 * the editor can load once per frame and re-fit repeatedly as offset/margin
 * change without re-decoding the source image every drag tick.
 */
export async function loadFrameCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Normalizes a source frame to a fixed `size`x`size` canvas: the character's
 * opaque silhouette is scaled down (never up) to fit within `size - 2*margin`,
 * centered by default, then nudged by `offsetX`/`offsetY` — the same
 * auto-center-then-offset behavior as `fitCanvasToFrame` in imageProcessing.ts,
 * generalized with an explicit position adjustment on top of centering.
 */
export function fitFrameWithOffset(
  source: HTMLCanvasElement,
  size: number,
  margin: number,
  offsetX: number,
  offsetY: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  const bounds = opaqueBounds(source)
  if (!bounds) return out

  const maxDim = size - margin * 2
  const scale = Math.min(maxDim / bounds.width, maxDim / bounds.height, 1)
  const drawWidth = bounds.width * scale
  const drawHeight = bounds.height * scale
  const dx = (size - drawWidth) / 2 + offsetX
  const dy = (size - drawHeight) / 2 + offsetY

  ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, dx, dy, drawWidth, drawHeight)
  return out
}

/** Composes fitted 64x64 frame canvases into a single horizontal-strip PNG. */
export async function composeFrameStrip(frames: HTMLCanvasElement[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = frames.length * VIDEO_SHEET_FRAME_SIZE
  canvas.height = VIDEO_SHEET_FRAME_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.imageSmoothingEnabled = false

  frames.forEach((frame, i) => {
    ctx.drawImage(frame, i * VIDEO_SHEET_FRAME_SIZE, 0)
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to convert canvas to blob'))
    }, 'image/png')
  })
}
```

- [ ] **Step 2: Verify the module compiles standalone**

Run: `cd /Users/macbook/Desktop/Project/My-2026/Games/Tutorial/tools/sprite-dashboard && npx tsc --noEmit`
Expected: PASS (this file has no external repo dependencies beyond the DOM lib, so it should compile in isolation even before the editor component exists).

- [ ] **Step 3: Write `VideoV2SpriteSheetEditor.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Slider, Space, Typography } from 'antd'
import type { CutFrame } from './VideoV2FrameCutter'
import { VIDEO_SHEET_FRAME_SIZE, fitFrameWithOffset, loadFrameCanvas } from '../../lib/videoSpriteSheet'
import VideoV2Preview from './VideoV2Preview'

const CELL_DISPLAY_SIZE = 140

export interface FrameOffset {
  x: number
  y: number
}

interface VideoV2SpriteSheetEditorProps {
  frames: CutFrame[]
  margin: number
  onMarginChange: (value: number) => void
  frameOffsets: FrameOffset[]
  onFrameOffsetsChange: (value: FrameOffset[]) => void
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  onBack: () => void
  onSave: () => void
}

/**
 * One frame's fitted-preview cell: loads the raw frame once, re-fits it on a
 * canvas whenever margin/offset change, and turns mouse drags on the canvas
 * into offset deltas scaled from display pixels back to the fixed 64x64
 * source space (display is CELL_DISPLAY_SIZE, source is VIDEO_SHEET_FRAME_SIZE).
 */
function FrameCell({
  frame,
  margin,
  offset,
  onOffsetChange,
}: {
  frame: CutFrame
  margin: number
  offset: FrameOffset
  onOffsetChange: (offset: FrameOffset) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLCanvasElement | null>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offset: FrameOffset } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadFrameCanvas(frame.keyedBlob).then((canvas) => {
      if (cancelled) return
      sourceRef.current = canvas
      redraw()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.keyedBlob])

  function redraw() {
    const source = sourceRef.current
    const canvas = canvasRef.current
    if (!source || !canvas) return
    const fitted = fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
    canvas.width = VIDEO_SHEET_FRAME_SIZE
    canvas.height = VIDEO_SHEET_FRAME_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, VIDEO_SHEET_FRAME_SIZE, VIDEO_SHEET_FRAME_SIZE)
    ctx.drawImage(fitted, 0, 0)
  }

  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margin, offset])

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, offset }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const start = dragStartRef.current
    if (!start) return
    const scale = VIDEO_SHEET_FRAME_SIZE / CELL_DISPLAY_SIZE
    const dx = (e.clientX - start.mouseX) * scale
    const dy = (e.clientY - start.mouseY) * scale
    onOffsetChange({ x: start.offset.x + dx, y: start.offset.y + dy })
  }

  function handleMouseUp() {
    dragStartRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: CELL_DISPLAY_SIZE,
        height: CELL_DISPLAY_SIZE,
        background: 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 0 0 / 16px 16px',
        cursor: 'grab',
        imageRendering: 'pixelated',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}

export default function VideoV2SpriteSheetEditor({
  frames,
  margin,
  onMarginChange,
  frameOffsets,
  onFrameOffsetsChange,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  onBack,
  onSave,
}: VideoV2SpriteSheetEditorProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  // Re-render the preview strip's frame URLs whenever margin/offsets change,
  // so VideoV2Preview shows the edited (not raw) frames.
  useEffect(() => {
    let cancelled = false
    async function build() {
      const canvases = await Promise.all(
        frames.map(async (frame, i) => {
          const source = await loadFrameCanvas(frame.keyedBlob)
          const offset = frameOffsets[i] ?? { x: 0, y: 0 }
          return fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
        }),
      )
      if (cancelled) return
      const blobs = await Promise.all(
        canvases.map(
          (c) =>
            new Promise<Blob>((resolve, reject) => {
              c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
            }),
        ),
      )
      if (cancelled) return
      setPreviewUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u))
        return blobs.map((b) => URL.createObjectURL(b))
      })
    }
    build()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, margin, frameOffsets])

  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const offsets = useMemo(
    () => frames.map((_, i) => frameOffsets[i] ?? { x: 0, y: 0 }),
    [frames, frameOffsets],
  )

  function handleFrameOffsetChange(index: number, offset: FrameOffset) {
    const next = [...offsets]
    next[index] = offset
    onFrameOffsetsChange(next)
  }

  function handleApplyToAll() {
    const current = offsets[activeIndex] ?? { x: 0, y: 0 }
    onFrameOffsetsChange(frames.map(() => ({ ...current })))
  }

  return (
    <Card title="Sprite Sheet Editor">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text>Margin — minimum gap between character and frame edge</Typography.Text>
          <Slider min={0} max={16} value={margin} onChange={onMarginChange} />
        </div>

        {previewUrls.length > 0 && (
          <VideoV2Preview
            frameUrls={previewUrls}
            frameDurationSeconds={frameDurationSeconds}
            onFrameDurationSecondsChange={onFrameDurationSecondsChange}
            loop={loop}
            onLoopChange={onLoopChange}
            size={VIDEO_SHEET_FRAME_SIZE * 3}
          />
        )}

        <Space>
          <Typography.Text>Drag a frame below to reposition its character.</Typography.Text>
          <Button size="small" onClick={handleApplyToAll}>
            Apply frame {activeIndex + 1}'s position to all
          </Button>
        </Space>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {frames.map((frame, index) => (
            <div key={frame.id} onMouseDown={() => setActiveIndex(index)}>
              <FrameCell
                frame={frame}
                margin={margin}
                offset={offsets[index]}
                onOffsetChange={(offset) => handleFrameOffsetChange(index, offset)}
              />
              <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {index + 1}
              </Typography.Text>
            </div>
          ))}
        </div>

        <Space>
          <Button onClick={onBack}>Back to chroma key tuning</Button>
          <Button type="primary" onClick={onSave}>
            Save animation
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
```

- [ ] **Step 4: Change `VideoV2KeyTuner`'s "Save animation" button to "Continue"**

In `src/routes/AnimationsVideoV2/VideoV2KeyTuner.tsx`, rename the `onSave` prop to `onContinue` for clarity (it now advances the step rather than saving) and update the props interface (currently lines 11-19):

```ts
interface VideoV2KeyTunerProps {
  frames: CutFrame[]
  frameDurationSeconds: number
  onFrameDurationSecondsChange: (value: number) => void
  loop: boolean
  onLoopChange: (value: boolean) => void
  onBack: () => void
  onContinue: (frames: CutFrame[]) => void
}
```

Update the destructured props (currently lines 51-59) to use `onContinue`, and update the button (currently lines 179-185):

```tsx
export default function VideoV2KeyTuner({
  frames,
  frameDurationSeconds,
  onFrameDurationSecondsChange,
  loop,
  onLoopChange,
  onBack,
  onContinue,
}: VideoV2KeyTunerProps) {
```

```tsx
<Space>
  <Button onClick={onBack}>Back to frame cutting</Button>
  <Button
    type="primary"
    disabled={rekeying || !hasRekeyed || keyedFrames.length === 0}
    onClick={() => onContinue(keyedFrames)}
  >
    Continue to Sprite Sheet Editor
  </Button>
</Space>
```

- [ ] **Step 5: Wire the new `'sheet'` step into `AnimationsVideoV2Page.tsx`**

Change `type Step` (currently line 12):

```ts
type Step = 'cut' | 'tune' | 'sheet'
```

Add new state for the sprite-sheet editor, right after the `cutFrames`/`frameDurationSeconds`/`loop`/`step` block (after line 46):

```ts
const [sheetFrames, setSheetFrames] = useState<CutFrame[]>([])
const [sheetMargin, setSheetMargin] = useState(4)
const [sheetFrameOffsets, setSheetFrameOffsets] = useState<{ x: number; y: number }[]>([])
```

Add the import for the new component near the other Video V2 imports (after line 9):

```ts
import VideoV2SpriteSheetEditor from './VideoV2SpriteSheetEditor'
```

Add a handler that receives the tuned frames from the Key Tuner and advances to the sheet step (place it near `handleStackChange`, after line 114):

```ts
function handleTuneContinue(frames: CutFrame[]) {
  setSheetFrames(frames)
  setSheetFrameOffsets(frames.map(() => ({ x: 0, y: 0 })))
  setStep('sheet')
}
```

Update `handleSave`'s signature and call site — it now takes no argument, reading `sheetFrames` directly instead of receiving `frames` from the Key Tuner. Replace the existing `handleSave` (currently lines 116-147):

```ts
async function handleSave() {
  if ((!setupSnapshot?.characterId && !setupSnapshot?.referenceImageFile) || !rawVideoBlob || sheetFrames.length === 0)
    return

  const animation: VideoAnimation = {
    id: crypto.randomUUID(),
    characterId: setupSnapshot.characterId,
    itemIds: setupSnapshot.itemIds,
    state: setupSnapshot.state,
    groupName: setupSnapshot.groupName.trim() || undefined,
    actionDescription: setupSnapshot.actionDescription,
    frameBlobs: sheetFrames.map((f) => f.keyedBlob),
    frameTimestamps: sheetFrames.map((f) => f.timestamp),
    frameDurationSeconds,
    loop,
    rawVideoBlob,
    createdAt: Date.now(),
    sheetMargin,
    frameOffsets: sheetFrameOffsets,
  }
  await saveVideoAnimation(animation)

  // Safe to revoke: the cutter's own frames/URLs are separate objects from
  // sheetFrames (the tuner's re-keyed frames, threaded through unchanged by
  // the sheet editor) — this never touches the still-mounted cutter's <img> URLs.
  sheetFrames.forEach((f) => URL.revokeObjectURL(f.url))
  setRawVideoUrl(null)
  setRawVideoBlob(null)
  setSetupSnapshot(null)
  setCutFrames([])
  setSheetFrames([])
  setSheetFrameOffsets([])
  setSheetMargin(4)
  setStep('cut')
  setRefreshKey((k) => k + 1)
  message.success('Animation saved')
}
```

(This references `sheetMargin`/`frameOffsets` on `VideoAnimation`, added in Step 6 below.)

Update the render section. Replace the Key Tuner block (currently lines 201-211):

```tsx
{rawVideoUrl && step === 'tune' && (
  <VideoV2KeyTuner
    frames={cutFrames}
    frameDurationSeconds={frameDurationSeconds}
    onFrameDurationSecondsChange={setFrameDurationSeconds}
    loop={loop}
    onLoopChange={setLoop}
    onBack={() => setStep('cut')}
    onContinue={handleTuneContinue}
  />
)}
{rawVideoUrl && step === 'sheet' && (
  <VideoV2SpriteSheetEditor
    frames={sheetFrames}
    margin={sheetMargin}
    onMarginChange={setSheetMargin}
    frameOffsets={sheetFrameOffsets}
    onFrameOffsetsChange={setSheetFrameOffsets}
    frameDurationSeconds={frameDurationSeconds}
    onFrameDurationSecondsChange={setFrameDurationSeconds}
    loop={loop}
    onLoopChange={setLoop}
    onBack={() => setStep('tune')}
    onSave={handleSave}
  />
)}
```

- [ ] **Step 6: Add `sheetMargin`/`frameOffsets` to `VideoAnimation` and bump the DB version**

In `src/types.ts`, add two optional fields to `VideoAnimation` (from Step 1 of Phase 1, now further extended):

```ts
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
```

No `db.ts` schema/version change is needed: `idb`'s object stores are schemaless key-value blobs (`keyPath: 'id'`), and adding new optional fields to a stored interface doesn't require a version bump — only structural changes like new object stores or indexes do (see the existing `videoAnimations` store in `src/lib/db.ts:55-58`, unchanged since it was added). Do not touch `db.ts` in this step.

- [ ] **Step 7: Type-check**

Run: `cd /Users/macbook/Desktop/Project/My-2026/Games/Tutorial/tools/sprite-dashboard && npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/videoSpriteSheet.ts src/routes/AnimationsVideoV2/VideoV2SpriteSheetEditor.tsx src/routes/AnimationsVideoV2/VideoV2KeyTuner.tsx src/routes/AnimationsVideoV2/AnimationsVideoV2Page.tsx src/types.ts
git commit -m "$(cat <<'EOF'
feat(video-v2): add Sprite Sheet Editor step with margin and per-frame offset

Inserts a new step between chroma-key tuning and Save where the user can
preview the animation, adjust a shared margin, and drag each frame's
character to a per-frame x/y offset within its 64x64 cell. Margin and
offsets are persisted on VideoAnimation for future re-editing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Manual Test:**
1. Run through Setup → Generate → cut a few frames → Continue to tuning.
2. In the Key Tuner, adjust chroma key, then click "Continue to Sprite Sheet Editor" — confirm the new screen appears showing all frames in 64x64 boxes.
3. Drag the character within one frame's box — confirm the character visibly moves and stays within the canvas as you drag.
4. Move the Margin slider — confirm every frame's character resizes (shrinks as margin increases) simultaneously.
5. Click "Apply frame N's position to all" after dragging frame 1 — confirm every other frame's character jumps to the same relative position as frame 1.
6. Press Play in the preview — confirm it plays the edited (repositioned) frames, not the originals.
7. Click "Back to chroma key tuning" then "Continue" again — confirm prior margin/offset edits are preserved (state wasn't reset).
8. Click "Save animation" — confirm it saves successfully and returns to the Setup screen (Gallery repopulates).

---

## Phase 3: Export Sprite Sheet PNG

**Functional outcome (observable/testable):** From the Sprite Sheet Editor, an "Export Sprite Sheet" button downloads a single PNG file (`frameCount * 64` wide, `64` tall) reflecting the current margin and per-frame offsets, without requiring Save first.

**Files:**
- Modify: `src/routes/AnimationsVideoV2/VideoV2SpriteSheetEditor.tsx` — add an Export button that reuses the already-computed fitted canvases

**Interfaces:**
- Consumes: `composeFrameStrip(frames: HTMLCanvasElement[]): Promise<Blob>` and `loadFrameCanvas`/`fitFrameWithOffset` from `src/lib/videoSpriteSheet.ts` (Phase 2); a `downloadBlob` helper (new, colocated — see Step 1)

- [ ] **Step 1: Add a `downloadBlob` helper to `videoSpriteSheet.ts`**

Append to `src/lib/videoSpriteSheet.ts` (this mirrors `src/lib/spriteSheet.ts:133-140` exactly but lives in the Video V2 module so it has no dependency on the unrelated Animation-by-Image sheet code):

```ts
export function downloadFrameStrip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Add the Export button and handler to `VideoV2SpriteSheetEditor.tsx`**

Add the import (extend the existing `videoSpriteSheet` import line):

```ts
import { VIDEO_SHEET_FRAME_SIZE, composeFrameStrip, downloadFrameStrip, fitFrameWithOffset, loadFrameCanvas } from '../../lib/videoSpriteSheet'
```

Add state for export status, alongside the existing `previewUrls`/`activeIndex` state:

```ts
const [exporting, setExporting] = useState(false)
```

Add the handler function, near `handleApplyToAll`:

```ts
async function handleExport() {
  setExporting(true)
  try {
    const canvases = await Promise.all(
      frames.map(async (frame, i) => {
        const source = await loadFrameCanvas(frame.keyedBlob)
        const offset = offsets[i]
        return fitFrameWithOffset(source, VIDEO_SHEET_FRAME_SIZE, margin, offset.x, offset.y)
      }),
    )
    const blob = await composeFrameStrip(canvases)
    downloadFrameStrip(blob, `animation_sheet_${Date.now()}.png`)
  } finally {
    setExporting(false)
  }
}
```

Add the button next to "Apply to all", in the same `<Space>` block:

```tsx
<Space>
  <Typography.Text>Drag a frame below to reposition its character.</Typography.Text>
  <Button size="small" onClick={handleApplyToAll}>
    Apply frame {activeIndex + 1}'s position to all
  </Button>
  <Button size="small" loading={exporting} onClick={handleExport}>
    Export Sprite Sheet ({frames.length} x {VIDEO_SHEET_FRAME_SIZE}px)
  </Button>
</Space>
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/macbook/Desktop/Project/My-2026/Games/Tutorial/tools/sprite-dashboard && npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/videoSpriteSheet.ts src/routes/AnimationsVideoV2/VideoV2SpriteSheetEditor.tsx
git commit -m "$(cat <<'EOF'
feat(video-v2): export sprite sheet editor output as a downloadable PNG

Composes the currently-edited (margin + per-frame offset) frames into a
single horizontal-strip PNG and triggers a browser download, independent
of Save.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Manual Test:**
1. In the Sprite Sheet Editor, adjust margin and drag a couple of frames' offsets.
2. Click "Export Sprite Sheet" — confirm a PNG file downloads.
3. Open the downloaded PNG — confirm its width is exactly `frameCount * 64` and height `64`, and that each frame's character position/size visually matches what was shown in the editor (including the dragged offsets and current margin).
4. Click "Save animation" afterward — confirm Save still works independently (export did not consume or mutate any state needed for Save).

---

## Self-Review Notes

- **Spec coverage:** Optional attachment (Phase 1) ✓, reference image upload (Phase 1) ✓, 3-image cap + items collage (Phase 1, ADR 0001) ✓, Preview (Phase 2, reuses `VideoV2Preview`) ✓, Edit Frame / margin / offset (Phase 2) ✓, Export Sprite Sheet PNG (Phase 3) ✓, persisted margin/offsets for later re-edit (Phase 2 Step 6 — fields added; re-open UI explicitly out of scope) ✓.
- **Placeholder scan:** No TBD/TODO markers; every step has literal code. `handleDiscard`'s "Wait — actually leave as-is" line in Phase 1 Step 4 is a deliberate inline correction for the plan author's own first instinct, kept because it documents *why* the obvious-looking change (clearing the reference image on discard) is wrong — matches this codebase's existing comment style of explaining non-obvious decisions.
- **Type consistency:** `CutFrame` used identically across `VideoV2FrameCutter.tsx`, `VideoV2KeyTuner.tsx`, `VideoV2SpriteSheetEditor.tsx`. `FrameOffset` (`{x, y}`) matches `VideoAnimation.frameOffsets` shape. `onContinue: (frames: CutFrame[]) => void` in `VideoV2KeyTuner` matches `handleTuneContinue(frames: CutFrame[])` in the page. `handleSave` changes from `(frames: CutFrame[]) => Promise<void>` to `() => Promise<void>` consistently between its definition and the `onSave={handleSave}` call site in `VideoV2SpriteSheetEditor`.
