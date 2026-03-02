import { UMeshComponent } from './UMeshComponent';
import { AActor } from '../Framework/AActor';

/**
 * A specialized mesh component that renders a 3D Axis Gizmo (RGB).
 * Used for visual reference of an actor's orientation.
 */
export class UGizmoComponent extends UMeshComponent {
  constructor(owner: AActor, name: string = 'GizmoComponent') {
    super(owner, name);
    this.topology = 'line-list';
  }

  /**
   * Generates the axis lines (X=Red, Y=Green, Z=Blue).
   */
  public createAxisGizmo(device: GPUDevice): void {
    const size = 1.5;

    // Interleaved data: [pos.x, pos.y, pos.z, color.r, color.g, color.b]
    const vertices = new Float32Array([
      // X Axis - Red
      0, 0, 0, 1, 0, 0,
      size, 0, 0, 1, 0, 0,

      // Y Axis - Green
      0, 0, 0, 0, 1, 0,
      0, size, 0, 0, 1, 0,

      // Z Axis - Blue
      0, 0, 0, 0, 0, 1,
      0, 0, size, 0, 0, 1,
    ]);

    this.vertexCount = 6;
    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();
  }
}
