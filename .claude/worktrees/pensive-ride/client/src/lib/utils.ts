import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a Wikimedia Commons wiki page URL (e.g. .../wiki/File:Name.jpg) to a direct image URL so <img src> can load it.
 * Raw image URLs (e.g. upload.wikimedia.org or other direct links) are returned unchanged.
 */
export function toComposerImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null
  const trimmed = url.trim()
  const match = trimmed.match(/^https?:\/\/(?:commons\.wikimedia\.org|[\w-]+\.wikipedia\.org)\/wiki\/File:(.+)$/i)
  if (match) {
    const filename = decodeURIComponent(match[1].replace(/^\/+/, ""))
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`
  }
  return trimmed
}
