import { USceneComponent } from '../Framework/USceneComponent';

/**
 * A light that illuminates the world from a specific direction.
 * Similar to the sun.
 */
export class UDirectionalLightComponent extends USceneComponent {
  public color: Float32Array = new Float32Array([1, 1, 1]);
  public intensity: number = 1.0;
  public castShadows: boolean = true;
  public bUsedAsAtmosphereSunLight: boolean = true;

  // La dirección se extrae del WorldMatrix del componente en el Renderer
}
