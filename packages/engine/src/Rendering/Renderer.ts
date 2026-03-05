import { mat4, vec3 } from 'gl-matrix';
import { Logger } from '../Core/Logger';
import { World } from '../Framework/World';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UMeshComponent } from '../Components/UMeshComponent';
import { UDirectionalLightComponent } from '../Components/UDirectionalLightComponent';
import { UAssetManager } from '../Core/Resources/UAssetManager';

// Shader Imports (Vite ?raw)
import standardShader from './Shaders/Standard.wgsl?raw';
import shadowShader from './Shaders/Shadow.wgsl?raw';
import gizmoShader from './Shaders/Gizmo.wgsl?raw';
import billboardShader from './Shaders/Billboard.wgsl?raw';
import gridShader from './Shaders/Grid.wgsl?raw';
import outlineShader from './Shaders/Outline.wgsl?raw';
import skyShader from './Shaders/Sky.wgsl?raw';

/**
 * Data needed for a single frame of rendering.
 */
interface FrameData {
  commandEncoder: GPUCommandEncoder;
  viewProjMatrix: mat4;
  lightViewProj: mat4;
  mainCamera: UCameraComponent;
  aspectRatio: number;
  directionalLight: UDirectionalLightComponent | null;
  textureView: GPUTextureView;
  world: World;
}

/**
 * Handles WebGPU rendering operations and GPU resource management.
 */
export class Renderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;

  private skyPipeline: GPURenderPipeline | null = null;
  private trianglePipeline: GPURenderPipeline | null = null;
  private linePipeline: GPURenderPipeline | null = null;
  private outlinePipeline: GPURenderPipeline | null = null;
  private gizmoOverlayPipeline: GPURenderPipeline | null = null;
  private gizmoTriangleOverlayPipeline: GPURenderPipeline | null = null;
  private billboardPipeline: GPURenderPipeline | null = null;
  private billboardQuadBuffer: GPUBuffer | null = null;

  // Cache/Pool
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  private sceneUniformBuffer: GPUBuffer | null = null;
  private sceneBindGroup: GPUBindGroup | null = null;
  private skyBindGroup: GPUBindGroup | null = null;

  // Phase 29.1 / 33.1: Textures
  private defaultSampler: GPUSampler | null = null;
  private fallbackWhiteTexture: GPUTexture | null = null;
  private fallbackFlatNormalTexture: GPUTexture | null = null;
  private fallbackGrayTexture: GPUTexture | null = null;

  private shadowPipeline: GPURenderPipeline | null = null;
  private shadowTexture: GPUTexture | null = null;
  private shadowView: GPUTextureView | null = null;
  private shadowSampler: GPUSampler | null = null;
  private fallbackHDRTexture: GPUTexture | null = null;

  public viewProjMatrix: mat4 = mat4.create();

  constructor() { }

  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter!.requestDevice();
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context!.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });

    // --- FALLBACK TEXTURES (Phase 58.3 Fix: Create these BEFORE bind groups) ---
    this.fallbackWhiteTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: this.fallbackWhiteTexture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1]
    );
    UAssetManager.getInstance().setFallbackWhiteTexture(this.fallbackWhiteTexture);

    this.fallbackFlatNormalTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: this.fallbackFlatNormalTexture },
      new Uint8Array([128, 128, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1]
    );

    this.fallbackGrayTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: this.fallbackGrayTexture },
      new Uint8Array([128, 128, 128, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1]
    );

    this.fallbackHDRTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: this.fallbackHDRTexture },
      new Float32Array([0.05, 0.05, 0.05, 1.0]) as any,
      { bytesPerRow: 16, rowsPerImage: 1 },
      [1, 1, 1]
    );
    // --------------------------------------------------------------------------

    const standardVertexBuffers: GPUVertexBufferLayout[] = [{
      arrayStride: 48, // Phase 34: 48 bytes (Pos[12] + Normal[12] + UV[8] + Tangent[16])
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
        { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        { shaderLocation: 3, offset: 32, format: 'float32x4' }, // tangent
      ],
    }];

    const colorVertexBuffers: GPUVertexBufferLayout[] = [{
      arrayStride: 24,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // color (or fallback normal)
      ]
    }];

    const standardModule = this.device.createShaderModule({ code: standardShader });
    const shadowModule = this.device.createShaderModule({ code: shadowShader });
    const gizmoModule = this.device.createShaderModule({ code: gizmoShader });
    const billboardModule = this.device.createShaderModule({ code: billboardShader });
    const gridModule = this.device.createShaderModule({ code: gridShader });
    const outlineModule = this.device.createShaderModule({ code: outlineShader });
    const skyModule = this.device.createShaderModule({ code: skyShader });

    this.shadowTexture = this.device.createTexture({
      size: [2048, 2048], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowView = this.shadowTexture.createView();
    this.shadowSampler = this.device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

    this.shadowPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shadowModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.skyPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: skyModule, entryPoint: 'vs_main' },
      fragment: { module: skyModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });

    // Layouts must match exactly the Shader groups
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
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [materialBindGroupLayout, sceneBindGroupLayout]
    });

    this.trianglePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: standardModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: standardModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.linePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: gridModule, entryPoint: 'vs_main', buffers: colorVertexBuffers },
      fragment: {
        module: gridModule, entryPoint: 'fs_main',
        targets: [{
          format: this.format, blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'line-list' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.outlinePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: outlineModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: outlineModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'front' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.gizmoOverlayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: gizmoModule, entryPoint: 'vs_main', buffers: colorVertexBuffers },
      fragment: { module: gizmoModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.gizmoTriangleOverlayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: gizmoModule, entryPoint: 'vs_main', buffers: colorVertexBuffers },
      fragment: { module: gizmoModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.billboardPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: billboardModule, entryPoint: 'vs_main', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: {
        module: billboardModule, entryPoint: 'fs_main',
        targets: [{ format: this.format, blend: { color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }]
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: { depthWriteEnabled: false, depthCompare: 'less', format: 'depth24plus' },
    });

    this.sceneUniformBuffer = this.device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.trianglePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer } },
        { binding: 1, resource: this.shadowView! },
        { binding: 2, resource: this.shadowSampler! },
        { binding: 3, resource: this.fallbackHDRTexture!.createView() }
      ],
    });

    this.skyBindGroup = this.device.createBindGroup({
      layout: this.skyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer } }
      ]
    });

    const quadData = new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]);
    this.billboardQuadBuffer = this.device.createBuffer({ size: quadData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
    new Float32Array(this.billboardQuadBuffer.getMappedRange()).set(quadData);
    this.billboardQuadBuffer.unmap();

    // Phase 29.1: Default Texture and Sampler
    this.defaultSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });


    Logger.info("WebGPU Renderer Initialized (Modular).");
  }

  public render(world: World): void {
    const frameData = this.prepareFrame(world);
    if (!frameData) return;

    this.executeShadowPass(frameData);
    this.executeSkyPass(frameData);
    this.executeMainPass(frameData);
    this.executeGizmoPass(frameData);
    this.submitFrame(frameData.commandEncoder);
  }

  private prepareFrame(world: World): FrameData | null {
    if (!this.device || !this.context) return null;

    let mainCamera: UCameraComponent | null = null;
    for (const actor of world.actors) {
      if (actor.rootComponent instanceof UCameraComponent) { mainCamera = actor.rootComponent; break; }
    }
    if (!mainCamera) return null;

    const aspectRatio = this.context.getCurrentTexture().width / this.context.getCurrentTexture().height;
    const viewProjMatrix = mat4.create();
    mat4.multiply(viewProjMatrix, mainCamera.getProjectionMatrix(aspectRatio), mainCamera.getViewMatrix());
    mat4.copy(this.viewProjMatrix, viewProjMatrix);

    let directionalLight: UDirectionalLightComponent | null = null;
    for (const actor of world.actors) {
      directionalLight = actor.getComponent(UDirectionalLightComponent);
      if (directionalLight) break;
    }

    const lightDir = directionalLight ? directionalLight.getForwardVector() : vec3.fromValues(-0.5, -1, -0.5);
    const lightColor = directionalLight ? directionalLight.color : new Float32Array([1, 1, 1]);
    const lightIntensity = directionalLight ? directionalLight.intensity : 1.0;

    const lightViewProj = mat4.create();
    const lightProj = mat4.create();
    mat4.ortho(lightProj, -20, 20, -20, 20, 0.1, 150);
    const fixMatrix = mat4.fromValues(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1);
    mat4.multiply(lightProj, fixMatrix, lightProj);

    const lightEye = directionalLight ? directionalLight.owner.rootComponent!.relativeLocation : vec3.fromValues(0, 50, 0);
    const lightTarget = vec3.add(vec3.create(), lightEye, lightDir);
    let up = vec3.fromValues(0, 1, 0);
    if (Math.abs(vec3.dot(lightDir, up)) > 0.99) up = vec3.fromValues(1, 0, 0);
    const lightView = mat4.lookAt(mat4.create(), lightEye, lightTarget, up);
    mat4.multiply(lightViewProj, lightProj, lightView);

    const sceneData = new Float32Array(48); // Expanded (Phase 28) for 192-byte alignment (invViewProj)
    sceneData.set([...lightDir, 0], 0);
    sceneData.set([...lightColor.map(c => c * lightIntensity), 1], 4);
    sceneData.set(lightViewProj as any, 8);
    const camPos = mainCamera.owner.rootComponent?.relativeLocation || vec3.create();
    sceneData.set([...camPos, 1.0], 24);

    const invViewProj = mat4.create();
    mat4.invert(invViewProj, viewProjMatrix);
    sceneData.set(invViewProj as any, 28);

    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    return {
      commandEncoder: this.device.createCommandEncoder(),
      viewProjMatrix,
      lightViewProj,
      mainCamera,
      aspectRatio,
      directionalLight,
      textureView: this.context.getCurrentTexture().createView(),
      world
    };
  }

  private executeShadowPass(frameData: FrameData): void {
    if (!this.shadowPipeline || !this.shadowView) return;
    const { commandEncoder, world, lightViewProj } = frameData;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: this.shadowView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
    });
    pass.setPipeline(this.shadowPipeline);

    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.topology === 'triangle-list' && !component.isGizmo) {
          const lMVP = mat4.create();
          mat4.multiply(lMVP, lightViewProj, component.getTransformMatrix());
          const buffer = this.getOrCreateUniformBuffer(component.id + "_shadow", 64);
          this.device!.queue.writeBuffer(buffer, 0, lMVP as any);
          const bindGroup = this.getOrCreateBindGroup(component.id + "_shadow", this.shadowPipeline.getBindGroupLayout(0), [{ binding: 0, resource: { buffer } }]);
          pass.setBindGroup(0, bindGroup);
          pass.setVertexBuffer(0, component.vertexBuffer);
          if (component.indexBuffer) {
            pass.setIndexBuffer(component.indexBuffer, 'uint16');
            pass.drawIndexed(component.indexCount);
          } else {
            pass.draw(component.vertexCount);
          }
        }
      }
    }
    pass.end();
  }

  private executeSkyPass(frameData: FrameData): void {
    if (!this.skyPipeline || !this.skyBindGroup) return;
    const { commandEncoder, textureView } = frameData;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }]
    });

    pass.setPipeline(this.skyPipeline);
    pass.setBindGroup(0, this.skyBindGroup);
    pass.draw(3);
    pass.end();
  }

  private executeMainPass(frameData: FrameData): void {
    const { commandEncoder, textureView, world, viewProjMatrix } = frameData;
    const width = this.context!.getCurrentTexture().width;
    const height = this.context!.getCurrentTexture().height;

    if (!this.depthTexture || this.depthTexture.width !== width || this.depthTexture.height !== height) {
      this.depthTexture?.destroy();
      this.depthTexture = this.device!.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depthTextureView = this.depthTexture.createView();
    }

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTextureView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
    });

    for (const actor of world.actors) {
      const isSelected = actor.isSelected;
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer) {
          if (component.topology === 'line-list' && !component.isGizmo) {
            this.renderGrid(pass, component, viewProjMatrix);
          } else if (component.topology === 'triangle-list' && !component.isGizmo) {
            this.renderMesh(pass, component, viewProjMatrix, isSelected);
          }
        }
      }
    }
    pass.end();
  }

  private executeGizmoPass(frameData: FrameData): void {
    const { commandEncoder, textureView, world, viewProjMatrix, mainCamera, aspectRatio } = frameData;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTextureView!, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1.0 }
    });

    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.isGizmo) {
          this.renderGizmo(pass, component, viewProjMatrix);
        }
      }
    }

    if (this.billboardPipeline && this.billboardQuadBuffer) {
      pass.setPipeline(this.billboardPipeline);
      pass.setVertexBuffer(0, this.billboardQuadBuffer);
      for (const actor of world.actors) {
        for (const component of actor.components) {
          if (component instanceof UDirectionalLightComponent) {
            this.renderBillboard(pass, component, mainCamera, aspectRatio);
          }
        }
      }
    }
    pass.end();
  }

  private submitFrame(encoder: GPUCommandEncoder): void {
    this.device!.queue.submit([encoder.finish()]);
  }

  private renderMesh(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4, isSelected: boolean) {
    if (!this.trianglePipeline || !this.sceneBindGroup) return;
    const mvp = mat4.create();
    const model = component.getTransformMatrix();
    mat4.multiply(mvp, viewProj, model);
    const buffer = this.getOrCreateUniformBuffer(component.id, 160);
    const data = new Float32Array(40);
    data.set(mvp as any, 0);
    data.set(model as any, 16);
    data.set(component.material?.baseColor || [1, 1, 1, 1], 32);
    // Phase 27: Roughness floor to prevent division-by-zero in Cook-Torrance denominator
    data[36] = Math.max(component.material?.roughness ?? 0.5, 0.002);
    data[37] = component.material?.metallic ?? 0.0;
    // data[38], data[39] are padding
    this.device!.queue.writeBuffer(buffer, 0, data);

    // Material Architecture Fase 1: Correct texture fallback selection
    const albedoView = component.material?.baseColorTexture ?
      component.material.baseColorTexture.createView() :
      this.fallbackWhiteTexture!.createView();

    const roughnessView = component.material?.roughnessTexture ?
      component.material.roughnessTexture.createView() :
      this.fallbackGrayTexture!.createView();

    const normalView = component.material?.normalTexture ?
      component.material.normalTexture.createView() :
      this.fallbackFlatNormalTexture!.createView();

    const cacheKey = component.id + '_material_group';

    // Dynamic Reconstruction when Drag & Drop happens
    if (component.material && component.material.isDirty) {
      this.bindGroups.delete(cacheKey);
      component.material.isDirty = false;
    }

    const bindGroup = this.getOrCreateBindGroup(cacheKey, this.trianglePipeline.getBindGroupLayout(0), [
      { binding: 0, resource: { buffer } },
      { binding: 1, resource: this.defaultSampler! },
      { binding: 2, resource: albedoView },
      { binding: 3, resource: roughnessView },
      { binding: 4, resource: normalView }
    ]);

    pass.setPipeline(this.trianglePipeline);
    pass.setBindGroup(0, bindGroup); pass.setBindGroup(1, this.sceneBindGroup);
    pass.setVertexBuffer(0, component.vertexBuffer!);
    if (component.indexBuffer) { pass.setIndexBuffer(component.indexBuffer, 'uint16'); pass.drawIndexed(component.indexCount); } else { pass.draw(component.vertexCount); }
    if (isSelected && this.outlinePipeline) { pass.setPipeline(this.outlinePipeline); pass.drawIndexed(component.indexCount); }
  }

  private renderGrid(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4) {
    if (!this.linePipeline) return;
    const mvp = mat4.create();
    mat4.multiply(mvp, viewProj, component.getTransformMatrix());
    const buffer = this.getOrCreateUniformBuffer(component.id, 64);
    this.device!.queue.writeBuffer(buffer, 0, mvp as any);
    const bindGroup = this.getOrCreateBindGroup(component.id, this.linePipeline.getBindGroupLayout(0), [{ binding: 0, resource: { buffer } }]);
    pass.setPipeline(this.linePipeline); pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, component.vertexBuffer!); pass.draw(component.vertexCount);
  }

  private renderGizmo(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4) {
    const pipeline = component.topology === 'line-list' ? this.gizmoOverlayPipeline : this.gizmoTriangleOverlayPipeline;
    if (!pipeline) return;
    const mvp = mat4.create();
    mat4.multiply(mvp, viewProj, component.getTransformMatrix());
    const buffer = this.getOrCreateUniformBuffer(component.id, 128); // mat4 + vec4
    this.device!.queue.writeBuffer(buffer, 0, mvp as any);
    const color = component.material ? component.material.baseColor : new Float32Array([1, 1, 1, 1]);
    this.device!.queue.writeBuffer(buffer, 64, color as any);
    const bindGroup = this.getOrCreateBindGroup(component.id, pipeline.getBindGroupLayout(0), [{ binding: 0, resource: { buffer } }]);
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, component.vertexBuffer!);
    if (component.indexBuffer) { pass.setIndexBuffer(component.indexBuffer, 'uint16'); pass.drawIndexed(component.indexCount); } else { pass.draw(component.vertexCount); }
  }

  private renderBillboard(pass: GPURenderPassEncoder, light: UDirectionalLightComponent, camera: UCameraComponent, aspect: number) {
    if (!this.billboardPipeline) return;
    const buffer = this.getOrCreateUniformBuffer(light.id + "_billboard", 160);
    const data = new Float32Array(40);
    data.set(camera.getViewMatrix() as any, 0);
    data.set(camera.getProjectionMatrix(aspect) as any, 16);
    data.set(light.owner.rootComponent!.relativeLocation as any, 32);
    data[35] = 0.25; // Size
    data.set(light.isSelected ? [1, 0.6, 0, 1] : [1, 1, 0, 0.8], 36); // Color
    this.device!.queue.writeBuffer(buffer, 0, data);
    const bindGroup = this.getOrCreateBindGroup(light.id + "_billboard", this.billboardPipeline.getBindGroupLayout(0), [{ binding: 0, resource: { buffer } }]);
    pass.setBindGroup(0, bindGroup); pass.draw(4);
  }

  private getOrCreateUniformBuffer(key: string, size: number): GPUBuffer {
    let buffer = this.uniformBuffers.get(key);
    if (!buffer) {
      buffer = this.device!.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.uniformBuffers.set(key, buffer);
    }
    return buffer;
  }

  private getOrCreateBindGroup(key: string, layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]): GPUBindGroup {
    let bindGroup = this.bindGroups.get(key);
    if (!bindGroup) {
      bindGroup = this.device!.createBindGroup({ layout, entries });
      this.bindGroups.set(key, bindGroup);
    }
    return bindGroup;
  }

  public getDevice(): GPUDevice | null { return this.device; }
}
