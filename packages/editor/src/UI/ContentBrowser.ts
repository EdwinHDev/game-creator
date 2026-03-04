import { EventBus } from '@game-creator/engine';
import { EditorLogger } from '../Core/EditorLogger';
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
  private isRefreshing: boolean = false;

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

    importBtn.addEventListener('click', async () => {
      try {
        const success = await ProjectSystem.importFiles();
        if (success) {
          this.refreshContent();
        }
      } catch (e) {
        EditorLogger.error("Error importing files:", e);
      }
    });

    newMatBtn.addEventListener('click', () => {
      // Create a small centered modal
      const modal = document.createElement('div');
      modal.style.position = 'absolute';
      modal.style.top = '50%';
      modal.style.left = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.backgroundColor = 'var(--bg-panel)';
      modal.style.padding = '20px';
      modal.style.border = '1px solid var(--border-color)';
      modal.style.borderRadius = '8px';
      modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      modal.style.zIndex = '1000';
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.gap = '16px';
      modal.style.minWidth = '300px';

      const title = document.createElement('div');
      title.textContent = 'Create New Material';
      title.style.fontSize = '0.9rem';
      title.style.fontWeight = 'bold';
      title.style.color = 'var(--text-main)';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'e.g. M_Metal_Rust';
      input.value = '';
      input.style.backgroundColor = 'var(--bg-surface)';
      input.style.color = 'var(--text-main)';
      input.style.border = '1px solid var(--border-color)';
      input.style.padding = '10px';
      input.style.borderRadius = '4px';
      input.style.outline = 'none';
      input.style.fontSize = '0.8rem';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '10px';

      const cancelBtn = this.createActionButton('Cancel');
      const createBtn = this.createActionButton('Create');
      createBtn.style.backgroundColor = 'var(--accent-color)';
      createBtn.style.borderColor = 'var(--accent-color)';

      const handleCreate = async () => {
        const matName = input.value.trim();
        if (!matName) {
          alert("Material name cannot be empty.");
          return;
        }

        const success = await ProjectSystem.createNewMaterial(matName);
        if (success) {
          modal.remove();
          this.refreshContent();
        } else {
          alert(`Material '${matName}' already exists or failed to create. Please choose another name.`);
        }
      };

      cancelBtn.onclick = () => modal.remove();
      createBtn.onclick = handleCreate;

      input.onkeydown = (e) => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') modal.remove();
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(createBtn);
      modal.appendChild(title);
      modal.appendChild(input);
      modal.appendChild(actions);
      this.appendChild(modal);

      setTimeout(() => input.focus(), 10);
    });

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
    EventBus.on('PROJECT_LOADED', this.handleRefresh);
    EventBus.on('RequestContentBrowserRefresh', this.handleRefresh);

    // Initial load if project already open
    if (ProjectSystem.getDirectoryHandle()) {
      this.refreshContent();
    }
  }

  disconnectedCallback() {
    EventBus.off('PROJECT_LOADED', this.handleRefresh);
    EventBus.off('RequestContentBrowserRefresh', this.handleRefresh);
  }

  private handleRefresh = () => {
    this.refreshContent();
  };

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
    // Si ya está escaneando, ignoramos esta llamada
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const handle = ProjectSystem.getDirectoryHandle();
      if (!handle) return;

      const assetsHandle = await handle.getDirectoryHandle('Assets', { create: true });

      // Limpiamos el DOM estrictamente AQUÍ, justo antes del escaneo
      this.contentArea.innerHTML = '';

      await this.scanDirectory(assetsHandle);
    } catch (e) {
      EditorLogger.error("Error leyendo carpeta Assets:", e);
    } finally {
      // Liberamos el candado sin importar si hubo éxito o error
      this.isRefreshing = false;
    }
  }

  // Nuevo método recursivo
  private async scanDirectory(dirHandle: any) {
    for await (const [name, entry] of (dirHandle as any).entries()) {
      if (entry.kind === 'file') {
        // Si es archivo, aplicamos los filtros de las pestañas
        if (this.shouldShowFile(name, this.currentTab)) {
          await this.createFileItem(name, entry, dirHandle);
        }
      } else if (entry.kind === 'directory') {
        // Si es una subcarpeta (ej. 'Materials'), entramos recursivamente a buscar más archivos
        await this.scanDirectory(entry);
      }
    }
  }

  private shouldShowFile(filename: string, tab: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (tab === 'All') return true;
    if (tab === 'Textures') return ['png', 'jpg', 'jpeg', 'tga', 'webp'].includes(ext);
    if (tab === 'Models') return ['glb', 'gltf', 'obj'].includes(ext);
    if (tab === 'Materials') return ext === 'mat';
    return false;
  }

  private async createFileItem(name: string, entry: any, dirHandle: FileSystemDirectoryHandle) {
    const item = document.createElement('div');
    item.style.width = '80px';
    item.style.minHeight = '100px';
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'center';
    item.style.padding = '8px';
    item.style.cursor = 'pointer';
    item.style.borderRadius = '4px';
    item.style.transition = 'background-color 0.2s';
    item.style.position = 'relative';

    // Delete button (hidden by default)
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '✖';
    deleteBtn.style.position = 'absolute';
    deleteBtn.style.top = '-4px';
    deleteBtn.style.right = '-4px';
    deleteBtn.style.backgroundColor = '#ff4757';
    deleteBtn.style.color = 'white';
    deleteBtn.style.border = 'none';
    deleteBtn.style.borderRadius = '50%';
    deleteBtn.style.width = '18px';
    deleteBtn.style.height = '18px';
    deleteBtn.style.fontSize = '10px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.display = 'none';
    deleteBtn.style.alignItems = 'center';
    deleteBtn.style.justifyContent = 'center';
    deleteBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
    deleteBtn.style.zIndex = '10';

    item.onmouseenter = () => {
      item.style.backgroundColor = 'rgba(255,255,255,0.05)';
      deleteBtn.style.display = 'flex';
    };
    item.onmouseleave = () => {
      item.style.backgroundColor = 'transparent';
      deleteBtn.style.display = 'none';
    };

    // Physical deletion logic with dependency check (Phase 49.1)
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent asset selection

      const isTexture = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.tga');
      const type = isTexture ? 'texture' : (name.endsWith('.mat') ? 'material' : 'other');

      // 1. Dependency Check
      if (type !== 'other') {
        const deps = await ProjectSystem.checkAssetDependencies(name, type as any);
        if (deps.length > 0) {
          const displayDeps = deps.slice(0, 3).join('\n- ');
          const more = deps.length > 3 ? `\n...and ${deps.length - 3} more.` : '';
          alert(`⛔ Cannot delete '${name}' because it is in use by:\n\n- ${displayDeps}${more}\n\nPlease remove these references before deleting.`);
          return;
        }
      }

      // 2. Safe Deletion
      if (confirm(`Are you sure you want to permanently delete '${name}' from disk?`)) {
        try {
          await dirHandle.removeEntry(name);
          EditorLogger.info(`Asset deleted: ${name}`);
          this.refreshContent();
        } catch (error) {
          EditorLogger.error(`Error deleting ${name}`, error);
        }
      }
    });

    item.appendChild(deleteBtn);

    // Visual container for thumbnails
    const visualContainer = document.createElement('div');
    visualContainer.style.width = '48px';
    visualContainer.style.height = '48px';
    visualContainer.style.marginBottom = '8px';
    visualContainer.style.display = 'flex';
    visualContainer.style.justifyContent = 'center';
    visualContainer.style.alignItems = 'center';

    try {
      const isTexture = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.tga');
      if (isTexture) {
        // 1. REAL TEXTURE THUMBNAIL
        const file = await entry.getFile();
        const url = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = url;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '4px';
        img.style.border = '1px solid var(--border-color)';
        visualContainer.appendChild(img);
      } else if (name.endsWith('.mat')) {
        // 2. MATERIAL THUMBNAIL (🎨)
        visualContainer.style.fontSize = '40px';
        visualContainer.textContent = '🎨';
      } else {
        // 3. MODELS OR OTHERS
        visualContainer.style.fontSize = '40px';
        visualContainer.textContent = name.endsWith('.glb') ? '🧊' : '📄';
      }
    } catch (e) {
      visualContainer.style.fontSize = '30px';
      visualContainer.textContent = '❌';
    }

    const text = document.createElement('div');
    text.textContent = name;
    text.style.fontSize = '0.75rem';
    text.style.color = 'var(--text-main)';
    text.style.textAlign = 'center';
    text.style.wordBreak = 'break-all';

    item.appendChild(visualContainer);
    item.appendChild(text);

    // Interaction
    item.addEventListener('click', () => {
      EventBus.emit('OnAssetSelected', {
        type: name.endsWith('.mat') ? 'material' : 'texture',
        name: name,
        path: name.endsWith('.mat') ? `Materials/${name}` : `Textures/${name}`
      });
    });

    this.contentArea.appendChild(item);

    // Drag & Drop support (Phase 47 & 50)
    const isTexture = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.tga');
    const isMaterial = name.endsWith('.mat');

    if (isTexture || isMaterial) {
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        const assetData = {
          type: isMaterial ? 'material' : 'texture',
          name: name,
          path: isMaterial ? `Materials/${name}` : `Textures/${name}`
        };
        e.dataTransfer?.setData('application/json', JSON.stringify(assetData));
        item.style.opacity = '0.5';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
      });
    }
  }

}

customElements.define('gc-content-browser', ContentBrowser);
