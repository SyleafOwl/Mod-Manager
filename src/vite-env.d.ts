/// <reference types="vite/client" />

interface ModMeta {
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

interface ModItem {
	folder: string
	dir: string
	meta: ModMeta
}

declare global {
	interface Window {
		api: {
			getSettings(): Promise<{ modsRoot?: string; imagesRoot?: string }>
			setModsRoot(root: string): Promise<{ modsRoot?: string; imagesRoot?: string }>
			setImagesRoot(root: string): Promise<{ modsRoot?: string; imagesRoot?: string }>
			selectFolder(): Promise<string | null>
			selectArchive(): Promise<string | null>

			listCharacters(): Promise<string[]>
			addCharacter(name: string): Promise<string>
			normalizeCharacterNames(): Promise<{ changed: Array<{ from: string; to: string }>; skipped: string[] }>

			listMods(character: string): Promise<ModItem[]>
			addModFromArchive(character: string, archivePath: string, modName: string, meta?: Partial<ModMeta>): Promise<boolean>
			saveModMetadata(character: string, modName: string, meta: Partial<ModMeta>): Promise<ModMeta>
			deleteMod(character: string, modName: string): Promise<boolean>
			openModPage(character: string, modName: string): Promise<boolean>
			openFolder(character?: string, modName?: string): Promise<boolean>
			updateFromUrl(character: string, modName: string): Promise<boolean>
					onFsChanged(cb: (payload: any) => void): () => void
		}
	}
}

export {}
