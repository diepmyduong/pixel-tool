function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Failed to load video'))
    video.src = url
  })
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

/**
 * Draws the full video frame at `timestamp` seconds to a canvas, uncropped
 * — used as the still image the manual grid-alignment UI drags boundary
 * lines over.
 */
export async function captureFullFrame(videoUrl: string, timestamp: number): Promise<HTMLCanvasElement> {
  const video = await loadVideo(videoUrl)
  await seek(video, timestamp)

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.drawImage(video, 0, 0)
  return canvas
}

/**
 * Draws one square cell of the video frame at `timestamp` seconds to a
 * canvas, cropped using a manually-aligned square rect (from
 * useSquareCellGrid).
 */
export async function extractFrame(
  videoUrl: string,
  timestamp: number,
  cellRect: { sx: number; sy: number; size: number },
): Promise<HTMLCanvasElement> {
  const video = await loadVideo(videoUrl)
  await seek(video, timestamp)

  const { sx, sy, size } = cellRect

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context')
  ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
  return canvas
}

export async function getVideoDuration(videoUrl: string): Promise<number> {
  const video = await loadVideo(videoUrl)
  return video.duration
}

/**
 * Extracts the [startTime, endTime] slice of the clip's audio track as a
 * single Blob, played back at `playbackRate` (default 1x, i.e. real-time)
 * so the recorded clip's wall-clock duration is (endTime - startTime) /
 * playbackRate — used to speed a user-picked sound-effect window down to
 * a target duration that matches the extracted frame count.
 */
export async function extractAudio(
  videoUrl: string,
  startTime: number,
  endTime: number,
  playbackRate = 1,
): Promise<Blob> {
  const video = await loadVideo(videoUrl)
  video.muted = false
  video.playbackRate = playbackRate

  const audioCtx = new AudioContext()
  const source = audioCtx.createMediaElementSource(video)
  const dest = audioCtx.createMediaStreamDestination()
  source.connect(dest)

  const recorder = new MediaRecorder(dest.stream)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))
  })

  await seek(video, startTime)
  recorder.start()
  await video.play()
  await new Promise<void>((resolve) => {
    const durationMs = (Math.max(0, endTime - startTime) / playbackRate) * 1000
    setTimeout(resolve, durationMs)
  })
  recorder.stop()
  video.pause()
  await audioCtx.close()

  return recordingDone
}
