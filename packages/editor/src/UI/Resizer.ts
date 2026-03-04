
export class Resizer extends HTMLElement {
  private isDragging = false;
  private startPos = 0;
  private startSize = 0;
  private type: 'horizontal' | 'vertical' = 'vertical';
  private targetVar: string = '';
  private panelSide: 'left' | 'right' | 'bottom' = 'left';
  private lastSize: number = 0;
  private minSize: number = 100;
  private maxSize: number = 800;

  constructor() {
    super();
  }

  connectedCallback() {
    this.type = this.getAttribute('type') as 'horizontal' | 'vertical' || 'vertical';
    this.targetVar = this.getAttribute('target-var') || '';
    this.panelSide = this.getAttribute('side') as 'left' | 'right' | 'bottom' || 'left';
    this.minSize = parseInt(this.getAttribute('min') || '100');
    this.maxSize = parseInt(this.getAttribute('max') || '800');

    this.render();
    this.setupListeners();
  }

  private render() {
    this.className = `gc-resizer gc-resizer-${this.type}`;
    this.innerHTML = `
      <div class="resizer-handle"></div>
      <button class="resizer-collapse-btn" title="Toggle Panel">
        <!-- SVG for expanded state (pointing towards panel) -->
        <svg class="icon-arrow icon-collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <!-- SVG for collapsed state (pointing away from panel) -->
        <svg class="icon-arrow icon-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <style>
        .gc-resizer {
          position: relative;
          background-color: var(--border-color);
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }

        .gc-resizer:hover {
          background-color: var(--accent-color);
        }

        .gc-resizer-vertical {
          width: 4px;
          cursor: col-resize;
          height: 100%;
        }

        .gc-resizer-horizontal {
          height: 4px;
          cursor: row-resize;
          width: 100%;
        }

        .resizer-handle {
          width: 100%;
          height: 100%;
        }

        .resizer-collapse-btn {
          position: absolute;
          background-color: var(--accent-color);
          border: none;
          border-radius: 6px; /* Slightly more rectangular but still rounded */
          width: 14px;
          height: 32px; /* Smaller more pill-like */
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          box-shadow: 0 0 6px rgba(0,0,0,0.5);
          transition: transform 0.2s, background-color 0.2s;
          pointer-events: auto;
          z-index: 20;
        }

        .resizer-collapse-btn:hover {
          background-color: var(--accent-hover);
        }

        .gc-resizer-vertical .resizer-collapse-btn {
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        }

        .gc-resizer-vertical .resizer-collapse-btn:hover {
          transform: translate(-50%, -50%) scale(1.1);
        }

        .gc-resizer-horizontal .resizer-collapse-btn {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(90deg);
        }

        .gc-resizer-horizontal .resizer-collapse-btn:hover {
          transform: translate(-50%, -50%) rotate(90deg) scale(1.1);
        }

        .icon-arrow {
          width: 14px;
          height: 14px;
          color: white;
          transition: transform 0.2s;
        }

        /* Adjust rotation based on side configured from AppShell */
        .gc-resizer-vertical[side="right"] .icon-collapse { transform: rotate(180deg); }
        .gc-resizer-vertical[side="right"] .icon-expand { transform: rotate(180deg); }

        .gc-resizer-horizontal[side="bottom"] .icon-collapse { transform: rotate(180deg); }
        .gc-resizer-horizontal[side="bottom"] .icon-expand { transform: rotate(180deg); }
      </style>
    `;
  }

  private setupListeners() {
    const handle = this.querySelector('.resizer-handle');
    const btn = this.querySelector('.resizer-collapse-btn');

    handle?.addEventListener('mousedown', (e) => this.onMouseDown(e as MouseEvent));
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });
  }

  private onMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.startPos = this.type === 'vertical' ? e.clientX : e.clientY;

    const currentVal = getComputedStyle(document.documentElement).getPropertyValue(this.targetVar);
    this.startSize = parseInt(currentVal) || 0;

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = this.type === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing');
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const currentPos = this.type === 'vertical' ? e.clientX : e.clientY;
    const delta = currentPos - this.startPos;

    let newSize = this.startSize;
    if (this.panelSide === 'left') newSize += delta;
    else if (this.panelSide === 'right' || this.panelSide === 'bottom') newSize -= delta;

    newSize = Math.max(this.minSize, Math.min(newSize, this.maxSize));

    document.documentElement.style.setProperty(this.targetVar, `${newSize}px`);

    if (newSize > 10) {
      this.lastSize = newSize;
    }
  };

  private onMouseUp = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('is-resizing');
  };

  private toggleCollapse() {
    const currentVal = parseInt(getComputedStyle(document.documentElement).getPropertyValue(this.targetVar)) || 0;

    let isCollapsing = true;

    if (currentVal > 5) {
      this.lastSize = currentVal;
      document.documentElement.style.setProperty(this.targetVar, '0px');
    } else {
      isCollapsing = false;
      const restoreSize = this.lastSize > 50 ? this.lastSize : 250;
      document.documentElement.style.setProperty(this.targetVar, `${restoreSize}px`);
    }

    const iconCollapse = this.querySelector('.icon-collapse') as HTMLElement;
    const iconExpand = this.querySelector('.icon-expand') as HTMLElement;

    if (iconCollapse && iconExpand) {
      if (isCollapsing) {
        iconCollapse.style.display = 'none';
        iconExpand.style.display = 'inline-block';
      } else {
        iconCollapse.style.display = 'inline-block';
        iconExpand.style.display = 'none';
      }
    }
  }
}

customElements.define('gc-resizer', Resizer);
