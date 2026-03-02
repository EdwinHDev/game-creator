import { EventBus } from '@game-creator/engine';

/**
 * Details Panel Web Component for inspecting and modifying actor properties.
 */
export class DetailsPanel extends HTMLElement {
  private currentActor: any = null;

  constructor() {
    super();
    this.setupStyles();
  }

  connectedCallback() {
    EventBus.on('OnActorSelected', this.handleActorSelected);
    this.render();
  }

  disconnectedCallback() {
    EventBus.off('OnActorSelected', this.handleActorSelected);
  }

  private handleActorSelected = (actor: any) => {
    console.log('DetailsPanel received actor:', actor?.name);
    this.currentActor = actor;
    this.render();
  };

  private render() {
    // 1. Clear contents
    this.innerHTML = '';

    // 2. Fallback if no selection
    if (!this.currentActor) {
      const empty = document.createElement('div');
      empty.className = 'p-4 text-muted';
      empty.style.opacity = '0.5';
      empty.style.fontStyle = 'italic';
      empty.style.padding = '20px';
      empty.textContent = 'Select an object to view details.';
      this.appendChild(empty);
      return;
    }

    // 3. Header
    const header = document.createElement('div');
    header.style.padding = '15px';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.backgroundColor = 'var(--bg-surface)';

    const title = document.createElement('h3');
    title.textContent = this.currentActor.name;
    title.style.margin = '0';
    title.style.fontSize = '14px';
    title.style.color = 'var(--accent-color)';
    header.appendChild(title);
    this.appendChild(header);

    // 4. Transform Section (Safe Check)
    const root = this.currentActor.rootComponent;
    if (root && root.relativeLocation) {
      this.renderTransformUI(root);
    }
  }

  private renderTransformUI(root: any) {
    const section = document.createElement('div');
    section.style.padding = '15px';

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = 'TRANSFORM';
    sectionTitle.style.fontSize = '10px';
    sectionTitle.style.fontWeight = 'bold';
    sectionTitle.style.marginBottom = '10px';
    sectionTitle.style.opacity = '0.6';
    section.appendChild(sectionTitle);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '8px';

    grid.innerHTML = `
      <div class="input-group">
        <label>X</label>
        <input type="number" id="pos-x" step="0.1" value="${root.relativeLocation[0]}">
      </div>
      <div class="input-group">
        <label>Y</label>
        <input type="number" id="pos-y" step="0.1" value="${root.relativeLocation[1]}">
      </div>
      <div class="input-group">
        <label>Z</label>
        <input type="number" id="pos-z" step="0.1" value="${root.relativeLocation[2]}">
      </div>
    `;

    section.appendChild(grid);
    this.appendChild(section);

    // 5. Two-Way Binding
    const inputX = section.querySelector('#pos-x') as HTMLInputElement;
    const inputY = section.querySelector('#pos-y') as HTMLInputElement;
    const inputZ = section.querySelector('#pos-z') as HTMLInputElement;

    if (inputX) {
      inputX.addEventListener('input', (e) => {
        root.relativeLocation[0] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }
    if (inputY) {
      inputY.addEventListener('input', (e) => {
        root.relativeLocation[1] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }
    if (inputZ) {
      inputZ.addEventListener('input', (e) => {
        root.relativeLocation[2] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }

    // Add some quick styles for the groups
    const style = document.createElement('style');
    style.textContent = `
      .input-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .input-group label {
        font-size: 9px;
        font-weight: bold;
        opacity: 0.5;
      }
      .input-group input {
        background: var(--bg-base);
        color: var(--text-main);
        border: 1px solid var(--border-color);
        padding: 4px;
        border-radius: 4px;
        font-size: 11px;
        width: 100%;
        outline: none;
      }
      .input-group input:focus {
        border-color: var(--accent-color);
      }
    `;
    this.appendChild(style);
  }

  private setupStyles() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.overflowY = 'auto';
    this.style.backgroundColor = 'var(--bg-panel)';
  }
}

customElements.define('gc-details-panel', DetailsPanel);
