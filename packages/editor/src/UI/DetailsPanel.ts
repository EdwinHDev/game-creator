import { EventBus } from '@game-creator/engine';

/**
 * Details Panel Web Component for inspecting and modifying actor properties.
 */
export class DetailsPanel extends HTMLElement {
  private currentActor: any = null;
  private container: HTMLDivElement;

  constructor() {
    super();
    this.container = document.createElement('div');
    this.appendChild(this.container);
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
    this.currentActor = actor;
    this.render();
  };

  private render() {
    this.container.innerHTML = '';

    if (!this.currentActor) {
      this.container.innerHTML = `<div class="empty-state">Select an object to see details</div>`;
      return;
    }

    const actorHeader = document.createElement('div');
    actorHeader.className = 'actor-header';
    actorHeader.innerHTML = `
      <div class="actor-icon">📦</div>
      <div class="actor-title">${this.currentActor.name}</div>
      <div class="actor-id">${this.currentActor.id}</div>
    `;
    this.container.appendChild(actorHeader);

    // Transform Section
    if (this.currentActor.rootComponent && this.currentActor.rootComponent.relativeLocation) {
      this.renderTransformSection();
    }
  }

  private renderTransformSection() {
    const section = document.createElement('div');
    section.className = 'property-section';
    section.innerHTML = `<div class="section-title">Transform</div>`;

    const locationRow = this.createVector3Row('Location', this.currentActor.rootComponent.relativeLocation);
    section.appendChild(locationRow);

    this.container.appendChild(section);
  }

  private createVector3Row(label: string, vector: Float32Array): HTMLElement {
    const row = document.createElement('div');
    row.className = 'vector-row';
    row.innerHTML = `
      <div class="vector-label">${label}</div>
      <div class="vector-inputs">
        <div class="input-group"><span class="axis-x">X</span><input type="number" step="0.1" value="${vector[0]}" data-axis="0"></div>
        <div class="input-group"><span class="axis-y">Y</span><input type="number" step="0.1" value="${vector[1]}" data-axis="1"></div>
        <div class="input-group"><span class="axis-z">Z</span><input type="number" step="0.1" value="${vector[2]}" data-axis="2"></div>
      </div>
    `;

    const inputs = row.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const axis = parseInt(input.dataset.axis || '0');
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
          vector[axis] = val;
        }
      });
    });

    return row;
  }

  private setupStyles() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.backgroundColor = 'var(--bg-panel)';
    this.style.color = 'var(--text-main)';
    this.style.fontSize = '12px';

    this.innerHTML = `
      <style>
        .empty-state {
          padding: 40px 20px;
          text-align: center;
          opacity: 0.4;
          font-style: italic;
        }
        .actor-header {
          padding: 15px;
          background-color: var(--bg-surface);
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 10px;
        }
        .actor-title {
          font-weight: bold;
          font-size: 14px;
          color: var(--accent-color);
        }
        .actor-id {
          font-size: 10px;
          opacity: 0.5;
          font-family: monospace;
          margin-top: 4px;
        }
        .property-section {
          padding: 0 15px;
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: bold;
          opacity: 0.6;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
        }
        .vector-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vector-label {
          opacity: 0.8;
        }
        .vector-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
        }
        .input-group {
          display: flex;
          align-items: center;
          background-color: var(--bg-base);
          border-radius: 4px;
          border: 1px solid var(--border-color);
          overflow: hidden;
        }
        .input-group span {
          width: 18px;
          text-align: center;
          font-weight: bold;
          font-size: 10px;
          padding: 4px 0;
        }
        .axis-x { color: #f24e1e; background: rgba(242, 78, 30, 0.1); }
        .axis-y { color: #81e61c; background: rgba(129, 230, 28, 0.1); }
        .axis-z { color: #2d9cdb; background: rgba(45, 156, 219, 0.1); }
        
        input {
          width: 100%;
          border: none;
          background: transparent;
          color: var(--text-main);
          padding: 4px 6px;
          font-size: 12px;
          outline: none;
        }
        input:focus {
          background-color: rgba(255, 255, 255, 0.05);
        }
      </style>
    `;
  }
}

customElements.define('gc-details-panel', DetailsPanel);
