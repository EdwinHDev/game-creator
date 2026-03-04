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
        data.materialPath = meshComp.materialPath;
        data.geometryType = meshComp.geometryType || 'none'; // <-- NUEVO: Guardamos la forma
      }

      // Special case for Directional Light persistence (Phase 52.1)
      if (comp.constructor.name === 'UDirectionalLightComponent') {
        const lightComp = comp as any;
        data.intensity = lightComp.intensity !== undefined ? lightComp.intensity : 5.0;
        data.color = lightComp.color ? Array.from(lightComp.color) : [1, 1, 1, 1];
        data.castShadows = lightComp.castShadows !== undefined ? lightComp.castShadows : true;
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
    this.components = []; // Clear for Phase 52 to avoid zombi objects

    // Import components dynamic to avoid circular dependencies if any
    const { UTransformComponent } = await import('../Components/UTransformComponent');
    const { UMeshComponent } = await import('../Components/UMeshComponent');
    const { UDirectionalLightComponent } = await import('../Components/UDirectionalLightComponent');

    for (const compData of data.components) {
      let comp: any = null;

      if (compData.type === 'UTransformComponent') comp = new UTransformComponent(this);
      else if (compData.type === 'UMeshComponent') comp = new UMeshComponent(this);
      else if (compData.type === 'UDirectionalLightComponent') comp = new UDirectionalLightComponent(this);

      if (comp) {
        Object.assign(comp, compData);
        this.components.push(comp);

        // Restore root component if it was the first one or specifically marked
        // In this engine, the first scene component usually becomes the root
        if (!this.rootComponent && comp instanceof USceneComponent) {
          this.rootComponent = comp;
        }
      }
    }
  }
}
