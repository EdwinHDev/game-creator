import { EventBus, AActor, UDirectionalLightComponent, UGizmoComponent, quat, vec3, World, Engine } from '@game-creator/engine';

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
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    EventBus.off('OnActorSelected', this.handleActorSelected);
    EventBus.off('EngineTick', this.handleTick);
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
