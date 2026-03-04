import { EventBus } from '@game-creator/engine';
import { ProjectSystem } from '../Core/ProjectSystem';

/**
 * Content Browser component for managing project assets.
 * Redesigned as a native Web Component for visual consistency.
 */
export class ContentBrowser extends HTMLElement {
  private tabsContainer: HTMLDivElement;
  private actionBar: HTMLDivElement;
  private contentArea: HTMLDivElement;
  private currentTab: string = 'All';
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  constructor() {
    super();
    this.setupBaseStyles();

    // 1. CABECERA OSCURA (Título)
    const header = document.createElement('div');
    header.style.backgroundColor = 'var(--bg-surface)';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.padding = '8px 12px';

    const title = document.createElement('div');
    title.textContent = 'Content Browser';
    title.style.fontSize = '0.68rem';
    title.style.textTransform = 'uppercase';
    title.style.opacity = '0.7';
    title.style.color = 'var(--text-main)';
    header.appendChild(title);
    this.appendChild(header);

    // 2. TOOLBAR UNIFICADA (Tabs a la izquierda, Botones a la derecha)
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.alignItems = 'center';
    toolbar.style.backgroundColor = 'var(--bg-panel)';
    toolbar.style.borderBottom = '1px solid var(--border-color)';
    toolbar.style.padding = '0 8px';

    // 2A. Contenedor de Tabs (Izquierda)
    this.tabsContainer = document.createElement('div');
    this.tabsContainer.style.display = 'flex';

    const tabs = ['All', 'Textures', 'Models', 'Materials'];
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.textContent = tab;
      btn.dataset.tab = tab;
      this.styleTabButton(btn, tab === this.currentTab);

      btn.addEventListener('click', () => {
        this.currentTab = tab;
        this.updateTabs();
        this.refreshContent();
      });
      this.tabsContainer.appendChild(btn);
    });

    // 2B. Contenedor de Botones de Acción (Derecha)
    this.actionBar = document.createElement('div');
    this.actionBar.style.display = 'flex';
    this.actionBar.style.gap = '8px';

    const importBtn = this.createActionButton('+ Import');
    const newMatBtn = this.createActionButton('+ New Material');

    importBtn.addEventListener('click', () => {
      alert('Import feature coming soon!');
    });

    newMatBtn.addEventListener('click', () => this.handleCreateMaterial());

    this.actionBar.appendChild(importBtn);
    this.actionBar.appendChild(newMatBtn);

    // Ensamblar Toolbar
    toolbar.appendChild(this.tabsContainer);
    toolbar.appendChild(this.actionBar);
    this.appendChild(toolbar);

    // 3. CONTENT AREA (Área de archivos)
    this.contentArea = document.createElement('div');
    this.contentArea.style.display = 'flex';
    this.contentArea.style.flexWrap = 'wrap';
    this.contentArea.style.gap = '10px';
    this.contentArea.style.padding = '12px';
    this.contentArea.style.flex = '1';
    this.contentArea.style.overflowY = 'auto';
    this.contentArea.style.alignContent = 'flex-start';
    this.appendChild(this.contentArea);
  }

  connectedCallback() {
    EventBus.subscribe('PROJECT_LOADED', (data: any) => {
      this.directoryHandle = data.handle;
      this.refreshContent();
    });

    EventBus.on('RequestContentBrowserRefresh', () => this.refreshContent());

    // Initial load if project already open
    if (ProjectSystem.directoryHandle) {
      this.directoryHandle = ProjectSystem.directoryHandle;
      this.refreshContent();
    }
  }

  private setupBaseStyles() {
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.minHeight = '200px';
    this.style.backgroundColor = 'var(--bg-panel)';
    this.style.color = 'var(--text-main)';
    this.style.overflow = 'hidden';
  }

  private styleTabButton(btn: HTMLButtonElement, isActive: boolean) {
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.padding = '8px 16px';
    btn.style.fontSize = '0.7rem';
    btn.style.fontWeight = 'bold';
    btn.style.textTransform = 'uppercase';
    btn.style.cursor = 'pointer';
    btn.style.color = isActive ? 'var(--text-main)' : 'var(--text-muted)';
    btn.style.borderBottom = isActive ? '2px solid var(--accent-color)' : '2px solid transparent';
    btn.style.transition = 'color 0.2s, border-color 0.2s';

    // Using mouse events for hover effects since we're using inline styles
    btn.onmouseenter = () => { if (!isActive) btn.style.color = 'var(--text-main)'; };
    btn.onmouseleave = () => { if (!isActive) btn.style.color = 'var(--text-muted)'; };
  }

  private createActionButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.backgroundColor = 'var(--bg-surface)';
    btn.style.color = 'var(--text-main)';
    btn.style.border = '1px solid var(--border-color)';
    btn.style.padding = '4px 12px';
    btn.style.fontSize = '0.75rem';
    btn.style.borderRadius = '3px';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background-color 0.2s, border-color 0.2s';

    btn.onmouseenter = () => {
      btn.style.backgroundColor = 'var(--accent-color)';
      btn.style.borderColor = 'var(--accent-color)';
    };
    btn.onmouseleave = () => {
      btn.style.backgroundColor = 'var(--bg-surface)';
      btn.style.borderColor = 'var(--border-color)';
    };
    return btn;
  }

  private updateTabs() {
    Array.from(this.tabsContainer.children).forEach((child: any) => {
      this.styleTabButton(child, child.dataset.tab === this.currentTab);
    });
  }

  private async refreshContent() {
    if (!this.directoryHandle) return;

    this.contentArea.innerHTML = '';

    try {
      let targetHandle = this.directoryHandle;
      try {
        targetHandle = await this.directoryHandle.getDirectoryHandle('Assets');
      } catch (e) {
        // Fallback to root or keep searching
      }

      for await (const [name, entry] of (targetHandle as any).entries()) {
        if (entry.kind === 'file') {
          if (!this.matchesFilter(name)) continue;

          this.createAssetIcon(name);
        }
      }
    } catch (e) {
      console.error("ContentBrowser: Error refreshing content", e);
      this.contentArea.innerHTML = `<div style="color:var(--text-muted); padding:10px;">Error loading assets.</div>`;
    }
  }

  private matchesFilter(filename: string): boolean {
    if (this.currentTab === 'All') return true;

    const ext = filename.toLowerCase().split('.').pop();
    if (this.currentTab === 'Textures') {
      return ['png', 'jpg', 'jpeg', 'tga', 'webp'].includes(ext || '');
    }
    if (this.currentTab === 'Models') {
      return ['glb', 'gltf'].includes(ext || '');
    }
    if (this.currentTab === 'Materials') {
      return ext === 'mat';
    }
    return true;
  }

  private createAssetIcon(name: string) {
    const isMat = name.endsWith('.mat');
    const isTex = /\.(png|jpg|jpeg|webp|tga)$/i.test(name);
    const isModel = /\.(glb|gltf)$/i.test(name);

    const item = document.createElement('div');
    item.style.width = '80px';
    item.style.height = '100px';
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'center';
    item.style.cursor = 'pointer';
    item.style.borderRadius = '4px';
    item.style.padding = '4px';
    item.style.transition = 'background 0.2s';
    item.style.border = '1px solid transparent';

    if (isMat) {
      item.style.backgroundColor = 'rgba(var(--accent-rgb, 60, 130, 246), 0.05)';
      item.style.borderColor = 'rgba(var(--accent-rgb, 60, 130, 246), 0.2)';
    }

    item.onmouseenter = () => {
      item.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      item.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    };
    item.onmouseleave = () => {
      item.style.backgroundColor = isMat ? 'rgba(var(--accent-rgb, 60, 130, 246), 0.05)' : 'transparent';
      item.style.borderColor = isMat ? 'rgba(var(--accent-rgb, 60, 130, 246), 0.2)' : 'transparent';
    };

    const icon = document.createElement('div');
    icon.textContent = isMat ? '📦' : (isTex ? '🖼️' : (isModel ? '🏗️' : '📄'));
    icon.style.fontSize = '2rem';
    icon.style.marginBottom = '4px';

    const label = document.createElement('div');
    label.textContent = name;
    label.style.fontSize = '0.65rem';
    label.style.width = '100%';
    label.style.textAlign = 'center';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.color = isMat ? 'var(--accent-color)' : 'var(--text-muted)';

    item.appendChild(icon);
    item.appendChild(label);

    item.addEventListener('click', () => {
      if (isMat) EventBus.emit('OnMaterialSelected', { relativePath: name });
    });

    this.contentArea.appendChild(item);
  }

  private async handleCreateMaterial() {
    const name = prompt("Material Name:", "M_NewMaterial");
    if (name) {
      const success = await ProjectSystem.createMaterialAsset(name);
      if (success) {
        this.refreshContent();
      }
    }
  }
}

customElements.define('gc-content-browser', ContentBrowser);
