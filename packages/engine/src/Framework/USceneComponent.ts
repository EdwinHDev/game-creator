import { vec3, quat, mat4 } from 'gl-matrix';
import { UActorComponent } from './UActorComponent';
import { AActor } from './AActor';

/**
 * A component that has a transform and supports attachment.
 */
export class USceneComponent extends UActorComponent {
  /**
   * Location relative to the parent.
   */
  public relativeLocation: vec3;

  /**
   * Rotation relative to the parent.
   */
  public relativeRotation: quat;

  /**
   * Scale relative to the parent.
   */
  public relativeScale: vec3;

  public parent: USceneComponent | null = null;
  public children: USceneComponent[] = [];

  constructor(owner: AActor, name: string = 'SceneComponent') {
    super(owner, name);

    this.relativeLocation = vec3.fromValues(0, 0, 0);
    this.relativeRotation = quat.create(); // Identity
    this.relativeScale = vec3.fromValues(1, 1, 1);
  }

  /**
   * Attaches this component to another scene component.
   */
  public setupAttachment(newParent: USceneComponent): void {
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index !== -1) {
        this.parent.children.splice(index, 1);
      }
    }

    this.parent = newParent;
    if (this.parent) {
      this.parent.children.push(this);
    }
  }

  /**
   * Calculates and returns the local transformation matrix of this component.
   */
  public getTransformMatrix(): mat4 {
    const matrix = mat4.create();
    mat4.fromRotationTranslationScale(
      matrix,
      this.relativeRotation,
      this.relativeLocation,
      this.relativeScale
    );
    return matrix;
  }
}
