import { UActorComponent } from '../Framework/UActorComponent';

/**
 * Component responsible for managing and providing environment lighting (IBL).
 */
export class USkyLightComponent extends UActorComponent {
  public intensity: number = 1.0;
  public hdrPath: string | null = null;
  public envTexture: GPUTexture | null = null;
  public envView: GPUTextureView | null = null;

  /**
   * Prepares the component for loading an HDR texture.
   * Actual loading logic will be integrated with RGBELoader in future steps.
   */
  public async loadHDR(path: string, device: GPUDevice) {
    this.hdrPath = path;
    console.log(`[USkyLightComponent] Preparado para cargar: ${path}`);
  }
}
