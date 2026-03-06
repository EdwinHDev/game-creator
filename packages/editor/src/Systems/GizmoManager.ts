import {
  EventBus, AActor, quat, vec3, mat4, Engine,
  getRayFromCamera, intersectRayPlane, projectToScreen, UMeshComponent, UDirectionalLightComponent,
  UCameraComponent, AGizmoActor
} from '@game-creator/engine';

/**
 * GizmoManager handles all logic for transformation gizmos (Translate, Rotate, Scale).
 * It manages gizmo actors, hit detection, and application of transformation deltas.
 */
export class GizmoManager {
  private _selectedActor: AActor | null = null;

  // Transform Gizmo Actor (Centralized)
  private gizmoActor: AGizmoActor | null = null;

  // Dedicated handle for Directional Lights
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

  // Hover Interaction State
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private isCheckingHover: boolean = false;

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
   * Cleans up the gizmo manager.
   */
  public destroy(): void {
    this.hideGizmos();
  }

  /**
   * Sets the currently selected actor for transformation.
   */
  public setSelectedActor(actor: AActor | null): void {
    const world = Engine.getInstance().getActiveWorld();
    this._selectedActor = actor;
    if (world) {
      world.selectedActorId = actor ? actor.id : null;
    }

    if (!actor || actor.isEditorOnly) {
      this.hideGizmos();
    } else {
      this.rebuildGizmos();
    }
  }

  public async onMouseDown(e: MouseEvent, canvas: HTMLCanvasElement): Promise<void> {
    const engine = Engine.getInstance();
    const activeWorld = engine.getActiveWorld();
    if (e.button !== 0 || !this._selectedActor || !this._selectedActor.rootComponent || !activeWorld) return;

    const renderer = engine.getRenderer();

    // 1. Get Mouse Coordinates
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 2. Find active camera
    const cameraActor = activeWorld.actors.find(a => a.getComponent(UCameraComponent));
    const mainCamera = cameraActor?.getComponent(UCameraComponent);
    if (!mainCamera) return;

    // 3. GPU ID Picking
    const gizmoId = await renderer.getGizmoIdAt(mouseX, mouseY, activeWorld, mainCamera);

    let bestAxis: 'X' | 'Y' | 'Z' | null = null;
    if (gizmoId === 1) bestAxis = 'X';
    else if (gizmoId === 2) bestAxis = 'Y';
    else if (gizmoId === 3) bestAxis = 'Z';
    else if (gizmoId === 4) bestAxis = 'X'; // XY (X primary)
    else if (gizmoId === 5) bestAxis = 'Y'; // YZ (Y primary)
    else if (gizmoId === 6) bestAxis = 'Z'; // ZX (Z primary)
    else if (gizmoId === 7) bestAxis = 'X'; // Uniform (X primary)

    if (bestAxis) {
      this.isDraggingGizmo = true;
      this.dragAxis = bestAxis;
      if (this.gizmoActor) {
        this.gizmoActor.activeAxis = gizmoId;
      }
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

    const deltaX = mouseX - this.lastMouseX;
    const deltaY = mouseY - this.lastMouseY;

    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;

    if (!this.isDraggingGizmo && !this.isCheckingHover && this.gizmoActor && !this.gizmoActor.bIsHidden) {
      this.checkHover();
    }

    const ray = getRayFromCamera(mouseX, mouseY, canvas.width, canvas.height, viewProj);

    if (this.isDraggingGizmo && this.dragAxis && this._selectedActor?.rootComponent) {
      const root = this._selectedActor.rootComponent;
      const pos = root.relativeLocation;

      if (this.currentTransformMode === 'rotate') {
        const planeNormal = this.getDragPlaneNormal(this.dragAxis);
        const hit = intersectRayPlane(ray.origin, ray.direction, this.dragStartActorPos, planeNormal);

        if (hit) {
          const delta = vec3.create();
          vec3.subtract(delta, hit, this.dragStartMouseHit);
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
        }
        EventBus.emit('OnActorPropertiesChanged', this._selectedActor);
        this.update();
      } else if (this.currentTransformMode === 'translate' || this.currentTransformMode === 'scale') {
        const moveAxis = vec3.fromValues(
          this.dragAxis === 'X' ? 1 : 0,
          this.dragAxis === 'Y' ? 1 : 0,
          this.dragAxis === 'Z' ? 1 : 0
        );
        if (this.transformSpace === 'local') {
          vec3.transformQuat(moveAxis, moveAxis, root.relativeRotation);
        }

        const originScreen = projectToScreen(pos, viewProj, canvas.width, canvas.height);
        const pointOnAxis = vec3.create();
        vec3.scaleAndAdd(pointOnAxis, pos, moveAxis, 1.0);
        const axisScreen = projectToScreen(pointOnAxis, viewProj, canvas.width, canvas.height);

        if (originScreen && axisScreen) {
          const dx = axisScreen.x - originScreen.x;
          const dy = axisScreen.y - originScreen.y;
          const pixelsPerUnit = Math.sqrt(dx * dx + dy * dy);

          if (pixelsPerUnit > 0.0001) {
            const screenAxisX = dx / pixelsPerUnit;
            const screenAxisY = dy / pixelsPerUnit;

            // Proyectar el movimiento del mouse sobre el vector del eje en pantalla
            const pixelDelta = deltaX * screenAxisX + deltaY * screenAxisY;
            const worldDelta = pixelDelta / pixelsPerUnit;

            if (this.currentTransformMode === 'translate') {
              vec3.scaleAndAdd(pos, pos, moveAxis, worldDelta);
            } else if (this.currentTransformMode === 'scale') {
              const sc = root.relativeScale;
              const sensitivity = 0.005;
              const scaleFactor = Math.pow(2.0, pixelDelta * sensitivity);

              const activeId = this.gizmoActor?.activeAxis;
              if (activeId === 7) {
                // Uniform Scale (XYZ)
                sc[0] = Math.max(0.01, sc[0] * scaleFactor);
                sc[1] = Math.max(0.01, sc[1] * scaleFactor);
                sc[2] = Math.max(0.01, sc[2] * scaleFactor);
              } else if (activeId === 4) {
                // Plane XY
                sc[0] = Math.max(0.01, sc[0] * scaleFactor);
                sc[1] = Math.max(0.01, sc[1] * scaleFactor);
              } else if (activeId === 5) {
                // Plane YZ
                sc[1] = Math.max(0.01, sc[1] * scaleFactor);
                sc[2] = Math.max(0.01, sc[2] * scaleFactor);
              } else if (activeId === 6) {
                // Plane ZX
                sc[0] = Math.max(0.01, sc[0] * scaleFactor);
                sc[2] = Math.max(0.01, sc[2] * scaleFactor);
              } else {
                // Single Axis
                const axisIdx = this.dragAxis === 'X' ? 0 : this.dragAxis === 'Y' ? 1 : 2;
                sc[axisIdx] = Math.max(0.01, sc[axisIdx] * scaleFactor);
              }
            }
          }
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
    if (this.gizmoActor) {
      this.gizmoActor.activeAxis = 0;
    }
  }

  private async checkHover(): Promise<void> {
    this.isCheckingHover = true;
    const engine = Engine.getInstance();
    const activeWorld = engine.getActiveWorld();
    const mainCamera = activeWorld?.actors.find(a => a.getComponent(UCameraComponent))?.getComponent(UCameraComponent);

    if (activeWorld && mainCamera) {
      const gizmoId = await engine.getRenderer().getGizmoIdAt(this.lastMouseX, this.lastMouseY, activeWorld, mainCamera);
      if (this.gizmoActor) {
        if (this.gizmoActor.hoverAxis !== gizmoId) {
          this.gizmoActor.hoverAxis = gizmoId;
          this.update(); // Trigger re-render with new hover state
        }
      }
    }
    this.isCheckingHover = false;
  }

  private update(): void {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!this._selectedActor || !this._selectedActor.rootComponent || !activeWorld) {
      this.hideGizmos();
      return;
    }

    const root = this._selectedActor.rootComponent;
    const pos = root.relativeLocation;
    const rot = root.relativeRotation;
    const camPos = this.getCameraPosition();
    const scaleFactor = this.calculateScaleFactor(pos);

    if (this._selectedActor.getComponent(UDirectionalLightComponent)) {
      if (this.gizmoActor) this.gizmoActor.bIsHidden = true; // In solar mode, hide standard gizmos

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

      // Point along local -Z (Forward) - Force Local regardless of transformSpace
      syncPart(this.lightDirectionGizmo, vec3.fromValues(0, 0, 0), vec3.fromValues(-90, 0, 0), 1.0, true);
      syncPart(this.lightDirectionTip, vec3.fromValues(0, 0, -3.0), vec3.fromValues(-90, 0, 0), 1.0, true);
    } else {
      if (this.gizmoActor) {
        this.gizmoActor.bIsHidden = false;
        vec3.copy(this.gizmoActor.rootComponent!.relativeLocation, pos);
        quat.copy(this.gizmoActor.rootComponent!.relativeRotation, this.transformSpace === 'local' ? rot : quat.create());
        this.gizmoActor.updateGizmoScale(camPos);
      }

      const hidePos = vec3.fromValues(99999, 99999, 99999);
      if (this.lightDirectionGizmo?.rootComponent) vec3.copy(this.lightDirectionGizmo.rootComponent.relativeLocation, hidePos);
      if (this.lightDirectionTip?.rootComponent) vec3.copy(this.lightDirectionTip.rootComponent.relativeLocation, hidePos);
    }
  }

  private calculateScaleFactor(pos: vec3): number {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return 1.0;
    let camPos = vec3.fromValues(0, 10, 20);
    for (const actor of activeWorld.actors) {
      if (actor.rootComponent && (actor.name === 'MainCamera' || actor.rootComponent.constructor.name === 'UCameraComponent')) {
        camPos = actor.rootComponent.relativeLocation;
        break;
      }
    }
    return vec3.distance(camPos, pos) * 0.15;
  }

  private rebuildGizmos(): void {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return;

    // Cleanup old actors
    if (this.gizmoActor) {
      activeWorld.destroyActor(this.gizmoActor);
      this.gizmoActor = null;
    }
    if (this.lightDirectionGizmo) activeWorld.destroyActor(this.lightDirectionGizmo);
    if (this.lightDirectionTip) activeWorld.destroyActor(this.lightDirectionTip);

    if (!this._selectedActor) return;

    const engine = Engine.getInstance();
    const device = engine.getRenderer().getDevice();
    if (!device) return;

    // Spawn the professional AGizmoActor for standard transformations
    this.gizmoActor = activeWorld.spawnActor(AGizmoActor, 'EditorGizmo', true);
    this.gizmoActor.setGizmoType(this.currentTransformMode);
    this.gizmoActor.bIsHidden = true; // Hidden until update finds a selection

    const isSun = this._selectedActor.getComponent(UDirectionalLightComponent);
    if (isSun) {
      this.lightDirectionGizmo = activeWorld.spawnActor(AActor, 'LightDirectionGizmo', true);
      const mesh = this.lightDirectionGizmo.addComponent(UMeshComponent);
      this.lightDirectionGizmo.rootComponent = mesh;
      const lightCol = [1.0, 0.9, 0.2];
      mesh.setPrimitive('Primitive_Cylinder');
      mesh.isGizmo = true;
      mesh.pickingId = 3; // Z-axis equivalent for solar handle
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999);

      this.lightDirectionTip = activeWorld.spawnActor(AActor, 'LightDirectionHandle', true);
      const tipMesh = this.lightDirectionTip.addComponent(UMeshComponent);
      this.lightDirectionTip.rootComponent = tipMesh;
      tipMesh.setPrimitive('Primitive_Sphere');
      tipMesh.isGizmo = true;
      tipMesh.pickingId = 3;
      if (tipMesh.material) tipMesh.material.baseColor = new Float32Array([...lightCol, 1.0]);
      vec3.set(tipMesh.relativeScale, 0.025, 0.025, 0.025);
    }

    this.update();
  }

  private hideGizmos(): void {
    if (this.gizmoActor) this.gizmoActor.bIsHidden = true;
    const hidePos = vec3.fromValues(99999, 99999, 99999);
    if (this.lightDirectionGizmo?.rootComponent) vec3.copy(this.lightDirectionGizmo.rootComponent.relativeLocation, hidePos);
    if (this.lightDirectionTip?.rootComponent) vec3.copy(this.lightDirectionTip.rootComponent.relativeLocation, hidePos);
  }

  private getCameraPosition(): vec3 {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return vec3.fromValues(0, 10, 20);
    const cameraActor = activeWorld.actors.find(a => a.getComponent(UCameraComponent));
    return cameraActor?.rootComponent?.relativeLocation || vec3.fromValues(0, 10, 20);
  }

  private getDragPlaneNormal(axis: 'X' | 'Y' | 'Z'): vec3 {
    if (axis === 'Y') return vec3.fromValues(1, 0, 0);
    return vec3.fromValues(0, 1, 0);
  }
}

