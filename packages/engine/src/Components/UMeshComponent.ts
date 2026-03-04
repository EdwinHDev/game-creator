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
   * Generates a simple colored box matching the updated 48-byte stride format:
   * [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
   */
  public createBox(device: GPUDevice): void {
    this.topology = 'triangle-list';
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();

    // 24 vertices (4 per face)
    const vertices = new Float32Array([
      // Front face (Z+) -> Normal: 0, 0, 1 | Tangent: 1, 0, 0, 1
      -1, -1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1,
      1, -1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1,
      1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
      -1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,

      // Back face (Z-) -> Normal: 0, 0, -1 | Tangent: -1, 0, 0, 1
      -1, -1, -1, 0, 0, -1, 1, 1, -1, 0, 0, 1,
      -1, 1, -1, 0, 0, -1, 1, 0, -1, 0, 0, 1,
      1, 1, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1,
      1, -1, -1, 0, 0, -1, 0, 1, -1, 0, 0, 1,

      // Top face (Y+) -> Normal: 0, 1, 0 | Tangent: 1, 0, 0, 1
      -1, 1, -1, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      -1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1,
      1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1,
      1, 1, -1, 0, 1, 0, 1, 0, 1, 0, 0, 1,

      // Bottom face (Y-) -> Normal: 0, -1, 0 | Tangent: 1, 0, 0, 1
      -1, -1, -1, 0, -1, 0, 0, 1, 1, 0, 0, 1,
      1, -1, -1, 0, -1, 0, 1, 1, 1, 0, 0, 1,
      1, -1, 1, 0, -1, 0, 1, 0, 1, 0, 0, 1,
      -1, -1, 1, 0, -1, 0, 0, 0, 1, 0, 0, 1,

      // Right face (X+) -> Normal: 1, 0, 0 | Tangent: 0, 0, -1, 1
      1, -1, -1, 1, 0, 0, 1, 1, 0, 0, -1, 1,
      1, 1, -1, 1, 0, 0, 1, 0, 0, 0, -1, 1,
      1, 1, 1, 1, 0, 0, 0, 0, 0, 0, -1, 1,
      1, -1, 1, 1, 0, 0, 0, 1, 0, 0, -1, 1,

      // Left face (X-) -> Normal: -1, 0, 0 | Tangent: 0, 0, 1, 1
      -1, -1, -1, -1, 0, 0, 0, 1, 0, 0, 1, 1,
      -1, -1, 1, -1, 0, 0, 1, 1, 0, 0, 1, 1,
      -1, 1, 1, -1, 0, 0, 1, 0, 0, 0, 1, 1,
      -1, 1, -1, -1, 0, 0, 0, 0, 0, 0, 1, 1,
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
    // Phase 34: 12 floats per vertex (48 bytes)
    this.vertexCount = vertices.length / 12;

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
  public async loadTexture(url: string, device: GPUDevice, type: 'albedo' | 'roughness' | 'normal' = 'albedo'): Promise<void> {
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      const newTexture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: newTexture },
        [imageBitmap.width, imageBitmap.height]
      );

      // Link to appropriate UMaterial slot
      if (this.material) {
        if (type === 'albedo') this.material.baseColorTexture = newTexture;
        else if (type === 'roughness') this.material.roughnessTexture = newTexture;
        else if (type === 'normal') this.material.normalTexture = newTexture;

        this.material.isDirty = true;
      } else {
        console.warn(`No material found to link texture slot ${type} onto mesh ${this.owner?.name}`);
      }

    } catch (error) {
      console.error(`Failed to load texture at path ${url} for slot ${type}:`, error);
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
      vertices.push(linePos, 0, -halfSize, ...xColor, 0, 0, 1, 0, 0, 1);
      vertices.push(linePos, 0, halfSize, ...xColor, 0, 0, 1, 0, 0, 1);

      // Line along Z (Horizontal-ish)
      const zColor = isCenter ? xAxisColor : grayColor;
      vertices.push(-halfSize, 0, linePos, ...zColor, 0, 0, 1, 0, 0, 1);
      vertices.push(halfSize, 0, linePos, ...zColor, 0, 0, 1, 0, 0, 1);
    }

    const vertexData = new Float32Array(vertices);
    this.vertexCount = vertexData.length / 12;

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
      0, h, 0, ...nf, 0, 0, 1, 0, 0, 1,
      -r, 0, r, ...nf, 0, 0, 1, 0, 0, 1,
      r, 0, r, ...nf, 0, 0, 1, 0, 0, 1,

      // Back Face
      0, h, 0, ...nb, 0, 0, 1, 0, 0, 1,
      r, 0, -r, ...nb, 0, 0, 1, 0, 0, 1,
      -r, 0, -r, ...nb, 0, 0, 1, 0, 0, 1,

      // Right Face
      0, h, 0, ...nr, 0, 0, 1, 0, 0, 1,
      r, 0, r, ...nr, 0, 0, 1, 0, 0, 1,
      r, 0, -r, ...nr, 0, 0, 1, 0, 0, 1,

      // Left Face
      0, h, 0, ...nl, 0, 0, 1, 0, 0, 1,
      -r, 0, -r, ...nl, 0, 0, 1, 0, 0, 1,
      -r, 0, r, ...nl, 0, 0, 1, 0, 0, 1,

      // Base
      -r, 0, -r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      r, 0, -r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      r, 0, r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      -r, 0, -r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      r, 0, r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
      -r, 0, r, 0, -1, 0, 0, 0, 1, 0, 0, 1,
    ]);

    this.vertexCount = vertices.length / 12; // Phase 34
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
      0, 0, 0, r, g, b, 0, 0, 1, 0, 0, 1,
      0, length, 0, r, g, b, 0, 0, 1, 0, 0, 1,
    ]);

    this.vertexCount = vertices.length / 12;
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
      0, s, 0, r, g, b, 0, 0, 1, 0, 0, 1,
      s, 0, 0, r, g, b, 0, 0, 1, 0, 0, 1,

      s, 0, 0, r, g, b, 0, 0, 1, 0, 0, 1,
      0, -s, 0, r, g, b, 0, 0, 1, 0, 0, 1,

      0, -s, 0, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, 0, 0, r, g, b, 0, 0, 1, 0, 0, 1,

      -s, 0, 0, r, g, b, 0, 0, 1, 0, 0, 1,
      0, s, 0, r, g, b, 0, 0, 1, 0, 0, 1,
    ]);

    this.vertexCount = vertices.length / 12;
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
      -s, s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      s, s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,

      s, s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      s, -s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,

      s, -s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      -s, -s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,

      -s, -s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      -s, s, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1,
    ]);

    this.vertexCount = vertices.length / 12;
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
    // 2 vertices per segment * 12 floats (48 bytes)
    const vertices = new Float32Array(segments * 2 * 12);
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

      const off = i * 24;
      // Vert 1
      vertices[off + 0] = x1; vertices[off + 1] = y1; vertices[off + 2] = z1;
      vertices[off + 3] = r; vertices[off + 4] = g; vertices[off + 5] = b;
      vertices[off + 6] = 0; vertices[off + 7] = 0; vertices[off + 8] = 1; vertices[off + 9] = 0; vertices[off + 10] = 0; vertices[off + 11] = 1;
      // Vert 2
      vertices[off + 12] = x2; vertices[off + 13] = y2; vertices[off + 14] = z2;
      vertices[off + 15] = r; vertices[off + 16] = g; vertices[off + 17] = b;
      vertices[off + 18] = 0; vertices[off + 19] = 0; vertices[off + 20] = 1; vertices[off + 21] = 0; vertices[off + 22] = 0; vertices[off + 23] = 1;
    }

    this.vertexCount = vertices.length / 12;
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
      vertices.push(x1, 0, z1, 0, 1, 0, 0, 0, 1, 0, 0, 1);
      vertices.push(x2, 0, z2, 0, 1, 0, 0, 0, 1, 0, 0, 1);

      // Line to tip
      vertices.push(x1, 0, z1, 0, 1, 0, 0, 0, 1, 0, 0, 1);
      vertices.push(0, height, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1);
    }

    const vertexData = new Float32Array(vertices);
    this.vertexCount = vertexData.length / 12;
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
  public createGizmoCube(device: GPUDevice, size: number = 0.5, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const s = size * 0.5;
    const [r, g, b] = color;
    const vertices = new Float32Array([
      // Front face
      -s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,

      // Back face
      -s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,

      // Connecting lines
      -s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, -s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, s, r, g, b, 0, 0, 1, 0, 0, 1,
      -s, s, -s, r, g, b, 0, 0, 1, 0, 0, 1,
    ]);

    this.vertexCount = vertices.length / 12;
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
  public createSphere(device: GPUDevice, radius: number = 1.0, segments: number = 32): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.topology = 'triangle-list';

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= segments; y++) {
      const v = y / segments;
      const phi = v * Math.PI; // vertically from 0 to PI

      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const theta = u * Math.PI * 2; // horizontally from 0 to 2PI

        const px = radius * Math.sin(phi) * Math.cos(theta);
        const py = radius * Math.cos(phi);
        const pz = radius * Math.sin(phi) * Math.sin(theta);

        const nx = px / radius, ny = py / radius, nz = pz / radius;

        // Phase 34: Sphere Tangent derivation
        // Taking the derivative of position vector with respect to theta (u)
        // dP/dtheta = (-R * sin(phi) * sin(theta), 0, R * sin(phi) * cos(theta))
        let tx = -Math.sin(theta);
        let ty = 0;
        let tz = Math.cos(theta);
        // Normalize the tangent
        const tLen = Math.sqrt(tx * tx + tz * tz);
        if (tLen > 0.0001) {
          tx /= tLen;
          tz /= tLen;
        } else {
          tx = 1; ty = 0; tz = 0; // fallback at poles
        }

        // [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
        vertices.push(px, py, pz, nx, ny, nz, u, 1 - v, tx, ty, tz, 1.0);
      }
    }

    for (let y = 0; y < segments; y++) {
      for (let x = 0; x < segments; x++) {
        const i1 = y * (segments + 1) + x;
        const i2 = i1 + 1;
        const i3 = (y + 1) * (segments + 1) + x;
        const i4 = i3 + 1;

        indices.push(i1, i3, i2);
        indices.push(i2, i3, i4);
      }
    }

    this.indexCount = indices.length;
    // Phase 34: 12 floats per vertex
    this.vertexCount = vertices.length / 12;

    this.vertexBuffer = device.createBuffer({
      size: vertices.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.length * 2,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    if (!this.material) this.material = new UMaterial();
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
