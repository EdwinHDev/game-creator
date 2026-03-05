import './styles/tokens.css';
import './UI/AppShell';
import './UI/Outliner';
import './UI/DetailsPanel';
import { EditorCameraController } from './UI/EditorCameraController';
import { Engine, AActor, UCameraComponent, UDirectionalLightComponent, vec3, EventBus } from '@game-creator/engine';
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
    EditorLogger.info("Motor y Assets listos.");

    // --- Phase 7: Test Scene Setup ---
    const world = Engine.getInstance().getActiveWorld()!;
    viewport.world = world; // Triggers sunlight spawning (Phase 15 Redo)

    // 1. Setup Camera
    const cameraActor = world.spawnActor(AActor, 'MainCamera', true);
    const camera = cameraActor.addComponent(UCameraComponent);
    cameraActor.rootComponent = camera;
    vec3.set(camera.relativeLocation, 0, 4, 12); // Standard isometric perspective (Phase 13.1)


    // --- Phase 10: Editor Camera Controller ---
    new EditorCameraController(canvas, cameraActor);
    // -------------------------------------------

    // --- Phase 11: TopBar Integration ---
    const topbar = document.querySelector('gc-topbar') as any;
    if (topbar) {
      topbar.engine = engine;
      topbar.render(); // Re-render now that it has the engine
    }

    // --- Content Browser Mock ---
    const assetManager = (window as any).UAssetManager || (await import('@game-creator/engine')).UAssetManager;
    const assetList = assetManager.getInstance().getAssetDataList();

    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.bottom = '10px';
    panel.style.left = '50%';
    panel.style.transform = 'translateX(-50%)';
    panel.style.display = 'flex';
    panel.style.gap = '8px';
    panel.style.padding = '8px';
    panel.style.background = 'rgba(20,20,20,0.8)';
    panel.style.borderRadius = '8px';
    panel.style.zIndex = '9999';

    assetList.forEach((a: any) => {
      if (a.type === 'StaticMesh') {
        const btn = document.createElement('button');
        btn.textContent = `Spawn ${a.name.replace('Primitive_', '')}`;
        btn.style.padding = '5px 10px';
        btn.style.cursor = 'pointer';
        btn.onclick = () => {
          const newActor = engine.spawnActorByAssetId(a.name);
          if (newActor) {
            EventBus.dispatch('OnActorSelected', newActor);
            EventBus.emit('OnWorldChanged', {});
          }
        };
        panel.appendChild(btn);
      }
    });

    // Add Light Button temporarily here since we deleted it from TopBar
    const lightBtn = document.createElement('button');
    lightBtn.textContent = 'Spawn DL';
    lightBtn.style.padding = '5px 10px';
    lightBtn.style.cursor = 'pointer';
    lightBtn.onclick = () => {
      const world = engine.getActiveWorld()!;
      const itemCount = world.actors.filter((a: any) => a.name.startsWith(`DirectionalLight_`)).length;
      const newActor = world.spawnActor(AActor, `DirectionalLight_${itemCount + 1}`);
      const light = newActor.addComponent(UDirectionalLightComponent);
      newActor.rootComponent = light;
      light.intensity = 5.0;
      light.castShadows = true;
      vec3.set(light.relativeLocation, 10, 20, 10);
      vec3.set(light.relativeRotation, -45, 45, 0);
      EventBus.dispatch('OnActorSelected', newActor);
      EventBus.emit('OnWorldChanged', {});
    };
    panel.appendChild(lightBtn);

    document.body.appendChild(panel);
    // ----------------------------

    // Handle project open requests from UI
    EventBus.on('RequestProjectOpen', () => {
      ProjectSystem.loadProject(engine);
    });

    // Handle actor creation/destruction for unsaved changes (Phase 54)
    EventBus.on('OnActorSpawned', () => ProjectSystem.markUnsaved());

    // Handle actor destruction requests from UI
    EventBus.on('RequestActorDestruction', (actor: any) => {
      if (actor.getComponent && actor.getComponent(UDirectionalLightComponent)) {
        EditorLogger.warn('Cannot delete the Directional Light!');
        return;
      }
      world.destroyActor(actor);
      ProjectSystem.markUnsaved(); // Mark dirty on destruction
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
