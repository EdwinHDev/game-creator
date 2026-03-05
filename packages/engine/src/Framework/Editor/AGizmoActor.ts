import { AActor } from '../AActor';
import { UMeshComponent } from '../../Components/UMeshComponent';
import { USceneComponent } from '../USceneComponent';
import { vec3, quat, mat4 } from 'gl-matrix';
import { UAssetManager, EPrimitiveType } from '../../Core/Resources/UAssetManager';

export class AGizmoActor extends AActor {
  private xAxisStem: UMeshComponent;
  private xAxisTip: UMeshComponent;
  private yAxisStem: UMeshComponent;
  private yAxisTip: UMeshComponent;
  private zAxisStem: UMeshComponent;
  private zAxisTip: UMeshComponent;

  public hoverAxis: number = 0;
  public activeAxis: number = 0;

  constructor() {
    super('TranslationGizmo');
    this.tags.push('EditorUtility', 'Gizmo');

    const stemScale = vec3.fromValues(0.01, 1.0, 0.01);
    const tipScale = vec3.fromValues(0.08, 0.2, 0.08);

    // --- Axis X (Red) ---
    this.xAxisStem = this.addComponent(UMeshComponent, 'X_Stem');
    this.xAxisStem.setAsset(UAssetManager.getAsset(EPrimitiveType.CYLINDER));
    this.xAxisStem.isGizmo = true;
    this.xAxisStem.pickingId = 1;
    this.xAxisStem.relativeScale = stemScale;
    this.xAxisStem.relativeRotation = quat.fromEuler(quat.create(), 0, 0, -90);
    this.xAxisStem.relativeLocation = vec3.fromValues(50, 0, 0);

    this.xAxisTip = this.addComponent(UMeshComponent, 'X_Tip');
    this.xAxisTip.setAsset(UAssetManager.getAsset(EPrimitiveType.CONE));
    this.xAxisTip.isGizmo = true;
    this.xAxisTip.pickingId = 1;
    this.xAxisTip.relativeScale = tipScale;
    this.xAxisTip.relativeRotation = quat.fromEuler(quat.create(), 0, 0, -90);
    this.xAxisTip.relativeLocation = vec3.fromValues(105, 0, 0);

    // --- Axis Y (Green) ---
    this.yAxisStem = this.addComponent(UMeshComponent, 'Y_Stem');
    this.yAxisStem.setAsset(UAssetManager.getAsset(EPrimitiveType.CYLINDER));
    this.yAxisStem.isGizmo = true;
    this.yAxisStem.pickingId = 2;
    this.yAxisStem.relativeScale = stemScale;
    this.yAxisStem.relativeLocation = vec3.fromValues(0, 50, 0);

    this.yAxisTip = this.addComponent(UMeshComponent, 'Y_Tip');
    this.yAxisTip.setAsset(UAssetManager.getAsset(EPrimitiveType.CONE));
    this.yAxisTip.isGizmo = true;
    this.yAxisTip.pickingId = 2;
    this.yAxisTip.relativeScale = tipScale;
    this.yAxisTip.relativeLocation = vec3.fromValues(0, 105, 0);

    // --- Axis Z (Blue) ---
    this.zAxisStem = this.addComponent(UMeshComponent, 'Z_Stem');
    this.zAxisStem.setAsset(UAssetManager.getAsset(EPrimitiveType.CYLINDER));
    this.zAxisStem.isGizmo = true;
    this.zAxisStem.pickingId = 3;
    this.zAxisStem.relativeScale = stemScale;
    this.zAxisStem.relativeRotation = quat.fromEuler(quat.create(), 90, 0, 0);
    this.zAxisStem.relativeLocation = vec3.fromValues(0, 0, 50);

    this.zAxisTip = this.addComponent(UMeshComponent, 'Z_Tip');
    this.zAxisTip.setAsset(UAssetManager.getAsset(EPrimitiveType.CONE));
    this.zAxisTip.isGizmo = true;
    this.zAxisTip.pickingId = 3;
    this.zAxisTip.relativeScale = tipScale;
    this.zAxisTip.relativeRotation = quat.fromEuler(quat.create(), 90, 0, 0);
    this.zAxisTip.relativeLocation = vec3.fromValues(0, 0, 105);

    // Set root if not set
    this.rootComponent = this.yAxisStem; // arbitrary, or create a dummy root

    // Create a dummy root for better organization
    const dummyRoot = this.addComponent(USceneComponent, 'GizmoRoot');
    this.rootComponent = dummyRoot;

    // Re-attach axes to dummy root
    this.xAxisStem.setupAttachment(dummyRoot);
    this.xAxisTip.setupAttachment(dummyRoot);
    this.yAxisStem.setupAttachment(dummyRoot);
    this.yAxisTip.setupAttachment(dummyRoot);
    this.zAxisStem.setupAttachment(dummyRoot);
    this.zAxisTip.setupAttachment(dummyRoot);
  }

  public updateGizmoScale(cameraPosition: vec3, cameraFOV: number = 45) {
    if (!this.rootComponent) return;

    const gizmoPosition = vec3.create();
    mat4.getTranslation(gizmoPosition, this.rootComponent.getWorldMatrix());

    const distance = vec3.distance(cameraPosition, gizmoPosition);

    // Factor de escala basado en distancia para mantener tamaño constante en píxeles
    const scaleFactor = (distance * Math.tan(cameraFOV * 0.5 * (Math.PI / 180))) * 0.005;

    this.rootComponent.relativeScale = vec3.fromValues(scaleFactor, scaleFactor, scaleFactor);
    this.rootComponent.updateWorldMatrix();
  }
}
