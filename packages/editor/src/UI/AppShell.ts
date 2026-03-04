import { EventBus, UDirectionalLightComponent, Engine, UMeshComponent } from '@game-creator/engine';
import './Resizer';
import './Viewport';
import './TopBar';

export class AppShell extends HTMLElement {
  private selectedActor: any = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();

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
  }

  private render() {
    this.innerHTML = `
      <div class="app-container">
        <header class="top-bar">
          <div class="logo">GAME CREATOR</div>
          <div class="menu">File | Edit | View | Help</div>
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
          <div class="panel-header">CONTENT BROWSER</div>
          <div class="panel-content">Assets / Models / Textures</div>
        </footer>
      </div>

      <style>
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
      </style>
    `;
  }
}

customElements.define('gc-app-shell', AppShell);
