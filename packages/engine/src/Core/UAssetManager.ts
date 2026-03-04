import { Logger } from './Logger';

/**
 * Handles project-level assets loading like Textures and Models.
 * Maintains references to FileSystem directory handlers resolving URLs avoiding CORS problems.
 */
export class UAssetManager {
  private static instance: UAssetManager;

  // Active directory handle selected via ProjectSystem
  public currentProjectDirectory: FileSystemDirectoryHandle | null = null;

  // Cache holding mapped 'relativePath' -> 'blobUrl'
  private assetCache: Map<string, string> = new Map();

  private constructor() { }

  public static getInstance(): UAssetManager {
    if (!UAssetManager.instance) {
      UAssetManager.instance = new UAssetManager();
    }
    return UAssetManager.instance;
  }

  /**
   * Translates a relative file path like 'textures/brick.jpg' into a usable blob URL
   * extracted from the current active project directory handle.
   * If not project is defined, tries a direct web fetch.
   */
  public async getAssetUrl(relativePath: string): Promise<string> {
    if (this.assetCache.has(relativePath)) {
      return this.assetCache.get(relativePath)!;
    }

    if (!this.currentProjectDirectory) {
      // Fallback: Web fetch if running without a local project folder mounted
      return relativePath;
    }

    try {
      const parts = relativePath.split(/[/\\]/);
      let currentDir = this.currentProjectDirectory;

      // Traverse subdirectories
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '') continue;
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      const objectUrl = URL.createObjectURL(file);
      this.assetCache.set(relativePath, objectUrl);

      return objectUrl;
    } catch (e) {
      Logger.error(`Failed to load asset from project relative path: ${relativePath}`, e);
      return relativePath; // Fallback
    }
  }

  /**
   * Resets the active project and clears cached Blob URLs to free memory.
   */
  public reset(newDirectory: FileSystemDirectoryHandle | null) {
    this.currentProjectDirectory = newDirectory;
    for (const [_, url] of this.assetCache) {
      URL.revokeObjectURL(url);
    }
    this.assetCache.clear();
  }
}
