import { mat4, vec3 } from 'gl-matrix';
import { Logger } from '../Core/Logger';
import { World } from '../Framework/World';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UMeshComponent } from '../Components/UMeshComponent';
import { UDirectionalLightComponent } from '../Components/UDirectionalLightComponent';
import { USkyLightComponent } from '../Components/USkyLightComponent';
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
  skyLight: USkyLightComponent | null;
  textureView: GPUTextureView;
  world: World;
  targetWidth: number;   // <--- NUEVO
  targetHeight: number;  // <--- NUEVO
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
  private pickingTexture: GPUTexture | null = null;
  private pickingBuffer: GPUBuffer | null = null;

  private skyPipeline: GPURenderPipeline | null = null;
  private trianglePipeline: GPURenderPipeline | null = null;
  private gridPipeline: GPURenderPipeline | null = null;
  private outlinePipeline: GPURenderPipeline | null = null;
  private gizmoTriangleOverlayPipeline: GPURenderPipeline | null = null;
  private billboardPipeline: GPURenderPipeline | null = null;
  private billboardQuadBuffer: GPUBuffer | null = null;

  // Cache/Pool
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  private sceneUniformBuffer: GPUBuffer | null = null;
  private lightUniformBuffer: GPUBuffer | null = null;
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

    this.pickingTexture = this.device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    this.pickingBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

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
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [materialBindGroupLayout, sceneBindGroupLayout]
    });

    const gridPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [sceneBindGroupLayout]
    });

    this.trianglePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: standardModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: standardModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.gridPipeline = this.device.createRenderPipeline({
      layout: gridPipelineLayout,
      vertex: { module: gridModule, entryPoint: 'vs_main', buffers: [] },
      fragment: {
        module: gridModule, entryPoint: 'fs_main',
        targets: [{
          format: this.format, blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.outlinePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: outlineModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: outlineModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'front' },
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

    this.sceneUniformBuffer = this.device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    // PASO B: Inicializar el lightUniformBuffer (Fase 3)
    this.lightUniformBuffer = this.device.createBuffer({
      size: 16 * 4 * 4, // 16 floats por luz * 4 luces * 4 bytes = 256 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.trianglePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer } },
        { binding: 1, resource: this.shadowView! },
        { binding: 2, resource: this.shadowSampler! },
        { binding: 3, resource: this.fallbackHDRTexture!.createView() },
        { binding: 4, resource: { buffer: this.lightUniformBuffer! } }
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

  public render(
    world: World,
    customTarget?: GPUTextureView,
    customWidth?: number,
    customHeight?: number,
    customCamera?: UCameraComponent
  ): void {
    const frameData = this.prepareFrame(world, customTarget, customWidth, customHeight, customCamera);
    if (!frameData) return;

    this.executeShadowPass(frameData);
    this.executeSkyPass(frameData);
    this.executeMainPass(frameData);
    this.executeGridPass(frameData);
    this.executeGizmoPass(frameData);
    this.submitFrame(frameData.commandEncoder);
  }

  private prepareFrame(
    world: World,
    customTarget?: GPUTextureView,
    customWidth?: number,
    customHeight?: number,
    customCamera?: UCameraComponent
  ): FrameData | null {
    if (!this.device || !this.context) return null;

    // 1. Usar cámara custom o buscar la principal en el World
    let mainCamera = customCamera;
    if (!mainCamera) {
      for (const actor of world.actors) {
        if (actor.rootComponent instanceof UCameraComponent) { mainCamera = actor.rootComponent; break; }
      }
    }
    if (!mainCamera) return null;

    // 2. Determinar el Destino (Target) y Resoluciones
    const width = customWidth || this.context.getCurrentTexture().width;
    const height = customHeight || this.context.getCurrentTexture().height;
    const textureView = customTarget || this.context.getCurrentTexture().createView();
    const aspectRatio = width / height;

    const viewProjMatrix = mat4.create();
    mat4.multiply(viewProjMatrix, mainCamera.getProjectionMatrix(aspectRatio), mainCamera.getViewMatrix());
    mat4.copy(this.viewProjMatrix, viewProjMatrix);

    const directionalLights: UDirectionalLightComponent[] = [];
    let skyLight: USkyLightComponent | null = null;

    for (const actor of world.actors) {
      if (directionalLights.length < 4) {
        const light = actor.getComponent(UDirectionalLightComponent);
        if (light) directionalLights.push(light);
      }
      if (!skyLight) skyLight = actor.getComponent(USkyLightComponent);
    }

    // PASO C: Actualizar el envío de datos en 'prepareFrame' (Fase 3)
    const lightBufferData = new Float32Array(8 * 4); // 4 luces * 8 floats per Light
    for (let i = 0; i < directionalLights.length; i++) {
      const light = directionalLights[i];
      const worldMat = light.owner.rootComponent?.getWorldMatrix() || mat4.create();
      const lightForward = vec3.fromValues(-worldMat[8], -worldMat[9], -worldMat[10]);
      vec3.normalize(lightForward, lightForward);

      const offset = i * 8;
      lightBufferData.set(lightForward, offset);
      lightBufferData.set([0], offset + 3); // padding
      lightBufferData.set(light.color, offset + 4);
      lightBufferData.set([light.intensity], offset + 7); // intensity in w
    }
    this.device.queue.writeBuffer(this.lightUniformBuffer!, 0, lightBufferData);

    const countBuffer = new Uint32Array([directionalLights.length]);
    this.device.queue.writeBuffer(this.lightUniformBuffer!, 128, countBuffer);

    // Initial direction/color for shadow pass (using the first light)
    const directionalLight = directionalLights[0] || null;
    let lightDir = vec3.fromValues(-0.5, -1, -0.5);
    if (directionalLight && directionalLight.owner.rootComponent) {
      const worldMat = directionalLight.owner.rootComponent.getWorldMatrix();
      lightDir = vec3.fromValues(-worldMat[8], -worldMat[9], -worldMat[10]);
      vec3.normalize(lightDir, lightDir);
    }

    const lightColor = directionalLight ? new Float32Array(directionalLight.color) : new Float32Array([1, 1, 1]);
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

    const sceneData = new Float32Array(64); // 256 bytes (64 floats)
    // 0-15: viewProj
    sceneData.set(viewProjMatrix as any, 0);
    // 16-31: invViewProj
    const invViewProj = mat4.create();
    mat4.invert(invViewProj, viewProjMatrix);
    sceneData.set(invViewProj as any, 16);
    // 32-35: cameraPos
    const camPos = mainCamera.owner.rootComponent?.relativeLocation || vec3.create();
    sceneData.set([...camPos, 1.0], 32);
    // 36-39: lightDir
    sceneData.set([...lightDir, 0], 36);
    // 40-43: lightColor (intensidad incluida)
    const finalLightColor = lightColor.map(c => c * lightIntensity);
    sceneData.set([...finalLightColor, 1], 40);
    // 44-59: lightViewProj
    sceneData.set(lightViewProj as any, 44);

    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    // Update scene bind group to use SkyLight HDRI if available
    const hdrView = (skyLight && skyLight.envView) ? skyLight.envView : this.fallbackHDRTexture!.createView();
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.trianglePipeline!.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer! } },
        { binding: 1, resource: this.shadowView! },
        { binding: 2, resource: this.shadowSampler! },
        { binding: 3, resource: hdrView },
        { binding: 4, resource: { buffer: this.lightUniformBuffer! } }
      ],
    });

    return {
      commandEncoder: this.device.createCommandEncoder(),
      viewProjMatrix,
      lightViewProj,
      mainCamera,
      aspectRatio,
      directionalLight,
      skyLight,
      textureView,
      world,
      targetWidth: width,
      targetHeight: height
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
      if (actor.bIsHidden) continue; // Skip hidden actors
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.topology === 'triangle-list' && !component.isGizmo) {
          const lMVP = mat4.create();
          mat4.multiply(lMVP, lightViewProj, component.getWorldMatrix());
          const buffer = this.getOrCreateUniformBuffer(component.id + "_shadow", 64);
          this.device!.queue.writeBuffer(buffer, 0, lMVP as any);
          const bindGroup = this.getOrCreateBindGroup(component.id + "_shadow", this.shadowPipeline.getBindGroupLayout(0), [{ binding: 0, resource: { buffer } }]);
          pass.setBindGroup(0, bindGroup);
          pass.setVertexBuffer(0, component.vertexBuffer);
          if (component.indexBuffer) {
            pass.setIndexBuffer(component.indexBuffer, 'uint32');
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
    const { commandEncoder, textureView, world, viewProjMatrix, targetWidth, targetHeight } = frameData;

    // Destruye y recrea la textura de profundidad si la resolución del Target cambió
    if (!this.depthTexture || this.depthTexture.width !== targetWidth || this.depthTexture.height !== targetHeight) {
      this.depthTexture?.destroy();
      this.depthTexture = this.device!.createTexture({
        size: [targetWidth, targetHeight],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.depthTextureView = this.depthTexture.createView();
    }

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTextureView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
    });

    for (const actor of world.actors) {
      if (actor.bIsHidden || actor.hasTag('Gizmo')) continue;
      const isSelected = actor.isSelected;
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer) {
          if (component.topology === 'triangle-list' && !component.isGizmo) {
            this.renderMesh(pass, component, viewProjMatrix, isSelected);
          }
        }
      }
    }
    pass.end();
  }

  private executeGizmoPass(frameData: FrameData): void {
    const { commandEncoder, textureView, world, viewProjMatrix, mainCamera, aspectRatio } = frameData;

    // Overlay Render Pass: We want the gizmo to draw on top of everything.
    // Standard approach: Clear the depth buffer before drawing the gizmos.
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1.0
      }
    });

    for (const actor of world.actors) {
      if (actor.bIsHidden || !actor.hasTag('Gizmo')) continue;

      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.isGizmo) {
          // Identify axis by component name for coloring
          let axisColor = new Float32Array([1, 1, 1, 1]);
          if (component.name.includes('X_')) axisColor = new Float32Array([1.0, 0.2, 0.2, 1.0]); // Red
          else if (component.name.includes('Y_')) axisColor = new Float32Array([0.2, 1.0, 0.2, 1.0]); // Green
          else if (component.name.includes('Z_')) axisColor = new Float32Array([0.2, 0.2, 1.0, 1.0]); // Blue

          this.renderGizmo(pass, component, viewProjMatrix, axisColor);
        }
      }
    }

    if (this.billboardPipeline && this.billboardQuadBuffer) {
      pass.setPipeline(this.billboardPipeline);
      pass.setVertexBuffer(0, this.billboardQuadBuffer);
      for (const actor of world.actors) {
        if (actor.bIsHidden) continue; // Hide icons too
        for (const component of actor.components) {
          if (component instanceof UDirectionalLightComponent) {
            this.renderBillboard(pass, component, mainCamera, aspectRatio);
          }
        }
      }
    }
    pass.end();
  }

  private executeGridPass(frameData: FrameData): void {
    if (!this.gridPipeline || !this.sceneBindGroup || !frameData.world.bShowGrid) return;
    const { commandEncoder, textureView } = frameData;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this.gridPipeline);
    // Group 0: Camera and Global Data (Same as main pass but at index 0 for this pipeline)
    pass.setBindGroup(0, this.sceneBindGroup!);
    pass.draw(4); // Full-screen quad (triangle strip)
    pass.end();
  }

  private submitFrame(encoder: GPUCommandEncoder): void {
    this.device!.queue.submit([encoder.finish()]);
  }

  private renderMesh(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4, isSelected: boolean) {
    if (!this.trianglePipeline || !this.sceneBindGroup) return;
    const mvp = mat4.create();
    const model = component.getWorldMatrix();
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
    if (component.indexBuffer) {
      pass.setIndexBuffer(component.indexBuffer, 'uint32');
      pass.drawIndexed(component.indexCount);
    } else {
      pass.draw(component.vertexCount);
    }
    if (isSelected && this.outlinePipeline) { pass.setPipeline(this.outlinePipeline); pass.drawIndexed(component.indexCount); }
  }


  private renderGizmo(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4, color: Float32Array, axisId: number = 0) {
    const pipeline = this.gizmoTriangleOverlayPipeline;
    if (!pipeline) return;

    const mvp = mat4.create();
    const model = component.getWorldMatrix();
    mat4.multiply(mvp, viewProj, model);

    // Uniforms: MVP (64) + Color (16) + axisId (4) + padding (12) = 96 bytes
    const buffer = this.getOrCreateUniformBuffer(`${component.id}_gizmo`, 96);
    const data = new Float32Array(24);
    data.set(mvp as any, 0);
    data.set(color, 16);
    data[20] = axisId;
    this.device!.queue.writeBuffer(buffer, 0, data);

    const bindGroup = this.getOrCreateBindGroup(`${component.id}_gizmo_bg`, pipeline.getBindGroupLayout(0), [
      { binding: 0, resource: { buffer } }
    ]);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, component.vertexBuffer!);
    if (component.indexBuffer) {
      pass.setIndexBuffer(component.indexBuffer, 'uint32');
      pass.drawIndexed(component.indexCount);
    } else {
      pass.draw(component.vertexCount);
    }
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

  public async getGizmoIdAt(mouseX: number, mouseY: number, world: World, camera: UCameraComponent): Promise<number> {
    if (!this.device || !this.pickingTexture || !this.pickingBuffer) return 0;

    const canvas = this.context!.canvas as HTMLCanvasElement;
    const width = canvas.width;
    const height = canvas.height;

    // Jitter Matrix: Centers the 1x1 render target on the mouse coordinates
    const ndcX = (mouseX / width) * 2 - 1;
    const ndcY = 1 - (mouseY / height) * 2;

    const jitterMat = mat4.create();
    mat4.fromTranslation(jitterMat, [-ndcX, -ndcY, 0]);
    mat4.scale(jitterMat, jitterMat, [width, height, 1]);

    const viewProj = mat4.create();
    const projection = camera.getProjectionMatrix(width / height);
    const view = camera.getViewMatrix();
    mat4.multiply(viewProj, projection, view);
    mat4.multiply(viewProj, jitterMat, viewProj);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.pickingTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });

    // Optional: setScissorRect to 1x1 on the 1x1 texture (always (0,0,1,1))
    pass.setScissorRect(0, 0, 1, 1);

    for (const actor of world.actors) {
      if (actor.bIsHidden || !actor.hasTag('Gizmo')) continue;
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.isGizmo) {
          // Use explicit pickingId if available, fallback to legacy name detection
          let axisId = component.pickingId;
          if (axisId === 0) {
            if (component.name.includes('X_')) axisId = 1;
            else if (component.name.includes('Y_')) axisId = 2;
            else if (component.name.includes('Z_')) axisId = 3;
          }

          if (axisId > 0) {
            this.renderGizmo(pass, component, viewProj, new Float32Array([1, 1, 1, 1]), axisId);
          }
        }
      }
    }
    pass.end();

    encoder.copyTextureToBuffer(
      { texture: this.pickingTexture },
      { buffer: this.pickingBuffer, bytesPerRow: 256 },
      [1, 1, 1]
    );

    this.device.queue.submit([encoder.finish()]);

    await this.pickingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Uint8Array(this.pickingBuffer.getMappedRange());
    const id = result[0]; // R channel
    this.pickingBuffer.unmap();

    return id;
  }

  public getDevice(): GPUDevice | null { return this.device; }
}
