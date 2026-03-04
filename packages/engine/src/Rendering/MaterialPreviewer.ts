import { mat4 } from 'gl-matrix';
import { UMaterial } from './UMaterial';
import standardShader from './Shaders/Standard.wgsl?raw';

/**
 * Isolated renderer to preview a material on a sphere.
 * Used in the Details Panel for real-time visual feedback.
 */
export class MaterialPreviewer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;

  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount: number = 0;
  private isDestroyed: boolean = false;

  private materialUniformBuffer: GPUBuffer | null = null;
  private sceneUniformBuffer: GPUBuffer | null = null;

  private fallbackWhiteTexture: GPUTexture;
  private fallbackFlatNormalTexture: GPUTexture;
  private dummyShadowTexture: GPUTexture;
  private defaultSampler: GPUSampler;
  private shadowSampler: GPUSampler;

  constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.device = device;
    this.context = canvas.getContext('webgpu') as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });

    // 1. Fallback Textures
    this.fallbackWhiteTexture = this.createSolidTexture([255, 255, 255, 255]);
    this.fallbackFlatNormalTexture = this.createSolidTexture([128, 128, 255, 255]);
    this.dummyShadowTexture = this.device.createTexture({
      size: [2, 2, 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.defaultSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });

    this.shadowSampler = this.device.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // 2. Uniform Buffers
    // Material Uniforms: MVP (64) + Model (64) + BaseColor (16) + Roughness (4) + Metallic (4) + Padding (8) = 160
    this.materialUniformBuffer = this.device.createBuffer({
      size: 160,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Scene Uniforms: LightDir (16) + LightColor (16) + LightVP (64) + CameraPos (16) + InvVP (64) = 176 (rounded to 192 for alignment)
    this.sceneUniformBuffer = this.device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.initGeometry();
    this.initPipeline();
  }

  private createSolidTexture(color: number[]): GPUTexture {
    const tex = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: tex },
      new Uint8Array(color),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1]
    );
    return tex;
  }

  private initGeometry() {
    const radius = 1.0;
    const segments = 32;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= segments; y++) {
      const v = y / segments;
      const phi = v * Math.PI;
      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const theta = u * Math.PI * 2;
        const px = radius * Math.sin(phi) * Math.cos(theta);
        const py = radius * Math.cos(phi);
        const pz = radius * Math.sin(phi) * Math.sin(theta);
        const nx = px / radius, ny = py / radius, nz = pz / radius;
        let tx = -Math.sin(theta), ty = 0, tz = Math.cos(theta);
        const tLen = Math.sqrt(tx * tx + tz * tz);
        if (tLen > 0.0001) { tx /= tLen; tz /= tLen; } else { tx = 1; ty = 0; tz = 0; }
        vertices.push(px, py, pz, nx, ny, nz, u, 1 - v, tx, ty, tz, 1.0);
      }
    }
    for (let y = 0; y < segments; y++) {
      for (let x = 0; x < segments; x++) {
        const i1 = y * (segments + 1) + x;
        const i2 = i1 + 1;
        const i3 = (y + 1) * (segments + 1) + x;
        const i4 = i3 + 1;
        indices.push(i1, i2, i3, i2, i4, i3);
      }
    }

    this.indexCount = indices.length;
    this.vertexBuffer = this.device.createBuffer({
      size: vertices.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = this.device.createBuffer({
      size: indices.length * 2,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();
  }

  private initPipeline() {
    const module = this.device.createShaderModule({ code: standardShader });

    const materialBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
      ]
    });

    const sceneBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
      ]
    });

    const layout = this.device.createPipelineLayout({
      bindGroupLayouts: [materialBindGroupLayout, sceneBindGroupLayout]
    });

    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 48,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
            { shaderLocation: 3, offset: 32, format: 'float32x4' }, // tangent
          ]
        }]
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
    });
  }

  public render(material: UMaterial) {
    if (!this.pipeline || !this.vertexBuffer || !this.indexBuffer) return;

    // 1. Update Uniforms
    const modelMatrix = mat4.create();
    mat4.rotateY(modelMatrix, modelMatrix, Date.now() * 0.001); // Auto-rotation for preview

    const viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, [0, 0, 3], [0, 0, 0], [0, 1, 0]);

    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, Math.PI / 4, 1.0, 0.1, 10.0);

    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
    mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);

    // Material Data
    const matData = new Float32Array(40); // 160 bytes / 4
    matData.set(mvpMatrix, 0);
    matData.set(modelMatrix, 16);
    matData.set(material.baseColor, 32);
    matData[36] = material.roughness;
    matData[37] = material.metallic;
    this.device.queue.writeBuffer(this.materialUniformBuffer!, 0, matData);

    // Scene Data
    const sceneData = new Float32Array(48); // 192 bytes / 4
    sceneData.set([1, -1, -1, 0], 0); // lightDirection (Y is down)
    sceneData.set([1, 1, 1, 1], 4);   // lightColor
    sceneData.set(mat4.create(), 8);  // lightVP (dummy)
    sceneData.set([0, 0, 3, 1], 24);  // cameraPosition
    sceneData.set(mat4.create(), 28); // invVP (dummy)
    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    // 2. Bind Groups
    const matBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.materialUniformBuffer! } },
        { binding: 1, resource: this.defaultSampler },
        { binding: 2, resource: material.baseColorTexture?.createView() || this.fallbackWhiteTexture.createView() },
        { binding: 3, resource: material.roughnessTexture?.createView() || this.fallbackWhiteTexture.createView() },
        { binding: 4, resource: material.normalTexture?.createView() || this.fallbackFlatNormalTexture.createView() },
      ]
    });

    const sceneBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer! } },
        { binding: 1, resource: this.dummyShadowTexture.createView() },
        { binding: 2, resource: this.shadowSampler },
      ]
    });

    // 3. Render Pass
    const depthTexture = this.device.createTexture({
      size: [256, 256],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      }
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, matBindGroup);
    pass.setBindGroup(1, sceneBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
    pass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Request next frame for rotation if not destroyed
    if (!this.isDestroyed) {
      requestAnimationFrame(() => this.render(material));
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.materialUniformBuffer?.destroy();
    this.sceneUniformBuffer?.destroy();
    this.fallbackWhiteTexture?.destroy();
    this.fallbackFlatNormalTexture?.destroy();
    this.dummyShadowTexture?.destroy();
  }
}
