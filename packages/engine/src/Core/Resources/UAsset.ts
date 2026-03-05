import { UObject } from '../UObject';

export class UAsset extends UObject {
  public vertexBuffer: GPUBuffer | null = null;
  public indexBuffer: GPUBuffer | null = null;
  public indexCount: number = 0;
  public type: string = 'StaticMesh';

  constructor(
    name: string,
    device: GPUDevice,
    vertices: Float32Array,
    indices: Uint32Array
  ) {
    super(name);
    this.indexCount = indices.length;

    // Crear Buffer de Vértices
    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    // Crear Buffer de Índices
    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();
  }

  public destroy() {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
  }
}
