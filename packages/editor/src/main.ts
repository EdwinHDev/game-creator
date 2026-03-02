import './styles/tokens.css';
import './UI/AppShell';
import './UI/Outliner';
import './UI/DetailsPanel';
import { EditorCameraController } from './UI/EditorCameraController';
import { Engine, AActor, UCameraComponent, UMeshComponent, vec3, EventBus } from '@game-creator/engine';
import './UI/TopBar';

console.log('Game Creator Editor Initialized');

async function initEngine() {
  const viewport = document.querySelector('gc-viewport') as any; // Cast for custom method access
  if (viewport) {
    const canvas = viewport.getCanvas();
    const engine = new Engine();
    await engine.initialize(canvas);

    // --- Phase 7: Test Scene Setup ---
    const world = engine.getWorld();

    // 1. Setup Camera
    const cameraActor = world.spawnActor(AActor, 'MainCamera');
    const camera = cameraActor.addComponent(UCameraComponent);
    cameraActor.rootComponent = camera;
    vec3.set(camera.relativeLocation, 0, 5, 10); // Elevated perspective

    // --- Phase 12: Editor Grid ---
    const gridActor = world.spawnActor(AActor, 'EditorGrid');
    const gridMesh = gridActor.addComponent(UMeshComponent);
    gridActor.rootComponent = gridMesh;
    gridMesh.createGrid(engine.getRenderer().getDevice()!, 100, 100);
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

    // Handle actor destruction requests from UI
    EventBus.on('RequestActorDestruction', (actor: any) => {
      world.destroyActor(actor);
    });
    // ------------------------------------

    engine.start();
  }
}

// Wait for the custom elements to be ready
window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
