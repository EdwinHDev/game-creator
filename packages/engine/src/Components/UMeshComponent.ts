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
  public materialPath: string | null = null;
  public geometryType: string = 'none';

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
   * Generates a simple colored box matching the updated 48-byte stride format:
   * [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
   */
  public createBox(device: GPUDevice): void {
    this.geometryType = 'box';
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

    // Initialize default material if none
    if (!this.material && !this.materialPath) this.material = new UMaterial();
  }

  /**
   * Serializes the component's data.
   */
  public override serialize(): any {
    const data = super.serialize();
    return {
      ...data,
      materialPath: this.materialPath,
      geometryType: this.geometryType
    };
  }

  /**
   * Deserializes the component's data.
   */
  public override async deserialize(data: any): Promise<void> {
    await super.deserialize(data);
    if (data.materialPath) {
      this.materialPath = data.materialPath;
    }
    if (data.geometryType) {
      this.geometryType = data.geometryType;
    }
  }

  /**
   * Generates a flat subdivided plane on the XZ axis.
   * 12 floats per vertex: [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
   */
  public createPlane(device: GPUDevice, size: number = 1.0, segments: number = 10): void {
    this.geometryType = 'plane';
    this.topology = 'triangle-list';
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();

    const verts: number[] = [];
    const inds: number[] = [];
    const halfSize = size / 2;
    const step = size / segments;

    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const posX = -halfSize + x * step;
        const posZ = -halfSize + z * step;
        const u = x / segments;
        const v = z / segments;

        // Position, Normal (0,1,0), UV, Tangent (1,0,0,1)
        verts.push(posX, 0, posZ, 0, 1, 0, u, v, 1, 0, 0, 1);
      }
    }

    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const i0 = z * (segments + 1) + x;
        const i1 = i0 + 1;
        const i2 = i0 + (segments + 1);
        const i3 = i2 + 1;

        // Triangles
        inds.push(i0, i2, i1);
        inds.push(i1, i2, i3);
      }
    }

    const vertices = new Float32Array(verts);
    const indices = new Uint16Array(inds);

    this.vertexCount = vertices.length / 12;
    this.indexCount = indices.length;

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    if (!this.material) this.material = new UMaterial();
  }

  /**
   * Generates a cylinder oriented on the Y axis.
   * 12 floats per vertex: [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
   */
  public createCylinder(device: GPUDevice, radius: number = 1.0, height: number = 2.0, segments: number = 32): void {
    this.geometryType = 'cylinder';
    this.topology = 'triangle-list';
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();

    const verts: number[] = [];
    const inds: number[] = [];
    const halfHeight = height / 2;

    // Body (walls)
    for (let y = 0; y <= 1; y++) {
      const v = 1 - y;
      const posY = y === 0 ? -halfHeight : halfHeight;
      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const theta = u * Math.PI * 2;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const posX = radius * sinTheta;
        const posZ = radius * cosTheta;

        // Normal points outwards from center
        // Tangent points along the circumference
        verts.push(
          posX, posY, posZ,
          sinTheta, 0, cosTheta, // nx, ny, nz
          u, v,                  // u, v
          cosTheta, 0, -sinTheta, 1 // tx, ty, tz, tw
        );
      }
    }

    // Body Indices
    for (let x = 0; x < segments; x++) {
      const i0 = x;
      const i1 = x + 1;
      const i2 = x + (segments + 1);
      const i3 = i2 + 1;

      inds.push(i0, i1, i2);
      inds.push(i1, i3, i2);
    }

    // Caps
    const buildCap = (isTop: boolean) => {
      const sign = isTop ? 1 : -1;
      const posY = halfHeight * sign;
      const centerIdx = verts.length / 12;

      // Center point
      verts.push(
        0, posY, 0,
        0, sign, 0,
        0.5, 0.5,
        1, 0, 0, 1
      );

      const startIndex = verts.length / 12;

      for (let x = 0; x <= segments; x++) {
        const theta = (x / segments) * Math.PI * 2;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        // Map UVs circle into square 0-1
        const u = 0.5 + (sinTheta * 0.5);
        const v = 0.5 + (cosTheta * 0.5 * sign); // Flip V for bottom cap matching top visually

        verts.push(
          radius * sinTheta, posY, radius * cosTheta,
          0, sign, 0,
          u, v,
          1, 0, 0, 1
        );
      }

      for (let x = 0; x < segments; x++) {
        if (isTop) {
          inds.push(centerIdx, startIndex + x, startIndex + x + 1);
        } else {
          inds.push(centerIdx, startIndex + x + 1, startIndex + x);
        }
      }
    };

    buildCap(true);  // Top Cap
    buildCap(false); // Bottom Cap

    const vertices = new Float32Array(verts);
    const indices = new Uint16Array(inds);

    this.vertexCount = vertices.length / 12;
    this.indexCount = indices.length;

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    if (!this.material) this.material = new UMaterial();
  }

  /**
   * Generates a capsule oriented on the Y axis.
   * 12 floats per vertex: [x, y, z, nx, ny, nz, u, v, tx, ty, tz, tw]
   */
  public createCapsule(device: GPUDevice, radius: number = 0.5, height: number = 2.0, radialSegments: number = 32, heightSegments: number = 16): void {
    this.geometryType = 'capsule';
    this.topology = 'triangle-list';
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();

    const verts: number[] = [];
    const inds: number[] = [];

    // The cylinder part height is total height minus the two hemispheres
    const cylinderHeight = Math.max(0, height - (radius * 2));
    const halfCylHeight = cylinderHeight / 2;

    let indexCount = 0;
    const indexRow: number[][] = [];

    // Calculate total segments
    // Top Hemisphere (0 to PI/2)
    // Cylinder Body 
    // Bottom Hemisphere (PI/2 to PI)

    const halfHeightSegments = Math.max(2, Math.floor(heightSegments / 2));

    const buildRing = (yOffset: number, phiStart: number, phiEnd: number, hSegments: number) => {
      for (let y = 0; y <= hSegments; y++) {
        const indexRowArray: number[] = [];
        const vRatio = y / hSegments;
        const phi = phiStart + vRatio * (phiEnd - phiStart);

        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        for (let x = 0; x <= radialSegments; x++) {
          const u = x / radialSegments;
          const theta = u * Math.PI * 2;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);

          // Position
          const posX = radius * sinPhi * sinTheta;
          const posY = radius * cosPhi + yOffset;
          const posZ = radius * sinPhi * cosTheta;

          // Normal
          const nx = sinPhi * sinTheta;
          const ny = cosPhi;
          const nz = sinPhi * cosTheta;

          // Tangent
          const tx = cosTheta;
          const ty = 0;
          const tz = -sinTheta;

          // Adjust V coordinate based on overall vertical position
          // Total height = height
          // Current absolute Y = posY
          // Convert from Y [-height/2, height/2] to V [1, 0]
          const v = 1.0 - ((posY + (height / 2)) / height);

          verts.push(posX, posY, posZ, nx, ny, nz, u, v, tx, ty, tz, 1);
          indexRowArray.push(indexCount++);
        }
        indexRow.push(indexRowArray);
      }
    };
    // 1. Top Hemisphere
    buildRing(halfCylHeight, 0, Math.PI / 2, halfHeightSegments);

    // 2. Cylinder Body (if any)
    if (cylinderHeight > 0) {
      // We add a ring at the bottom of the cylinder body to ensure valid UV interpolation down the wall
      buildRing(-halfCylHeight, Math.PI / 2, Math.PI / 2, 1);
    }

    // 3. Bottom Hemisphere
    buildRing(-halfCylHeight, Math.PI / 2, Math.PI, halfHeightSegments);

    // Generate Indices
    for (let r = 0; r < indexRow.length - 1; r++) {
      for (let c = 0; c < radialSegments; c++) {
        const i0 = indexRow[r][c];
        const i1 = indexRow[r + 1][c];
        const i2 = indexRow[r + 1][c + 1];
        const i3 = indexRow[r][c + 1];

        inds.push(i0, i1, i2);
        inds.push(i0, i2, i3);
      }
    }

    const vertices = new Float32Array(verts);
    const indices = new Uint16Array(inds);

    this.vertexCount = vertices.length / 12;
    this.indexCount = indices.length;

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

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
        if (type === 'albedo') {
          this.material.baseColorTexture = newTexture;
          this.material.albedoMapPath = url;
        } else if (type === 'roughness') {
          this.material.roughnessTexture = newTexture;
          this.material.roughnessMapPath = url;
        } else if (type === 'normal') {
          this.material.normalTexture = newTexture;
          this.material.normalMapPath = url;
        }

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
   * Generates a solid pyramid for gizmo arrow heads. (Fixed for 6 floats)
   */
  public createPyramid(device: GPUDevice, height: number = 0.15, radius: number = 0.05, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.topology = 'triangle-list';

    const h = height;
    const r = radius;
    const [cr, cg, cb] = color; // Usamos el color directo en lugar de Normales y Tangentes

    const vertices = new Float32Array([
      // Front Face
      0, h, 0, cr, cg, cb,
      -r, 0, r, cr, cg, cb,
      r, 0, r, cr, cg, cb,

      // Back Face
      0, h, 0, cr, cg, cb,
      r, 0, -r, cr, cg, cb,
      -r, 0, -r, cr, cg, cb,

      // Right Face
      0, h, 0, cr, cg, cb,
      r, 0, r, cr, cg, cb,
      r, 0, -r, cr, cg, cb,

      // Left Face
      0, h, 0, cr, cg, cb,
      -r, 0, -r, cr, cg, cb,
      -r, 0, r, cr, cg, cb,

      // Base
      -r, 0, -r, cr, cg, cb,
      r, 0, -r, cr, cg, cb,
      r, 0, r, cr, cg, cb,
      -r, 0, -r, cr, cg, cb,
      r, 0, r, cr, cg, cb,
      -r, 0, r, cr, cg, cb,
    ]);

    this.vertexCount = vertices.length / 6; // Vuelve a la normalidad
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

    this.vertexCount = vertices.length / 6;
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
    ]);

    this.vertexCount = vertices.length / 6;
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

    this.vertexCount = vertices.length / 6;
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
    // Gizmos use colorVertexBuffers (24 bytes) = 6 floats
    const vertices = new Float32Array(segments * 2 * 6);
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

    this.vertexCount = vertices.length / 6;
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
   * Generates a line-based cube for scale gizmo tips. (Fixed for 6 floats)
   */
  public createGizmoCube(device: GPUDevice, size: number = 0.5, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.topology = 'line-list';

    const s = size * 0.5;
    const [r, g, b] = color;

    // Eliminamos los ', 0, 0, 1, 0, 0, 1' que habías añadido de más
    const vertices = new Float32Array([
      // Front face
      -s, -s, s, r, g, b,
      s, -s, s, r, g, b,
      s, -s, s, r, g, b,
      s, s, s, r, g, b,
      s, s, s, r, g, b,
      -s, s, s, r, g, b,
      -s, s, s, r, g, b,
      -s, -s, s, r, g, b,

      // Back face
      -s, -s, -s, r, g, b,
      s, -s, -s, r, g, b,
      s, -s, -s, r, g, b,
      s, s, -s, r, g, b,
      s, s, -s, r, g, b,
      -s, s, -s, r, g, b,
      -s, s, -s, r, g, b,
      -s, -s, -s, r, g, b,

      // Connecting lines
      -s, -s, s, r, g, b,
      -s, -s, -s, r, g, b,
      s, -s, s, r, g, b,
      s, -s, -s, r, g, b,
      s, s, s, r, g, b,
      s, s, -s, r, g, b,
      -s, s, s, r, g, b,
      -s, s, -s, r, g, b,
    ]);

    this.vertexCount = vertices.length / 6; // Vuelve a la normalidad
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
   * Generates a solid colored cube specifically for 6-float Gizmo pipelines (filled).
   */
  public createSolidGizmoCube(device: GPUDevice, size: number = 0.1, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.topology = 'triangle-list';

    const s = size * 1.7;
    const [r, g, b] = color;

    // 8 Corners of the cube
    const p = [
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s], // Front (0,1,2,3)
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s]  // Back  (4,5,6,7)
    ];

    // Vertices: 24 (4 per face to handle flat coloring easily in basic pipeline)
    // Format: [x, y, z, r, g, b]
    const vertices = new Float32Array([
      // Front face
      ...p[0], r, g, b, ...p[1], r, g, b, ...p[2], r, g, b, ...p[3], r, g, b,
      // Back face
      ...p[5], r, g, b, ...p[4], r, g, b, ...p[7], r, g, b, ...p[6], r, g, b,
      // Top face
      ...p[3], r, g, b, ...p[2], r, g, b, ...p[6], r, g, b, ...p[7], r, g, b,
      // Bottom face
      ...p[4], r, g, b, ...p[5], r, g, b, ...p[1], r, g, b, ...p[0], r, g, b,
      // Right face
      ...p[1], r, g, b, ...p[5], r, g, b, ...p[6], r, g, b, ...p[2], r, g, b,
      // Left face
      ...p[4], r, g, b, ...p[0], r, g, b, ...p[3], r, g, b, ...p[7], r, g, b
    ]);

    // Indices: 36 (6 faces * 2 triangles * 3 vertices)
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3, // Front
      4, 5, 6, 4, 6, 7, // Back
      8, 9, 10, 8, 10, 11, // Top
      12, 13, 14, 12, 14, 15, // Bottom
      16, 17, 18, 16, 18, 19, // Right
      20, 21, 22, 20, 22, 23  // Left
    ]);

    this.vertexCount = vertices.length / 6;
    this.indexCount = indices.length;

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    this.material = new UMaterial();
  }

  /**
   * Generates a smooth UV sphere.
   */
  public createSphere(device: GPUDevice, radius: number = 1.0, segments: number = 32): void {
    this.geometryType = 'sphere';
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

        indices.push(i1, i2, i3);
        indices.push(i2, i4, i3);
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
   * Generates a solid colored sphere specifically for 6-float Gizmo pipelines.
   */
  public createGizmoSphere(device: GPUDevice, radius: number = 0.05, segments: number = 16, color: number[] = [1, 1, 1]): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.topology = 'triangle-list';

    const vertices: number[] = [];
    const indices: number[] = [];
    const [r, g, b] = color;

    for (let y = 0; y <= segments; y++) {
      const v = y / segments;
      const phi = v * Math.PI;

      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const theta = u * Math.PI * 2;

        const px = radius * Math.sin(phi) * Math.cos(theta);
        const py = radius * Math.cos(phi);
        const pz = radius * Math.sin(phi) * Math.sin(theta);

        // Exactamente 6 floats! (Posición y Color)
        vertices.push(px, py, pz, r, g, b);
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

    const vertexData = new Float32Array(vertices);
    this.vertexCount = vertexData.length / 6;
    this.indexCount = indices.length;

    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.length * 2,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
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
