import { UObject } from '../Core/UObject';
import { AActor } from './AActor';
import { Logger } from '../Core/Logger';

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

    Logger.info(`Actor spawned: ${name} (ID: ${actor.id})`);
    return actor;
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
