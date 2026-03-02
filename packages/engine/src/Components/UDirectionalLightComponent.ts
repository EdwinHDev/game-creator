import { ULightComponent } from './ULightComponent';
import { AActor } from '../Framework/AActor';
import { vec3 } from 'gl-matrix';

/**
 * A light that illuminates the world from a specific direction.
 * Similar to the sun.
 */
export class UDirectionalLightComponent extends ULightComponent {
  constructor(owner: AActor, name: string = 'DirectionalLightComponent') {
    super(owner, name);
  }

  /**
   * Returns the forward direction of the light based on its rotation.
   */
  public getForwardVector(): vec3 {
    const forward = vec3.fromValues(0, 0, -1);
    vec3.transformQuat(forward, forward, this.relativeRotation);
    return forward;
  }
}
