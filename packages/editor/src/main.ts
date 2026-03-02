import './styles/tokens.css';
import './UI/AppShell';
import { Engine } from '@game-creator/engine';

console.log('Game Creator Editor Initialized');

async function initEngine() {
  const viewport = document.querySelector('gc-viewport') as any; // Cast for custom method access
  if (viewport) {
    const canvas = viewport.getCanvas();
    const engine = new Engine();
    await engine.initialize(canvas);
    engine.start();
  }
}

// Wait for the custom elements to be ready
window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
