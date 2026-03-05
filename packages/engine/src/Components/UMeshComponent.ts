import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';
import { UMaterial } from '../Rendering/UMaterial';
import { UAsset } from '../Core/Resources/UAsset';
import { UAssetManager } from '../Core/Resources/UAssetManager';
import { Logger } from '../Core/Logger';

/**
 * A component that represents a 3D mesh.
 */
export class UMeshComponent extends USceneComponent {
  private _asset: UAsset | null = null;
  public assetId: string = 'Primitive_Cube';
  public topology: GPUPrimitiveTopology = 'triangle-list';
  public isGizmo: boolean = false;
  public material: UMaterial | null = null;
  public materialPath: string | null = null;

  public get vertexBuffer(): GPUBuffer | null { return this._asset?.vertexBuffer || null; }
  public get indexBuffer(): GPUBuffer | null { return this._asset?.indexBuffer || null; }
  public get indexCount(): number { return this._asset?.indexCount || 0; }
  public get vertexCount(): number { return this._asset ? 0 : 0; } // Legacy, mostly unused now for indexed
  public get asset(): UAsset | null { return this._asset; }

  constructor(owner: AActor, name: string = 'MeshComponent') {
    super(owner, name);
  }

  /**
   * Called when the component is created or loaded.
   */
  public async initialize(device: GPUDevice): Promise<void> {
    // Initial primitive setup
    this.setPrimitive(this.assetId);

    if (!this.material) {
      this.material = new UMaterial();
    }
    if (this.materialPath) {
      const mat = await UAssetManager.getInstance().loadMaterial(this.materialPath, device);
      if (mat) this.material = mat;
    }
  }

  /**
   * Sets the primitive asset for this component.
   */
  public setPrimitive(type: string): void {
    this.assetId = type;
    this._asset = UAssetManager.getAsset(type) || null;

    if (!this._asset) {
      Logger.error(`[UMeshComponent] No se encontró el asset: ${type}`);
    } else {
      this.topology = 'triangle-list';
    }
  }

  /**
   * Called every frame.
   */
  public override tick(deltaTime: number): void {
    super.tick(deltaTime);
  }

  /**
   * Serializes the component's data.
   */
  public override serialize(): any {
    const data = super.serialize();
    return {
      ...data,
      materialPath: this.materialPath,
      assetId: this.assetId
    };
  }

  /**
   * Deserializes the component's data.
   */
  public override async deserialize(data: any): Promise<void> {
    await super.deserialize(data);
    if (data.materialPath) {
      this.materialPath = data.materialPath;
    }
    if (data.assetId || data.geometryType) {
      this.assetId = data.assetId || data.geometryType;
      // Convert legacy names if necessary
      if (this.assetId === 'box') this.assetId = 'Primitive_Cube';
      if (this.assetId === 'plane') this.assetId = 'Primitive_Plane';
      if (this.assetId === 'sphere') this.assetId = 'Primitive_Sphere';
      if (this.assetId === 'cylinder') this.assetId = 'Primitive_Cylinder';
      if (this.assetId === 'cone') this.assetId = 'Primitive_Cone';
      if (this.assetId === 'capsule') this.assetId = 'Primitive_Capsule';
    }
  }

  /**
   * Cleans up GPU resources.
   */
  public override destroy(): void {
    super.destroy();
    // UMeshComponent no longer owns the buffers, they are managed by UAssetManager
    this._asset = null;
  }
}
