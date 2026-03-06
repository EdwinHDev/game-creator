import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';

/**
 * Component responsible for managing and providing environment lighting (IBL).
 */
export class USkyLightComponent extends USceneComponent {
  public intensity: number = 1.0;
  public hdrPath: string | null = null;
  public envTexture: GPUTexture | null = null;
  public envView: GPUTextureView | null = null;

  constructor(owner: AActor, name: string = 'SkyLightComponent') {
    super(owner, name);
  }

  /**
   * Prepares the component for loading an HDR texture.
   * Actual loading logic will be integrated with RGBELoader in future steps.
   */
  public async loadHDR(path: string, _device: GPUDevice) {
    this.hdrPath = path;
    console.log(`[USkyLightComponent] Preparado para cargar: ${path}`);
  }
}
