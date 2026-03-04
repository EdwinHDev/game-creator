import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';

/**
 * A component that solely represents a transform in the scene.
 * Usually used as a root component for actors that don't have a mesh (like lights or empty folders).
 */
export class UTransformComponent extends USceneComponent {
  constructor(owner: AActor, name: string = 'TransformComponent') {
    super(owner, name);
  }
}
