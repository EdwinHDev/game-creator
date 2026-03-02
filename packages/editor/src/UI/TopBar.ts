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
        <button id="btn-add-cube" class="btn-primary">+ Add Cube</button>
      </div>
      <style>
        .top-bar-content {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 100%;
          padding: 0 10px;
        }
        .btn-primary {
          background-color: var(--accent-color);
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          transition: filter 0.2s;
        }
        .btn-primary:hover {
          filter: brightness(1.1);
        }
        .btn-primary:active {
          filter: brightness(0.9);
        }
      </style>
    `;

    const btn = this.querySelector('#btn-add-cube');
    if (btn) {
      btn.addEventListener('click', () => this.spawnCube());
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
