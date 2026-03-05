import { mat4 } from 'gl-matrix';
import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';

/**
 * A component that defines a perspective camera.
 */
export class UCameraComponent extends USceneComponent {
  /**
   * Field of view in radians.
   */
  public fov: number = (45 * Math.PI) / 180;

  /**
   * Near clipping plane.
   */
  public near: number = 10.0;

  /**
   * Far clipping plane.
   */
  public far: number = 200000.0;

  constructor(owner: AActor, name: string = 'CameraComponent') {
    super(owner, name);
  }

  /**
   * Calculates the view matrix (inverse of world transform).
   */
  public getViewMatrix(): mat4 {
    const viewMatrix = mat4.create();

    // For now, we use the local transform. 
    // In a full implementation, we'd multiply by parent transforms to get world space.
    mat4.fromRotationTranslationScale(
      viewMatrix,
      this.relativeRotation,
      this.relativeLocation,
      this.relativeScale
    );

    // View matrix is the inverse of the camera's world transform
    mat4.invert(viewMatrix, viewMatrix);

    return viewMatrix;
  }

  /**
   * Calculates the perspective projection matrix.
   */
  public getProjectionMatrix(aspectRatio: number): mat4 {
    const projectionMatrix = mat4.create();
    mat4.perspective(
      projectionMatrix,
      this.fov,
      aspectRatio,
      this.near,
      this.far
    );
    return projectionMatrix;
  }
}
