import { AActor, UMeshComponent, vec3 } from '@game-creator/engine';

/**
 * TopBar Web Component with tools and spawning actions.
 */
export class TopBar extends HTMLElement {
  public engine: any;

  constructor() {
    super();
    this.setupStyles();
  }

  connectedCallback() {
    this.render();
  }

  public render() {
    this.innerHTML = `
      <div class="top-bar-content">
        <div class="transform-tools">
          <button id="btn-move" class="btn-tool active">Move</button>
          <button id="btn-rotate" class="btn-tool">Rotate</button>
          <button id="btn-scale" class="btn-tool">Scale</button>
        </div>
        <div class="divider"></div>
        <button id="btn-add-cube" class="btn-primary">+ Add Cube</button>
      </div>
      <style>
        .top-bar-content {
          display: flex;
          align-items: center;
          gap: 15px;
          height: 100%;
          padding: 0 15px;
          background-color: var(--panel-bg);
          border-bottom: 1px solid var(--border-color);
        }
        .transform-tools {
          display: flex;
          gap: 4px;
          background-color: rgba(0,0,0,0.2);
          padding: 3px;
          border-radius: 6px;
        }
        .btn-tool {
          background: transparent;
          color: #aaa;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-tool:hover {
          color: white;
          background-color: rgba(255,255,255,0.05);
        }
        .btn-tool.active {
          background-color: var(--accent-color);
          color: white;
          font-weight: bold;
        }
        .divider {
          width: 1px;
          height: 20px;
          background-color: var(--border-color);
        }
        .btn-primary {
          background-color: #444;
          color: #eee;
          border: none;
          padding: 5px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover {
          background-color: #555;
        }
      </style>
    `;

    // Listeners for transform modes
    const modes: ('translate' | 'rotate' | 'scale')[] = ['translate', 'rotate', 'scale'];
    const ids = ['btn-move', 'btn-rotate', 'btn-scale'];

    ids.forEach((id, index) => {
      const btn = this.querySelector(`#${id}`);
      if (btn) {
        btn.addEventListener('click', () => {
          // Update visual active state
          this.querySelectorAll('.btn-tool').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Emit event
          import('@game-creator/engine').then(({ EventBus }) => {
            EventBus.emit('OnTransformModeChanged', modes[index]);
          });
        });
      }
    });

    const addBtn = this.querySelector('#btn-add-cube');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.spawnCube());
    }
  }

  private spawnCube() {
    if (!this.engine) return;

    const world = this.engine.getWorld();
    const renderer = this.engine.getRenderer();
    const device = renderer.getDevice();

    if (!device) return;

    // 1. Find the editor camera
    const actors = world.actors;
    const cameraActor = actors.find((a: any) => a.name === 'MainCamera');

    let spawnPos = vec3.fromValues(0, 0, 0);

    if (cameraActor && cameraActor.rootComponent) {
      const camPos = cameraActor.rootComponent.relativeLocation;
      const camRot = cameraActor.rootComponent.relativeRotation;

      // Calculate forward vector from rotation
      const forward = vec3.fromValues(0, 0, -1);
      vec3.transformQuat(forward, forward, camRot);

      // Spawn 5 units in front
      vec3.scaleAndAdd(spawnPos, camPos, forward, 5);
    }

    // 2. Spawn the actor
    const cubeCount = actors.filter((a: any) => a.name.startsWith('Cube_')).length;
    const newCube = world.spawnActor(AActor, `Cube_${cubeCount + 1}`);
    const mesh = newCube.addComponent(UMeshComponent);
    newCube.rootComponent = mesh;

    // Set position
    vec3.copy(mesh.relativeLocation, spawnPos);

    // Create GPU buffers
    mesh.createBox(device);

    console.log(`Spawned new cube at ${spawnPos}`);
  }

  private setupStyles() {
    this.style.display = 'block';
    this.style.height = '100%';
  }
}

customElements.define('gc-topbar', TopBar);
