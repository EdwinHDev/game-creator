import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';
import { vec3 } from 'gl-matrix';

export enum ESkyLightSourceType {
  CapturedScene,   // Uses procedural atmosphere
  SpecifiedCubemap  // Uses HDR/HDRI file
}

/**
 * Component responsible for managing and providing environment lighting (IBL).
 */
export class USkyLightComponent extends USceneComponent {
  public sourceType: ESkyLightSourceType = ESkyLightSourceType.CapturedScene;
  public intensity: number = 1.0;
  public lightColor: vec3 = vec3.fromValues(1, 1, 1);
  public cubemapAssetId: string | null = null; // For HDRI mode

  public envTexture: GPUTexture | null = null;
  public envView: GPUTextureView | null = null;

  constructor(owner: AActor, name: string = 'SkyLightComponent') {
    super(owner, name);
  }
}
