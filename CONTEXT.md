# Sprite Dashboard

Internal tool for generating and editing pixel-art character animations from AI-generated reference images and video.

## Language

**Reference Image**:
A user-uploaded image (not tied to a saved Character or Item) sent to the generation API as an extra visual reference. Exists only for the duration of a generate request; not persisted to IndexedDB.
_Avoid_: Attachment, upload (too generic)

**Items Collage**:
A single composed image combining multiple Item blobs into one grid, used only when 2+ items are attached, to stay within the generation API's 3-image limit. A single item is sent as-is; zero items sends no item slot.
_Avoid_: Item sheet, item grid

**Margin**:
The minimum distance kept between a character and the edges of its 64x64 sprite frame. One value applies to every frame in an animation, driving how much the character is scaled down to fit.
_Avoid_: Padding, offset (Offset is a different, per-frame concept — see below)

**Frame Offset**:
The x/y position of a character within its 64x64 sprite frame, adjustable per frame (unlike Margin, which is animation-wide). Set by dragging on the frame's canvas preview.
_Avoid_: Margin, position (ambiguous with Margin)

**Sprite Sheet**:
A single PNG file laying out an animation's frames left-to-right in a horizontal strip, each frame a fixed 64x64 square. Produced on demand for download; not stored in IndexedDB.
_Avoid_: Sprite atlas, texture sheet
