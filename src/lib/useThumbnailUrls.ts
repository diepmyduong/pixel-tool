import { useEffect, useState } from 'react'

/**
 * Converts a list of items to object URLs for thumbnail rendering, keyed by id.
 * URLs are revoked when their id drops out of the list or the hook unmounts.
 */
export function useThumbnailUrls<T extends { id: string }>(items: T[], getBlob: (item: T) => Blob | undefined) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    setUrls((prevUrls) => {
      const nextUrls: Record<string, string> = {}
      for (const item of items) {
        const blob = getBlob(item)
        if (!blob) continue
        nextUrls[item.id] = prevUrls[item.id] ?? URL.createObjectURL(blob)
      }
      for (const [id, url] of Object.entries(prevUrls)) {
        if (!nextUrls[id]) URL.revokeObjectURL(url)
      }
      return nextUrls
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  useEffect(() => {
    return () => {
      setUrls((prevUrls) => {
        Object.values(prevUrls).forEach((url) => URL.revokeObjectURL(url))
        return prevUrls
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return urls
}
