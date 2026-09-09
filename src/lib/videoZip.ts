import JSZip from 'jszip'
import type { Direction8 } from '../types'

/**
 * Structural shape shared by Character2VideoEntry and Item2VideoEntry (and
 * any future N-pose-per-direction video entry) — kept as a minimal inline
 * shape rather than importing either concrete type, since this module has
 * no reason to depend on either flow's specific pose union.
 */
interface ZippableVideoEntry {
  direction: Direction8
  pose: string
  videoBlob: Blob
}

/** Filename-safe label for one video entry, e.g. "up-stand" or "down_left-run". */
function entryFilename(entry: ZippableVideoEntry, index: number): string {
  return `${index + 1}_${entry.direction}_${entry.pose}.mp4`
}

/**
 * Zips every video in a session (or a filtered subset) into one .zip and
 * triggers a browser download — used by the "Download all" button so a
 * 16-video session doesn't mean 16 separate save-as dialogs.
 */
export async function downloadVideosAsZip(entries: ZippableVideoEntry[], zipFilename: string): Promise<void> {
  const zip = new JSZip()
  entries.forEach((entry, index) => {
    zip.file(entryFilename(entry, index), entry.videoBlob)
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = zipFilename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
