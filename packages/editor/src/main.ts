import './styles/tokens.css';
import './UI/AppShell';
import './UI/Outliner';
import './UI/DetailsPanel';
import { EditorCameraController } from './UI/EditorCameraController';
import { Engine, AActor, UCameraComponent, UMeshComponent, vec3 } from '@game-creator/engine';

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
    vec3.set(camera.relativeLocation, 0, 0, 5); // Pull back to see the center

    // 2. Setup Test Cube
    const cubeActor = world.spawnActor(AActor, 'TestCube');
    const mesh = cubeActor.addComponent(UMeshComponent);
    cubeActor.rootComponent = mesh;
    mesh.createBox(engine.getRenderer().getDevice()!);
    // ---------------------------------

    // --- Phase 10: Editor Camera Controller ---
    new EditorCameraController(canvas, cameraActor);
    // -------------------------------------------

    engine.start();
  }
}

// Wait for the custom elements to be ready
window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
