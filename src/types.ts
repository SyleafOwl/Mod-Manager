export type ModMeta = {
  name: string
  version?: string
  author?: string
  description?: string
  pageUrl?: string
  updateUrl?: string
  image?: string
  enabled?: boolean
  createdAt?: string
  updatedAt?: string
}

export type ModItem = {
  folder: string
  dir: string
  meta: ModMeta
  archive?: string | null
  size?: number          // Size in bytes
  timestamp?: number     // Unix timestamp (modified time)
  archivePath?: string   // Path to archive file if flat
}

export type CharacterItem = { name: string; imagePath?: string }

export type CropMeta = {
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  zoom?: number
}
