import { EventBus, vec3, quat } from '@game-creator/engine';

/**
 * Controller for free-look 3D navigation in the editor viewport.
 */
export class EditorCameraController {
  private cameraActor: any;
  private canvas: HTMLCanvasElement;

  private keys = new Set<string>();
  private isDragging = false;

  private pitch: number = -30; // 30 degrees down
  private yaw: number = 0;   // in degrees

  public moveSpeed = 5.0;
  public mouseSensitivity = 0.15;

  constructor(canvas: HTMLCanvasElement, cameraActor: any) {
    this.canvas = canvas;
    this.cameraActor = cameraActor;

    this.setupEvents();

    // Subscribe to the engine tick
    EventBus.on('EngineTick', (dt: number) => this.update(dt));
  }

  private setupEvents() {
    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { // Right click
        this.isDragging = true;
        this.canvas.requestPointerLock();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isDragging = false;
        document.exitPointerLock();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      this.yaw -= e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;

      // Clamp pitch to avoid gimbal lock/flipping
      if (this.pitch > 89) this.pitch = 89;
      if (this.pitch < -89) this.pitch = -89;
    });

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  public update(deltaTime: number) {
    if (!this.cameraActor || !this.cameraActor.rootComponent) return;

    const root = this.cameraActor.rootComponent;
    const location = root.relativeLocation;
    const rotation = root.relativeRotation;

    // 1. Update Rotation
    quat.fromEuler(rotation, this.pitch, this.yaw, 0);

    // 2. Update Movement
    if (this.keys.size === 0) return;

    const forward = vec3.fromValues(0, 0, -1);
    vec3.transformQuat(forward, forward, rotation);

    const right = vec3.create();
    vec3.cross(right, forward, [0, 1, 0]);
    vec3.normalize(right, right);

    const up = vec3.fromValues(0, 1, 0);

    const moveDir = vec3.create();

    if (this.keys.has('KeyW')) vec3.add(moveDir, moveDir, forward);
    if (this.keys.has('KeyS')) vec3.subtract(moveDir, moveDir, forward);
    if (this.keys.has('KeyA')) vec3.subtract(moveDir, moveDir, right);
    if (this.keys.has('KeyD')) vec3.add(moveDir, moveDir, right);
    if (this.keys.has('KeyE')) vec3.add(moveDir, moveDir, up);
    if (this.keys.has('KeyQ')) vec3.subtract(moveDir, moveDir, up);

    if (vec3.length(moveDir) > 0) {
      vec3.normalize(moveDir, moveDir);
      vec3.scale(moveDir, moveDir, this.moveSpeed * deltaTime);
      vec3.add(location, location, moveDir);
    }
  }
}
