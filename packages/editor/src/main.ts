import './styles/tokens.css';
import './UI/AppShell';
import './UI/Outliner';
import './UI/DetailsPanel';
import { EditorCameraController } from './UI/EditorCameraController';
import { Engine, AActor, UCameraComponent, UMeshComponent, UDirectionalLightComponent, vec3, EventBus, UMaterial } from '@game-creator/engine';
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
    viewport.world = world; // Triggers sunlight spawning (Phase 15 Redo)

    // 1. Setup Camera
    const cameraActor = world.spawnActor(AActor, 'MainCamera', true);
    const camera = cameraActor.addComponent(UCameraComponent);
    cameraActor.rootComponent = camera;
    vec3.set(camera.relativeLocation, 0, 4, 12); // Standard isometric perspective (Phase 13.1)

    // --- Phase 31: Test Cube Texture ---
    const cubeActor = world.spawnActor(AActor, 'TexturedCube', false);
    const cubeMesh = cubeActor.addComponent(UMeshComponent);
    cubeActor.rootComponent = cubeMesh;
    vec3.set(cubeMesh.relativeLocation, 0, 1.5, 0); // Hover above platform
    const cubeMat = new UMaterial('CubeMat');
    cubeMat.roughness = 0.3;
    cubeMat.metallic = 0.0;
    cubeMesh.material = cubeMat;
    cubeMesh.createBox(engine.getRenderer().getDevice()!);
    // Inject the test UV Checker Texture
    cubeMesh.loadTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_diffuse.jpg', engine.getRenderer().getDevice()!);
    // -----------------------------------

    // --- Phase 12-13: Editor Grid ---
    const gridActor = world.spawnActor(AActor, 'EditorGrid', true);
    const gridMesh = gridActor.addComponent(UMeshComponent);
    gridActor.rootComponent = gridMesh;
    gridMesh.createGrid(engine.getRenderer().getDevice()!);
    // -----------------------------

    // --- Phase 28: Ground Platform ---
    const platformActor = world.spawnActor(AActor, 'Platform', false);
    const platformMesh = platformActor.addComponent(UMeshComponent);
    platformActor.rootComponent = platformMesh;
    vec3.set(platformMesh.relativeLocation, 0, -0.25, 0); // Directly underneath grid
    vec3.set(platformMesh.relativeScale, 20, 0.5, 20); // Wide platform
    const mat = new UMaterial('PlatformMat');
    mat.baseColor = new Float32Array([0.2, 0.2, 0.2, 1.0]);
    mat.roughness = 0.1;
    mat.metallic = 0.2;
    platformMesh.material = mat;
    platformMesh.createBox(engine.getRenderer().getDevice()!);
    // ---------------------------------

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
      if (actor.getComponent && actor.getComponent(UDirectionalLightComponent)) {
        console.warn('Cannot delete the Directional Light!');
        return;
      }
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
