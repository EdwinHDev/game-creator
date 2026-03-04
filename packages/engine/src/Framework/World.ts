import { Logger } from '../Core/Logger';
import { AActor } from './AActor';
import { EventBus } from '../Core/EventBus';
import { UObject } from '../Core/UObject';

/**
 * Manages the collection of actors and the game state.
 */
export class World extends UObject {
  /**
   * All actors currently in the world.
   */
  public actors: AActor[] = [];

  /**
   * The ID of the currently selected actor (for editor selection).
   */
  public selectedActorId: string | null = null;

  private isBegunPlay: boolean = false;

  constructor(name: string = 'World') {
    super(name);
  }

  /**
   * Spawns a new actor into the world.
   * @param actorClass The class of the actor to spawn.
   * @param name The name of the new actor.
   * @param isEditorOnly Whether this actor is for the editor only.
   */
  public spawnActor<T extends AActor>(
    actorClass: new (name: string) => T,
    name: string = 'Actor',
    isEditorOnly: boolean = false
  ): T {
    const actor = new actorClass(name);
    actor.isEditorOnly = isEditorOnly;
    this.actors.push(actor);

    if (this.isBegunPlay) {
      actor.beginPlay();
    }

    // Notify the system that a new actor has been spawned (if it's not an editor-only actor)
    if (!actor.isEditorOnly) {
      EventBus.emit('OnActorSpawned', actor);
    }

    Logger.info(`Actor spawned: ${actor.name} (ID: ${actor.id})`);

    return actor;
  }

  /**
   * Removes an actor from the world and notifies the system.
   */
  public destroyActor(actor: AActor): void {
    const index = this.actors.indexOf(actor);
    if (index !== -1) {
      this.actors.splice(index, 1);

      // Notify the system that the actor has been destroyed
      EventBus.emit('OnActorDestroyed', actor);

      // Clean up actor resources
      actor.destroy();

      Logger.info(`Actor destroyed: ${actor.name} (ID: ${actor.id})`);
    }
  }

  /**
   * Initializes all actors in the world.
   */
  public beginPlay(): void {
    if (this.isBegunPlay) return;
    this.isBegunPlay = true;

    Logger.info("World BeginPlay started");
    for (const actor of this.actors) {
      actor.beginPlay();
    }
  }

  /**
   * Updates all actors in the world.
   */
  public tick(deltaTime: number): void {
    for (const actor of this.actors) {
      actor.tick(deltaTime);
    }
  }

  /**
   * Serializes the world and all its actors.
   */
  public serialize(): any {
    return {
      projectName: this.name,
      actors: this.actors.filter(a => !a.isEditorOnly).map(a => a.serialize())
    };
  }

  /**
   * Deserializes the world from JSON data.
   */
  public async deserialize(jsonData: any): Promise<void> {
    Logger.info("World Deserialization started");

    // Clear current world (excluding editor-only actors if any persistent ones exist)
    const actorsToDestroy = [...this.actors.filter(a => !a.isEditorOnly)];
    for (const actor of actorsToDestroy) {
      this.destroyActor(actor);
    }

    if (!jsonData.actors) return;

    for (const actorData of jsonData.actors) {
      // For Phase 1, we assume basic AActor class for all since we don't have a class registry yet
      const actor = this.spawnActor(AActor, actorData.name);
      await actor.deserialize(actorData);

      // Re-create mesh if it had mesh component data
      const meshData = actorData.components.find((c: any) => c.type === 'UMeshComponent');
      if (meshData) {
        // Note: Geometry creation (createBox etc) and device access 
        // will be handled by the Editor/ProjectSystem after calling this
        // to avoid passing GPUDevice deep into the Framework core if possible
      }
    }

    Logger.info(`World Deserialized: ${this.actors.length} actors loaded`);
  }
}
