import { UObject } from '../Core/UObject';
import { UAssetManager } from '../Core/Resources/UAssetManager';

/**
 * Represents a material that can be applied to a mesh.
 * Currently supports a basic RGBA base color.
 */
export class UMaterial extends UObject {
  /**
   * Triggers a rebuild of the associated internal GPU BindGroup.
   */
  public isDirty: boolean = true;

  /**
   * The base color of the material (RGBA).
   * Values are normalized (0.0 to 1.0).
   */
  public baseColor: Float32Array = new Float32Array([1.0, 1.0, 1.0, 1.0]);

  /**
   * Surface roughness (0.0 = smooth, 1.0 = rough).
   */
  public roughness: number = 0.5;

  /**
   * Metalness (0.0 = dielectric, 1.0 = metallic).
   */
  public metallic: number = 0.0;

  /**
   * PBR Texture Maps (Phase 33)
   */
  public baseColorTexture: GPUTexture | null = null;
  public roughnessTexture: GPUTexture | null = null;
  public normalTexture: GPUTexture | null = null;

  /**
   * Relative paths to the texture assets (Material Phase 1).
   */
  public albedoMapPath: string | null = null;
  public normalMapPath: string | null = null;
  public roughnessMapPath: string | null = null;

  constructor(name: string = 'NewMaterial') {
    super(name);
  }

  /**
   * Serializes the material data to a JSON-compatible object.
   */
  public serialize(): any {
    return {
      name: this.name,
      baseColor: Array.from(this.baseColor),
      roughness: this.roughness,
      metallic: this.metallic,
      albedoMapPath: this.albedoMapPath,
      normalMapPath: this.normalMapPath,
      roughnessMapPath: this.roughnessMapPath
    };
  }

  /**
   * Deserializes the material data from a JSON object.
   */
  public deserialize(data: any): void {
    if (data.name) this.name = data.name;
    if (data.baseColor) this.baseColor = new Float32Array(data.baseColor);
    if (data.roughness !== undefined) this.roughness = data.roughness;
    if (data.metallic !== undefined) this.metallic = data.metallic;
    if (data.albedoMapPath !== undefined) this.albedoMapPath = data.albedoMapPath;
    if (data.normalMapPath !== undefined) this.normalMapPath = data.normalMapPath;
    if (data.roughnessMapPath !== undefined) this.roughnessMapPath = data.roughnessMapPath;
    this.isDirty = true;
  }

  /**
   * Updates GPU texture resources using the provided Asset Manager.
   */
  public async updateResources(device: GPUDevice, assetManager: UAssetManager): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.albedoMapPath) {
      promises.push(assetManager.getTexture(this.albedoMapPath, device).then(tex => {
        if (tex) this.baseColorTexture = tex;
      }));
    }

    if (this.normalMapPath) {
      promises.push(assetManager.getTexture(this.normalMapPath, device).then(tex => {
        if (tex) this.normalTexture = tex;
      }));
    }

    if (this.roughnessMapPath) {
      promises.push(assetManager.getTexture(this.roughnessMapPath, device).then(tex => {
        if (tex) this.roughnessTexture = tex;
      }));
    }

    await Promise.all(promises);
    this.isDirty = true;
  }
}
