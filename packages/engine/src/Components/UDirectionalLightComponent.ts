import { quat, vec3 } from 'gl-matrix';
import { AActor } from '../Framework/AActor';
import { USceneComponent } from '../Framework/USceneComponent';

/**
 * A light that illuminates the world from a specific direction.
 * Similar to the sun.
 */
export class UDirectionalLightComponent extends USceneComponent {
  public lightColor: vec3 = vec3.fromValues(1.0, 0.95, 0.8);
  public intensity: number = 10.0;
  public bUsedAsAtmosphereSunLight: boolean = true;
  public castShadows: boolean = true;

  constructor(owner: AActor, name: string = 'DirectionalLight') {
    super(owner, name);
    // Inicialización explícita para evitar NaNs
    this.relativeLocation = vec3.create();
    this.relativeRotation = quat.create();
    this.relativeScale = vec3.fromValues(1.0, 1.0, 1.0);

    // Inclinación inicial para el sol (e.g. -45 grados)
    quat.fromEuler(this.relativeRotation, -45, 0, 0);
  }

  // La dirección se extrae del WorldMatrix del componente en el Renderer
}
