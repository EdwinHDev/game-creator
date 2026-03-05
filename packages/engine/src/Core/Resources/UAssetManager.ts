import { Logger } from '../Logger';
import { UMaterial } from '../../Rendering/UMaterial';
import { RGBELoader } from './RGBELoader';
import { UAsset } from './UAsset';

/**
 * Centralized Asset Manager for Game Engine resources.
 * Handles GPU Texture caching (VRAM), Primitives, and relative path resolution.
 */
export enum EPrimitiveType {
  BOX = 'Primitive_Box',
  SPHERE = 'Primitive_Sphere',
  PLANE = 'Primitive_Plane',
  CYLINDER = 'Primitive_Cylinder',
  CONE = 'Primitive_Cone',
  CAPSULE = 'Primitive_Capsule'
}

export class UAssetManager {
  private static instance: UAssetManager;

  // Active directory handle selected via ProjectSystem (Editor)
  public currentProjectDirectory: FileSystemDirectoryHandle | null = null;

  // UAsset Cache: id -> UAsset (Meshes)
  private assets: Map<string, UAsset> = new Map();

  // VRAM Cache: relativePath -> GPUTexture
  private textureCache: Map<string, GPUTexture> = new Map();
  // ... (rest of old code below)

  // HDRI Cache (rgba32float)
  private hdrCache: Map<string, GPUTexture> = new Map();

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
   * Used for the UI to list all registered primitive and loaded assets
   */
  public getAssetDataList(): { id: string, name: string, type: string }[] {
    const list: { id: string, name: string, type: string }[] = [];
    this.assets.forEach((asset, id) => {
      list.push({ id: id, name: asset.name, type: asset.type });
    });
    return list;
  }

  /**
   * Initializes basic primitives (Box, Plane, Sphere, Cylinder, Cone, Capsule) and registers them in the asset cache.
   */
  public static async init(device: GPUDevice) {
    const instance = this.getInstance();
    instance.createBoxPrimitive(device);
    instance.createPlanePrimitive(device);
    instance.createSpherePrimitive(device);
    instance.createCylinderPrimitive(device);
    instance.createConePrimitive(device);
    instance.createCapsulePrimitive(device);
    Logger.info("[UAssetManager] Todos los primitivos inicializados en GPU.");
  }

  private createSpherePrimitive(device: GPUDevice) {
    const segments = 32;
    const radius = 50.0;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= segments; lat++) {
      const theta = lat * Math.PI / segments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= segments; lon++) {
        const phi = lon * 2 * Math.PI / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        // Position (3)
        vertices.push(x * radius, y * radius, z * radius);
        // Normal (3)
        vertices.push(x, y, z);
        // UV (2)
        vertices.push(lon / segments, lat / segments);
        // Tangent (4)
        vertices.push(-sinPhi, 0, cosPhi, 1.0);
      }
    }

    for (let lat = 0; lat < segments; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const first = (lat * (segments + 1)) + lon;
        const second = first + segments + 1;

        indices.push(first, first + 1, second);
        indices.push(second, first + 1, second + 1);
      }
    }

    this.assets.set(EPrimitiveType.SPHERE, new UAsset(EPrimitiveType.SPHERE, device, new Float32Array(vertices), new Uint32Array(indices)));
  }

  private createCylinderPrimitive(device: GPUDevice) {
    const segments = 32;
    const radius = 50.0;
    const height = 100.0;
    const vertices: number[] = [];
    const indices: number[] = [];

    // 1. Side vertices
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      const u = i / segments;

      // Bottom side vertex
      vertices.push(x * radius, -height / 2, z * radius, x, 0, z, u, 1, -z, 0, x, 1);
      // Top side vertex
      vertices.push(x * radius, height / 2, z * radius, x, 0, z, u, 0, -z, 0, x, 1);
    }

    // Side indices
    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    // 2. Bottom Cap
    const bottomCenterIndex = vertices.length / 12;
    vertices.push(0, -height / 2, 0, 0, -1, 0, 0.5, 0.5, 1, 0, 0, 1);
    const bottomRingStart = vertices.length / 12;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      vertices.push(x * radius, -height / 2, z * radius, 0, -1, 0, (x + 1) * 0.5, (z + 1) * 0.5, 1, 0, 0, 1);
    }
    for (let i = 0; i < segments; i++) {
      indices.push(bottomCenterIndex, bottomRingStart + i + 1, bottomRingStart + i);
    }

    // 3. Top Cap
    const topCenterIndex = vertices.length / 12;
    vertices.push(0, height / 2, 0, 0, 1, 0, 0.5, 0.5, 1, 0, 0, 1);
    const topRingStart = vertices.length / 12;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      vertices.push(x * radius, height / 2, z * radius, 0, 1, 0, (x + 1) * 0.5, (z + 1) * 0.5, 1, 0, 0, 1);
    }
    for (let i = 0; i < segments; i++) {
      indices.push(topCenterIndex, topRingStart + i, topRingStart + i + 1);
    }

    this.assets.set(EPrimitiveType.CYLINDER, new UAsset(EPrimitiveType.CYLINDER, device, new Float32Array(vertices), new Uint32Array(indices)));
  }

  private createConePrimitive(device: GPUDevice) {
    const segments = 32;
    const radius = 50.0;
    const height = 100.0;
    const vertices: number[] = [];
    const indices: number[] = [];

    // 1. Side vertices
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      const u = i / segments;

      // Normal for cone side: needs to be slanted
      const nx = x;
      const nz = z;
      const ny = radius / height; // Approximation for smoothness
      const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);

      // Bottom edge
      vertices.push(x * radius, -height / 2, z * radius, nx / mag, ny / mag, nz / mag, u, 1, -z, 0, x, 1);
      // Tip (one vertex per segment for correct normals/UV)
      vertices.push(0, height / 2, 0, nx / mag, ny / mag, nz / mag, u, 0, -z, 0, x, 1);
    }

    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
    }

    // 2. Base Cap (Bottom)
    const centerIndex = vertices.length / 12;
    vertices.push(0, -height / 2, 0, 0, -1, 0, 0.5, 0.5, 1, 0, 0, 1);
    const ringStart = vertices.length / 12;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      vertices.push(x * radius, -height / 2, z * radius, 0, -1, 0, (x + 1) * 0.5, (z + 1) * 0.5, 1, 0, 0, 1);
    }
    for (let i = 0; i < segments; i++) {
      indices.push(centerIndex, ringStart + i + 1, ringStart + i);
    }

    this.assets.set(EPrimitiveType.CONE, new UAsset(EPrimitiveType.CONE, device, new Float32Array(vertices), new Uint32Array(indices)));
  }

  private createCapsulePrimitive(device: GPUDevice) {
    const segments = 32;
    const radius = 50.0;
    const cylinderHeight = 100.0;
    const rings = 16; // Hemispheres
    const vertices: number[] = [];
    const indices: number[] = [];

    // Generate UV Sphere-like vertices but offset by height
    const latEnd = rings * 2;

    for (let lat = 0; lat <= latEnd; lat++) {
      const theta = lat * Math.PI / latEnd;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      // Offset Y based on which hemisphere we are in
      let yOffset = 0;
      if (lat < rings) yOffset = cylinderHeight / 2;
      else if (lat > rings) yOffset = -cylinderHeight / 2;

      for (let lon = 0; lon <= segments; lon++) {
        const phi = lon * 2 * Math.PI / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        // Position (3)
        vertices.push(x * radius, (y * radius) + yOffset, z * radius);
        // Normal (3)
        vertices.push(x, y, z);
        // UV (2)
        vertices.push(lon / segments, lat / latEnd);
        // Tangent (4)
        vertices.push(-sinPhi, 0, cosPhi, 1.0);
      }
    }

    for (let lat = 0; lat < latEnd; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const first = (lat * (segments + 1)) + lon;
        const second = first + segments + 1;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    this.assets.set(EPrimitiveType.CAPSULE, new UAsset(EPrimitiveType.CAPSULE, device, new Float32Array(vertices), new Uint32Array(indices)));
  }

  private createBoxPrimitive(device: GPUDevice) {
    // A standard 100.0 unit cube centered at (0,0,0)
    // Layout: Position (3f), Normal (3f), UV (2f) - 24 vertices
    const vertices = new Float32Array([
      // Front face (Normal Z+) -> Tangent X+
      -50.0, -50.0, 50.0, 0, 0, 1, 0, 1, 1, 0, 0, 1,
      50.0, -50.0, 50.0, 0, 0, 1, 1, 1, 1, 0, 0, 1,
      50.0, 50.0, 50.0, 0, 0, 1, 1, 0, 1, 0, 0, 1,
      -50.0, 50.0, 50.0, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      // Back face (Normal Z-) -> Tangent X-
      -50.0, -50.0, -50.0, 0, 0, -1, 1, 1, -1, 0, 0, 1,
      -50.0, 50.0, -50.0, 0, 0, -1, 1, 0, -1, 0, 0, 1,
      50.0, 50.0, -50.0, 0, 0, -1, 0, 0, -1, 0, 0, 1,
      50.0, -50.0, -50.0, 0, 0, -1, 0, 1, -1, 0, 0, 1,
      // Top face (Normal Y+) -> Tangent X+
      -50.0, 50.0, -50.0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      -50.0, 50.0, 50.0, 0, 1, 0, 0, 1, 1, 0, 0, 1,
      50.0, 50.0, 50.0, 0, 1, 0, 1, 1, 1, 0, 0, 1,
      50.0, 50.0, -50.0, 0, 1, 0, 1, 0, 1, 0, 0, 1,
      // Bottom face (Normal Y-) -> Tangent X+
      -50.0, -50.0, -50.0, 0, -1, 0, 0, 1, 1, 0, 0, 1,
      50.0, -50.0, -50.0, 0, -1, 0, 1, 1, 1, 0, 0, 1,
      50.0, -50.0, 50.0, 0, -1, 0, 1, 0, 1, 0, 0, 1,
      -50.0, -50.0, 50.0, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      // Right face (Normal X+) -> Tangent Z-
      50.0, -50.0, -50.0, 1, 0, 0, 1, 1, 0, 0, -1, 1,
      50.0, 50.0, -50.0, 1, 0, 0, 1, 0, 0, 0, -1, 1,
      50.0, 50.0, 50.0, 1, 0, 0, 0, 0, 0, 0, -1, 1,
      50.0, -50.0, 50.0, 1, 0, 0, 0, 1, 0, 0, -1, 1,
      // Left face (Normal X-) -> Tangent Z+
      -50.0, -50.0, -50.0, -1, 0, 0, 0, 1, 0, 0, 1, 1,
      -50.0, -50.0, 50.0, -1, 0, 0, 1, 1, 0, 0, 1, 1,
      -50.0, 50.0, 50.0, -1, 0, 0, 1, 0, 0, 0, 1, 1,
      -50.0, 50.0, -50.0, -1, 0, 0, 0, 0, 0, 0, 1, 1,
    ]);

    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2,     // Front
      4, 6, 5, 4, 7, 6,     // Back
      8, 10, 9, 8, 11, 10,  // Top
      12, 14, 13, 12, 15, 14, // Bottom
      16, 18, 17, 16, 19, 18, // Right
      20, 22, 21, 20, 23, 22, // Left
    ]);

    this.assets.set(EPrimitiveType.BOX, new UAsset(EPrimitiveType.BOX, device, vertices, indices));
  }

  private createPlanePrimitive(device: GPUDevice) {
    // A standard 100.0 unit plane on XZ axis
    // Layout: Position (3f), Normal (3f), UV (2f), Tangent (4f) => 12 floats per vertex
    const vertices = new Float32Array([
      // Point 0 (Bottom-Left)
      -50.0, 0.0, -50.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
      // Point 1 (Bottom-Right)
      50.0, 0.0, -50.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0,
      // Point 2 (Top-Right)
      50.0, 0.0, 50.0, 0.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0,
      // Point 3 (Top-Left)
      -50.0, 0.0, 50.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0
    ]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    this.assets.set(EPrimitiveType.PLANE, new UAsset(EPrimitiveType.PLANE, device, vertices, indices));
  }

  /**
   * Retrieves a cached UAsset (Primitive mesh) by ID.
   */
  public static getAsset(id: string): UAsset | undefined {
    return this.getInstance().assets.get(id);
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
   * Loads or retrieves a cached HDR texture (rgba32float) for environment maps. (Phase 58.2)
   */
  public async loadHDRTexture(relativePath: string, device: GPUDevice): Promise<GPUTexture | null> {
    if (this.hdrCache.has(relativePath)) return this.hdrCache.get(relativePath)!;
    if (!this.currentProjectDirectory) {
      Logger.warn(`UAssetManager: No project directory mounted. Cannot load HDR ${relativePath}`);
      return null;
    }

    try {
      // Navigate to Assets directory, create it if missing
      const assetsDir = await this.currentProjectDirectory.getDirectoryHandle('Assets', { create: true });
      const parts = relativePath.split(/[/\\]/);
      let currentDir = assetsDir;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '') continue;
        currentDir = await currentDir.getDirectoryHandle(part, { create: true });
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();

      const hdrData = RGBELoader.parse(buffer);

      const texture = device.createTexture({
        size: [hdrData.width, hdrData.height, 1],
        format: 'rgba32float', // Strict format for HDR data
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });

      device.queue.writeTexture(
        { texture },
        hdrData.data as any,
        { bytesPerRow: hdrData.width * 16, rowsPerImage: hdrData.height },
        [hdrData.width, hdrData.height, 1]
      );

      this.hdrCache.set(relativePath, texture);
      Logger.info(`UAssetManager: Loaded HDR environment: ${relativePath}`);
      return texture;
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        Logger.warn(`UAssetManager: HDR asset not found: ${relativePath}. Reflections will use fallback color.`);
      } else {
        Logger.error(`UAssetManager: Failed to load HDR: ${relativePath}`, e);
      }
      return null;
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
   * Synchronously retrieves a material from the cache if it exists. (Phase 57.1)
   */
  public getMaterial(relativePath: string): UMaterial | null {
    return this.materialCache.get(relativePath) || null;
  }

  /**
   * Updates a material currently in memory. This allows all actors using this material
   * to be updated instantly in the viewport.
   */
  public async applyMaterialDataToCache(path: string, data: any, device: GPUDevice): Promise<void> {
    let mat = this.materialCache.get(path);
    if (!mat) {
      // FIX (Phase 56): If material isn't in cache (e.g. brand new), create it
      // so we don't "forget" the edits made just before assigning it to an actor.
      const { UMaterial } = await import('../../Rendering/UMaterial');
      mat = new UMaterial(data.name || 'NewMaterial');
      this.materialCache.set(path, mat);
      Logger.info(`UAssetManager: Created new material in cache for ${path}`);
    }

    // Direct property update for real-time responsiveness
    if (data.baseColor) mat.baseColor = new Float32Array(data.baseColor);
    if (data.metallic !== undefined) mat.metallic = data.metallic;
    if (data.roughness !== undefined) mat.roughness = data.roughness;

    // Update texture paths (updateResources will handle the actual GPU loading)
    if (data.textures) {
      mat.albedoMapPath = data.textures.albedo || null;
      mat.normalMapPath = data.textures.normal || null;
      mat.roughnessMapPath = data.textures.roughness || null;
    }

    await mat.updateResources(device, this);
    Logger.info(`UAssetManager: Real-time update applied to ${path}`);
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

    // NOTA: No destruimos 'this.assets' (los primitivos) ya que son globales del motor
    // y deben existir a través de diferentes proyectos.
  }
}
