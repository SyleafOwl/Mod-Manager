/// <reference types="vite/client" />

import type { CharacterItem, ModItem, ModMeta } from './types'

declare global {
	interface Window {
		api: {
			getSettings(): Promise<{ modsRoot?: string; imagesRoot?: string }>
			setModsRoot(root: string): Promise<{ modsRoot?: string; imagesRoot?: string }>
			setImagesRoot(root: string): Promise<{ modsRoot?: string; imagesRoot?: string }>
			selectFolder(): Promise<string | null>
			selectArchive(): Promise<string | null>

			listCharacters(): Promise<string[]>
			listCharactersWithImages(): Promise<CharacterItem[]>
			addCharacter(name: string): Promise<string>
			renameCharacter(oldName: string, newName: string): Promise<{ changed: boolean }>
			normalizeCharacterNames(): Promise<{ changed: Array<{ from: string; to: string }>; skipped: string[] }>
			deleteCharacter(name: string): Promise<boolean>

			listMods(character: string): Promise<ModItem[]>
			addModFromArchive(character: string, archivePath: string, modName: string, meta?: Partial<ModMeta>): Promise<boolean>
			copyArchiveToModFolder(character: string, archivePath: string): Promise<{ modName: string; fileName?: string; dir: string }>
			createModFromArchive(character: string, archivePath: string): Promise<{ modName: string; dir: string }>
			saveModMetadata(character: string, modName: string, meta: Partial<ModMeta>): Promise<ModMeta>
			saveModImageFromDataUrl(character: string, modName: string, dataUrl: string): Promise<string>
			saveModImageFromUrl(character: string, modName: string, url: string): Promise<string>
			getModPreviewDataUrl(character: string, modName: string): Promise<string | null>
			getModData(character: string, modName: string): Promise<{ pageUrl?: string; imageUrl?: string } | null>
			setModData(character: string, modName: string, payload: { pageUrl?: string; imageUrl?: string }): Promise<boolean>
			getPrimaryInternalName(character: string, modName: string): Promise<string | null>
			renamePrimaryInternal(character: string, modName: string, newName: string): Promise<{ changed: boolean }>
			peekPrimaryInternalName(archivePath: string): Promise<string | null>
			deleteMod(character: string, modName: string): Promise<boolean>
			openModPage(character: string, modName: string): Promise<boolean>
			openFolder(character?: string, modName?: string): Promise<boolean>
			updateFromUrl(character: string, modName: string): Promise<boolean>
			activateModExclusive(character: string, modName: string): Promise<boolean>
			enableMod(character: string, modName: string): Promise<boolean>
			disableMod(character: string, modName: string): Promise<boolean>
			readImageAsDataUrl(absPath: string): Promise<string | null>
			saveImageFromUrl(character: string, url: string, crop?: any): Promise<string>
			fetchImageDataUrl(url: string): Promise<string>
			saveImageFromDataUrl(character: string, dataUrl: string, sourceUrl?: string, crop?: any): Promise<string>
			getCharacterInfo(character: string): Promise<{ imagePath: string | null; url: string | null; crop?: any }>
			deleteFile(absPath: string): Promise<boolean>
			notifyReady(): void
			onFsChanged(cb: (payload: any) => void): () => void
		}
	}
}

export {}
