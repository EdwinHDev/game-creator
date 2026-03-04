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
  public isGizmo: boolean = false; // Phase 17.9.7: Flag for X-Ray rendering
  public material: UMaterial | null = null;
  public baseColorTexture: GPUTexture | null = null;

  constructor(owner: AActor, name: string = 'MeshComponent') {
    super(owner, name);
    this.material = new UMaterial();
  }

  /**
   * Called every frame.
   */
  public override tick(deltaTime: number): void {
    super.tick(deltaTime);
  }

  /**
   * Generates a simple colored box matching the updated 32-byte stride format:
   * [x, y, z, nx, ny, nz, u, v]
   */
  public createBox(device: GPUDevice): void {
    this.topology = 'triangle-list';
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();

    // 24 vertices (4 per face)
    const vertices = new Float32Array([
      // Front face (Z+) -> Normal: 0, 0, 1
      -1, -1, 1, 0, 0, 1, 0, 1,
      1, -1, 1, 0, 0, 1, 1, 1,
      1, 1, 1, 0, 0, 1, 1, 0,
      -1, 1, 1, 0, 0, 1, 0, 0,

      // Back face (Z-) -> Normal: 0, 0, -1
      -1, -1, -1, 0, 0, -1, 1, 1,
      -1, 1, -1, 0, 0, -1, 1, 0,
      1, 1, -1, 0, 0, -1, 0, 0,
      1, -1, -1, 0, 0, -1, 0, 1,

      // Top face (Y+) -> Normal: 0, 1, 0
      -1, 1, -1, 0, 1, 0, 0, 0,
      -1, 1, 1, 0, 1, 0, 0, 1,
      1, 1, 1, 0, 1, 0, 1, 1,
      1, 1, -1, 0, 1, 0, 1, 0,

      // Bottom face (Y-) -> Normal: 0, -1, 0
      -1, -1, -1, 0, -1, 0, 0, 1,
      1, -1, -1, 0, -1, 0, 1, 1,
      1, -1, 1, 0, -1, 0, 1, 0,
      -1, -1, 1, 0, -1, 0, 0, 0,

      // Right face (X+) -> Normal: 1, 0, 0
      1, -1, -1, 1, 0, 0, 1, 1,
      1, 1, -1, 1, 0, 0, 1, 0,
      1, 1, 1, 1, 0, 0, 0, 0,
      1, -1, 1, 1, 0, 0, 0, 1,

      // Left face (X-) -> Normal: -1, 0, 0
      -1, -1, -1, -1, 0, 0, 0, 1,
      -1, -1, 1, -1, 0, 0, 1, 1,
      -1, 1, 1, -1, 0, 0, 1, 0,
      -1, 1, -1, -1, 0, 0, 0, 0,
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
    this.vertexCount = vertices.length / 8; // 8 floats per vertex

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
    if (!this.material) this.material = new UMaterial();
  }

  /**
   * Phase 29.1: Texture Loading
   * Asynchronously loads an image from an URL and creates a WebGPU texture.
   */
  public async loadTexture(url: string, device: GPUDevice): Promise<void> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      this.baseColorTexture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: this.baseColorTexture },
        [imageBitmap.width, imageBitmap.height]
      );

    } catch (error) {
      console.error(`Failed to load texture at path ${url}:`, error);
    }
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
   * Generates a solid pyramid for gizmo arrow heads.
   */
  public createPyramid(device: GPUDevice, height: number = 0.15, radius: number = 0.05): void {
    this.vertexBuffer?.destroy();
    this.topology = 'triangle-list';

    const h = height;
    const r = radius;

    // Helper to normalize
    const norm = (x: number, y: number, z: number): number[] => {
      const len = Math.sqrt(x * x + y * y + z * z);
      return [x / len, y / len, z / len];
    };

    const nf = norm(0, r, h); // Normal Front
    const nb = norm(0, r, -h); // Normal Back
    const nr = norm(h, r, 0); // Normal Right
    const nl = norm(-h, r, 0); // Normal Left

    const vertices = new Float32Array([
      // Front Face
      0, h, 0, ...nf,
      -r, 0, r, ...nf,
      r, 0, r, ...nf,

      // Back Face
      0, h, 0, ...nb,
      r, 0, -r, ...nb,
      -r, 0, -r, ...nb,

      // Right Face
      0, h, 0, ...nr,
      r, 0, r, ...nr,
      r, 0, -r, ...nr,

      // Left Face
      0, h, 0, ...nl,
      -r, 0, -r, ...nl,
      -r, 0, r, ...nl,

      // Base
      -r, 0, -r, 0, -1, 0,
      r, 0, -r, 0, -1, 0,
      r, 0, r, 0, -1, 0,
      -r, 0, -r, 0, -1, 0,
      r, 0, r, 0, -1, 0,
      -r, 0, r, 0, -1, 0,
    ]);

    this.vertexCount = 18;
    this.indexCount = 0;
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
   * Generates a single line for a gizmo axis.
   */
  public createGizmoAxis(device: GPUDevice, length: number = 1.0, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const [r, g, b] = color;
    const vertices = new Float32Array([
      0, 0, 0, r, g, b,
      0, length, 0, r, g, b,
    ]);

    this.vertexCount = 2;
    this.indexCount = 0;
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
   * Generates a line-based diamond for translation gizmo tips.
   */
  public createDiamond(device: GPUDevice, size: number = 0.1, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const s = size;
    const [r, g, b] = color;
    const vertices = new Float32Array([
      0, s, 0, r, g, b,
      s, 0, 0, r, g, b,

      s, 0, 0, r, g, b,
      0, -s, 0, r, g, b,

      0, -s, 0, r, g, b,
      -s, 0, 0, r, g, b,

      -s, 0, 0, r, g, b,
      0, s, 0, r, g, b,

      // Vertical pass if we want it to look 3D-ish but flat
      // 0, 0, s,   0, 1, 0,
      // 0, 0, -s,  0, 1, 0,
    ]);

    this.vertexCount = 8;
    this.indexCount = 0;
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
   * Generates a line-based square for scale gizmo tips.
   */
  public createSquare(device: GPUDevice, size: number = 0.1): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const s = size * 0.5;
    const vertices = new Float32Array([
      -s, s, 0, 0, 1, 0,
      s, s, 0, 0, 1, 0,

      s, s, 0, 0, 1, 0,
      s, -s, 0, 0, 1, 0,

      s, -s, 0, 0, 1, 0,
      -s, -s, 0, 0, 1, 0,

      -s, -s, 0, 0, 1, 0,
      -s, s, 0, 0, 1, 0,
    ]);

    this.vertexCount = 8;
    this.indexCount = 0;
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
   * Generates a line-based circle for origin or rotation gizmos.
   */
  public createCircle(device: GPUDevice, radius: number = 1.0, segments: number = 64, color: number[] = [1, 1, 1], axis: 'X' | 'Y' | 'Z' = 'Y'): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const [r, g, b] = color;
    const vertices = new Float32Array(segments * 2 * 6); // 2 vertices per segment * 6 floats
    for (let i = 0; i < segments; i++) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;

      let x1, y1, z1, x2, y2, z2;

      if (axis === 'X') {
        x1 = 0; y1 = Math.cos(angle1) * radius; z1 = Math.sin(angle1) * radius;
        x2 = 0; y2 = Math.cos(angle2) * radius; z2 = Math.sin(angle2) * radius;
      } else if (axis === 'Y') {
        x1 = Math.cos(angle1) * radius; y1 = 0; z1 = Math.sin(angle1) * radius;
        x2 = Math.cos(angle2) * radius; y2 = 0; z2 = Math.sin(angle2) * radius;
      } else { // Z
        x1 = Math.cos(angle1) * radius; y1 = Math.sin(angle1) * radius; z1 = 0;
        x2 = Math.cos(angle2) * radius; y2 = Math.sin(angle2) * radius; z2 = 0;
      }

      const off = i * 12;
      // Vert 1
      vertices[off + 0] = x1; vertices[off + 1] = y1; vertices[off + 2] = z1;
      vertices[off + 3] = r; vertices[off + 4] = g; vertices[off + 5] = b;
      // Vert 2
      vertices[off + 6] = x2; vertices[off + 7] = y2; vertices[off + 8] = z2;
      vertices[off + 9] = r; vertices[off + 10] = g; vertices[off + 11] = b;
    }

    this.vertexCount = segments * 2;
    this.indexCount = 0;
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
   * Generates a line-based cone for translation gizmo tips.
   */
  public createGizmoCone(device: GPUDevice, height: number = 0.2, radius: number = 0.08, segments: number = 8): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const vertices = [];
    // Base circle
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      const x1 = Math.cos(a1) * radius;
      const z1 = Math.sin(a1) * radius;
      const x2 = Math.cos(a2) * radius;
      const z2 = Math.sin(a2) * radius;

      // Base edge
      vertices.push(x1, 0, z1, 0, 1, 0);
      vertices.push(x2, 0, z2, 0, 1, 0);

      // Line to tip
      vertices.push(x1, 0, z1, 0, 1, 0);
      vertices.push(0, height, 0, 0, 1, 0);
    }

    const vertexData = new Float32Array(vertices);
    this.vertexCount = vertexData.length / 6;
    this.indexCount = 0;
    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();
    this.material = new UMaterial();
  }

  /**
   * Generates a line-based cube for scale gizmo tips.
   */
  public createGizmoCube(device: GPUDevice, size: number = 0.1): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const s = size * 0.5;
    const vertices = new Float32Array([
      // Bottom
      -s, -s, -s, 0, 1, 0, s, -s, -s, 0, 1, 0,
      s, -s, -s, 0, 1, 0, s, -s, s, 0, 1, 0,
      s, -s, s, 0, 1, 0, -s, -s, s, 0, 1, 0,
      -s, -s, s, 0, 1, 0, -s, -s, -s, 0, 1, 0,
      // Top
      -s, s, -s, 0, 1, 0, s, s, -s, 0, 1, 0,
      s, s, -s, 0, 1, 0, s, s, s, 0, 1, 0,
      s, s, s, 0, 1, 0, -s, s, s, 0, 1, 0,
      -s, s, s, 0, 1, 0, -s, s, -s, 0, 1, 0,
      // Sides
      -s, -s, -s, 0, 1, 0, -s, s, -s, 0, 1, 0,
      s, -s, -s, 0, 1, 0, s, s, -s, 0, 1, 0,
      s, -s, s, 0, 1, 0, s, s, s, 0, 1, 0,
      -s, -s, s, 0, 1, 0, -s, s, s, 0, 1, 0,
    ]);

    this.vertexCount = 24;
    this.indexCount = 0;
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
   * Generates a smooth UV sphere.
   */
  public createSphere(device: GPUDevice, radius: number = 1.0, latSegments: number = 16, lonSegments: number = 32): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.topology = 'triangle-list';

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const v = lat / latSegments;

      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const u = lon / lonSegments;

        const nx = cosPhi * sinTheta;
        const ny = cosTheta;
        const nz = sinPhi * sinTheta;

        const x = nx * radius;
        const y = ny * radius;
        const z = nz * radius;

        // Position
        vertices.push(x, y, z);
        // Normal (UV sphere normals are the unit direction from center)
        vertices.push(nx, ny, nz);
        // UV
        vertices.push(u, v);
      }
    }

    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * (lonSegments + 1) + lon;
        const second = first + lonSegments + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    this.vertexCount = vertices.length / 8;
    this.indexCount = indices.length;

    const vertexData = new Float32Array(vertices);
    const indexData = new Uint16Array(indices);

    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indexData);
    this.indexBuffer.unmap();

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
