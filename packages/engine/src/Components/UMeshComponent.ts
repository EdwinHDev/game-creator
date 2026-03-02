import { USceneComponent } from '../Framework/USceneComponent';
import { AActor } from '../Framework/AActor';
import { UMaterial } from '../Rendering/UMaterial';

/**
 * A component that represents a 3D mesh.
 */
export class UMeshComponent extends USceneComponent {
  public vertexBuffer: GPUBuffer | null = null;
  public indexBuffer: GPUBuffer | null = null;
  public indexCount: number = 0;
  public vertexCount: number = 0;
  public topology: GPUPrimitiveTopology = 'triangle-list';
  public material: UMaterial | null = null;

  constructor(owner: AActor, name: string = 'MeshComponent') {
    super(owner, name);
  }

  /**
   * Called every frame.
   */
  public override tick(deltaTime: number): void {
    super.tick(deltaTime);
  }

  /**
   * Generates a simple 3D box and creates GPU buffers for it.
   */
  public createBox(device: GPUDevice): void {
    this.topology = 'triangle-list';

    // 24 vertices (4 per face) for unique normals (Flat Shading)
    // Structure: posX, posY, posZ, normX, normY, normZ
    const vertices = new Float32Array([
      // Front face (Normal: 0, 0, 1)
      -1, -1, 1, 0, 0, 1,
      1, -1, 1, 0, 0, 1,
      1, 1, 1, 0, 0, 1,
      -1, 1, 1, 0, 0, 1,

      // Back face (Normal: 0, 0, -1)
      -1, -1, -1, 0, 0, -1,
      -1, 1, -1, 0, 0, -1,
      1, 1, -1, 0, 0, -1,
      1, -1, -1, 0, 0, -1,

      // Top face (Normal: 0, 1, 0)
      -1, 1, -1, 0, 1, 0,
      -1, 1, 1, 0, 1, 0,
      1, 1, 1, 0, 1, 0,
      1, 1, -1, 0, 1, 0,

      // Bottom face (Normal: 0, -1, 0)
      -1, -1, -1, 0, -1, 0,
      1, -1, -1, 0, -1, 0,
      1, -1, 1, 0, -1, 0,
      -1, -1, 1, 0, -1, 0,

      // Right face (Normal: 1, 0, 0)
      1, -1, -1, 1, 0, 0,
      1, 1, -1, 1, 0, 0,
      1, 1, 1, 1, 0, 0,
      1, -1, 1, 1, 0, 0,

      // Left face (Normal: -1, 0, 0)
      -1, -1, -1, -1, 0, 0,
      -1, -1, 1, -1, 0, 0,
      -1, 1, 1, -1, 0, 0,
      -1, 1, -1, -1, 0, 0,
    ]);

    // 36 indices (6 faces * 2 triangles * 3 vertices)
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3,       // Front
      4, 5, 6, 4, 6, 7,       // Back
      8, 9, 10, 8, 10, 11,    // Top
      12, 13, 14, 12, 14, 15, // Bottom
      16, 17, 18, 16, 18, 19, // Right
      20, 21, 22, 20, 22, 23  // Left
    ]);

    this.indexCount = indices.length;
    this.vertexCount = 24;

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

    // Initialize default material
    this.material = new UMaterial();
  }

  /**
   * Generates a procedural grid on the XZ plane.
   */
  public createGrid(device: GPUDevice, size: number = 200, divisions: number = 200): void {
    this.topology = 'line-list';
    this.indexBuffer = null;
    this.indexCount = 0;

    const vertices: number[] = [];
    const step = size / divisions;
    const halfSize = size / 2;

    const grayColor = [0.3, 0.3, 0.3];
    const xAxisColor = [1.0, 0.2, 0.2]; // Red
    const zAxisColor = [0.2, 0.2, 1.0]; // Blue

    for (let i = 0; i <= divisions; i++) {
      const linePos = -halfSize + i * step;
      const isCenter = Math.abs(linePos) < 0.001;

      // Line along X (Vertical-ish)
      const xColor = isCenter ? zAxisColor : grayColor;
      vertices.push(linePos, 0, -halfSize, ...xColor);
      vertices.push(linePos, 0, halfSize, ...xColor);

      // Line along Z (Horizontal-ish)
      const zColor = isCenter ? xAxisColor : grayColor;
      vertices.push(-halfSize, 0, linePos, ...zColor);
      vertices.push(halfSize, 0, linePos, ...zColor);
    }

    const vertexData = new Float32Array(vertices);
    this.vertexCount = vertexData.length / 6;

    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();
  }

  /**
   * Generates a simple pyramid for gizmo arrow heads.
   * Apical vertex is at (0, height, 0). Base is a square on XZ plane.
   */
  public createPyramid(device: GPUDevice, height: number = 1.0, radius: number = 0.5): void {
    this.topology = 'triangle-list';

    // 18 vertices (3 per face * 4 lateral faces + 3 per triangle * 2 base triangles)
    // Structure: posX, posY, posZ, normX, normY, normZ
    // We use unique vertices per face for Flat Shading.

    const h = height;
    const r = radius;

    // Normals for lateral faces
    // Face Front-Right: Normal points somewhere between +Z and +X
    // For simplicity, we'll calculate them or use approximate ones. 
    // A better way is to normalize cross product of edges.

    // Front (+Z): points (0,h,0), (-r,0,r), (r,0,r)
    // Back (-Z): points (0,h,0), (r,0,-r), (-r,0,-r)
    // Right (+X): points (0,h,0), (r,0,r), (r,0,-r)
    // Left (-X): points (0,h,0), (-r,0,-r), (-r,0,r)

    const vertices = new Float32Array([
      // Front Face
      0, h, 0, 0, 0.5, 1,
      -r, 0, r, 0, 0.5, 1,
      r, 0, r, 0, 0.5, 1,

      // Back Face
      0, h, 0, 0, 0.5, -1,
      r, 0, -r, 0, 0.5, -1,
      -r, 0, -r, 0, 0.5, -1,

      // Right Face
      0, h, 0, 1, 0.5, 0,
      r, 0, r, 1, 0.5, 0,
      r, 0, -r, 1, 0.5, 0,

      // Left Face
      0, h, 0, -1, 0.5, 0,
      -r, 0, -r, -1, 0.5, 0,
      -r, 0, r, -1, 0.5, 0,

      // Base (2 triangles)
      -r, 0, -r, 0, -1, 0,
      r, 0, -r, 0, -1, 0,
      r, 0, r, 0, -1, 0,

      -r, 0, -r, 0, -1, 0,
      r, 0, r, 0, -1, 0,
      -r, 0, r, 0, -1, 0,
    ]);

    this.indexCount = 0; // No index buffer for this simple one
    this.vertexCount = vertices.length / 6;

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.material = new UMaterial();
  }

  /**
   * Cleans up GPU resources.
   */
  public override destroy(): void {
    super.destroy();

    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
      this.vertexBuffer = null;
    }

    if (this.indexBuffer) {
      this.indexBuffer.destroy();
      this.indexBuffer = null;
    }
  }
}
