import { mat4, vec3 } from 'gl-matrix';
import { Logger } from '../Core/Logger';
import { World } from '../Framework/World';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UMeshComponent } from '../Components/UMeshComponent';
import { USceneComponent } from '../Framework/USceneComponent';
import { UDirectionalLightComponent } from '../Components/UDirectionalLightComponent';
import { USkyLightComponent } from '../Components/USkyLightComponent';
import { UGridComponent } from '../Components/UGridComponent';
import { UAssetManager } from '../Core/Resources/UAssetManager';

// Shader Imports (Vite ?raw)
import standardShader from './Shaders/Standard.wgsl?raw';
import shadowShader from './Shaders/Shadow.wgsl?raw';
import gizmoShader from './Shaders/Gizmo.wgsl?raw';
import gizmoGlowShader from './Shaders/GizmoGlow.wgsl?raw';
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
  environmentBindGroup: GPUBindGroup | null;
}

/**
 * Handles WebGPU rendering operations and GPU resource management.
 */
export class Renderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private currentWidth: number = 0;
  private currentHeight: number = 0;
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private pickingTexture: GPUTexture | null = null;
  private pickingDepthTexture: GPUTexture | null = null;
  private pickingDepthTextureView: GPUTextureView | null = null;
  private pickingBuffer: GPUBuffer | null = null;
  private isPicking: boolean = false;

  private skyPipeline: GPURenderPipeline | null = null;
  private trianglePipeline: GPURenderPipeline | null = null;
  private gridPipeline: GPURenderPipeline | null = null;
  private outlinePipeline: GPURenderPipeline | null = null;
  private gizmoTriangleOverlayPipeline: GPURenderPipeline | null = null;
  private gizmoGlowPipeline: GPURenderPipeline | null = null;
  private billboardPipeline: GPURenderPipeline | null = null;
  private billboardQuadBuffer: GPUBuffer | null = null;
  private environmentBindGroupLayout: GPUBindGroupLayout | null = null;
  private defaultSkyTexture: GPUTexture | null = null;

  // Cache/Pool
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  private sceneUniformBuffer: GPUBuffer | null = null;
  private lightUniformBuffer: GPUBuffer | null = null;
  private sceneBindGroup: GPUBindGroup | null = null;
  private environmentBindGroup: GPUBindGroup | null = null;
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
      format: this.format, // Match pipeline expected format instead of hardcoded rgba8unorm
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    this.pickingBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.pickingDepthTexture = this.device.createTexture({
      size: [1, 1],
      format: 'depth24plus', // Matches standard pipeline config
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.pickingDepthTextureView = this.pickingDepthTexture.createView();

    // Generar la textura de profundidad base
    this.resizeDepthBuffer(canvas.width, canvas.height);

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

    // --- DEFAULT CUBEMAP (Placeholder for Sky/Environment) ---
    this.defaultSkyTexture = this.device.createTexture({
      size: [1, 1, 6], // 6 faces for a cubemap
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    // Write 1x1 black pixels to all 6 faces
    for (let i = 0; i < 6; i++) {
      this.device.queue.writeTexture(
        { texture: this.defaultSkyTexture, origin: [0, 0, i] },
        new Uint8Array([0, 0, 0, 255]),
        { bytesPerRow: 4, rowsPerImage: 1 },
        [1, 1, 1]
      );
    }
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
      arrayStride: 48, // Fix: Must match the standard 48-byte primitive layout since gizmos reuse cones/cylinders
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal (used as color fallback in shader)
      ]
    }];

    const standardModule = this.device.createShaderModule({ code: standardShader });
    const shadowModule = this.device.createShaderModule({ code: shadowShader });
    const gizmoModule = this.device.createShaderModule({ code: gizmoShader });
    const gizmoGlowModule = this.device.createShaderModule({ code: gizmoGlowShader });
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
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
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
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });

    this.environmentBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [materialBindGroupLayout, sceneBindGroupLayout, this.environmentBindGroupLayout]
    });

    const gridPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [sceneBindGroupLayout]
    });

    this.trianglePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: standardModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: standardModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
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
      depthStencil: { depthWriteEnabled: false, depthCompare: 'less-equal', format: 'depth24plus' },
    });

    this.outlinePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: outlineModule, entryPoint: 'vs_main', buffers: standardVertexBuffers },
      fragment: { module: outlineModule, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.gizmoTriangleOverlayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: gizmoModule, entryPoint: 'vs_main', buffers: colorVertexBuffers },
      fragment: {
        module: gizmoModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    this.gizmoGlowPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: gizmoGlowModule, entryPoint: 'vs_main', buffers: standardVertexBuffers }, // Uses normals
      fragment: {
        module: gizmoGlowModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, // Additive glow
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { depthWriteEnabled: false, depthCompare: 'less', format: 'depth24plus' },
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
        { binding: 3, resource: { buffer: this.lightUniformBuffer! } }
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

  private resizeDepthBuffer(width: number, height: number) {
    if (!this.device) return;

    // Destruir el viejo si existe
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }

    const depthTextureDesc: GPUTextureDescriptor = {
      size: [width, height, 1],
      dimension: '2d',
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    };

    this.depthTexture = this.device.createTexture(depthTextureDesc);
    this.depthTextureView = this.depthTexture.createView();

    this.currentWidth = width;
    this.currentHeight = height;
  }

  public render(
    world: World,
    customTarget?: GPUTextureView,
    customWidth?: number,
    customHeight?: number,
    customCamera?: UCameraComponent
  ): void {
    if (!this.device || !this.context || !this.context.canvas) return;

    // Si el canvas físico cambió de tamaño (debido a la UI o la ventana)
    const canvas = this.context.canvas as HTMLCanvasElement;
    if (canvas.width !== this.currentWidth || canvas.height !== this.currentHeight) {
      this.resizeDepthBuffer(canvas.width, canvas.height);
    }

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
    let atmosphereSunLight: UDirectionalLightComponent | null = null;

    for (const actor of world.actors) {
      if (directionalLights.length < 4) {
        const light = actor.getComponent(UDirectionalLightComponent);
        if (light) {
          directionalLights.push(light);
          if (light.bUsedAsAtmosphereSunLight && !atmosphereSunLight) {
            atmosphereSunLight = light;
          }
        }
      }
      if (!skyLight) skyLight = actor.getComponent(USkyLightComponent);
    }

    // Fallback if no specific atmosphere sun is designated
    const mainSun = atmosphereSunLight || directionalLights[0] || null;

    // PASO C: Actualizar el envío de datos en 'prepareFrame' (Fase 3)
    const lightBufferData = new Float32Array(8 * 4); // 4 luces * 8 floats per Light
    for (let i = 0; i < directionalLights.length; i++) {
      const light = directionalLights[i];
      const worldMat = light.owner.rootComponent?.getWorldMatrix() || mat4.create();
      // Extraction of the Vector pointed TOWARDS the light source (Backward)
      // gl-matrix: column 2 (index 8,9,10) is the Z axis.
      const towardsLight = vec3.fromValues(worldMat[8], worldMat[9], worldMat[10]);
      vec3.normalize(towardsLight, towardsLight);

      const offset = i * 8;
      lightBufferData.set(towardsLight, offset);
      lightBufferData.set([0], offset + 3); // padding
      lightBufferData.set(light.lightColor, offset + 4);
      lightBufferData.set([light.intensity], offset + 7); // intensity in w
    }
    this.device.queue.writeBuffer(this.lightUniformBuffer!, 0, lightBufferData);

    const countBuffer = new Uint32Array([directionalLights.length]);
    this.device.queue.writeBuffer(this.lightUniformBuffer!, 128, countBuffer);

    // Global Sun Direction/Color for Atmosphere/Sky (Group 1, Binding 0)
    let towardsSun = vec3.fromValues(0, 1, 0); // Default up
    if (mainSun && mainSun.owner.rootComponent) {
      const worldMat = mainSun.owner.rootComponent.getWorldMatrix();
      // Z-axis (columns 8,9,10) points towards the light source in our convention
      towardsSun = vec3.fromValues(worldMat[8], worldMat[9], worldMat[10]);
      vec3.normalize(towardsSun, towardsSun);
    }

    // Zero Protection: Ensure no components are exactly zero to avoid NaNs in shaders
    const protect = (v: number) => Math.abs(v) < 0.001 ? 0.001 * Math.sign(v || 1) : v;
    const safeSunDir = [protect(towardsSun[0]), protect(towardsSun[1]), protect(towardsSun[2])];

    const sunColor = mainSun ? mainSun.lightColor : vec3.fromValues(1, 1, 1);
    const sunIntensity = mainSun ? Math.max(0.001, mainSun.intensity) : 1.0;
    const finalSunColor = [sunColor[0] * sunIntensity, sunColor[1] * sunIntensity, sunColor[2] * sunIntensity];

    // Shadow calculation remains relevant
    const lightViewProj = mat4.create();
    const lightProj = mat4.create();
    mat4.ortho(lightProj, -5000, 5000, -5000, 5000, 1.0, 20000);
    const fixMatrix = mat4.fromValues(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1);
    mat4.multiply(lightProj, fixMatrix, lightProj);

    const lightEye = mainSun ? mainSun.owner.rootComponent!.relativeLocation : vec3.fromValues(0, 50, 0);
    // Shadow target remains along the -TowardsSun vector (the Forward vector)
    const sunForwardDir = vec3.scale(vec3.create(), towardsSun, -1);
    const lightTarget = vec3.add(vec3.create(), lightEye, sunForwardDir);
    let up = vec3.fromValues(0, 1, 0);
    if (Math.abs(vec3.dot(sunForwardDir, up)) > 0.99) up = vec3.fromValues(1, 0, 0);
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
    // 36-39: lightDir (sunDirection)
    sceneData.set([...safeSunDir, 0], 36);
    // 40-43: lightColor (sunColor con intensidad)
    sceneData.set([...finalSunColor, 1], 40);
    // 44-59: lightViewProj
    sceneData.set(lightViewProj as any, 44);

    // 60-63: Grid Params (rgb + opacity)
    const gridComp = world.gridComponent;
    if (gridComp) {
      sceneData.set([gridComp.gridColor[0], gridComp.gridColor[1], gridComp.gridColor[2], gridComp.opacity], 60);
    } else {
      sceneData.set([0.15, 0.15, 0.15, 0.8], 60); // Fallback
    }

    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    // Phase 63.3: Environment Bind Group (Group 2)
    const envView = (skyLight && skyLight.envView) ? skyLight.envView : this.defaultSkyTexture!.createView({ dimension: 'cube' });
    this.environmentBindGroup = this.device.createBindGroup({
      layout: this.environmentBindGroupLayout!,
      entries: [
        { binding: 0, resource: envView },
        { binding: 1, resource: this.defaultSampler! }
      ]
    });

    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.trianglePipeline!.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniformBuffer! } },
        { binding: 1, resource: this.shadowView! },
        { binding: 2, resource: this.shadowSampler! },
        { binding: 3, resource: { buffer: this.lightUniformBuffer! } }
      ],
    });

    return {
      commandEncoder: this.device.createCommandEncoder(),
      viewProjMatrix,
      lightViewProj,
      mainCamera,
      aspectRatio,
      directionalLight: mainSun,
      skyLight,
      textureView,
      world,
      targetWidth: width,
      targetHeight: height,
      environmentBindGroup: this.environmentBindGroup
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
        if (component instanceof USceneComponent && component.bIsHidden) continue;
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

    // La textura de profundidad principal (del canvas) ya se gestiona en render() (resizeDepthBuffer).
    // NOTA: Si este frame.targetWidth (resolución offscreen temporal como Picking) es distinto al canvas,
    // tendrías que usar otra depthTexture para ese offscreen target, pero por brevedad asumiendo que 
    // targetWidth/Height coincide con main canvas o no rompámos picking en este paso.
    // Mantenemos la lógica de la textura si customTarget asume cambio de size para no romper algo del editor:
    if (!this.depthTexture || this.depthTexture.width !== targetWidth || this.depthTexture.height !== targetHeight) {
      // Re-allocating dynamic target custom view (in real usecase it should be separated from canvas main view)
      this.resizeDepthBuffer(targetWidth, targetHeight);
    }

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTextureView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
    });

    for (const actor of world.actors) {
      if (actor.bIsHidden || actor.hasTag('Gizmo')) continue;
      const isSelected = actor.isSelected;
      for (const component of actor.components) {
        if (component instanceof USceneComponent && component.bIsHidden) continue;
        if (component instanceof UMeshComponent && component.vertexBuffer) {
          if (component.topology === 'triangle-list' && !component.isGizmo) {
            this.renderMesh(pass, component, viewProjMatrix, isSelected, frameData.directionalLight);
          }
        }
      }
    }
    pass.end();
  }

  private executeGizmoPass(frameData: FrameData): void {
    const { commandEncoder, textureView, world, viewProjMatrix } = frameData;

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

      const hoverAxis = (actor as any).hoverAxis || 0;
      const activeAxis = (actor as any).activeAxis || 0;

      if (hoverAxis !== 0) {
        // Log only once in a while or when hover exists for debugging
        // console.log(`[Renderer] Actor ${actor.name} has HoverAxis: ${hoverAxis}`);
      }

      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.isGizmo) {
          let axisId = component.pickingId;
          if (axisId === 0) {
            if (component.name.includes('X_')) axisId = 1;
            else if (component.name.includes('Y_')) axisId = 2;
            else if (component.name.includes('Z_')) axisId = 3;
          }

          let axisColor = new Float32Array([1, 1, 1, 1]);
          if (axisId === 1) axisColor = new Float32Array([1.0, 0.2, 0.2, 1.0]); // Red
          else if (axisId === 2) axisColor = new Float32Array([0.2, 1.0, 0.2, 1.0]); // Green
          else if (axisId === 3) axisColor = new Float32Array([0.2, 0.2, 1.0, 1.0]); // Blue
          else if (axisId === 4) axisColor = new Float32Array([0.2, 0.5, 1.0, 0.8]); // XY Plane (Blue-ish)
          else if (axisId === 5) axisColor = new Float32Array([1.0, 0.2, 0.5, 0.8]); // YZ Plane (Red-ish)
          else if (axisId === 6) axisColor = new Float32Array([0.5, 1.0, 0.2, 0.8]); // ZX Plane (Green-ish)
          else if (axisId === 7) axisColor = new Float32Array([0.9, 0.9, 0.9, 1.0]); // Uniform (White-ish)
          else if (axisId === 8) axisColor = new Float32Array([0.9, 0.9, 0.9, 0.8]); // Screen Rotation (White-ish)

          let alpha = 1.0;
          if (component instanceof USceneComponent && component.bIsHidden) continue;
          let brightness = 1.0;

          if (activeAxis !== 0) {
            // Un eje está siendo arrastrado
            if (axisId === activeAxis) {
              brightness = 1.5; // Brillar
              alpha = 1.0;
            } else {
              alpha = 0.2; // Ocultar los demás
            }
          } else if (hoverAxis !== 0 && axisId === hoverAxis) {
            // El ratón está encima - Glow del mismo color
            brightness = 1.2; // Aumentar ligeramente el brillo de la flecha base
          }

          axisColor[0] = Math.min(1.0, axisColor[0] * brightness);
          axisColor[1] = Math.min(1.0, axisColor[1] * brightness);
          axisColor[2] = Math.min(1.0, axisColor[2] * brightness);
          axisColor[3] = alpha;

          if (hoverAxis !== 0 && axisId === hoverAxis) {
            // EMISSIVE CORE: Toda la flecha brilla con intensidad
            brightness = 2.5;

            // INTEGRATED SOFT GLOW: Stack layers of Fresnel glow
            const shells = [
              { inflate: 8.0, opacity: 0.4 },
              { inflate: 18.0, opacity: 0.2 }
            ];

            for (const layer of shells) {
              const glowColor = new Float32Array([...axisColor]);
              glowColor[3] = layer.opacity;
              this.renderGizmo(pass, component, viewProjMatrix, glowColor, 0, false, true, layer.inflate, layer.opacity);
            }
          }

          this.renderGizmo(pass, component, viewProjMatrix, axisColor, 0, false, false);
        }
      }
    }

    if (this.billboardPipeline && this.billboardQuadBuffer) {
      pass.setPipeline(this.billboardPipeline);
      pass.setVertexBuffer(0, this.billboardQuadBuffer);
      // Billboard rendering of light icons and other editor visuals is currently disabled
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
    pass.draw(6); // Full-screen quad (6 vertices for 2 triangles)
    pass.end();
  }

  private submitFrame(encoder: GPUCommandEncoder): void {
    this.device!.queue.submit([encoder.finish()]);
  }

  private renderMesh(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4, isSelected: boolean, directionalLight: UDirectionalLightComponent | null = null) {
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
    data[38] = directionalLight ? directionalLight.shadowBias : 0.002; // dynamic shadowBias
    // data[39] are padding
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
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, this.sceneBindGroup);
    if (this.environmentBindGroup) {
      pass.setBindGroup(2, this.environmentBindGroup);
    }
    pass.setVertexBuffer(0, component.vertexBuffer!);
    if (component.indexBuffer) {
      pass.setIndexBuffer(component.indexBuffer, 'uint32');
      pass.drawIndexed(component.indexCount);
    } else {
      pass.draw(component.vertexCount);
    }
    if (isSelected && this.outlinePipeline) { pass.setPipeline(this.outlinePipeline); pass.drawIndexed(component.indexCount); }
  }


  private renderGizmo(pass: GPURenderPassEncoder, component: UMeshComponent, viewProj: mat4, color: Float32Array, axisId: number = 0, isPicking: boolean = false, isGlow: boolean = false, inflation: number = 0, opacityScale: number = 1.0) {
    const pipeline = isPicking ? this.gizmoTriangleOverlayPipeline : (isGlow ? this.gizmoGlowPipeline : this.gizmoTriangleOverlayPipeline);
    if (!pipeline) return;

    const mvp = mat4.create();
    const model = component.getWorldMatrix();
    mat4.multiply(mvp, viewProj, model);

    const suffix = isPicking ? '_picking' : (isGlow ? `_glow_${inflation}` : '');

    // Uniforms: MVP (64) + Color (16) + axisId (4) + inflation (4) + opacity (4) + padding (4) = 96 bytes
    const buffer = this.getOrCreateUniformBuffer(`${component.id}_gizmo${suffix}`, 96);
    const data = new Float32Array(24);
    data.set(mvp as any, 0);
    data.set(color, 16);
    data[20] = axisId;
    data[21] = inflation;
    data[22] = opacityScale;
    // data[23] is padding

    this.device!.queue.writeBuffer(buffer, 0, data);

    const bindGroup = this.getOrCreateBindGroup(`${component.id}_gizmo_bg${suffix}`, pipeline.getBindGroupLayout(0), [
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
    if (this.isPicking) return 0; // Prevent concurrent mapAsync calls

    this.isPicking = true;

    const canvas = this.context!.canvas as HTMLCanvasElement;
    const width = canvas.clientWidth;  // Use CSS/Client pixels for coordinate conversion
    const height = canvas.clientHeight;

    // Jitter Matrix: Centers the 1x1 render target on the mouse coordinates
    const ndcX = (mouseX / width) * 2 - 1;
    const ndcY = 1 - (mouseY / height) * 2;

    const jitterMat = mat4.create();
    mat4.identity(jitterMat);
    // Matrix Order: Scale * Translation * Projection * View
    // 1. Scale blows up the 1-pixel neighborhood to fill NDC [-1, 1]
    mat4.scale(jitterMat, jitterMat, [width, height, 1]);
    // 2. Translation moves the mouse NDC coordinate to the center
    mat4.translate(jitterMat, jitterMat, [-ndcX, -ndcY, 0]);

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
        view: this.pickingDepthTextureView!,
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
            this.renderGizmo(pass, component, viewProj, new Float32Array([1, 1, 1, 1]), axisId, true, false, 15.0);
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
    const id = this.format === 'bgra8unorm' ? result[2] : result[0]; // R channel
    this.pickingBuffer.unmap();

    this.isPicking = false;

    return id;
  }

  public getDevice(): GPUDevice | null { return this.device; }
}
