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

  // New AAA handles
  private uniformHandle: UMeshComponent;
  private xyHandle: UMeshComponent;
  private yzHandle: UMeshComponent;
  private zxHandle: UMeshComponent;

  public hoverAxis: number = 0;
  public activeAxis: number = 0;

  constructor() {
    super('TranslationGizmo');
    this.tags.push('EditorUtility', 'Gizmo');

    const stemScale = vec3.fromValues(0.015, 1.0, 0.015);
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

    // --- Uniform Scale Handle (Center) ---
    this.uniformHandle = this.addComponent(UMeshComponent, 'UniformScale');
    this.uniformHandle.setAsset(UAssetManager.getAsset(EPrimitiveType.BOX));
    this.uniformHandle.isGizmo = true;
    this.uniformHandle.pickingId = 7;
    this.uniformHandle.relativeScale = vec3.fromValues(0.05, 0.05, 0.05);
    this.uniformHandle.setupAttachment(dummyRoot);
    this.uniformHandle.bIsHidden = true; // Mode-specific

    // --- Planar Scale Handles ---
    const planeScale = vec3.fromValues(0.08, 0.08, 0.001);

    this.xyHandle = this.addComponent(UMeshComponent, 'XY_Scale');
    this.xyHandle.setAsset(UAssetManager.getAsset(EPrimitiveType.BOX));
    this.xyHandle.isGizmo = true;
    this.xyHandle.pickingId = 4;
    this.xyHandle.relativeScale = planeScale;
    this.xyHandle.relativeLocation = vec3.fromValues(40, 40, 0); // Positioned between X and Y
    this.xyHandle.setupAttachment(dummyRoot);
    this.xyHandle.bIsHidden = true;

    this.yzHandle = this.addComponent(UMeshComponent, 'YZ_Scale');
    this.yzHandle.setAsset(UAssetManager.getAsset(EPrimitiveType.BOX));
    this.yzHandle.isGizmo = true;
    this.yzHandle.pickingId = 5;
    this.yzHandle.relativeScale = planeScale;
    this.yzHandle.relativeLocation = vec3.fromValues(0, 40, 40);
    this.yzHandle.relativeRotation = quat.fromEuler(quat.create(), 0, 90, 0);
    this.yzHandle.setupAttachment(dummyRoot);
    this.yzHandle.bIsHidden = true;

    this.zxHandle = this.addComponent(UMeshComponent, 'ZX_Scale');
    this.zxHandle.setAsset(UAssetManager.getAsset(EPrimitiveType.BOX));
    this.zxHandle.isGizmo = true;
    this.zxHandle.pickingId = 6;
    this.zxHandle.relativeScale = planeScale;
    this.zxHandle.relativeLocation = vec3.fromValues(40, 0, 40);
    this.zxHandle.relativeRotation = quat.fromEuler(quat.create(), 90, 0, 0);
    this.zxHandle.setupAttachment(dummyRoot);
    this.zxHandle.bIsHidden = true;
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

  public setGizmoType(mode: 'translate' | 'scale' | 'rotate') {
    const isScale = mode === 'scale';
    const tipAsset = UAssetManager.getAsset(isScale ? EPrimitiveType.BOX : EPrimitiveType.CONE);

    // Scale mode uses cubes, translation uses cones
    this.xAxisTip.setAsset(tipAsset);
    this.yAxisTip.setAsset(tipAsset);
    this.zAxisTip.setAsset(tipAsset);

    // AAA proportions: refined stem thickness
    const stemScale = vec3.fromValues(0.015, 1.0, 0.015);
    this.xAxisStem.relativeScale = stemScale;
    this.yAxisStem.relativeScale = stemScale;
    this.zAxisStem.relativeScale = stemScale;

    // Adjust tip scale and position
    const tipScale = isScale ? vec3.fromValues(0.06, 0.06, 0.06) : vec3.fromValues(0.08, 0.2, 0.08);
    const tipOffset = isScale ? 100 : 105;

    this.xAxisTip.relativeScale = tipScale;
    this.xAxisTip.relativeLocation = vec3.fromValues(tipOffset, 0, 0);

    this.yAxisTip.relativeScale = tipScale;
    this.yAxisTip.relativeLocation = vec3.fromValues(0, tipOffset, 0);

    this.zAxisTip.relativeScale = tipScale;
    this.zAxisTip.relativeLocation = vec3.fromValues(0, 0, tipOffset);

    // Show/Hide advanced scale handles
    this.uniformHandle.bIsHidden = !isScale;
    this.xyHandle.bIsHidden = !isScale;
    this.yzHandle.bIsHidden = !isScale;
    this.zxHandle.bIsHidden = !isScale;

    // Apply colors to planar handles
    if (isScale) {
      if (this.xyHandle.material) this.xyHandle.material.baseColor = new Float32Array([0.2, 0.5, 1.0, 0.6]); // Blue-ish
      if (this.yzHandle.material) this.yzHandle.material.baseColor = new Float32Array([1.0, 0.2, 0.5, 0.6]); // Red-ish
      if (this.zxHandle.material) this.zxHandle.material.baseColor = new Float32Array([0.5, 1.0, 0.2, 0.6]); // Green-ish
      if (this.uniformHandle.material) this.uniformHandle.material.baseColor = new Float32Array([0.9, 0.9, 0.9, 0.8]); // White
    }
  }
}
