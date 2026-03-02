import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';

/**
 * Base class for all light components.
 */
export class ULightComponent extends USceneComponent {
  /**
   * The color of the light (RGB).
   */
  public color: Float32Array = new Float32Array([1.0, 1.0, 1.0]);

  /**
   * The brightness of the light.
   */
  public intensity: number = 1.0;

  /**
   * Whether this light should cast shadows.
   */
  public castShadows: boolean = true;

  constructor(owner: AActor, name: string = 'LightComponent') {
    super(owner, name);
  }
}
