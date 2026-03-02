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

  private isBegunPlay: boolean = false;

  constructor(name: string = 'World') {
    super(name);
  }

  /**
   * Spawns a new actor into the world.
   * @param actorClass The class of the actor to spawn.
   * @param name The name of the new actor.
   */
  public spawnActor<T extends AActor>(
    actorClass: new (name: string) => T,
    name: string = 'Actor'
  ): T {
    const actor = new actorClass(name);
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
}
