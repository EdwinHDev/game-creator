import { vec3, quat } from 'gl-matrix';
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
  public shadowDistance: number = 5000.0; // 50 metros en UU (spec: LIGHTING_ARCHITECTURE.md §3.A)
  public shadowBias: number = 0.005;

  constructor(owner: AActor, name: string = 'DirectionalLight') {
    super(owner, name);
    // Inicialización robusta para evitar NaNs
    this.relativeLocation = vec3.create();
    this.relativeRotation = quat.create(); // Ensure relativeRotation is initialized as a quat
    this.relativeScale = vec3.fromValues(1, 1, 1);

    // Restaurar rotación inicial a -45 grados Euler en X
    const eulerRotation = vec3.fromValues(-45, 0, 0);
    quat.fromEuler(this.relativeRotation, eulerRotation[0], eulerRotation[1], eulerRotation[2]);
  }

  // La dirección se extrae del WorldMatrix del componente en el Renderer
}
