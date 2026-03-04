import { AActor, UMeshComponent, vec3 } from '@game-creator/engine';

/**
 * TopBar Web Component with tools and spawning actions.
 */
export class TopBar extends HTMLElement {
  public engine: any;
  private currentTransformSpace: 'global' | 'local' = 'global';

  constructor() {
    super();
    this.setupStyles();
  }

  connectedCallback() {
    this.render();

    import('@game-creator/engine').then(({ EventBus, UDirectionalLightComponent }) => {
      EventBus.on('OnActorSelected', (actor: AActor) => {
        console.log(`TopBar: Selected actor ${actor.name}`);
        const isSun = actor.getComponent(UDirectionalLightComponent);
        const scaleBtn = this.querySelector('#btn-scale') as HTMLButtonElement;

        if (scaleBtn) {
          if (isSun) {
            scaleBtn.disabled = true;
            scaleBtn.style.opacity = '0.3';
            scaleBtn.style.pointerEvents = 'none';
            scaleBtn.title = 'Scaling is disabled for Directional Light';

            // If we are currently in scale mode, switch to translate
            const activeModeBtn = this.querySelector('.btn-tool.active');
            if (activeModeBtn?.id === 'btn-scale') {
              (this.querySelector('#btn-move') as HTMLElement).click();
            }
          } else {
            scaleBtn.disabled = false;
            scaleBtn.style.opacity = '1';
            scaleBtn.style.pointerEvents = 'auto';
            scaleBtn.title = '';
          }
        }
      });
    });
  }

  public render() {
    this.innerHTML = `
      <div class="top-bar-content">
        <!-- Left: Application Menus -->
        <div class="left-zone">
          <div class="dropdown">
            <button class="dropbtn">File</button>
            <div class="dropdown-content">
              <a href="#">New Scene</a>
              <a href="#">Save</a>
              <a href="#">Export</a>
            </div>
          </div>
          <div class="dropdown">
            <button class="dropbtn">Edit</button>
            <div class="dropdown-content">
              <a href="#">Undo<span class="shortcut">Ctrl+Z</span></a>
              <a href="#">Redo<span class="shortcut">Ctrl+Y</span></a>
            </div>
          </div>
          <div class="dropdown">
            <button class="dropbtn">View</button>
            <div class="dropdown-content">
              <a href="#">Toggle Grid</a>
              <a href="#">Toggle UI</a>
            </div>
          </div>
          <div class="dropdown">
            <button class="dropbtn">Help</button>
            <div class="dropdown-content">
              <a href="#">Documentation</a>
              <a href="#">About</a>
            </div>
          </div>
        </div>

        <!-- Center: Transform Tools & Space Toggle -->
        <div class="center-zone">
          <div class="transform-tools">
            <button id="btn-move" class="btn-tool active" title="Move">
              <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20"/></svg>
            </button>
            <button id="btn-rotate" class="btn-tool" title="Rotate">
              <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            <button id="btn-scale" class="btn-tool" title="Scale">
              <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2"><path d="M21 3l-6 6M21 3v6M21 3h-6M3 21l6-6M3 21v-6M3 21h6M14.5 9.5L9.5 14.5"/></svg>
            </button>
            
            <div style="width: 1px; height: 16px; background-color: rgba(255,255,255,0.1); margin: auto 4px;"></div>
            
            <button id="btn-toggle-space" class="btn-tool" title="Space: Global" style="color: var(--accent-color);">
              <svg id="icon-global" viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <ellipse cx="12" cy="12" rx="9" ry="3"/>
                <ellipse cx="12" cy="12" rx="3" ry="9"/>
              </svg>
              <svg id="icon-local" viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
                <path d="M12 12V3m0 0L9 6m3-3l3 3"/>
                <path d="M12 12h9m0 0l-3-3m3 3l-3 3"/>
                <path d="M12 12l-7 7m0 0h3m-3 0v-3"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Right: Primitives Menu -->
        <div class="right-zone">
          <div class="dropdown">
            <button class="btn-primary" title="Primitivas">
              <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              <svg viewBox="0 0 24 24" fill="none" class="icon icon-small" stroke="currentColor" stroke-width="3" style="margin-left:4px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <div class="dropdown-content dropdown-right">
              <button id="btn-spawn-cube" class="dropdown-button">Cube</button>
              <button class="dropdown-button">Sphere</button>
              <button class="dropdown-button">Plane</button>
            </div>
          </div>
        </div>
      </div>
      <style>
        .top-bar-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          height: 100%;
          padding: 0 16px;
          background-color: var(--panel-bg);
          border-bottom: 1px solid var(--border-color);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          user-select: none;
          position: relative;
        }

        .left-zone { 
          flex: 1;
          display: flex; 
          justify-content: flex-start; 
          align-items: center; 
          gap: 10px; 
        }
        
        .center-zone { 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          gap: 10px; 
        }
        
        .right-zone { 
          flex: 1;
          display: flex; 
          justify-content: flex-end; 
          align-items: center; 
          gap: 10px; 
        }
        
        /* Dropdowns */
        .dropdown {
          position: relative;
        }
        .dropbtn {
          background: transparent;
          color: #cccccc;
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: background-color 0.15s, color 0.15s;
        }
        .dropbtn:hover, .dropdown.open .dropbtn {
          background-color: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }
        .dropdown:hover > .dropdown-content {
          display: block;
        }
        .dropdown-content {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 9999;
          background: var(--bg-panel);
          min-width: 160px;
          border-radius: 6px;
          border: 1px solid #444;
          box-shadow: 0 8px 16px rgba(0,0,0,0.4);
          padding: 4px 0;
        }
        .dropdown-right {
          left: auto;
          right: 0;
          min-width: 120px;
        }
        .dropdown-content a, .dropdown-button {
          color: #ddd;
          padding: 8px 16px;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.1s;
        }
        .dropdown-content a:hover, .dropdown-button:hover {
          background-color: var(--accent-color);
          color: white;
        }
        .shortcut {
          color: #888;
          font-size: 11px;
        }
        .dropdown-content a:hover .shortcut {
          color: #ccc;
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
        .btn-tool .icon {
          width: 16px;
          height: 16px;
          vertical-align: middle;
        }
        .btn-icon {
          background: transparent;
          color: #aaa;
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon:hover {
          color: white;
          background-color: rgba(255,255,255,0.05);
        }
        .btn-icon .icon {
          width: 20px;
          height: 20px;
          vertical-align: middle;
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
          display: flex;
          align-items: center;
        }
        .btn-primary:hover {
          background-color: #555;
        }
        .btn-primary .icon {
          width: 18px;
          height: 18px;
          vertical-align: middle;
        }
        .btn-primary .icon-small {
          width: 12px;
          height: 12px;
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

    const addBtn = this.querySelector('#btn-spawn-cube');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.spawnCube());
    }

    const spaceBtn = this.querySelector('#btn-toggle-space') as HTMLButtonElement;
    if (spaceBtn) {
      spaceBtn.addEventListener('click', () => {
        this.currentTransformSpace = this.currentTransformSpace === 'global' ? 'local' : 'global';
        spaceBtn.title = `Space: ${this.currentTransformSpace.charAt(0).toUpperCase() + this.currentTransformSpace.slice(1)}`;

        const iconGlobal = spaceBtn.querySelector('#icon-global') as HTMLElement;
        const iconLocal = spaceBtn.querySelector('#icon-local') as HTMLElement;

        if (this.currentTransformSpace === 'local') {
          if (iconGlobal) iconGlobal.style.display = 'none';
          if (iconLocal) iconLocal.style.display = 'inline-block';
        } else {
          if (iconGlobal) iconGlobal.style.display = 'inline-block';
          if (iconLocal) iconLocal.style.display = 'none';
        }

        import('@game-creator/engine').then(({ EventBus }) => {
          EventBus.emit('OnTransformSpaceChanged', this.currentTransformSpace);
        });
      });
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
    this.style.flex = '1';
    this.style.height = '100%';
  }
}

customElements.define('gc-topbar', TopBar);
