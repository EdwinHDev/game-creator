import { Logger } from '../Logger';
import { UMaterial } from '../../Rendering/UMaterial';

/**
 * Centralized Asset Manager for Game Engine resources.
 * Handles GPU Texture caching (VRAM) and relative path resolution.
 */
export class UAssetManager {
  private static instance: UAssetManager;

  // Active directory handle selected via ProjectSystem (Editor)
  public currentProjectDirectory: FileSystemDirectoryHandle | null = null;

  // VRAM Cache: relativePath -> GPUTexture
  private textureCache: Map<string, GPUTexture> = new Map();

  // Material Cache: relativePath -> UMaterial
  private materialCache: Map<string, UMaterial> = new Map();

  // Fallback textures provided by the Renderer
  private fallbackWhiteTexture: GPUTexture | null = null;

  private constructor() { }

  public static getInstance(): UAssetManager {
    if (!UAssetManager.instance) {
      UAssetManager.instance = new UAssetManager();
    }
    return UAssetManager.instance;
  }

  /**
   * Registers a fallback texture to be used when asset loading fails.
   */
  public setFallbackWhiteTexture(texture: GPUTexture): void {
    this.fallbackWhiteTexture = texture;
  }

  /**
   * Loads or retrieves a cached texture from the project's Assets folder.
   */
  public async getTexture(relativePath: string, device: GPUDevice): Promise<GPUTexture | null> {
    if (this.textureCache.has(relativePath)) {
      return this.textureCache.get(relativePath)!;
    }

    if (!this.currentProjectDirectory) {
      Logger.warn(`UAssetManager: No project directory mounted. Cannot load ${relativePath}`);
      return this.fallbackWhiteTexture;
    }

    try {
      // Navigate to Assets directory first
      const assetsDir = await this.currentProjectDirectory.getDirectoryHandle('Assets');

      const parts = relativePath.split(/[/\\]/);
      let currentDir = assetsDir;

      // Traverse subdirectories
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '') continue;
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // Create ImageBitmap from File
      const imageBitmap = await createImageBitmap(file);

      // Create GPUTexture
      const texture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Upload to GPU
      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: texture },
        [imageBitmap.width, imageBitmap.height]
      );

      this.textureCache.set(relativePath, texture);
      Logger.info(`UAssetManager: Loaded and cached texture: ${relativePath}`);

      return texture;
    } catch (e) {
      Logger.error(`UAssetManager: Failed to load asset: ${relativePath}`, e);
      return this.fallbackWhiteTexture;
    }
  }

  /**
   * Loads or retrieves a cached material asset (.mat).
   */
  public async loadMaterial(relativePath: string, device: GPUDevice): Promise<UMaterial | null> {
    if (this.materialCache.has(relativePath)) {
      return this.materialCache.get(relativePath)!;
    }

    if (!this.currentProjectDirectory) {
      Logger.warn(`UAssetManager: No project directory mounted. Cannot load material ${relativePath}`);
      return null;
    }

    try {
      const assetsDir = await this.currentProjectDirectory.getDirectoryHandle('Assets');
      const parts = relativePath.split(/[/\\]/);
      let currentDir = assetsDir;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '') continue;
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      const material = new UMaterial(data.name || 'NewMaterial');

      // Map JSON structure to UMaterial properties
      material.deserialize({
        name: data.name,
        baseColor: data.baseColor,
        metallic: data.metallic,
        roughness: data.roughness,
        albedoMapPath: data.textures?.albedo || null,
        normalMapPath: data.textures?.normal || null,
        roughnessMapPath: data.textures?.roughness || null
      });

      // Load associated textures
      await material.updateResources(device, this);

      this.materialCache.set(relativePath, material);
      Logger.info(`UAssetManager: Loaded and cached material: ${relativePath}`);

      return material;
    } catch (e) {
      Logger.error(`UAssetManager: Failed to load material asset: ${relativePath}`, e);
      return null;
    }
  }

  /**
   * Clears the cache and resets the project directory.
   */
  public reset(newDirectory: FileSystemDirectoryHandle | null): void {
    this.currentProjectDirectory = newDirectory;
    // We don't explicitly destroy textures here as they might be used by active materials,
    // but clearing the map allows garbage collection if they are unreferenced.
    this.textureCache.clear();
    this.materialCache.clear();
  }
}
