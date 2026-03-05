import { UAsset } from "../Resources/UAsset";
import { World } from "../../Framework/World";
import { AActor } from "../../Framework/AActor";
import { UMeshComponent } from "../../Components/UMeshComponent";

export class UActorFactory {
  /**
   * Spawns an actor populated with the components corresponding to the UAsset type.
   */
  public static spawnFromAsset(asset: UAsset, world: World): AActor {
    const actorName = `Actor_${asset.name.replace('Primitive_', '')}`;
    const actor = world.spawnActor(AActor, actorName);

    const meshComp = actor.addComponent(UMeshComponent, 'StaticMeshComponent');
    meshComp.setAsset(asset);

    if (!actor.rootComponent) {
      actor.rootComponent = meshComp;
    }

    return actor;
  }
}
