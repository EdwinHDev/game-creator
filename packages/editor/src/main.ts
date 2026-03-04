import './styles/tokens.css';
import './UI/AppShell';
import './UI/Outliner';
import './UI/DetailsPanel';
import { EditorCameraController } from './UI/EditorCameraController';
import { Engine, AActor, UCameraComponent, UMeshComponent, UDirectionalLightComponent, vec3, EventBus } from '@game-creator/engine';
import { EditorLogger } from './Core/EditorLogger';
import { ProjectSystem } from './Core/ProjectSystem';
import './UI/TopBar';

EditorLogger.info('Game Creator Editor Initialized');

export let globalEngine: Engine | null = null;

async function initEngine() {
  const viewport = document.querySelector('gc-viewport') as any; // Cast for custom method access
  if (viewport) {
    const canvas = viewport.getCanvas();
    const engine = new Engine();
    await engine.initialize(canvas);

    // --- Phase 7: Test Scene Setup ---
    const world = engine.getWorld();
    viewport.world = world; // Triggers sunlight spawning (Phase 15 Redo)

    // 1. Setup Camera
    const cameraActor = world.spawnActor(AActor, 'MainCamera', true);
    const camera = cameraActor.addComponent(UCameraComponent);
    cameraActor.rootComponent = camera;
    vec3.set(camera.relativeLocation, 0, 4, 12); // Standard isometric perspective (Phase 13.1)

    // --- Phase 12-13: Editor Grid ---
    const gridActor = world.spawnActor(AActor, 'EditorGrid', true);
    const gridMesh = gridActor.addComponent(UMeshComponent);
    gridActor.rootComponent = gridMesh;
    gridMesh.createGrid(engine.getRenderer().getDevice()!);
    // -----------------------------

    // --- Phase 10: Editor Camera Controller ---
    new EditorCameraController(canvas, cameraActor);
    // -------------------------------------------

    // --- Phase 11: TopBar Integration ---
    const topbar = document.querySelector('gc-topbar') as any;
    if (topbar) {
      topbar.engine = engine;
      topbar.render(); // Re-render now that it has the engine
    }

    // Handle project open requests from UI
    EventBus.on('RequestProjectOpen', () => {
      ProjectSystem.loadProject(engine);
    });

    // Handle actor destruction requests from UI
    EventBus.on('RequestActorDestruction', (actor: any) => {
      if (actor.getComponent && actor.getComponent(UDirectionalLightComponent)) {
        EditorLogger.warn('Cannot delete the Directional Light!');
        return;
      }
      world.destroyActor(actor);
    });
    // ------------------------------------

    // Only start engine loop after a project is loaded
    EventBus.subscribe('PROJECT_LOADED', () => {
      if (!engine.isStarted) {
        engine.start();
        EditorLogger.info('Engine loop started after project load.');
      }
    });
  }
}

// Wait for the custom elements to be ready
window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
