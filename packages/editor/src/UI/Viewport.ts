import {
  EventBus, AActor, UDirectionalLightComponent, quat, vec3, World, Engine,
  getRayFromCamera, intersectRayPlane, UMeshComponent
} from '@game-creator/engine';

/**
 * Viewport Web Component that hosts the 3D Engine Canvas.
 * Handles automatic resizing via ResizeObserver.
 */
export class Viewport extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
  private _world: World | null = null;
  private selectedActor: AActor | null = null;

  // Transform Gizmos (Volumetric)
  private gizmoX: AActor | null = null;
  private gizmoY: AActor | null = null;
  private gizmoZ: AActor | null = null;

  // Arrow Heads
  private arrowHeadX: AActor | null = null;
  private arrowHeadY: AActor | null = null;
  private arrowHeadZ: AActor | null = null;

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

  constructor() {
    super();
    this.canvas = document.createElement('canvas');
    this.setupCanvas();

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this) {
          this.handleResize(entry.contentRect);
        }
      }
    });
  }

  /**
   * Sets the world and initializes editor-only actors like the sun.
   */
  set world(value: World) {
    this._world = value;
    this.spawnSun();
  }

  private spawnSun() {
    if (!this._world) return;

    // --- Phase 15: Directional Light ---
    const lightActor = this._world.spawnActor(AActor, 'DirectionalLight', false);
    const sun = lightActor.addComponent(UDirectionalLightComponent);
    lightActor.rootComponent = sun;

    sun.intensity = 1.2;
    quat.fromEuler(sun.relativeRotation, -45, -45, 0);
    // ------------------------------------

    // --- Phase 17.3: AAA Volumetric Gizmos ---
    this.rebuildGizmos();
  }

  private rebuildGizmos() {
    if (!this._world) return;

    // 1. Destroy existing to avoid "ghost" buffers
    const toDestroy = [this.gizmoX, this.gizmoY, this.gizmoZ, this.arrowHeadX, this.arrowHeadY, this.arrowHeadZ];
    for (const actor of toDestroy) {
      if (actor) this._world.destroyActor(actor);
    }

    const engine = Engine.getInstance();
    const device = engine.getRenderer().getDevice();
    if (!device) return;

    // Blender Reales: X: #FF3352, Y: #8BDC00, Z: #2890FF
    const colX = [1.0, 0.2, 0.321];
    const colY = [0.545, 0.862, 0.0];
    const colZ = [0.156, 0.564, 1.0];
    // Refining Phase 17.9.7: Final Calibration.

    const setupPart = (name: string, isTip: boolean, color: number[]): AActor => {
      const actor = this._world!.spawnActor(AActor, name, true);
      const mesh = actor.addComponent(UMeshComponent);
      actor.rootComponent = mesh;

      if (!isTip) {
        if (this.currentTransformMode === 'rotate') {
          // In rotate mode, these are 1.1x scale rings
          mesh.createCircle(device, 1.1, 64, color, name.split('_')[1] as any);
        } else {
          mesh.createGizmoAxis(device, 1.0, color);
        }
      } else {
        if (this.currentTransformMode === 'translate') {
          mesh.createPyramid(device, 0.15, 0.05, color); // Solid X-Ray Pyramid (15% reduced)
        } else if (this.currentTransformMode === 'scale') {
          mesh.createBox(device, color);
          vec3.set(mesh.relativeScale, 0.085, 0.085, 0.085); // Pro-Level Diminutive Cube (15% reduced)
        }
      }

      if (mesh.material) {
        mesh.material.baseColor = new Float32Array([...color, 1.0]);
      }
      mesh.isGizmo = true;
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999); // Hide initially
      return actor;
    };

    this.gizmoX = setupPart('Gizmo_X', false, colX);
    this.gizmoY = setupPart('Gizmo_Y', false, colY);
    this.gizmoZ = setupPart('Gizmo_Z', false, colZ);

    if (this.currentTransformMode !== 'rotate') {
      this.arrowHeadX = setupPart('ArrowHead_X', true, colX);
      this.arrowHeadY = setupPart('ArrowHead_Y', true, colY);
      this.arrowHeadZ = setupPart('ArrowHead_Z', true, colZ);
    }

    this.handleTick(); // Force immediate update after reconstruction
  }

  connectedCallback() {
    this.render();
    this.appendChild(this.canvas);
    this.resizeObserver.observe(this);

    EventBus.on('OnActorSelected', this.handleActorSelected);
    EventBus.on('EngineTick', this.handleTick);
    EventBus.on('OnTransformModeChanged', (mode: any) => {
      this.currentTransformMode = mode;
      this.rebuildGizmos();
    });

    EventBus.on('OnTransformSpaceChanged', (space: any) => {
      this.transformSpace = space;
    });

    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    EventBus.off('OnActorSelected', this.handleActorSelected);
    EventBus.off('EngineTick', this.handleTick);

    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  private handleMouseDown = (e: MouseEvent) => {
    // Only left click for gizmos
    if (e.button !== 0 || !this.selectedActor || !this.selectedActor.rootComponent) return;

    const engine = Engine.getInstance();
    const renderer = engine.getRenderer();
    const viewProj = renderer.viewProjMatrix;

    const { width, height } = this.canvas;
    const ray = getRayFromCamera(e.offsetX, e.offsetY, width, height, viewProj);

    // Pick Axis (Synchronized with scaleFactor) - Phase 17.9.10 Refinement
    const pos = this.selectedActor.rootComponent.relativeLocation;
    const rot = this.selectedActor.rootComponent.relativeRotation;

    // Calculate current visual scaleFactor
    let camPos = vec3.fromValues(0, 10, 20);
    for (const actor of this._world!.actors) {
      if (actor.rootComponent && (actor.name === 'MainCamera' || actor.rootComponent.constructor.name === 'UCameraComponent')) {
        camPos = actor.rootComponent.relativeLocation;
        break;
      }
    }
    const dist2Cam = vec3.distance(camPos, pos);
    const scaleFactor = dist2Cam * 0.15;
    const gizmoSize = 1.0 * scaleFactor; // Match visual tip exactly
    const hitThreshold = 0.08 * scaleFactor; // Phase 17.9.10 Pro radius

    const axes = [
      { dir: vec3.fromValues(1, 0, 0), axis: 'X' as const },
      { dir: vec3.fromValues(0, 1, 0), axis: 'Y' as const },
      { dir: vec3.fromValues(0, 0, 1), axis: 'Z' as const },
    ];

    let bestAxis: 'X' | 'Y' | 'Z' | null = null;
    let closestDist = Infinity;

    if (this.currentTransformMode === 'rotate') {
      const radius = 1.1 * scaleFactor;
      const ringThreshold = 0.1 * scaleFactor;

      for (const a of axes) {
        const planeNormal = vec3.create();
        if (this.transformSpace === 'local') {
          vec3.transformQuat(planeNormal, a.dir, rot);
        } else {
          vec3.copy(planeNormal, a.dir);
        }

        const hit = intersectRayPlane(ray.origin, ray.direction, pos, planeNormal);
        if (hit) {
          const distFromCenter = vec3.distance(hit, pos);
          const diff = Math.abs(distFromCenter - radius);
          if (diff < ringThreshold && diff < closestDist) {
            closestDist = diff;
            bestAxis = a.axis;
            vec3.subtract(this.dragStartVector, hit, pos);
            vec3.copy(this.dragStartMouseHit, hit);
          }
        }
      }
    } else {
      for (const a of axes) {
        const worldDir = vec3.create();
        if (this.transformSpace === 'local') {
          vec3.transformQuat(worldDir, a.dir, rot);
        } else {
          vec3.copy(worldDir, a.dir);
        }

        const u = worldDir;
        const v = ray.direction;
        const w0 = vec3.create();
        vec3.subtract(w0, pos, ray.origin);

        const b = vec3.dot(u, v);
        const d = vec3.dot(u, w0);
        const e = vec3.dot(v, w0);

        const denom = 1.0 - b * b;
        let sc, tc;

        if (denom < 0.0001) {
          sc = -d;
          tc = 0.0;
        } else {
          sc = (b * e - d) / denom;
          tc = (e - b * d) / denom;
        }

        sc = Math.max(0, Math.min(sc, gizmoSize));

        const P_axis = vec3.create();
        vec3.scaleAndAdd(P_axis, pos, worldDir, sc);
        const P_ray = vec3.create();
        vec3.scaleAndAdd(P_ray, ray.origin, ray.direction, tc);

        const distHit = vec3.distance(P_axis, P_ray);

        if (distHit < hitThreshold && distHit < closestDist) {
          closestDist = distHit;
          bestAxis = a.axis;
        }
      }
    }

    if (bestAxis) {
      this.isDraggingGizmo = true;
      this.dragAxis = bestAxis;
      vec3.copy(this.dragStartActorPos, pos);
      vec3.copy(this.dragStartActorScale, this.selectedActor.rootComponent.relativeScale);
      quat.copy(this.dragStartActorRotation, this.selectedActor.rootComponent.relativeRotation);

      if (this.currentTransformMode !== 'rotate') {
        const planeNormal = this.getDragPlaneNormal(bestAxis);
        const hit = intersectRayPlane(ray.origin, ray.direction, pos, planeNormal);
        if (hit) {
          vec3.copy(this.dragStartMouseHit, hit);
        }
      }
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDraggingGizmo || !this.dragAxis || !this.selectedActor || !this.selectedActor.rootComponent) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const engine = Engine.getInstance();
    const renderer = engine.getRenderer();
    const viewProj = renderer.viewProjMatrix;

    const ray = getRayFromCamera(mouseX, mouseY, this.canvas.width, this.canvas.height, viewProj);
    const planeNormal = this.getDragPlaneNormal(this.dragAxis);
    const hit = intersectRayPlane(ray.origin, ray.direction, this.dragStartActorPos, planeNormal);

    if (hit) {
      const delta = vec3.create();
      vec3.subtract(delta, hit, this.dragStartMouseHit);

      const root = this.selectedActor.rootComponent;
      const pos = root.relativeLocation;
      const rot = root.relativeRotation;

      if (this.currentTransformMode === 'rotate') {
        const rot = this.dragStartActorRotation;
        const axisDir = vec3.fromValues(
          this.dragAxis === 'X' ? 1 : 0,
          this.dragAxis === 'Y' ? 1 : 0,
          this.dragAxis === 'Z' ? 1 : 0
        );
        const worldAxis = vec3.create();
        if (this.transformSpace === 'local') {
          vec3.transformQuat(worldAxis, axisDir, rot);
        } else {
          vec3.copy(worldAxis, axisDir);
        }

        const hit = intersectRayPlane(ray.origin, ray.direction, pos, worldAxis);
        if (hit) {
          const currentVec = vec3.create();
          vec3.subtract(currentVec, hit, pos);

          // Calculate angle between vectors on the plane
          // Project vectors to local 2D space of the plane if needed, or use a more direct method
          // Direct method: angle between v1 and v2 around normal
          const v1 = vec3.create(); vec3.normalize(v1, this.dragStartVector);
          const v2 = vec3.create(); vec3.normalize(v2, currentVec);

          let dot = vec3.dot(v1, v2);
          dot = Math.max(-1, Math.min(1, dot));
          let angle = Math.acos(dot);

          const cross = vec3.create();
          vec3.cross(cross, v1, v2);
          if (vec3.dot(worldAxis, cross) < 0) angle = -angle;

          const deltaQuat = quat.create();
          quat.setAxisAngle(deltaQuat, worldAxis, angle);
          quat.multiply(this.selectedActor.rootComponent.relativeRotation, deltaQuat, rot);
          quat.normalize(this.selectedActor.rootComponent.relativeRotation, this.selectedActor.rootComponent.relativeRotation);
        }
      } else if (this.currentTransformMode === 'translate') {
        const moveAxis = vec3.create();
        if (this.dragAxis === 'X') vec3.set(moveAxis, 1, 0, 0);
        if (this.dragAxis === 'Y') vec3.set(moveAxis, 0, 1, 0);
        if (this.dragAxis === 'Z') vec3.set(moveAxis, 0, 0, 1);

        if (this.transformSpace === 'local') {
          vec3.transformQuat(moveAxis, moveAxis, rot);
        }

        // Project delta onto the chosen axis
        // For simple dragging, we'll just use the delta components if global, 
        // or transform the whole delta if local.
        // Actually the current delta calculation is simplified. 
        // Let's refine for local space:
        if (this.transformSpace === 'global') {
          if (this.dragAxis === 'X') pos[0] = this.dragStartActorPos[0] + delta[0];
          if (this.dragAxis === 'Y') pos[1] = this.dragStartActorPos[1] + delta[1];
          if (this.dragAxis === 'Z') pos[2] = this.dragStartActorPos[2] + delta[2];
        } else {
          // In Local mode, we project delta onto the rotated axis
          // This is a simplified approach
          const strength = vec3.dot(delta, moveAxis);
          vec3.scaleAndAdd(pos, this.dragStartActorPos, moveAxis, strength);
        }
      } else if (this.currentTransformMode === 'scale') {
        const sc = root.relativeScale;
        if (this.dragAxis === 'X') sc[0] = Math.max(0.01, this.dragStartActorScale[0] + delta[0]);
        if (this.dragAxis === 'Y') sc[1] = Math.max(0.01, this.dragStartActorScale[1] + delta[1]);
        if (this.dragAxis === 'Z') sc[2] = Math.max(0.01, this.dragStartActorScale[2] + delta[2]);
      }

      // Immediate Refresh of Gizmo Position (Phase 17.6 Fix)
      this.handleTick();
    }
  };

  private handleMouseUp = () => {
    this.isDraggingGizmo = false;
    this.dragAxis = null;
  };

  private getDragPlaneNormal(axis: 'X' | 'Y' | 'Z'): vec3 {
    // For X dragging, a plane with normal [0, 1, 0] or [0, 0, 1] works.
    // Ideally use a plane that is most "facing" the camera.
    if (axis === 'X') return vec3.fromValues(0, 1, 0);
    if (axis === 'Y') return vec3.fromValues(1, 0, 0);
    if (axis === 'Z') return vec3.fromValues(0, 1, 0);
    return vec3.fromValues(0, 1, 0);
  }


  private handleActorSelected = (actor: AActor | null) => {
    this.selectedActor = actor;

    // Pass selection to the engine for rendering outlines
    if (this._world) {
      this._world.selectedActorId = actor ? actor.id : null;
    }

    if (!actor || actor.isEditorOnly || (this.currentTransformMode !== 'translate' && this.currentTransformMode !== 'scale' && this.currentTransformMode !== 'rotate')) {
      this.hideGizmos();
    } else {
      this.rebuildGizmos();
    }
  };

  private hideGizmos() {
    const hidePos = vec3.fromValues(99999, 99999, 99999);
    if (this.gizmoX?.rootComponent) vec3.copy(this.gizmoX.rootComponent.relativeLocation, hidePos);
    if (this.gizmoY?.rootComponent) vec3.copy(this.gizmoY.rootComponent.relativeLocation, hidePos);
    if (this.gizmoZ?.rootComponent) vec3.copy(this.gizmoZ.rootComponent.relativeLocation, hidePos);
    if (this.arrowHeadX?.rootComponent) vec3.copy(this.arrowHeadX.rootComponent.relativeLocation, hidePos);
    if (this.arrowHeadY?.rootComponent) vec3.copy(this.arrowHeadY.rootComponent.relativeLocation, hidePos);
    if (this.arrowHeadZ?.rootComponent) vec3.copy(this.arrowHeadZ.rootComponent.relativeLocation, hidePos);
  }

  private handleTick = () => {
    if (this.selectedActor && this.selectedActor.rootComponent) {
      const root = this.selectedActor.rootComponent;
      const pos = root.relativeLocation;
      const rot = root.relativeRotation;

      if (this.currentTransformMode === 'translate' || this.currentTransformMode === 'scale' || this.currentTransformMode === 'rotate') {
        // --- Phase 17.8: Constant Size Logic ---
        let camPos = vec3.fromValues(0, 10, 20); // Fallback
        for (const actor of this._world!.actors) {
          if (actor.rootComponent && (actor.name === 'MainCamera' || actor.rootComponent.constructor.name === 'UCameraComponent')) {
            camPos = actor.rootComponent.relativeLocation;
            break;
          }
        }

        const dist = vec3.distance(camPos, pos);
        const scaleFactor = dist * 0.15;

        const syncPart = (actor: AActor | null, localOffset: vec3, localRotEuler?: vec3, scaleMultiplier: number = 1.0) => {
          if (!actor?.rootComponent) return;
          vec3.copy(actor.rootComponent.relativeLocation, pos);

          const finalOffset = vec3.create();
          vec3.set(finalOffset, localOffset[0] * scaleFactor, localOffset[1] * scaleFactor, localOffset[2] * scaleFactor);

          const worldOffset = vec3.create();
          if (this.transformSpace === 'local') {
            vec3.transformQuat(worldOffset, finalOffset, rot);
          } else {
            vec3.copy(worldOffset, finalOffset);
          }
          vec3.add(actor.rootComponent.relativeLocation, actor.rootComponent.relativeLocation, worldOffset);

          if (localRotEuler) {
            const localQuat = quat.create();
            quat.fromEuler(localQuat, localRotEuler[0], localRotEuler[1], localRotEuler[2]);
            if (this.transformSpace === 'local') {
              quat.multiply(actor.rootComponent.relativeRotation, rot, localQuat);
            } else {
              quat.copy(actor.rootComponent.relativeRotation, localQuat);
            }
          } else {
            if (this.transformSpace === 'local') {
              quat.copy(actor.rootComponent.relativeRotation, rot);
            } else {
              quat.identity(actor.rootComponent.relativeRotation);
            }
          }

          const finalScale = scaleFactor * scaleMultiplier;
          vec3.set(actor.rootComponent.relativeScale, finalScale, finalScale, finalScale);
        };

        if (this.currentTransformMode === 'rotate') {
          // Sync Rings (Center at 0,0,0)
          syncPart(this.gizmoX, vec3.fromValues(0, 0, 0));
          syncPart(this.gizmoY, vec3.fromValues(0, 0, 0));
          syncPart(this.gizmoZ, vec3.fromValues(0, 0, 0));
        } else {
          // Sync Axes (Lines start at 0,0,0)
          syncPart(this.gizmoX, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 0, -90));
          syncPart(this.gizmoY, vec3.fromValues(0, 0, 0));
          syncPart(this.gizmoZ, vec3.fromValues(0, 0, 0), vec3.fromValues(90, 0, 0));

          // Sync Arrow Heads (Positioned at 1.0 offset)
          const tipMultiplier = this.currentTransformMode === 'scale' ? 0.05 : 1.0;
          syncPart(this.arrowHeadX, vec3.fromValues(1.0, 0, 0), vec3.fromValues(0, 0, -90), tipMultiplier);
          syncPart(this.arrowHeadY, vec3.fromValues(0, 1.0, 0), undefined, tipMultiplier);
          syncPart(this.arrowHeadZ, vec3.fromValues(0, 0, 1.0), vec3.fromValues(90, 0, 0), tipMultiplier);
        }
      } else {
        this.hideGizmos();
      }
    } else {
      this.hideGizmos();
    }
  };

  /**
   * Returns the internal canvas element.
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private setupCanvas() {
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
  }

  private render() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.position = 'relative';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = '#000';
  }

  private handleResize(rect: DOMRectReadOnly) {
    const { width, height } = rect;

    // We no longer update canvas.width/height here to avoid flickering.
    // The Engine's tick loop will detect the change in clientWidth/Height.
    EventBus.emit('ViewportResized', { width, height });
  }
}

customElements.define('gc-viewport', Viewport);
