import { UObject } from '../Core/UObject';
import { UActorComponent } from './UActorComponent';
import { USceneComponent } from './USceneComponent';

/**
 * Base class for an Object that can be placed or spawned in a level.
 * Actors can contain a collection of ActorComponents.
 */
export class AActor extends UObject {
  /**
   * The main scene component that defines the transform of this actor.
   */
  public rootComponent: USceneComponent | null = null;

  /**
   * List of all components owned by this actor.
   */
  public components: UActorComponent[] = [];

  /**
   * If true, this actor won't be visible in the editor's Outliner.
   */
  public isEditorOnly: boolean = false;

  constructor(name: string = 'Actor') {
    super(name);
  }

  /**
   * Creates and adds a new component to this actor.
   * @param componentClass The class of the component to create.
   * @returns The newly created component.
   */
  public addComponent<T extends UActorComponent>(
    componentClass: new (owner: AActor, name?: string) => T,
    name?: string
  ): T {
    const component = new componentClass(this, name);
    this.components.push(component);
    return component;
  }

  /**
   * Called when the game starts for this actor.
   */
  public beginPlay(): void {
    for (const component of this.components) {
      component.beginPlay();
    }
  }

  /**
   * Called every frame.
   */
  public tick(deltaTime: number): void {
    for (const component of this.components) {
      component.tick(deltaTime);
    }
  }

  /**
   * Destroys the actor and all its components.
   */
  public destroy(): void {
    for (const component of this.components) {
      component.destroy();
    }
    this.components = [];
    this.rootComponent = null;
  }
}
