import {
  EventBus, AActor, UDirectionalLightComponent, UGizmoComponent,
  quat, vec3, World, Engine,
  getRayFromCamera, intersectRayPlane, distancePointToSegment
} from '@game-creator/engine';

/**
 * Viewport Web Component that hosts the 3D Engine Canvas.
 * Handles automatic resizing via ResizeObserver.
 */
export class Viewport extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
  private _world: World | null = null;
  private gizmoActor: AActor | null = null;
  private selectedActor: AActor | null = null;

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

    // --- Phase 17.1: Visual Gizmo ---
    this.gizmoActor = this._world.spawnActor(AActor, 'VisualGizmo', true); // isEditorOnly = true
    const gizmoComp = this.gizmoActor.addComponent(UGizmoComponent);
    this.gizmoActor.rootComponent = gizmoComp;

    // Create the buffers (Wait for engine to be ready or just use a small delay if needed, 
    // but better to get device from Engine)
    const engine = Engine.getInstance();
    const renderer = engine.getRenderer();
    const device = renderer.getDevice();
    if (device) {
      gizmoComp.createAxisGizmo(device);
    }

    // Initial hide
    gizmoComp.relativeLocation = vec3.fromValues(99999, 99999, 99999);
    // ------------------------------------
  }

  connectedCallback() {
    this.render();
    this.appendChild(this.canvas);
    this.resizeObserver.observe(this);

    EventBus.on('OnActorSelected', this.handleActorSelected);
    EventBus.on('EngineTick', this.handleTick);

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
    const gizmoSize = 1.5;

    const axes = [
      { dir: vec3.fromValues(1, 0, 0), axis: 'X' as const },
      { dir: vec3.fromValues(0, 1, 0), axis: 'Y' as const },
      { dir: vec3.fromValues(0, 0, 1), axis: 'Z' as const },
    ];

    let bestAxis: 'X' | 'Y' | 'Z' | null = null;
    let minDistance = 0.5; // Threshold

    for (const a of axes) {
      const end = vec3.create();
      vec3.scaleAndAdd(end, pos, a.dir, gizmoSize);

      // Approximate: find closest point on ray to the segment
      // For simplicity, we can just check distance from ray to segment
      // A ray is origin + t*dir. 
      // We'll use a simpler distance check: distance from ray to a few points on the segment
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

      // Force update of UI if needed (though it should update next frame)
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

    if (this.gizmoActor && this.gizmoActor.rootComponent) {
      if (!actor || actor.isEditorOnly) {
        // Move gizmo far away when nothing selected
        this.gizmoActor.rootComponent.relativeLocation = vec3.fromValues(99999, 99999, 99999);
      }
    }
  };

  private handleTick = () => {
    if (this.selectedActor && this.gizmoActor && this.selectedActor.rootComponent && this.gizmoActor.rootComponent) {
      // Sync Gizmo Transform with Selected Actor
      vec3.copy(this.gizmoActor.rootComponent.relativeLocation, this.selectedActor.rootComponent.relativeLocation);
      quat.copy(this.gizmoActor.rootComponent.relativeRotation, this.selectedActor.rootComponent.relativeRotation);
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

    console.debug(`Viewport DOM resized to: ${width}x${height}`);
  }
}

customElements.define('gc-viewport', Viewport);
