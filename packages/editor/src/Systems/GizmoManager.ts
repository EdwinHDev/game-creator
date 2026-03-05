import {
  EventBus, AActor, quat, vec3, mat4, World, Engine,
  getRayFromCamera, intersectRayPlane, UMeshComponent, UDirectionalLightComponent,
  UCameraComponent
} from '@game-creator/engine';

/**
 * GizmoManager handles all logic for transformation gizmos (Translate, Rotate, Scale).
 * It manages gizmo actors, hit detection, and application of transformation deltas.
 */
export class GizmoManager {
  private _world: World | null = null;
  private _selectedActor: AActor | null = null;

  // Transform Gizmos (Volumetric)
  private gizmoX: AActor | null = null;
  private gizmoY: AActor | null = null;
  private gizmoZ: AActor | null = null;

  // Arrow Heads / Scale Tips
  private arrowHeadX: AActor | null = null;
  private arrowHeadY: AActor | null = null;
  private arrowHeadZ: AActor | null = null;
  private lightDirectionGizmo: AActor | null = null;
  private lightDirectionTip: AActor | null = null;

  private currentTransformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private transformSpace: 'global' | 'local' = 'global';

  // Interaction State
  private isDraggingGizmo: boolean = false;
  private dragAxis: 'X' | 'Y' | 'Z' | null = null;
  private dragStartActorPos: vec3 = vec3.create();
  private dragStartActorScale: vec3 = vec3.create();
  private dragStartActorRotation: quat = quat.create();
  private dragStartMouseHit: vec3 = vec3.create();
  private dragStartVector: vec3 = vec3.create();

  // Phase 20.3: Solar Handle
  private isDraggingSolarHandle: boolean = false;

  constructor() {
    // Listen for engine ticks to update gizmo positions/sizes
    EventBus.on('EngineTick', this.update.bind(this));

    // Listen for global transform changes
    EventBus.on('OnTransformModeChanged', (mode: any) => {
      this.currentTransformMode = mode;
      this.rebuildGizmos();
    });

    EventBus.on('OnTransformSpaceChanged', (space: any) => {
      this.transformSpace = space;
    });
  }

  /**
   * Initializes the manager with a world.
   */
  public init(world: World): void {
    this._world = world;
    this.rebuildGizmos();
  }

  /**
   * Sets the currently selected actor for transformation.
   */
  public setSelectedActor(actor: AActor | null): void {
    this._selectedActor = actor;
    if (this._world) {
      this._world.selectedActorId = actor ? actor.id : null;
    }

    if (!actor || actor.isEditorOnly) {
      this.hideGizmos();
    } else {
      this.rebuildGizmos();
    }
  }

  public async onMouseDown(e: MouseEvent, canvas: HTMLCanvasElement): Promise<void> {
    if (e.button !== 0 || !this._selectedActor || !this._selectedActor.rootComponent || !this._world) return;

    const engine = Engine.getInstance();
    const renderer = engine.getRenderer();

    // 1. Get Mouse Coordinates
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 2. Find active camera
    const cameraActor = this._world.actors.find(a => a.getComponent(UCameraComponent));
    const mainCamera = cameraActor?.getComponent(UCameraComponent);
    if (!mainCamera) return;

    // 3. GPU ID Picking
    const gizmoId = await renderer.getGizmoIdAt(mouseX, mouseY, this._world, mainCamera);

    let bestAxis: 'X' | 'Y' | 'Z' | null = null;
    if (gizmoId === 1) bestAxis = 'X';
    else if (gizmoId === 2) bestAxis = 'Y';
    else if (gizmoId === 3) bestAxis = 'Z';

    if (bestAxis) {
      this.isDraggingGizmo = true;
      this.dragAxis = bestAxis;
      const pos = this._selectedActor.rootComponent.relativeLocation;
      vec3.copy(this.dragStartActorPos, pos);
      vec3.copy(this.dragStartActorScale, this._selectedActor.rootComponent.relativeScale);
      quat.copy(this.dragStartActorRotation, this._selectedActor.rootComponent.relativeRotation);

      // Initialize drag start hit point for calculations in onMouseMove
      const width = canvas.width;
      const height = canvas.height;
      const viewProj = renderer.viewProjMatrix;
      const ray = getRayFromCamera(mouseX, mouseY, width, height, viewProj);

      if (this.currentTransformMode !== 'rotate') {
        const planeNormal = this.getDragPlaneNormal(bestAxis);
        const hit = intersectRayPlane(ray.origin, ray.direction, pos, planeNormal);
        if (hit) {
          vec3.copy(this.dragStartMouseHit, hit);
        }
      } else {
        // For rotation, initialize drag start vector from center to hit point
        const worldAxis = vec3.create();
        const axisDir = vec3.fromValues(bestAxis === 'X' ? 1 : 0, bestAxis === 'Y' ? 1 : 0, bestAxis === 'Z' ? 1 : 0);
        if (this.transformSpace === 'local') {
          vec3.transformQuat(worldAxis, axisDir, this.dragStartActorRotation);
        } else {
          vec3.copy(worldAxis, axisDir);
        }
        const hit = intersectRayPlane(ray.origin, ray.direction, pos, worldAxis);
        if (hit) {
          vec3.subtract(this.dragStartVector, hit, pos);
          vec3.copy(this.dragStartMouseHit, hit);
        }
      }
    }
  }

  public onMouseMove(e: MouseEvent, canvas: HTMLCanvasElement): void {
    const engine = Engine.getInstance();
    const renderer = engine.getRenderer();
    const viewProj = renderer.viewProjMatrix;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ray = getRayFromCamera(mouseX, mouseY, canvas.width, canvas.height, viewProj);

    if (this.isDraggingGizmo && this.dragAxis && this._selectedActor?.rootComponent) {
      const planeNormal = this.getDragPlaneNormal(this.dragAxis);
      const hit = intersectRayPlane(ray.origin, ray.direction, this.dragStartActorPos, planeNormal);

      if (hit) {
        const delta = vec3.create();
        vec3.subtract(delta, hit, this.dragStartMouseHit);
        const root = this._selectedActor.rootComponent;
        const pos = root.relativeLocation;

        if (this.currentTransformMode === 'rotate') {
          const startRot = this.dragStartActorRotation;
          const axisDir = vec3.fromValues(
            this.dragAxis === 'X' ? 1 : 0,
            this.dragAxis === 'Y' ? 1 : 0,
            this.dragAxis === 'Z' ? 1 : 0
          );
          const worldAxis = vec3.create();
          if (this.transformSpace === 'local') {
            vec3.transformQuat(worldAxis, axisDir, startRot);
          } else {
            vec3.copy(worldAxis, axisDir);
          }

          const hitPlane = intersectRayPlane(ray.origin, ray.direction, pos, worldAxis);
          if (hitPlane) {
            const currentVec = vec3.create();
            vec3.subtract(currentVec, hitPlane, pos);
            const v1 = vec3.create(); vec3.normalize(v1, this.dragStartVector);
            const v2 = vec3.create(); vec3.normalize(v2, currentVec);
            let dot = Math.max(-1, Math.min(1, vec3.dot(v1, v2)));
            let angle = Math.acos(dot);
            const cross = vec3.create();
            vec3.cross(cross, v1, v2);
            if (vec3.dot(worldAxis, cross) < 0) angle = -angle;

            const deltaQuat = quat.create();
            quat.setAxisAngle(deltaQuat, worldAxis, angle);
            quat.multiply(root.relativeRotation, deltaQuat, startRot);
            quat.normalize(root.relativeRotation, root.relativeRotation);
          }
        } else if (this.currentTransformMode === 'translate') {
          const moveAxis = vec3.fromValues(
            this.dragAxis === 'X' ? 1 : 0,
            this.dragAxis === 'Y' ? 1 : 0,
            this.dragAxis === 'Z' ? 1 : 0
          );
          if (this.transformSpace === 'local') {
            vec3.transformQuat(moveAxis, moveAxis, this.dragStartActorRotation);
          }
          if (this.transformSpace === 'global') {
            if (this.dragAxis === 'X') pos[0] = this.dragStartActorPos[0] + delta[0];
            if (this.dragAxis === 'Y') pos[1] = this.dragStartActorPos[1] + delta[1];
            if (this.dragAxis === 'Z') pos[2] = this.dragStartActorPos[2] + delta[2];
          } else {
            const strength = vec3.dot(delta, moveAxis);
            vec3.scaleAndAdd(pos, this.dragStartActorPos, moveAxis, strength);
          }
        } else if (this.currentTransformMode === 'scale') {
          const sc = root.relativeScale;
          if (this.dragAxis === 'X') sc[0] = Math.max(0.01, this.dragStartActorScale[0] + delta[0]);
          if (this.dragAxis === 'Y') sc[1] = Math.max(0.01, this.dragStartActorScale[1] + delta[1]);
          if (this.dragAxis === 'Z') sc[2] = Math.max(0.01, this.dragStartActorScale[2] + delta[2]);
        }
        EventBus.emit('OnActorPropertiesChanged', this._selectedActor);
        this.update();
      }
    } else if (this.isDraggingSolarHandle && this._selectedActor?.rootComponent) {
      // Phase 20.4/26.2: Drag Solar Handle Logic
      const pos = this._selectedActor.rootComponent.relativeLocation;
      const distance = 3.0; // Standardized handle distance
      const targetPoint = vec3.create();
      vec3.scaleAndAdd(targetPoint, ray.origin, ray.direction, distance);

      // We want the light's Local -Z (forward) to point AT the target.
      // mat4.targetTo creates a view matrix where +Z points from Target to Eye.
      // If we use targetPoint - pos as the target direction, the math natively creates a matrix 
      // where +Z points backwards (pos - targetPoint), causing -Z to point perfectly at targetPoint!
      const direction = vec3.create();
      vec3.subtract(direction, targetPoint, pos);
      vec3.normalize(direction, direction);

      const up = vec3.fromValues(0, 1, 0);
      if (Math.abs(vec3.dot(direction, up)) > 0.99) vec3.set(up, 1, 0, 0);

      const m = mat4.create();
      mat4.targetTo(m, [0, 0, 0], direction, up);
      mat4.getRotation(this._selectedActor.rootComponent.relativeRotation, m);

      EventBus.emit('OnActorPropertiesChanged', this._selectedActor);
      this.update();
    }
  }

  public onMouseUp(): void {
    this.isDraggingGizmo = false;
    this.isDraggingSolarHandle = false;
    this.dragAxis = null;
  }

  private update(): void {
    if (!this._selectedActor || !this._selectedActor.rootComponent) {
      this.hideGizmos();
      return;
    }

    const root = this._selectedActor.rootComponent;
    const pos = root.relativeLocation;
    const rot = root.relativeRotation;
    const scaleFactor = this.calculateScaleFactor(pos);

    const syncPart = (actor: AActor | null, localOffset: vec3, localRotEuler?: vec3, scaleMultiplier: number = 1.0, forceLocal: boolean = false) => {
      if (!actor?.rootComponent) return;
      vec3.copy(actor.rootComponent.relativeLocation, pos);

      const finalOffset = vec3.create();
      vec3.set(finalOffset, localOffset[0] * scaleFactor, localOffset[1] * scaleFactor, localOffset[2] * scaleFactor);

      const worldOffset = vec3.create();
      if (this.transformSpace === 'local' || forceLocal) {
        vec3.transformQuat(worldOffset, finalOffset, rot);
      } else {
        vec3.copy(worldOffset, finalOffset);
      }
      vec3.add(actor.rootComponent.relativeLocation, actor.rootComponent.relativeLocation, worldOffset);

      if (localRotEuler) {
        const localQuat = quat.create();
        quat.fromEuler(localQuat, localRotEuler[0], localRotEuler[1], localRotEuler[2]);
        if (this.transformSpace === 'local' || forceLocal) {
          quat.multiply(actor.rootComponent.relativeRotation, rot, localQuat);
        } else {
          quat.copy(actor.rootComponent.relativeRotation, localQuat);
        }
      } else {
        if (this.transformSpace === 'local' || forceLocal) {
          quat.copy(actor.rootComponent.relativeRotation, rot);
        } else {
          quat.identity(actor.rootComponent.relativeRotation);
        }
      }

      const finalScale = scaleFactor * scaleMultiplier;
      vec3.set(actor.rootComponent.relativeScale, finalScale, finalScale, finalScale);
    };

    if (this.currentTransformMode === 'rotate') {
      const isLight = this._selectedActor.getComponent(UDirectionalLightComponent);
      if (!isLight) {
        syncPart(this.gizmoX, vec3.fromValues(0, 0, 0));
        syncPart(this.gizmoY, vec3.fromValues(0, 0, 0));
        syncPart(this.gizmoZ, vec3.fromValues(0, 0, 0));
      } else {
        // Standard rotation rings are hidden for light, but Solar Handle will be sync'd below
        [this.gizmoX, this.gizmoY, this.gizmoZ].forEach(a => {
          if (a?.rootComponent) vec3.set(a.rootComponent.relativeLocation, 99999, 99999, 99999);
        });
      }
    } else {
      syncPart(this.gizmoX, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 0, -90));
      syncPart(this.gizmoY, vec3.fromValues(0, 0, 0));
      syncPart(this.gizmoZ, vec3.fromValues(0, 0, 0), vec3.fromValues(90, 0, 0));

      const tipMultiplier = this.currentTransformMode === 'scale' ? 0.05 : 1.0;
      syncPart(this.arrowHeadX, vec3.fromValues(1.0, 0, 0), vec3.fromValues(0, 0, -90), tipMultiplier);
      syncPart(this.arrowHeadY, vec3.fromValues(0, 1.0, 0), undefined, tipMultiplier);
      syncPart(this.arrowHeadZ, vec3.fromValues(0, 0, 1.0), vec3.fromValues(90, 0, 0), tipMultiplier);
    }

    // Phase 21: Solar Handle Refinement (Sphere + Forward Binding)
    if (this._selectedActor.getComponent(UDirectionalLightComponent)) {
      // Point along local -Z (Forward) - Force Local regardless of transformSpace
      syncPart(this.lightDirectionGizmo, vec3.fromValues(0, 0, 0), vec3.fromValues(-90, 0, 0), 1.0, true);
      syncPart(this.lightDirectionTip, vec3.fromValues(0, 0, -3.0), vec3.fromValues(-90, 0, 0), 1.0, true);
    } else {
      const hidePos = vec3.fromValues(99999, 99999, 99999);
      if (this.lightDirectionGizmo?.rootComponent) vec3.copy(this.lightDirectionGizmo.rootComponent.relativeLocation, hidePos);
      if (this.lightDirectionTip?.rootComponent) vec3.copy(this.lightDirectionTip.rootComponent.relativeLocation, hidePos);
    }
  }

  private calculateScaleFactor(pos: vec3): number {
    if (!this._world) return 1.0;
    let camPos = vec3.fromValues(0, 10, 20);
    for (const actor of this._world.actors) {
      if (actor.rootComponent && (actor.name === 'MainCamera' || actor.rootComponent.constructor.name === 'UCameraComponent')) {
        camPos = actor.rootComponent.relativeLocation;
        break;
      }
    }
    return vec3.distance(camPos, pos) * 0.15;
  }

  private rebuildGizmos(): void {
    if (!this._world) return;
    const toDestroy = [
      this.gizmoX, this.gizmoY, this.gizmoZ,
      this.arrowHeadX, this.arrowHeadY, this.arrowHeadZ,
      this.lightDirectionGizmo, this.lightDirectionTip
    ];
    for (const actor of toDestroy) if (actor) this._world.destroyActor(actor);

    const engine = Engine.getInstance();
    const device = engine.getRenderer().getDevice();
    if (!device) return;

    const colX = [1.0, 0.2, 0.321], colY = [0.545, 0.862, 0.0], colZ = [0.156, 0.564, 1.0];

    const setupPart = (name: string, isTip: boolean, color: number[]): AActor => {
      const actor = this._world!.spawnActor(AActor, name, true);
      const mesh = actor.addComponent(UMeshComponent);
      actor.rootComponent = mesh;
      if (!isTip) {
        if (this.currentTransformMode === 'rotate') {
          // Fallback to Sphere for now until Torus/Circle is added
          mesh.setPrimitive('Primitive_Sphere');
          vec3.set(mesh.relativeScale, 1.1, 1.1, 0.05); // Flattened sphere as circle proxy
        } else {
          mesh.setPrimitive('Primitive_Cylinder');
        }
      } else {
        if (this.currentTransformMode === 'translate') {
          mesh.setPrimitive('Primitive_Cone');
        } else if (this.currentTransformMode === 'scale') {
          mesh.setPrimitive('Primitive_Cube');
          vec3.set(mesh.relativeScale, 0.085, 0.085, 0.085);
        }
        if (mesh.material) {
          mesh.material.baseColor = new Float32Array([...color, 1.0]);
        }
      }
      mesh.isGizmo = true;
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999);
      return actor;
    };

    this.gizmoX = setupPart('Gizmo_X', false, colX);
    this.gizmoY = setupPart('Gizmo_Y', false, colY);
    this.gizmoZ = setupPart('Gizmo_Z', false, colZ);

    const isSun = this._selectedActor?.getComponent(UDirectionalLightComponent);
    if (!isSun) {
      if (this.currentTransformMode !== 'rotate') {
        this.arrowHeadX = setupPart('ArrowHead_X', true, colX);
        this.arrowHeadY = setupPart('ArrowHead_Y', true, colY);
        this.arrowHeadZ = setupPart('ArrowHead_Z', true, colZ);
      }
    }

    if (this._selectedActor?.getComponent(UDirectionalLightComponent)) {
      this.lightDirectionGizmo = this._world.spawnActor(AActor, 'LightDirectionGizmo', true);
      const mesh = this.lightDirectionGizmo.addComponent(UMeshComponent);
      this.lightDirectionGizmo.rootComponent = mesh;
      const lightCol = [1.0, 0.9, 0.2];
      // Length changed to 3.0
      mesh.setPrimitive('Primitive_Cylinder');
      mesh.isGizmo = true;
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999);

      this.lightDirectionTip = this._world.spawnActor(AActor, 'LightDirectionHandle', true);
      const tipMesh = this.lightDirectionTip.addComponent(UMeshComponent);
      this.lightDirectionTip.rootComponent = tipMesh;
      // Phase 34.6: Use lightweight gizmo sphere geometry
      tipMesh.setPrimitive('Primitive_Sphere');
      if (tipMesh.material) {
        tipMesh.material.baseColor = new Float32Array([...lightCol, 1.0]);
      }
      // Perfect scale for the sphere tip (Shrunk to 0.025 for elegance)
      vec3.set(tipMesh.relativeScale, 0.025, 0.025, 0.025);
      tipMesh.isGizmo = true;
    }
    this.update();
  }

  private hideGizmos(): void {
    const hidePos = vec3.fromValues(99999, 99999, 99999);
    [this.gizmoX, this.gizmoY, this.gizmoZ, this.arrowHeadX, this.arrowHeadY, this.arrowHeadZ, this.lightDirectionGizmo, this.lightDirectionTip].forEach(a => {
      if (a?.rootComponent) vec3.copy(a.rootComponent.relativeLocation, hidePos);
    });
  }

  private getDragPlaneNormal(axis: 'X' | 'Y' | 'Z'): vec3 {
    if (axis === 'Y') return vec3.fromValues(1, 0, 0);
    return vec3.fromValues(0, 1, 0);
  }
}

