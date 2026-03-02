import { EventBus } from '@game-creator/engine';

/**
 * Outliner Web Component that displays the hierarchy of actors in the world.
 */
export class Outliner extends HTMLElement {
  private listElement: HTMLUListElement;
  private selectedActorId: string | null = null;
  private actorItems: Map<string, HTMLLIElement> = new Map();

  constructor() {
    super();
    this.listElement = document.createElement('ul');
    this.setupStyles();

    const title = document.createElement('div');
    title.textContent = 'Scene Root';
    title.style.padding = '10px';
    title.style.fontSize = '0.8rem';
    title.style.fontWeight = 'bold';
    title.style.textTransform = 'uppercase';
    title.style.opacity = '0.6';
    title.style.borderBottom = '1px solid var(--border-color)';

    this.appendChild(title);
    this.appendChild(this.listElement);
  }

  connectedCallback() {
    this.render();

    // Subscribe to engine events
    EventBus.on('OnActorSpawned', this.handleActorSpawned);
    EventBus.on('OnActorDestroyed', this.handleActorDestroyed);
  }

  disconnectedCallback() {
    // Clean up subscriptions to avoid memory leaks
    EventBus.off('OnActorSpawned', this.handleActorSpawned);
    EventBus.off('OnActorDestroyed', this.handleActorDestroyed);
  }

  private handleActorSpawned = (actor: any) => {
    const li = document.createElement('li');
    li.textContent = actor.name;
    li.dataset.id = actor.id;
    li.style.padding = '8px 12px';
    li.style.cursor = 'pointer';
    li.style.borderBottom = '1px solid var(--bg-surface)';
    li.style.transition = 'background-color 0.2s ease';
    li.style.fontSize = '0.9rem';

    li.addEventListener('mouseenter', () => {
      if (this.selectedActorId !== actor.id) {
        li.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      }
    });

    li.addEventListener('mouseleave', () => {
      if (this.selectedActorId !== actor.id) {
        li.style.backgroundColor = 'transparent';
      }
    });

    li.addEventListener('click', () => {
      this.selectActor(actor);
    });

    this.listElement.appendChild(li);
    this.actorItems.set(actor.id, li);
  };

  private handleActorDestroyed = (actor: any) => {
    const li = this.actorItems.get(actor.id);
    if (li) {
      li.remove();
      this.actorItems.delete(actor.id);
      if (this.selectedActorId === actor.id) {
        this.selectedActorId = null;
      }
    }
  };

  private selectActor(actor: any) {
    // Clear previous selection
    if (this.selectedActorId) {
      const prevLi = this.actorItems.get(this.selectedActorId);
      if (prevLi) {
        prevLi.style.backgroundColor = 'transparent';
        prevLi.style.color = 'inherit';
      }
    }

    // New selection
    this.selectedActorId = actor.id;
    const currentLi = this.actorItems.get(actor.id);
    if (currentLi) {
      currentLi.style.backgroundColor = 'var(--accent-color)';
      currentLi.style.color = '#fff';
    }

    // Emit event for other components (e.g., Detail panel)
    EventBus.emit('OnActorSelected', actor);
    console.log(`Actor selected in Outliner: ${actor.name} (${actor.id})`);
  }

  private setupStyles() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.overflowY = 'auto';
    this.style.backgroundColor = 'var(--bg-panel)';
    this.style.color = 'var(--text-main)';

    this.listElement.style.listStyle = 'none';
    this.listElement.style.padding = '0';
    this.listElement.style.margin = '0';
  }

  private render() {
    // Initial container setup if needed
  }
}

customElements.define('gc-outliner', Outliner);
