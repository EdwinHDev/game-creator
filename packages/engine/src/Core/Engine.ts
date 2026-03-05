import { Logger } from './Logger';
import { EventBus } from './EventBus';
import { Renderer } from '../Rendering/Renderer';
import { World } from '../Framework/World';

/**
 * Main application class of the engine.
 * Controls the game loop and canvas interaction.
 */
export class Engine {
  private canvas: HTMLCanvasElement | null = null;
  private isRunning: boolean = false;
  public get isStarted(): boolean { return this.isRunning; }
  private lastTime: number = 0;
  private animationFrameId: number | null = null;
  private static instance: Engine | null = null;
  private renderer: Renderer;
  private worlds: Map<string, World> = new Map();
  private activeWorldId: string | null = null;

  constructor() {
    this.renderer = new Renderer();
    this.createWorld('MainWorld');
    this.setActiveWorld('MainWorld');
    Engine.instance = this;
  }

  /**
   * Static access to the active engine instance.
   */
  public static getInstance(): Engine {
    if (!Engine.instance) {
      Engine.instance = new Engine();
    }
    return Engine.instance;
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

    for (const world of this.worlds.values()) {
      world.beginPlay();
    }

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

    // 1. Update game logic en TODOS los mundos
    for (const world of this.worlds.values()) {
      world.tick(deltaTime);
    }

    // Current temporary tick logic
    EventBus.emit('EngineTick', deltaTime);

    // 2. Renderizar solo el Mundo Activo en el Canvas Principal
    const activeWorld = this.getActiveWorld();
    if (activeWorld) {
      this.renderer.render(activeWorld);
    }
  }

  // --- GESTIÓN DE MUNDOS ---

  public createWorld(id: string): World {
    if (this.worlds.has(id)) {
      Logger.warn(`[Engine] El mundo con id '${id}' ya existe.`);
      return this.worlds.get(id)!;
    }
    const newWorld = new World();
    this.worlds.set(id, newWorld);
    return newWorld;
  }

  public getWorld(id: string): World | undefined {
    return this.worlds.get(id);
  }

  public getActiveWorld(): World | null {
    if (!this.activeWorldId) return null;
    return this.worlds.get(this.activeWorldId) || null;
  }

  public setActiveWorld(id: string): void {
    if (this.worlds.has(id)) {
      this.activeWorldId = id;
    } else {
      Logger.error(`[Engine] Intento de activar un mundo inexistente: ${id}`);
    }
  }

  /**
   * Deprecado: Usa getActiveWorld() en su lugar.
   * Se mantiene por compatibilidad temporal con interfaces existentes.
   */
  public get world(): World {
    return this.getActiveWorld()!;
  }

  /**
   * Returns the active renderer.
   */
  public getRenderer(): Renderer {
    return this.renderer;
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
