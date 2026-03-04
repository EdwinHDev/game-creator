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

  /**
   * If true, this actor is currently selected in the editor.
   */
  public isSelected: boolean = false;

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
   * Finds the first component of the given class.
   * @param componentClass The class to search for.
   * @returns The component if found, otherwise null.
   */
  public getComponent<T extends UActorComponent>(
    componentClass: new (...args: any[]) => T
  ): T | null {
    if (typeof componentClass !== 'function') {
      console.warn(`[Engine] getComponent called with an invalid type on actor ${this.name}.`);
      return null;
    }
    for (const component of this.components) {
      if (component instanceof componentClass) {
        return component as T;
      }
    }
    return null;
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

  /**
   * Serializes the actor and its components.
   */
  public serialize(): any {
    const serializedComponents = this.components.map(comp => {
      const data: any = {
        type: comp.constructor.name,
        name: comp.name
      };

      if (comp instanceof USceneComponent) {
        Object.assign(data, comp.serialize());
      }

      // Special case for MeshComponent to include material/mesh info
      if (comp.constructor.name === 'UMeshComponent') {
        const meshComp = comp as any;
        data.material = {
          assetPath: meshComp.material?.assetPath,
          baseColor: meshComp.material ? Array.from(meshComp.material.baseColor) : null
        };
      }

      return data;
    });

    return {
      name: this.name,
      components: serializedComponents
    };
  }

  /**
   * Deserializes the actor and its components.
   */
  public async deserialize(data: any): Promise<void> {
    this.name = data.name;

    // Components are often created in the constructor or manually added.
    // For Phase 1, we assume the components are already there or need to be recreated.
    // A more robust system would handle component mapping.
    for (const compData of data.components) {
      let component = this.components.find(c => c.constructor.name === compData.type && c.name === compData.name);

      if (component instanceof USceneComponent) {
        component.deserialize(compData);
      }

      // Handle mesh specifics if needed (like re-creating geometry)
      if (compData.type === 'UMeshComponent' && component) {
        const meshComp = component as any;
        if (compData.material && meshComp.material) {
          if (compData.material.baseColor) {
            meshComp.material.baseColor.set(compData.material.baseColor);
          }
          // Texture loading would happen via ProjectSystem helper usually
        }
      }
    }
  }
}
