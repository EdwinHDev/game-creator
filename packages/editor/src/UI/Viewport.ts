import {
  EventBus, AActor, UDirectionalLightComponent, quat, vec3, World, Engine,
  getRayFromCamera, intersectRayPlane, distancePointToSegment, UMeshComponent
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

  // Interaction State
  private isDraggingGizmo: boolean = false;
  private dragAxis: 'X' | 'Y' | 'Z' | null = null;
  private dragStartActorPos: vec3 = vec3.create();
  private dragStartMouseHit: vec3 = vec3.create();

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
    this.setupVolumetricGizmos();
  }

  private setupVolumetricGizmos() {
    if (!this._world) return;
    const engine = Engine.getInstance();
    const device = engine.getRenderer().getDevice();
    if (!device) return;

    // Create 3 Actors for X, Y, Z
    this.gizmoX = this._world.spawnActor(AActor, 'Gizmo_X', true);
    this.gizmoY = this._world.spawnActor(AActor, 'Gizmo_Y', true);
    this.gizmoZ = this._world.spawnActor(AActor, 'Gizmo_Z', true);

    // Create 3 Actors for Arrow Heads
    this.arrowHeadX = this._world.spawnActor(AActor, 'ArrowHead_X', true);
    this.arrowHeadY = this._world.spawnActor(AActor, 'ArrowHead_Y', true);
    this.arrowHeadZ = this._world.spawnActor(AActor, 'ArrowHead_Z', true);

    const setupGizmo = (actor: AActor, color: number[], scale: vec3) => {
      const mesh = actor.addComponent(UMeshComponent);
      actor.rootComponent = mesh;
      mesh.createBox(device);
      if (mesh.material) {
        mesh.material.baseColor = new Float32Array([...color, 1.0]);
      }
      vec3.copy(mesh.relativeScale, scale);
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999);
    };

    const setupArrow = (actor: AActor, color: number[]) => {
      const mesh = actor.addComponent(UMeshComponent);
      actor.rootComponent = mesh;
      mesh.createPyramid(device, 0.3, 0.1);
      if (mesh.material) {
        mesh.material.baseColor = new Float32Array([...color, 1.0]);
      }
      mesh.relativeLocation = vec3.fromValues(99999, 99999, 99999);
    };

    // Phase 17.4: Reduced scales (50%)
    setupGizmo(this.gizmoX, [1, 0.1, 0.1], vec3.fromValues(1.0, 0.025, 0.025));
    setupGizmo(this.gizmoY, [0.1, 1, 0.1], vec3.fromValues(0.025, 1.0, 0.025));
    setupGizmo(this.gizmoZ, [0.1, 0.1, 1], vec3.fromValues(0.025, 0.025, 1.0));

    setupArrow(this.arrowHeadX, [1, 0.1, 0.1]);
    setupArrow(this.arrowHeadY, [0.1, 1, 0.1]);
    setupArrow(this.arrowHeadZ, [0.1, 0.1, 1]);
  }

  connectedCallback() {
    this.render();
    this.appendChild(this.canvas);
    this.resizeObserver.observe(this);

    EventBus.on('OnActorSelected', this.handleActorSelected);
    EventBus.on('EngineTick', this.handleTick);
    EventBus.on('OnTransformModeChanged', (mode: any) => {
      this.currentTransformMode = mode;
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

    // Pick Axis
    const pos = this.selectedActor.rootComponent.relativeLocation;
    const gizmoSize = 2.0;

    const axes = [
      { dir: vec3.fromValues(1, 0, 0), axis: 'X' as const },
      { dir: vec3.fromValues(0, 1, 0), axis: 'Y' as const },
      { dir: vec3.fromValues(0, 0, 1), axis: 'Z' as const },
    ];

    let bestAxis: 'X' | 'Y' | 'Z' | null = null;
    let minDistance = 0.8; // Increased threshold for volumetric picking

    for (const a of axes) {
      const end = vec3.create();
      vec3.scaleAndAdd(end, pos, a.dir, gizmoSize);

      const dist = distancePointToSegment(this.getClosestPointOnRayToPoint(ray, pos), pos, end);

      if (dist < minDistance) {
        minDistance = dist;
        bestAxis = a.axis;
      }
    }

    if (bestAxis) {
      this.isDraggingGizmo = true;
      this.dragAxis = bestAxis;
      vec3.copy(this.dragStartActorPos, pos);

      // Intersection with a plane for dragging
      const planeNormal = this.getDragPlaneNormal(bestAxis);
      const hit = intersectRayPlane(ray.origin, ray.direction, pos, planeNormal);
      if (hit) {
        vec3.copy(this.dragStartMouseHit, hit);
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

      const pos = this.selectedActor.rootComponent.relativeLocation;
      if (this.dragAxis === 'X') pos[0] = this.dragStartActorPos[0] + delta[0];
      if (this.dragAxis === 'Y') pos[1] = this.dragStartActorPos[1] + delta[1];
      if (this.dragAxis === 'Z') pos[2] = this.dragStartActorPos[2] + delta[2];
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

  private getClosestPointOnRayToPoint(ray: { origin: vec3, direction: vec3 }, point: vec3): vec3 {
    // Helper to find a representative point for distance check
    // Just return the projection of 'point' onto the ray
    const v = vec3.create();
    vec3.subtract(v, point, ray.origin);
    const t = vec3.dot(v, ray.direction);
    const closest = vec3.create();
    vec3.scaleAndAdd(closest, ray.origin, ray.direction, t);
    return closest;
  }

  private handleActorSelected = (actor: AActor | null) => {
    this.selectedActor = actor;

    if (!actor || actor.isEditorOnly || this.currentTransformMode !== 'translate') {
      this.hideGizmos();
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

      if (this.currentTransformMode === 'translate') {
        const syncPart = (actor: AActor | null, localOffset: vec3, localRotEuler?: vec3) => {
          if (!actor?.rootComponent) return;
          vec3.copy(actor.rootComponent.relativeLocation, pos);
          const worldOffset = vec3.create();
          vec3.transformQuat(worldOffset, localOffset, rot);
          vec3.add(actor.rootComponent.relativeLocation, actor.rootComponent.relativeLocation, worldOffset);

          if (localRotEuler) {
            const localQuat = quat.create();
            quat.fromEuler(localQuat, localRotEuler[0], localRotEuler[1], localRotEuler[2]);
            quat.multiply(actor.rootComponent.relativeRotation, rot, localQuat);
          } else {
            quat.copy(actor.rootComponent.relativeRotation, rot);
          }
        };

        // Sync Axes
        syncPart(this.gizmoX, vec3.fromValues(1.0, 0, 0));
        syncPart(this.gizmoY, vec3.fromValues(0, 1.0, 0));
        syncPart(this.gizmoZ, vec3.fromValues(0, 0, 1.0));

        // Sync Arrow Heads
        syncPart(this.arrowHeadX, vec3.fromValues(2.0, 0, 0), vec3.fromValues(0, 0, -90));
        syncPart(this.arrowHeadY, vec3.fromValues(0, 2.0, 0)); // Points +Y already
        syncPart(this.arrowHeadZ, vec3.fromValues(0, 0, 2.0), vec3.fromValues(90, 0, 0));
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
