import { UAsset } from "../Resources/UAsset";
import { World } from "../../Framework/World";
import { AActor } from "../../Framework/AActor";
import { UMeshComponent } from "../../Components/UMeshComponent";

export class UActorFactory {
  /**
   * Spawns an actor populated with the components corresponding to the UAsset type.
   */
  public static spawnFromAsset(asset: UAsset, world: World): AActor {
    const actor = world.spawnActor(AActor, `Actor_${asset.name}`);

    if (asset.type === 'StaticMesh') {
      const meshComp = actor.addComponent(UMeshComponent, 'StaticMeshComponent');
      meshComp.setAsset(asset);
      actor.rootComponent = meshComp;
    }

    return actor;
  }
}
