import { EventBus, UDirectionalLightComponent, Engine, UMeshComponent } from '@game-creator/engine';
import './Resizer';
import './Viewport';
import './TopBar';
import './ContentBrowser';
import { ProjectSystem } from '../Core/ProjectSystem';

export class AppShell extends HTMLElement {
  private selectedActor: any = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.showLauncher();

    // Track selection for global actions (like Delete)
    EventBus.on('OnActorSelected', (actor: any) => {
      this.selectedActor = actor;
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Delete' && this.selectedActor) {
        const isSun = this.selectedActor.name === 'MainCamera' ||
          (this.selectedActor.getComponent && this.selectedActor.getComponent(UDirectionalLightComponent));

        if (!isSun) {
          EventBus.emit('RequestActorDestruction', this.selectedActor);
          this.selectedActor = null;
        } else {
          console.warn(`Deletion blocked for protected actor: ${this.selectedActor.name}`);
        }
      }
    });

    // Phase 32: Drag & Drop Texture Importer setup
    const contentBrowser = this.querySelector('.content-browser');
    if (contentBrowser) {
      contentBrowser.addEventListener('dragover', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        contentBrowser.classList.add('drag-active');
      });

      contentBrowser.addEventListener('dragleave', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        contentBrowser.classList.remove('drag-active');
      });

      contentBrowser.addEventListener('drop', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        contentBrowser.classList.remove('drag-active');

        const file = e.dataTransfer?.files[0];
        if (file && file.type.startsWith('image/')) {
          const localUrl = URL.createObjectURL(file);

          if (this.selectedActor) {
            const mesh = this.selectedActor.getComponent(UMeshComponent);
            if (mesh) {
              const engine = Engine.getInstance();
              if (engine && engine.getRenderer() && engine.getRenderer().getDevice()) {
                mesh.loadTexture(localUrl, engine.getRenderer().getDevice()!);
              }
            }
          }
        }
      });
    }

    // Phase 33: Listen for DetailsPanel PBR Texture assignment events globally
    EventBus.on('OnTextureDropped', (payload: any) => {
      const { type, url } = payload;

      if (this.selectedActor) {
        const mesh = this.selectedActor.getComponent(UMeshComponent);
        if (mesh) {
          const engine = Engine.getInstance();
          if (engine && engine.getRenderer() && engine.getRenderer().getDevice()) {
            mesh.loadTexture(url, engine.getRenderer().getDevice()!, type); // Passing `type` to indicate which slot
          }
        }
      }
    });

    EventBus.subscribe('PROJECT_LOADED', () => {
      const launcher = this.querySelector('#project-launcher') as HTMLElement;
      if (launcher) launcher.style.display = 'none';

      const app = this.querySelector('.app-container') as HTMLElement;
      if (app) app.style.visibility = 'visible';
    });
  }

  private hasValidResolution(): boolean {
    const MIN_WIDTH = 1360;
    const MIN_HEIGHT = 768;
    return window.screen.width >= MIN_WIDTH && window.screen.height >= MIN_HEIGHT;
  }

  private updateLauncherResolutionState() {
    const launcher = this.querySelector('#project-launcher') as HTMLElement;
    if (!launcher || launcher.style.display === 'none') return;

    const isValid = this.hasValidResolution();
    const btnNew = this.querySelector('#btn-new-proj') as HTMLButtonElement;
    const btnOpen = this.querySelector('#btn-open-proj') as HTMLButtonElement;
    const warning = this.querySelector('#resolution-warning') as HTMLElement;

    if (btnNew) {
      btnNew.disabled = !isValid;
      btnNew.style.opacity = isValid ? '1' : '0.4';
      btnNew.style.cursor = isValid ? 'pointer' : 'not-allowed';
    }

    if (btnOpen) {
      btnOpen.disabled = !isValid;
      btnOpen.style.opacity = isValid ? '1' : '0.4';
      btnOpen.style.cursor = isValid ? 'pointer' : 'not-allowed';
    }

    if (warning) {
      warning.style.display = isValid ? 'none' : 'block';
    }
  }

  private showLauncher() {
    const launcher = this.querySelector('#project-launcher') as HTMLElement;
    if (launcher) launcher.style.display = 'flex';

    const app = this.querySelector('.app-container') as HTMLElement;
    if (app) app.style.visibility = 'hidden';

    this.updateLauncherResolutionState();

    // Listen for resolution changes (e.g. moving window to another monitor)
    window.addEventListener('resize', () => this.updateLauncherResolutionState());

    this.querySelector('#btn-new-proj')?.addEventListener('click', () => {
      ProjectSystem.createProject();
    });

    this.querySelector('#btn-open-proj')?.addEventListener('click', () => {
      EventBus.emit('RequestProjectOpen', {});
    });
  }

  private render() {
    this.innerHTML = `
      <div class="app-container">
        <header class="top-bar">
          <div class="logo">GAME CREATOR</div>
          <gc-topbar id="main-topbar"></gc-topbar>
        </header>

        <aside class="outliner">
          <div class="panel-header">OUTLINER</div>
          <gc-outliner></gc-outliner>
        </aside>

        <gc-resizer type="vertical" target-var="--left-width" side="left" min="150" max="500"></gc-resizer>

        <main class="viewport">
          <gc-viewport id="main-viewport"></gc-viewport>
        </main>

        <gc-resizer type="vertical" target-var="--right-width" side="right" min="150" max="500"></gc-resizer>

        <aside class="details">
          <gc-details-panel></gc-details-panel>
        </aside>

        <!-- Horizontal Resizer in its own row -->
        <gc-resizer type="horizontal" target-var="--bottom-height" side="bottom" min="100" max="600"></gc-resizer>

        <footer class="content-browser">
          <gc-content-browser></gc-content-browser>
        </footer>
      </div>

      <div id="project-launcher">
        <div class="launcher-content">
          <h1>GAME CREATOR</h1>
          <p>Select or create a project to start building.</p>
          <div class="launcher-actions">
            <button id="btn-new-proj" class="btn-launcher">New Project</button>
            <button id="btn-open-proj" class="btn-launcher secondary">Open Project</button>
          </div>
          <div id="resolution-warning" style="display: none; flex-direction: column; align-items: center; color: #ff6b6b; background-color: rgba(255,0,0,0.05); padding: 16px 20px; border: 1px solid rgba(255,107,107,0.3); border-radius: 6px; margin-top: 20px; gap: 10px;">
            <span style="font-size: 2rem; line-height: 1; display: block; margin-bottom: 10px;">⚠️</span>
            <span style="font-size: 0.85rem; line-height: 1.4; text-align: center; max-width: 400px;">
              Resolución no soportada.<br>El motor requiere un monitor físico de al menos 1360x768 para mostrar correctamente las herramientas de desarrollo.
            </span>
          </div>
        </div>
      </div>

      <style>
        /* Strict styling for disabled buttons in the launcher */
        button:disabled {
            background-color: var(--bg-surface) !important;
            color: #555555 !important;
            border: 1px solid var(--border-color) !important;
            cursor: not-allowed !important;
            opacity: 0.7 !important;
            pointer-events: none !important; /* Anula hover, active o clic */
            box-shadow: none !important;
            transform: none !important;
        }

        .app-container {
          display: grid;
          width: 100vw;
          height: 100vh;
          grid-template-rows: var(--top-height) 1fr 4px var(--bottom-height);
          grid-template-columns: var(--left-width) 4px 1fr 4px var(--right-width);
          transition: var(--transition-layout);
          overflow: hidden;
        }

        body.is-resizing .app-container {
          transition: none !important;
        }

        .top-bar {
          grid-row: 1;
          grid-column: 1 / -1;
          background-color: var(--bg-surface);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          padding: 0 15px;
          font-size: 12px;
          font-weight: bold;
        }

        .logo {
            color: var(--accent-color);
            margin-right: 20px;
        }

        .outliner {
          grid-row: 2;
          grid-column: 1;
          background-color: var(--bg-panel);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .viewport {
          grid-row: 2;
          grid-column: 3;
          background-color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .viewport-label {
            color: #444;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 2px;
        }

        .details {
          grid-row: 2;
          grid-column: 5;
          background-color: var(--bg-panel);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        gc-resizer[type="horizontal"] {
            grid-row: 3;
            grid-column: 1 / -1;
        }

        .content-browser {
          grid-row: 4;
          grid-column: 1 / -1;
          background-color: var(--bg-panel);
          border-top: 1px solid var(--border-color);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .panel-header {
            padding: 8px 12px;
            background-color: var(--bg-surface);
            font-size: 10px;
            letter-spacing: 1px;
            font-weight: bold;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border-color);
        }

        .panel-content {
            padding: 10px;
            font-size: 13px;
        }

        #project-launcher {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: var(--bg-panel);
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          color: white;
        }

        .launcher-content {
          text-align: center;
          max-width: 400px;
        }

        .launcher-content h1 {
          font-size: 48px;
          color: var(--accent-color);
          margin-bottom: 8px;
          letter-spacing: 4px;
        }

        .launcher-content p {
          color: var(--text-muted);
          margin-bottom: 40px;
        }

        .launcher-actions {
          display: flex;
          gap: 15px;
          justify-content: center;
        }

        .btn-launcher {
          background-color: var(--accent-color);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s;
        }

        .btn-launcher:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
        }

        .btn-launcher.secondary {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
        }
      </style>
    `;
  }
}

customElements.define('gc-app-shell', AppShell);
