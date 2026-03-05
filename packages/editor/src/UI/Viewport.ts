import {
  EventBus, Engine
} from '@game-creator/engine';
import { GizmoManager } from '../Systems/GizmoManager';
import { EditorLogger } from '../Core/EditorLogger';

/**
 * Viewport Web Component that hosts the 3D Engine Canvas.
 * Handles automatic resizing via ResizeObserver.
 */
export class Viewport extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
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
  set world(_value: any) {
    this.spawnSun();
  }

  private spawnSun() {
    // === Deshabilitado temporalmente para romper recursión inicial ===
    // El sol debe crearse mediante una factoría más estable tras inicializar todo
    /*
    const activeWorld = Engine.getInstance().getActiveWorld();
    if (!activeWorld) return;

    // --- Phase 15: Directional Light ---
    const lightActor = activeWorld.spawnActor(AActor, 'DirectionalLight', false);
    const sun = lightActor.addComponent(UDirectionalLightComponent);
    lightActor.rootComponent = sun;

    sun.intensity = 1.2;
    vec3.set(sun.relativeLocation, 0, 15, 0); // Raised sun
    quat.fromEuler(sun.relativeRotation, -45, -45, 0);
    // ------------------------------------
    */

    // Rebuild gizmos for the new world
    this.gizmoManager.setSelectedActor(null);
  }

  connectedCallback() {
    this.render();
    this.appendChild(this.canvas);
    this.resizeObserver.observe(this);

    // Delegate selection and interaction to GizmoManager
    EventBus.on('OnActorSelected', (actor: any) => this.gizmoManager.setSelectedActor(actor));

    // RECURSIÓN ROTA: Comentamos esto temporalmente
    // EventBus.on('OnActiveWorldChanged', () => this.spawnSun());

    this.canvas.addEventListener('mousedown', (e) => this.gizmoManager.onMouseDown(e, this.canvas));
    window.addEventListener('mousemove', (e) => this.gizmoManager.onMouseMove(e, this.canvas));
    window.addEventListener('mouseup', () => this.gizmoManager.onMouseUp());

    // Drag and Drop (Unreal Style)
    this.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    this.addEventListener('drop', (e) => {
      e.preventDefault();
      const assetId = e.dataTransfer?.getData('gc-asset-id');
      if (assetId) {
        const engine = Engine.getInstance();
        const newActor = engine.spawnActorByAssetId(assetId);
        if (newActor) {
          EditorLogger.info(`Actor instanciado desde Content Browser: ${newActor.name}`);
          EventBus.dispatch('OnActorSelected', newActor);
          EventBus.emit('OnWorldChanged', {});
        }
      }
    });

    this.startRenderLoop();
  }

  private startRenderLoop() {
    const render = () => {
      const engine = Engine.getInstance();
      const activeWorld = engine.getActiveWorld();
      if (activeWorld) {
        engine.getRenderer().render(activeWorld);
      }
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
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
