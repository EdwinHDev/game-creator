import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';

/**
 * A component that represents a 3D mesh.
 */
export class UMeshComponent extends USceneComponent {
  public vertexBuffer: GPUBuffer | null = null;
  public indexBuffer: GPUBuffer | null = null;
  public indexCount: number = 0;

  constructor(owner: AActor, name: string = 'MeshComponent') {
    super(owner, name);
  }

  /**
   * Generates a simple 3D box and creates GPU buffers for it.
   */
  public createBox(device: GPUDevice): void {
    // 8 vertices for a cube (pos: vec3, color: vec3)
    const vertices = new Float32Array([
      // Front face
      -1, -1, 1, 1, 0, 0, // 0: Red
      1, -1, 1, 0, 1, 0, // 1: Green
      1, 1, 1, 0, 0, 1, // 2: Blue
      -1, 1, 1, 1, 1, 1, // 3: White

      // Back face
      -1, -1, -1, 1, 1, 0, // 4: Yellow
      1, -1, -1, 0, 1, 1, // 5: Cyan
      1, 1, -1, 1, 0, 1, // 6: Magenta
      -1, 1, -1, 0, 0, 0, // 7: Black
    ]);

    // 36 indices (6 faces * 2 triangles * 3 vertices)
    const indices = new Uint16Array([
      // Front
      0, 1, 2, 0, 2, 3,
      // Back
      4, 6, 5, 4, 7, 6,
      // Top
      3, 2, 6, 3, 6, 7,
      // Bottom
      4, 5, 1, 4, 1, 0,
      // Right
      1, 5, 6, 1, 6, 2,
      // Left
      4, 0, 3, 4, 3, 7,
    ]);

    this.indexCount = indices.length;

    // Create Vertex Buffer
    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    // Create Index Buffer
    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();
  }
}
