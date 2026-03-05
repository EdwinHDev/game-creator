import { AActor } from '../AActor';
import { UMeshComponent } from '../../Components/UMeshComponent';
import { USceneComponent } from '../USceneComponent';
import { vec3, quat, mat4 } from 'gl-matrix';

export class AGizmoActor extends AActor {
  private xAxisStem: UMeshComponent;
  private xAxisTip: UMeshComponent;
  private yAxisStem: UMeshComponent;
  private yAxisTip: UMeshComponent;
  private zAxisStem: UMeshComponent;
  private zAxisTip: UMeshComponent;

  constructor() {
    super('TranslationGizmo');
    this.tags.push('EditorUtility', 'Gizmo');

    const stemScale = vec3.fromValues(0.05, 1.0, 0.05);
    const tipScale = vec3.fromValues(0.2, 0.2, 0.2);

    // --- Axis X (Red) ---
    this.xAxisStem = this.addComponent(UMeshComponent, 'X_Stem');
    this.xAxisStem.setPrimitive('Primitive_Cylinder');
    this.xAxisStem.isGizmo = true;
    this.xAxisStem.pickingId = 1;
    this.xAxisStem.relativeScale = stemScale;
    this.xAxisStem.relativeRotation = quat.fromEuler(quat.create(), 0, 0, -90);
    this.xAxisStem.relativeLocation = vec3.fromValues(0.5, 0, 0);

    this.xAxisTip = this.addComponent(UMeshComponent, 'X_Tip');
    this.xAxisTip.setPrimitive('Primitive_Cone');
    this.xAxisTip.isGizmo = true;
    this.xAxisTip.pickingId = 1;
    this.xAxisTip.relativeScale = tipScale;
    this.xAxisTip.relativeRotation = quat.fromEuler(quat.create(), 0, 0, -90);
    this.xAxisTip.relativeLocation = vec3.fromValues(1.0, 0, 0);

    // --- Axis Y (Green) ---
    this.yAxisStem = this.addComponent(UMeshComponent, 'Y_Stem');
    this.yAxisStem.setPrimitive('Primitive_Cylinder');
    this.yAxisStem.isGizmo = true;
    this.yAxisStem.pickingId = 2;
    this.yAxisStem.relativeScale = stemScale;
    this.yAxisStem.relativeLocation = vec3.fromValues(0, 0.5, 0);

    this.yAxisTip = this.addComponent(UMeshComponent, 'Y_Tip');
    this.yAxisTip.setPrimitive('Primitive_Cone');
    this.yAxisTip.isGizmo = true;
    this.yAxisTip.pickingId = 2;
    this.yAxisTip.relativeScale = tipScale;
    this.yAxisTip.relativeLocation = vec3.fromValues(0, 1.0, 0);

    // --- Axis Z (Blue) ---
    this.zAxisStem = this.addComponent(UMeshComponent, 'Z_Stem');
    this.zAxisStem.setPrimitive('Primitive_Cylinder');
    this.zAxisStem.isGizmo = true;
    this.zAxisStem.pickingId = 3;
    this.zAxisStem.relativeScale = stemScale;
    this.zAxisStem.relativeRotation = quat.fromEuler(quat.create(), 90, 0, 0);
    this.zAxisStem.relativeLocation = vec3.fromValues(0, 0, 0.5);

    this.zAxisTip = this.addComponent(UMeshComponent, 'Z_Tip');
    this.zAxisTip.setPrimitive('Primitive_Cone');
    this.zAxisTip.isGizmo = true;
    this.zAxisTip.pickingId = 3;
    this.zAxisTip.relativeScale = tipScale;
    this.zAxisTip.relativeRotation = quat.fromEuler(quat.create(), 90, 0, 0);
    this.zAxisTip.relativeLocation = vec3.fromValues(0, 0, 1.0);

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
    const scaleFactor = (distance * Math.tan(cameraFOV * 0.5 * (Math.PI / 180))) * 0.15;

    this.rootComponent.relativeScale = vec3.fromValues(scaleFactor, scaleFactor, scaleFactor);
    this.rootComponent.updateWorldMatrix();
  }
}
