import { UObject } from '../Core/UObject';
import { AActor } from './AActor';

/**
 * Base class for all Actor Components.
 * Components are modular bits of functionality that can be added to Actors.
 */
export class UActorComponent extends UObject {
  /**
   * The actor that owns this component.
   */
  public readonly owner: AActor;

  constructor(owner: AActor, name: string = 'ActorComponent') {
    super(name);
    this.owner = owner;
  }

  /**
   * Called when the game starts or when component is spawned.
   */
  public beginPlay(): void {
    // Virtual
  }

  /**
   * Called every frame.
   * @param deltaTime Time elapsed since last frame in seconds.
   */
  public tick(_deltaTime: number): void {
    // Virtual
  }

  /**
   * Called when the component is being destroyed.
   */
  public destroy(): void {
    // Virtual
  }
}
