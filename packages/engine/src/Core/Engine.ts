import { Logger } from './Logger';
import { EventBus } from './EventBus';
import { Renderer } from '../Rendering/Renderer';

/**
 * Main application class of the engine.
 * Controls the game loop and canvas interaction.
 */
export class Engine {
  private canvas: HTMLCanvasElement | null = null;
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private animationFrameId: number | null = null;
  private renderer: Renderer;

  constructor() {
    this.renderer = new Renderer();
  }

  /**
   * Links the engine to a DOM canvas.
   */
  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    await this.renderer.initialize(canvas);
    Logger.info("Engine attached to Canvas");
  }

  /**
   * Starts the internal core game loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    Logger.info("Engine loop started");
  }

  /**
   * Gracefully stops the game loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    Logger.info("Engine loop stopped");
  }

  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.tick(deltaTime);

    this.animationFrameId = requestAnimationFrame((time) => this.loop(time));
  }

  /**
   * Main logic update and render trigger.
   */
  private tick(deltaTime: number): void {
    this.resizeCanvasIfNeeded();

    // Current temporary tick logic
    EventBus.emit('EngineTick', deltaTime);

    // Delegate rendering to WebGPU Renderer
    this.renderer.render();
  }

  /**
   * Checks if the canvas internal resolution matches its display size 
   * and updates it if necessary to avoid stretching and flickering.
   */
  private resizeCanvasIfNeeded(): void {
    if (!this.canvas) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      Logger.info(`Engine resized canvas to: ${width}x${height}`);
    }
  }
}
