import {
  EventBus, AActor, UDirectionalLightComponent, quat, vec3, World, Engine
} from '@game-creator/engine';
import { GizmoManager } from '../Systems/GizmoManager';

/**
 * Viewport Web Component that hosts the 3D Engine Canvas.
 * Handles automatic resizing via ResizeObserver.
 */
export class Viewport extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
  private _world: World | null = null;
  private gizmoManager: GizmoManager;

  constructor() {
    super();
    this.canvas = document.createElement('canvas');
    this.gizmoManager = new GizmoManager();
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

    // Initialize GizmoManager with the new world
    this.gizmoManager.init(this._world);
  }

  connectedCallback() {
    this.render();
    this.appendChild(this.canvas);
    this.resizeObserver.observe(this);

    // Delegate selection and interaction to GizmoManager
    EventBus.on('OnActorSelected', (actor: any) => this.gizmoManager.setSelectedActor(actor));

    this.canvas.addEventListener('mousedown', (e) => this.gizmoManager.onMouseDown(e, this.canvas));
    window.addEventListener('mousemove', (e) => this.gizmoManager.onMouseMove(e, this.canvas));
    window.addEventListener('mouseup', () => this.gizmoManager.onMouseUp());
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    // Manager event listeners are persistent for the lifecycle of the editor.
  }

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
    EventBus.emit('ViewportResized', { width, height });
  }
}

customElements.define('gc-viewport', Viewport);
