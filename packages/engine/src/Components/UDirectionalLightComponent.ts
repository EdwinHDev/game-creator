import { UActorComponent } from '../Framework/UActorComponent';

/**
 * A light that illuminates the world from a specific direction.
 * Similar to the sun.
 */
export class UDirectionalLightComponent extends UActorComponent {
  public color: number[] = [1, 1, 1];
  public intensity: number = 1.0;
  public castShadows: boolean = true;

  // La dirección se extrae del WorldMatrix del componente en el Renderer
}
