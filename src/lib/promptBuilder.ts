import type { Direction8, StateGroup } from "../types";
import { DIRECTION8_ORDER } from "../types";
import {
  ANIM_IMG_GRID_COLS_DEFAULT as ANIM_IMG_GRID_COLS,
  ANIM_IMG_GRID_ROWS,
  ANIMATION_VIDEO_SECONDS,
  CHAR2_GRID_COLS,
  CHAR2_GRID_ROWS,
  CHARACTER_LAYOUT,
  CHAR_GRID_COLS,
  CHAR_GRID_ROWS,
  CHAR_VERSIONS,
  DIRECTION_ORDER,
  ITEM_GRID_COLS,
  ITEM_GRID_ROWS,
} from "./grid";

export function buildCharacterPrompt(
  description: string,
  styleTemplate: string,
): string {
  const rows: string[] = [];
  for (let row = 0; row < CHAR_GRID_ROWS; row++) {
    const cellsInRow = CHARACTER_LAYOUT.filter((c) => c.row === row);
    const filled = cellsInRow.filter((c) => c.view !== null);
    if (filled.length === 0) continue;
    const desc = filled
      .map((c) => `col ${c.col + 1}: ${c.view} view (version ${c.version})`)
      .join(", ");
    rows.push(`Row ${row + 1}: ${desc}`);
  }
  return [
    `Character turnaround reference sheet, ${CHAR_GRID_COLS}x${CHAR_GRID_ROWS} grid on pure flat green screen background (solid chroma key green, #00FF00, no gradient, no shadow, no vignette, no texture anywhere on the background), each cell a separate isolated full-body pose, no overlap between cells, consistent character design and outfit across all ${CHAR_VERSIONS} versions (rows are alternate art versions of the SAME character concept, not different characters).`,
    "Cell dividers: 1 solid black pixel line between each cell, not part of the character or background, just a visual guide for the model to keep the grid layout correct.",
    `Each character pose must be centered in its cell with clear even padding (at least 10% of the cell's width and height) between the character's silhouette and the cell edge on all sides — never let hands, feet, hair, weapons, or hat brims touch or cross the cell boundary.`,
    styleTemplate,
    `Character: ${description}`,
    ...rows,
    "Bottom-right 2x3 block (rows 10-11, cols 4-6): leave as plain green screen filler, no character, to reduce watermark risk.",
    "No text, no watermark, no logo anywhere in the image.",
  ].join("\n\n");
}

const DIRECTION8_FACING_HINT: Record<Direction8, string> = {
  up: "facing away from the camera, moving toward the top of the screen (back view)",
  down: "facing the camera, moving toward the bottom of the screen (front view)",
  left: "facing left in profile, moving toward the left of the screen (side view)",
  right: "facing right in profile, moving toward the right of the screen (side view)",
  up_left: "facing up-left at a diagonal (back three-quarter view), moving toward the top-left of the screen",
  up_right: "facing up-right at a diagonal (back three-quarter view), moving toward the top-right of the screen",
  down_left: "facing down-left at a diagonal (front three-quarter view), moving toward the bottom-left of the screen",
  down_right: "facing down-right at a diagonal (front three-quarter view), moving toward the bottom-right of the screen",
};

/**
 * Character-2 sheet: 3 columns (standing / running / attacking) x 8 direction
 * rows, a single character version per image — unlike buildCharacterPrompt's
 * static turnaround views, every cell shows the same 8 movement-facing
 * directions, just in a different pose per column.
 */
export function buildCharacterPrompt2(
  description: string,
  styleTemplate: string,
): string {
  const standRows = DIRECTION8_ORDER.map(
    (direction, i) =>
      `Row ${i + 1}: standing idle pose, ${DIRECTION8_FACING_HINT[direction]}.`,
  );
  const runRows = DIRECTION8_ORDER.map(
    (direction, i) =>
      `Row ${i + 1}: running pose (mid-stride, clearly airborne/pushing-off leg and pumping arms, not just standing), ${DIRECTION8_FACING_HINT[direction]}.`,
  );
  const attackRows = DIRECTION8_ORDER.map(
    (direction, i) =>
      `Row ${i + 1}: melee attack pose (mid-swing at the peak of a strike — weapon or fist extended, clear windup-to-impact body torque, not a neutral stance), ${DIRECTION8_FACING_HINT[direction]}.`,
  );
  return [
    `Character movement-direction reference sheet, ${CHAR2_GRID_COLS}x${CHAR2_GRID_ROWS} grid (3 columns, ${CHAR2_GRID_ROWS} rows) on pure flat green screen background (solid chroma key green, #00FF00, no gradient, no shadow, no vignette, no texture anywhere on the background), each cell a separate isolated full-body pose of the SAME single character version, no overlap between cells.`,
    `Column 1 (left column, all ${CHAR2_GRID_ROWS} cells top to bottom) is the character's STANDING/IDLE pose, one row per movement direction, in this exact row order:`,
    ...standRows,
    `Column 2 (middle column, all ${CHAR2_GRID_ROWS} cells top to bottom) is the character's RUNNING pose, one row per movement direction, in this exact row order — the SAME direction as column 1's row in that same row position:`,
    ...runRows,
    `Column 3 (right column, all ${CHAR2_GRID_ROWS} cells top to bottom) is the character's ATTACKING pose, one row per movement direction, in this exact row order — the SAME direction as columns 1 and 2's row in that same row position:`,
    ...attackRows,
    "Cell dividers: 1 solid black pixel line between each cell, not part of the character or background, just a visual guide for the model to keep the grid layout correct.",
    `Each character pose must be centered in its cell with clear even padding (at least 10% of the cell's width and height) between the character's silhouette and the cell edge on all sides — never let hands, feet, hair, weapons, or hat brims touch or cross the cell boundary.`,
    styleTemplate,
    `Character: ${description}`,
    "No text, no watermark, no logo anywhere in the image.",
  ].join("\n\n");
}

// Kept short and to one clear instruction per direction — an earlier version
// stacked several extra clauses per diagonal (hip angle, leading/trailing
// limb, path-curvature warning), and the model tried to satisfy all of them
// at once by breaking the pose into an odd, twisted stance instead of just
// running at a 45-degree angle. One plain "diagonal, halfway between X and Y"
// instruction reads clearly and keeps the run cycle natural.
const DIRECTION8_MOTION_HINT: Record<Direction8, string> = {
  up: "moving straight toward the top of the screen",
  down: "moving straight toward the bottom of the screen",
  left: "moving straight toward the left of the screen",
  right: "moving straight toward the right of the screen",
  up_right: "running at a 45-degree diagonal, halfway between up and right, toward the upper-right corner of the screen",
  up_left: "running at a 45-degree diagonal, halfway between up and left, toward the upper-left corner of the screen",
  down_right: "running at a 45-degree diagonal, halfway between down and right, toward the lower-right corner of the screen",
  down_left: "running at a 45-degree diagonal, halfway between down and left, toward the lower-left corner of the screen",
};

// Same "one plain instruction" reasoning as DIRECTION8_MOTION_HINT above,
// but phrased for a strike's aim rather than a run's travel path — reusing
// the run hint's wording ("running at a diagonal...") for an attack read as
// nonsense ("aimed toward running at a diagonal").
const DIRECTION8_ATTACK_AIM_HINT: Record<Direction8, string> = {
  up: "straight up, toward the top of the screen",
  down: "straight down, toward the bottom of the screen",
  left: "straight left, toward the left of the screen",
  right: "straight right, toward the right of the screen",
  up_right: "a 45-degree diagonal toward the upper-right corner of the screen",
  up_left: "a 45-degree diagonal toward the upper-left corner of the screen",
  down_right: "a 45-degree diagonal toward the lower-right corner of the screen",
  down_left: "a 45-degree diagonal toward the lower-left corner of the screen",
};

export type Character2Pose = "stand" | "run" | "attack";

/**
 * Video prompt for one Character-2 cell (a pose + direction combination).
 * The provided reference image is that exact cell's still frame — it must
 * be treated as frame 0, not just a loose style reference, since the whole
 * point is animating that specific pose/direction outward from where it
 * already stands in the sheet.
 */
export function buildCharacter2VideoPrompt(
  pose: Character2Pose,
  direction: Direction8,
  description: string,
): string {
  const positionBlock =
    pose === "stand"
      ? `CRITICAL — fixed position, this is an IDLE animation, the character does NOT travel: the character is centered in frame and stays at that exact spot on screen for the entire clip. No walking, no running, no stepping forward or sideways, no drifting, no entrance, no exit. Only a subtle idle motion is allowed — light bobbing/swaying in place, hair and clothing fluttering gently in a breeze, weight shifting slightly — and the character's feet stay planted on the same spot throughout. Frame 0, the middle frame, and the last frame all show the character at the exact same screen position.`
      : pose === "run"
        ? `CRITICAL — this is a RUN-IN-PLACE animation, the character does NOT travel across the frame: even though the action being performed is running (${DIRECTION8_MOTION_HINT[direction]}), the character's body stays centered in frame and anchored to the same spot on screen for the entire clip, exactly like running on a treadmill — legs stride and arms pump as if covering ground, but the character never actually moves toward the edge of the frame, never drifts, and never exits. Frame 0, the middle frame, and the last frame all show the character at the exact same screen position.`
        : `CRITICAL — fixed position, the character does NOT travel: the character is centered in frame and stays at that exact spot on screen for the entire clip. The attack (weapon swing, punch, or lunge) may extend a limb or weapon outward, but the character's feet/body root stay planted on the same spot — no stepping forward into the attack, no dashing, no drifting, no entrance, no exit. Frame 0, the middle frame, and the last frame all show the character's body at the exact same screen position.`;

  const actionText =
    pose === "stand"
      ? `standing still in place, not walking or running, ${DIRECTION8_FACING_HINT[direction]}.`
      : pose === "run"
        ? `running in place at a steady pace, with a clear full-body run cycle (arms pumping, legs striding, slight bounce): ${DIRECTION8_MOTION_HINT[direction]}.`
        : `performing a single melee attack in place — a clear windup, a fast strike/swing at full extension, then recovery back to a ready stance — aimed ${DIRECTION8_ATTACK_AIM_HINT[direction]}, ${DIRECTION8_FACING_HINT[direction]}.`;

  // Repeated as its own standalone line right after the action, on top of
  // positionBlock above — the single earlier "fixed position" paragraph was
  // sometimes outweighed by the action line ("standing" still read as license
  // to take a step), so the no-movement rule for stand/attack is stated
  // twice, once in the general position rules and once right next to the
  // action. Run is exempt: "run-in-place" already states its own no-travel
  // rule inline, tailored to a locomotion cycle rather than a single strike.
  const stationaryReinforcement =
    pose === "stand"
      ? "CRITICAL — the character must remain completely stationary for the whole clip: no steps, no shifting to a different spot, no leaning that moves the body's center off its starting point. Any movement is limited to idle sway/breathing/hair/clothing motion that returns to the same spot, never a step or a walk."
      : pose === "attack"
        ? "CRITICAL — the character's feet and body root stay planted on the same spot for the whole clip: no stepping into the strike, no lunging forward, no dashing toward a target. Only the attacking limb/weapon and the body's rotation/lean during the swing may move — the character ends the clip standing on the same spot it started on."
        : "";

  return [
    `${ANIMATION_VIDEO_SECONDS} second video, 16:9 frame, ONE single character only — never two copies, never a split screen, never a grid of panels.`,
    `CRITICAL — the attached reference image is the exact starting frame of this video: frame 0 must match it as closely as possible (same pose, same facing, same framing, same character design) before any motion begins.`,
    `Background: pure flat green screen (solid chroma key green, #00FF00), no gradient, no shadow, no vignette, no texture, nothing else in the background. This flat single-colour background exists specifically so the background can be keyed out afterwards — any shadow cast onto the background, any coloured rim light, or any green tint on the character itself will break that step.`,
    `CRITICAL — fixed camera: no zoom, no push-in, no pull-out, no pan, no tilt, no orbit, no handheld shake, no rack focus. The camera is locked off for the entire clip and the character stays the same size on screen from first frame to last.`,
    positionBlock,
    `CRITICAL — fixed facing: the character keeps facing the same direction as the reference image (${DIRECTION8_FACING_HINT[direction]}) in frame 0, in the middle, and in the last frame. It never turns to face another direction.`,
    `The action: ${actionText}`,
    stationaryReinforcement,
    `Character reference: ${description}`,
    `Audio: none. Do NOT include background music, and do NOT include any soundtrack or score. Silence, or incidental sound effects only.`,
    "No text, no watermark, no logo, no UI overlay, no letterboxing anywhere in the video.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const DEFAULT_ACTION_TEXT: Record<StateGroup, string> = {
  stand_run:
    "running in place (feet cycling as if running, but the body does not travel anywhere)",
  attack:
    "performing a melee attack motion in place, with a clear windup, strike, and recovery",
  roll: "performing a dodge roll motion in place, returning to the same spot",
};

const QUADRANT_LABELS: Record<(typeof DIRECTION_ORDER)[number], string> = {
  up: "TOP-LEFT",
  right: "TOP-RIGHT",
  down: "BOTTOM-RIGHT",
  left: "BOTTOM-LEFT",
};

const FACING_HINT: Record<(typeof DIRECTION_ORDER)[number], string> = {
  up: "facing away from the camera (back view, as if moving toward the top of the screen)",
  right:
    "facing right in profile (side view, as if moving toward the right of the screen)",
  down: "facing the camera (front view, as if moving toward the bottom of the screen)",
  left: "facing left in profile (side view, as if moving toward the left of the screen)",
};

// The action's own directionality (which way a swing/step/roll aims) must
// match the panel's facing, or the character ends up facing one way while
// visibly swinging/moving another — e.g. facing up but swinging rightward.
const MOTION_AXIS_HINT: Record<(typeof DIRECTION_ORDER)[number], string> = {
  up: "every swing, step, or lunge in this action is aimed upward/away from the camera, matching the up-facing pose",
  right:
    "every swing, step, or lunge in this action is aimed rightward, matching the right-facing pose",
  down: "every swing, step, or lunge in this action is aimed downward/toward the camera, matching the down-facing pose",
  left: "every swing, step, or lunge in this action is aimed leftward, matching the left-facing pose",
};

export function buildAnimationPrompt(
  characterDescription: string,
  itemNames: string[],
  state: StateGroup,
  actionDescription: string,
): string {
  const itemText =
    itemNames.length > 0
      ? `The character is holding/wearing: ${itemNames.join(", ")} (shown in the additional reference images), positioned naturally for this action.`
      : "";

  const actionText = actionDescription.trim() || DEFAULT_ACTION_TEXT[state];

  const panelLines = DIRECTION_ORDER.map(
    (direction) =>
      `${QUADRANT_LABELS[direction]} panel: character ${FACING_HINT[direction]}, ${actionText}. The action's motion must match this facing: ${MOTION_AXIS_HINT[direction]} — the body faces ${direction} AND the action itself visibly happens toward ${direction}, never toward a different axis. This panel keeps facing ${direction} for the ENTIRE clip, from the first frame to the very last frame — it never turns to face any other direction. This panel's facing direction is DIFFERENT from all 3 other panels.`,
  );

  return [
    `${ANIMATION_VIDEO_SECONDS} second video, pure flat green screen background (solid chroma key green, #00FF00, no gradient, no shadow, no vignette, nothing else in the background), 16:9 frame.`,
    `Think of this as 4 separate video panels of the exact same size, arranged in a 2x2 grid and played back together as one video, like a 4-way security camera wall: TOP-LEFT, TOP-RIGHT, BOTTOM-LEFT, BOTTOM-RIGHT. There are no visible grid lines or dividers between panels, but each panel's content is completely independent from the other 3 — different facing direction, own isolated character copy, no shared motion or shared pose.`,
    `Each of the 4 panels below MUST show a DIFFERENT facing direction — never repeat the same direction in two panels, never show all 4 panels facing the same way:`,
    ...panelLines,
    `CRITICAL — facing direction never changes: a panel assigned to face "up" must show the character facing up in frame 0, in the middle of the clip, AND in the last frame — do not let it rotate, turn around, or end up facing a different direction than it started. The same applies to every other panel. Direction is fixed per panel for the full ${ANIMATION_VIDEO_SECONDS} seconds.`,
    `CRITICAL — fixed screen position: inside its own panel, each character copy is centered and stays perfectly still at that exact spot for the entire clip, starting from frame 0. There is no entrance, no walk-in, no slide-in, no fade-in, no camera pan or zoom, ever, in any panel. Frame 0 already shows all 4 copies fully in place, each already in a ready pose at the center of its own panel.`,
    `CRITICAL — synchronized timing across all 4 panels: all 4 panels perform their action at the exact same instant — windup starts at the same timestamp in every panel, the peak/impact moment happens at the same timestamp in every panel, recovery ends at the same timestamp in every panel. Panels must never be staggered or offset from each other in time, and the one shared audio track's sound effects must land on a beat that's simultaneously correct for all 4 panels.`,
    `CRITICAL — small character, generous padding: each character copy is drawn small within its panel, filling at most 55% of the panel's width and height at its widest pose (including any weapon/item swing extending outward) — leave clear open background space on all sides. This padding is required so the panel can be cropped to a tight square around the character later without cutting off hands, weapons, or effects that extend past the body during the action.`,
    `Each panel plays the action as a clear, readable sequence of distinct poses (e.g. idle/ready -> windup/anticipation -> peak action -> follow-through/recovery -> back to idle), not a blurry continuous loop — every pose should be different enough from its neighbors to be usable as a separate animation frame. Use a deliberate, slightly stepped/stop-motion cadence between poses (brief hold on each key pose) rather than smooth continuous motion, similar to classic 2D sprite animation. The character never leaves the center of its own panel while doing this.`,
    `Character reference (all views composed in one image): ${characterDescription}`,
    itemText,
    `Audio: include sound effects appropriate to the action (footsteps, whoosh, impact, etc.) synced to the motion. Do NOT include any background music — sound effects only, or silence between effects.`,
    "No text, no watermark, no logo anywhere in the video.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Builds the prompt for one v2 video: a single right-facing character on a
 * chroma key background, fixed position, fixed camera, no audio. Unlike
 * buildAnimationPrompt's 2x2 grid of 4 directions, this flow only ever
 * produces right-facing frames — left is obtained by flipping horizontally
 * at render time, so there is no direction parameter here.
 */
export function buildVideoAnimationV2Prompt(
  characterDescription: string,
  itemNames: string[],
  state: StateGroup,
  actionDescription: string,
): string {
  const actionText = actionDescription.trim() || DEFAULT_ACTION_TEXT[state];

  const itemText =
    itemNames.length > 0
      ? `The character is holding/wearing: ${itemNames.join(", ")} (shown in the additional reference images), positioned naturally for this action.`
      : "";

  return [
    `${ANIMATION_VIDEO_SECONDS} second video, 16:9 frame, ONE single character only — never two copies, never a split screen, never a grid of panels.`,
    `Background: pure flat green screen (solid chroma key green, #00FF00), no gradient, no shadow, no vignette, no texture, nothing else in the background. This flat single-colour background exists specifically so the background can be keyed out afterwards — any shadow cast onto the background, any coloured rim light, or any green tint on the character itself will break that step.`,
    `CRITICAL — fixed position: the character is centered in frame and stays at that exact spot for the whole clip. No walking across frame, no entrance, no exit, no drift. Frame 0 already shows the character fully in place and in a ready pose.`,
    `CRITICAL — fixed camera: no zoom, no push-in, no pull-out, no pan, no tilt, no orbit, no handheld shake, no rack focus. The camera is locked off for the entire clip and the character stays the same size on screen from first frame to last.`,
    `CRITICAL — fixed facing: the character faces RIGHT in profile (side view, as if moving toward the right of the screen) in frame 0, in the middle, and in the last frame. It never turns to face another direction. Every swing, step, or lunge in the action is aimed rightward, matching the facing.`,
    `Character size/padding: the character fills at most 60% of the frame height at its widest pose (including any weapon or effect extending outward), leaving clear green space on all sides so the frame can be cropped tightly later without cutting off hands, weapons or effects.`,
    `The action: ${actionText}, played as a clear readable sequence of distinct poses (idle/ready -> windup/anticipation -> peak -> follow-through -> back to idle), with a deliberate slightly stepped stop-motion cadence and a brief hold on each key pose, so individual frames are usable as separate animation frames. Not a blurry continuous blur.`,
    `Character reference: ${characterDescription}`,
    itemText,
    `Audio: none. Do NOT include background music, and do NOT include any soundtrack or score. Silence, or incidental sound effects only.`,
    "No text, no watermark, no logo, no UI overlay, no letterboxing anywhere in the video.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseItemNames(itemNamesText: string): string[] {
  return itemNamesText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildItemPrompt(
  itemNames: string[],
  styleTemplate: string,
): string {
  const totalCells = ITEM_GRID_COLS * ITEM_GRID_ROWS;
  // Cycle item names across every cell so each row has concrete, named
  // content (mirroring the character prompt's per-row anchoring, which
  // reliably held the grid to its exact dimensions) — this naming is only
  // a generation aid, not a constraint the user must respect when picking:
  // the variant picker lets them freely tag any cut cell to any item name.
  const rows: string[] = [];
  for (let row = 0; row < ITEM_GRID_ROWS; row++) {
    const cellNames = Array.from(
      { length: ITEM_GRID_COLS },
      (_, col) => itemNames[(row * ITEM_GRID_COLS + col) % itemNames.length],
    );
    rows.push(
      `Row ${row + 1}: ${cellNames.map((name, i) => `col ${i + 1}: ${name}`).join(", ")}`,
    );
  }
  return [
    `Game item icon reference sheet, ${ITEM_GRID_COLS}x${ITEM_GRID_ROWS} grid (${totalCells} cells total) on pure flat green screen background (solid chroma key green, #00FF00, no gradient, no shadow, no vignette, no texture anywhere on the background), each cell a single isolated item icon, no overlap between cells, no character or hand holding the item — item alone, centered in its cell.`,
    `Each item must be centered in its cell with clear even padding (at least 15% of the cell's width and height) between the item's silhouette and the cell edge on all sides — never let any part of the item touch or cross the cell boundary.`,
    styleTemplate,
    "Row-by-row content (vary angle/pose/lighting freely between repeats of the same item — these should not look like identical copies):",
    ...rows,
    "No text, no watermark, no logo anywhere in the image.",
    "Cell dividers: 1 solid black pixel line between each cell, not part of the character or background, just a visual guide for the model to keep the grid layout correct.",
  ].join("\n\n");
}

/**
 * The action beat each of the 8 frames should land on. Kept short and
 * concrete: an earlier version spelled out per-frame blur intensity, target
 * points and continuity rules across seven CRITICAL blocks, and the model
 * responded by drawing near-static poses — the safest way to satisfy every
 * constraint at once. Describing the motion arc and letting the model handle
 * the rendering works far better.
 */
const FRAME_BEATS: Record<StateGroup, string> = {
  stand_run:
    "frame 1 standing idle, frames 2-10 a full run cycle (push-off, high-knee, mid-stride, contact, opposite push-off, opposite high-knee, opposite mid-stride, contact, recovery) that loops back to frame 2",
  attack:
    "frames 1-3 wind-up, frames 4-5 the strike accelerating, frame 6 the peak/impact at full extension, frames 7-10 follow-through settling back to the start pose",
  roll: "frames 1-2 crouch and launch, frames 3-8 the roll (tuck, upside-down mid-roll, unfurl, land, settle), frames 9-10 rising back to a standing ready pose",
};

const ACTION_DIRECTION_OPTIONS = [
  "same as facing",
  "top to bottom (overhead downward strike/chop)",
  "bottom to top (upward slash/uppercut)",
  "left to right (horizontal swing/slash)",
  "right to left (horizontal swing/slash)",
  "outward thrust/stab (forward along the facing direction)",
] as const;

export type ActionDirection = (typeof ACTION_DIRECTION_OPTIONS)[number];

export const ACTION_DIRECTION_CHOICES: ActionDirection[] = [
  ...ACTION_DIRECTION_OPTIONS,
];

/**
 * Builds the prompt for one animation sheet: a 10-frame strip per direction,
 * one direction per row.
 *
 * Deliberately short. The previous version stacked seven CRITICAL blocks
 * (blur intensity, effect containment, motion continuity, no deformation,
 * fixed feet, fixed camera, facing-vs-action) onto a 48-cell sheet, and the
 * model resolved the conflict by drawing almost no motion at all. This keeps
 * the shape the model reliably follows — style, layout, per-row action, one
 * background rule — and leaves the rest to it.
 */
export function buildAnimationImagePrompt(
  characterDescription: string,
  itemNames: string[],
  state: StateGroup,
  actionDescription: string,
  actionDirection: ActionDirection = "same as facing",
  styleTemplate = "",
): string {
  const actionText = actionDescription.trim() || DEFAULT_ACTION_TEXT[state];
  const itemText =
    itemNames.length > 0
      ? ` The character is holding ${itemNames.join(", ")} (see reference images).`
      : "";

  const rows = DIRECTION_ORDER.map((direction, i) => {
    const axis =
      actionDirection === "same as facing"
        ? `${direction}wards, matching the facing`
        : `${actionDirection}, regardless of the facing`;
    return `Row ${i + 1}: character ${FACING_HINT[direction]}, keeping that exact facing in all ${ANIM_IMG_GRID_COLS} frames of the row — it never turns to another direction mid-row. The action's motion travels ${axis}.`;
  });

  return [
    `A ${ANIM_IMG_GRID_COLS}x${ANIM_IMG_GRID_ROWS} pixel art sprite sheet for a 2D game. Rows 1-4 each hold one ${ANIM_IMG_GRID_COLS}-frame animation of the same character, read left to right as continuous keyframes of a single motion.`,
    `The animation: ${actionText}.${itemText} Frame timing across each row: ${FRAME_BEATS[state]}.`,
    ...rows,
    `Every one of the ${ANIM_IMG_GRID_COLS * 4} character cells is the SAME character from the reference image — identical face, hat, hair, outfit, colours, body proportions and drawn at the same size and camera distance in every cell. Only the pose changes between frames. Do not redesign, restyle, resize or recolour the character between frames, and do not swap in a different character.`,
    `Because each animation is only ${ANIM_IMG_GRID_COLS} frames, give the moving limb/tool visible directional motion blur and speed streaks on the fast frames, so the direction and speed of the motion reads clearly from a still frame.`,
    styleTemplate,
    "16-bit pixel art, clean 1-2px outlines, no anti-aliasing, flat cel shading, consistent character design, proportions and scale across every frame.",
    `Character: ${characterDescription}`,
    `Each cell is 64x64 pixels with a 20x20 pixel even margin between the character's silhouette and the cell edge on all sides — nothing touches or crosses into a neighbouring cell.`,
    "Solid flat green screen background (#00FF00) everywhere, no gradient or shadow. No grid lines. No text, watermark, or logo.",
    "Cell dividers: 1 solid black pixel line between each cell, not part of the character or background, just a visual guide for the model to keep the grid layout correct.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
