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

  /**
   * Visibility flag. If true, this component and its children (if using this flag) won't be rendered.
   */
  public bIsHidden: boolean = false;

  public parent: USceneComponent | null = null;
  public children: USceneComponent[] = [];

  protected localMatrix: mat4 = mat4.create();
  protected worldMatrix: mat4 = mat4.create();

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
   * Updates the world matrix of this component and its children recursively.
   */
  public updateWorldMatrix(parentWorldMatrix?: mat4): void {
    // 1. Calcular matriz local a partir de pos/rot/esc
    mat4.fromRotationTranslationScale(
      this.localMatrix,
      this.relativeRotation,
      this.relativeLocation,
      this.relativeScale
    );

    // 2. Si tiene padre, multiplicar: World = ParentWorld * Local
    if (parentWorldMatrix) {
      mat4.multiply(this.worldMatrix, parentWorldMatrix, this.localMatrix);
    } else {
      mat4.copy(this.worldMatrix, this.localMatrix);
    }

    // 3. Propagar a los hijos (recursividad profesional)
    for (const child of this.children) {
      child.updateWorldMatrix(this.worldMatrix);
    }
  }

  /**
   * Returns the cached world transformation matrix.
   */
  public getWorldMatrix(): mat4 {
    return this.worldMatrix;
  }

  /**
   * Calculates and returns the local transformation matrix of this component.
   * Legacy method for compatibility.
   */
  public getTransformMatrix(): mat4 {
    return this.localMatrix;
  }

  /**
   * Serializes the component's transform data.
   */
  public serialize(): any {
    return {
      name: this.name,
      relativeLocation: Array.from(this.relativeLocation),
      relativeRotation: Array.from(this.relativeRotation),
      relativeScale: Array.from(this.relativeScale)
    };
  }

  /**
   * Deserializes the component's transform data.
   */
  public deserialize(data: any): void {
    if (data.relativeLocation) vec3.copy(this.relativeLocation, new Float32Array(data.relativeLocation));
    if (data.relativeRotation) quat.copy(this.relativeRotation, new Float32Array(data.relativeRotation));
    if (data.relativeScale) vec3.copy(this.relativeScale, new Float32Array(data.relativeScale));
  }
}
