import {
  EventBus, AActor, quat, vec3, Engine,
  getRayFromCamera, intersectRayPlane, projectToScreen,
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
    else if (gizmoId >= 4 && gizmoId <= 7) bestAxis = (gizmoId === 5 ? 'Y' : (gizmoId === 6 ? 'Z' : 'X'));
    else if (gizmoId === 8) bestAxis = 'Z'; // Dummy axis for screen rotation

    if (bestAxis || gizmoId === 8) {
      this.isDraggingGizmo = true;
      this.dragAxis = bestAxis;
      if (this.gizmoActor) {
        this.gizmoActor.activeAxis = gizmoId;
      }
      const root = this._selectedActor.rootComponent;
      const pos = root.relativeLocation;
      vec3.copy(this.dragStartActorPos, pos);
      vec3.copy(this.dragStartActorScale, root.relativeScale);
      quat.copy(this.dragStartActorRotation, root.relativeRotation);

      const width = canvas.width;
      const height = canvas.height;
      const viewProj = renderer.viewProjMatrix;
      const ray = getRayFromCamera(mouseX, mouseY, width, height, viewProj);

      if (this.currentTransformMode !== 'rotate') {
        const planeNormal = this.getDragPlaneNormal(bestAxis!);
        const hit = intersectRayPlane(ray.origin, ray.direction, pos, planeNormal);
        if (hit) {
          vec3.copy(this.dragStartMouseHit, hit);
        }
      } else {
        // Rotation initialization
        const worldAxis = vec3.create();
        if (gizmoId === 8) {
          // Screen Rotation: Axis is camera forward
          vec3.set(worldAxis, viewProj[2], viewProj[6], viewProj[10]);
          vec3.normalize(worldAxis, worldAxis);
        } else {
          const axisDir = vec3.fromValues(bestAxis === 'X' ? 1 : 0, bestAxis === 'Y' ? 1 : 0, bestAxis === 'Z' ? 1 : 0);
          if (this.transformSpace === 'local') {
            vec3.transformQuat(worldAxis, axisDir, this.dragStartActorRotation);
          } else {
            vec3.copy(worldAxis, axisDir);
          }
        }

        const hit = intersectRayPlane(ray.origin, ray.direction, pos, worldAxis);
        if (hit) {
          vec3.subtract(this.dragStartVector, hit, pos);
          vec3.copy(this.dragStartMouseHit, hit);
        } else if (gizmoId === 8) {
          // Fallback for screen rotation if hit fails (paralelor plane)
          // Use screen space vector directly if needed, but plane intersection usually works for cam forward
          vec3.set(this.dragStartVector, mouseX - width / 2, mouseY - height / 2, 0);
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
        const activeId = this.gizmoActor?.activeAxis ?? 0;
        const worldAxis = vec3.create();

        if (activeId === 8) {
          // Screen Rotation: Axis is camera forward vector
          const camRot = this.getCameraRotation();
          vec3.set(worldAxis, 0, 0, -1);
          vec3.transformQuat(worldAxis, worldAxis, camRot);
          vec3.normalize(worldAxis, worldAxis);
        } else {
          const axisDir = vec3.fromValues(
            this.dragAxis === 'X' ? 1 : 0,
            this.dragAxis === 'Y' ? 1 : 0,
            this.dragAxis === 'Z' ? 1 : 0
          );
          if (this.transformSpace === 'local') {
            vec3.transformQuat(worldAxis, axisDir, this.dragStartActorRotation);
          } else {
            vec3.copy(worldAxis, axisDir);
          }
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
          quat.multiply(root.relativeRotation, deltaQuat, this.dragStartActorRotation);
          quat.normalize(root.relativeRotation, root.relativeRotation);
        }
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

            const activeId = this.gizmoActor?.activeAxis ?? 0;

            if (this.currentTransformMode === 'translate') {
              if (activeId >= 4 && activeId <= 6) {
                // Planar Translation
                const normal = vec3.create();
                if (activeId === 4) vec3.set(normal, 0, 0, 1);
                else if (activeId === 5) vec3.set(normal, 1, 0, 0);
                else if (activeId === 6) vec3.set(normal, 0, 1, 0);

                if (this.transformSpace === 'local') {
                  vec3.transformQuat(normal, normal, this.dragStartActorRotation);
                }

                const hit = intersectRayPlane(ray.origin, ray.direction, this.dragStartActorPos, normal);
                if (hit) {
                  const worldDelta = vec3.create();
                  vec3.subtract(worldDelta, hit, this.dragStartMouseHit);
                  vec3.add(root.relativeLocation, this.dragStartActorPos, worldDelta);
                }
              } else if (activeId === 7) {
                // Free Translation (Parallel to camera)
                const camForward = vec3.create();
                vec3.set(camForward, viewProj[2], viewProj[6], viewProj[10]);
                vec3.normalize(camForward, camForward);

                const hit = intersectRayPlane(ray.origin, ray.direction, this.dragStartActorPos, camForward);
                if (hit) {
                  const worldDelta = vec3.create();
                  vec3.subtract(worldDelta, hit, this.dragStartMouseHit);
                  vec3.add(root.relativeLocation, this.dragStartActorPos, worldDelta);
                }
              } else {
                // Axial Translation
                vec3.scaleAndAdd(pos, pos, moveAxis, worldDelta);
              }
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
          EventBus.emit('OnActorPropertiesChanged', this._selectedActor);
          this.update();
        }
      }
    }
  }

  public onMouseUp(): void {
    this.isDraggingGizmo = false;
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
    const camRot = this.getCameraRotation();

    if (this.gizmoActor) {
      this.gizmoActor.bIsHidden = false;
      vec3.copy(this.gizmoActor.rootComponent!.relativeLocation, pos);
      quat.copy(this.gizmoActor.rootComponent!.relativeRotation, this.transformSpace === 'local' ? rot : quat.create());
      this.gizmoActor.updateGizmoScale(camPos, camRot);
    }
  }


  private rebuildGizmos(): void {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return;

    // Cleanup old actors
    if (this.gizmoActor) {
      activeWorld.destroyActor(this.gizmoActor);
      this.gizmoActor = null;
    }
    // Spawn the professional AGizmoActor for standard transformations
    this.gizmoActor = activeWorld.spawnActor(AGizmoActor, 'EditorGizmo', true);
    this.gizmoActor.setGizmoType(this.currentTransformMode);
    this.gizmoActor.bIsHidden = true; // Hidden until update finds a selection

    this.update();
  }

  private hideGizmos(): void {
    if (this.gizmoActor) this.gizmoActor.bIsHidden = true;
  }

  private getCameraPosition(): vec3 {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return vec3.fromValues(0, 10, 20);
    const cameraActor = activeWorld.actors.find(a => a.getComponent(UCameraComponent));
    return cameraActor?.rootComponent?.relativeLocation || vec3.fromValues(0, 10, 20);
  }

  private getCameraRotation(): quat {
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return quat.create();
    const cameraActor = activeWorld.actors.find(a => a.getComponent(UCameraComponent));
    return cameraActor?.rootComponent?.relativeRotation || quat.create();
  }

  private getDragPlaneNormal(axis: 'X' | 'Y' | 'Z'): vec3 {
    if (axis === 'Y') return vec3.fromValues(1, 0, 0);
    return vec3.fromValues(0, 1, 0);
  }
}

