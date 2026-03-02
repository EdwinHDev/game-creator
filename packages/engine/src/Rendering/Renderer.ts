import { mat4, vec3 } from 'gl-matrix';
import { Logger } from '../Core/Logger';
import { World } from '../Framework/World';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UMeshComponent } from '../Components/UMeshComponent';
import { UDirectionalLightComponent } from '../Components/UDirectionalLightComponent';

/**
 * Handles WebGPU rendering operations and GPU resource management.
 */
export class Renderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';

  private trianglePipeline: GPURenderPipeline | null = null;
  private linePipeline: GPURenderPipeline | null = null;
  private outlinePipeline: GPURenderPipeline | null = null;
  private gizmoOverlayPipeline: GPURenderPipeline | null = null;
  private gizmoTriangleOverlayPipeline: GPURenderPipeline | null = null;
  private billboardPipeline: GPURenderPipeline | null = null;
  private billboardQuadBuffer: GPUBuffer | null = null;

  // Cache for uniform buffers to avoid re-allocation every frame
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  // Global Scene Uniforms
  private sceneUniformBuffer: GPUBuffer | null = null;
  private sceneBindGroup: GPUBindGroup | null = null;

  // Shadow Mapping Resources
  private shadowTexture: GPUTexture | null = null;
  private shadowView: GPUTextureView | null = null;
  private shadowSampler: GPUSampler | null = null;
  private shadowPipeline: GPURenderPipeline | null = null;

  public viewProjMatrix: mat4 = mat4.create();

  constructor() { }

  /**
   * Returns the WebGPU device.
   */
  public getDevice(): GPUDevice | null {
    return this.device;
  }

  /**
   * Initializes WebGPU context and device.
   * @throws EngineCrashError if WebGPU is not supported.
   */
  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) {
      Logger.critical("WebGPU is not supported in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      Logger.critical("Failed to request WebGPU adapter.");
    }

    this.device = await adapter!.requestDevice();
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context!.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque'
    });

    // --- Phase 16: Shadow Resources ---
    this.shadowTexture = this.device.createTexture({
      size: [2048, 2048, 1],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowView = this.shadowTexture.createView();

    this.shadowSampler = this.device.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create basic shader module (Flat Shaded Triangle with Shadow Mapping)
    const shaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
          modelMatrix: mat4x4<f32>,
          baseColor: vec4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct SceneUniforms {
          lightViewProj: mat4x4<f32>,
          lightDirection: vec4<f32>,
          lightColor: vec4<f32>,
      }
      @group(1) @binding(0) var<uniform> scene: SceneUniforms;
      @group(1) @binding(1) var shadowMap: texture_depth_2d;
      @group(1) @binding(2) var shadowSampler: sampler_comparison;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) normal: vec3<f32>,
          @location(1) fragPosLightSpace: vec4<f32>,
      }

      @vertex
      fn vs_main(
          @location(0) pos: vec3<f32>,
          @location(1) normal: vec3<f32>
      ) -> VertexOut {
          var out: VertexOut;
          let worldPos = uniforms.modelMatrix * vec4<f32>(pos, 1.0);
          out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
          out.normal = (uniforms.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
          out.fragPosLightSpace = scene.lightViewProj * worldPos;
          return out;
      }

      @fragment
      fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
          let N = normalize(in.normal);
          let L = normalize(-scene.lightDirection.xyz);
          let diffuseIntensity = max(dot(N, L), 0.0);
          
          // Shadow Calculation
          let projCoords = in.fragPosLightSpace.xyz / in.fragPosLightSpace.w;
          let uv = vec2<f32>(projCoords.x, -projCoords.y) * 0.5 + 0.5;
          
          var shadow = textureSampleCompare(shadowMap, shadowSampler, uv, projCoords.z - 0.005);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || projCoords.z > 1.0) {
              shadow = 1.0; 
          }

          // Full Lambert: ambient + (diffuse * intensity * shadow)
          let ambient = 0.2;
          let lighting = (ambient + (diffuseIntensity * shadow)) * scene.lightColor.rgb;
          return vec4<f32>(uniforms.baseColor.rgb * lighting, uniforms.baseColor.a);
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    // --- Editor Grid Shader (with fading) ---
    const lineShaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) color: vec3<f32>,
          @location(1) localPos: vec3<f32>,
      }

      @vertex
      fn vs_main(
          @location(0) pos: vec3<f32>,
          @location(1) color: vec3<f32>
      ) -> VertexOut {
          var out: VertexOut;
          out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
          out.color = color;
          out.localPos = pos;
          return out;
      }

      @fragment
      fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
          let dist = length(in.localPos.xz);
          // Fade starts at 40 units, disappears at 100 units
          let alpha = 1.0 - smoothstep(40.0, 100.0, dist);
          return vec4<f32>(in.color, alpha);
      }
    `;
    const lineShaderModule = this.device.createShaderModule({ code: lineShaderCode });

    // --- Phase 18: Outline Shader (Inverted Hull) ---
    const outlineShaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
      }

      @vertex
      fn vs_main(
          @location(0) pos: vec3<f32>,
          @location(1) normal: vec3<f32>
      ) -> VertexOut {
          var out: VertexOut;
          // Extrude along normal for the outline effect
          let thickness = 0.03;
          let pushedPos = pos + normalize(normal) * thickness;
          out.pos = uniforms.mvpMatrix * vec4<f32>(pushedPos, 1.0);
          return out;
      }

      @fragment
      fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(1.0, 0.6, 0.0, 1.0); // Orange
      }
    `;
    const outlineShaderModule = this.device.createShaderModule({ code: outlineShaderCode });

    // Shared pipeline settings
    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: 24, // 3 floats pos + 3 floats normal
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      },
    ];

    const fragmentState: GPUFragmentState = {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: this.format }],
    };

    // 1. Create Triangle Pipeline
    this.trianglePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
      },
      fragment: fragmentState,
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // --- Phase 16: Shadow Pipeline (Depth-only) ---
    const shadowShaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs_main(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
          return uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
      }
    `;
    const shadowShaderModule = this.device.createShaderModule({ code: shadowShaderCode });

    this.shadowPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shadowShaderModule,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
      },
    });

    // Create Global Scene Uniform Buffer (lightProjection + lightDirection + lightColor)
    this.sceneUniformBuffer = this.device.createBuffer({
      size: 96, // mat4x4 (64) + 2 * vec4 (32)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create Bind Group for Scene Uniforms (Group 1)
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.trianglePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.sceneUniformBuffer,
          },
        },
        {
          binding: 1,
          resource: this.shadowView!,
        },
        {
          binding: 2,
          resource: this.shadowSampler!,
        },
      ],
    });

    // 2. Create Line Pipeline (with Blending)
    this.linePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: lineShaderModule,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: lineShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: {
                operation: 'add',
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: {
                operation: 'add',
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
              },
            },
          }
        ],
      },
      primitive: {
        topology: 'line-list',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // 3. Create Outline Pipeline
    this.outlinePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: outlineShaderModule,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: outlineShaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'front', // Inverted Hull: cull front faces
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // --- Phase 17.8: Gizmo Overlay Pipeline (No Depth Test) ---
    const gizmoShaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
          color: vec4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) color: vec4<f32>,
      }

      @vertex
      fn vs_main(@location(0) pos: vec3<f32>, @location(1) color: vec3<f32>) -> VertexOut {
          var out: VertexOut;
          out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
          out.color = vec4<f32>(color, 1.0); // Directly return injected vertex color
          return out;
      }

      @fragment
      fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
          return in.color; // Strictly Unlit: Ignora la luz ambiental y de escena
      }
    `;
    const gizmoShaderModule = this.device.createShaderModule({ code: gizmoShaderCode });

    this.gizmoOverlayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: gizmoShaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' }
          ],
        }],
      },
      fragment: {
        module: gizmoShaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'line-list',
      },
      // Removed depthStencil for absolute X-Ray visibility in depth-less pass
    });

    this.gizmoTriangleOverlayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: gizmoShaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' }
          ],
        }],
      },
      fragment: {
        module: gizmoShaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
      // No DepthStencil block here to allow it to be used in depth-less pass
    });

    // --- Phase 20: Billboard Pipeline (Icons) ---
    const billboardShaderCode = `
      struct BillboardUniforms {
          viewMatrix: mat4x4<f32>,
          projectionMatrix: mat4x4<f32>,
          worldPos: vec3<f32>,
          size: f32,
          color: vec4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: BillboardUniforms;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) uv: vec2<f32>,
      }

      @vertex
      fn vs_main(@location(0) pos: vec2<f32>) -> VertexOut {
          var out: VertexOut;
          
          // Create a billboard in view space
          let posView = (uniforms.viewMatrix * vec4<f32>(uniforms.worldPos, 1.0)).xyz;
          let offset = pos * uniforms.size;
          out.pos = uniforms.projectionMatrix * vec4<f32>(posView.xy + offset, posView.z, 1.0);
          out.uv = pos * 0.5 + 0.5;
          return out;
      }

      @fragment
      fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
          let dist = length(in.uv - 0.5);
          if (dist > 0.45) { discard; }
          
          // Core Circle
          var color = uniforms.color.rgb;
          
          // Subtle glow
          let glow = 1.0 - smoothstep(0.2, 0.45, dist);
          return vec4<f32>(color, uniforms.color.a * glow);
      }
    `;
    const billboardShaderModule = this.device.createShaderModule({ code: billboardShaderCode });

    this.billboardPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: billboardShaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        }],
      },
      fragment: {
        module: billboardShaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          }
        }],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // Create unit quad for billboards [-1, 1]
    const quadData = new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]);
    this.billboardQuadBuffer = this.device.createBuffer({
      size: quadData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.billboardQuadBuffer.getMappedRange()).set(quadData);
    this.billboardQuadBuffer.unmap();

    Logger.info("WebGPU Renderer initialized with Selection Outlines and Gizmo Overlay support.");
  }

  /**
   * Performs the main render pass.
   */
  public render(world: World): void {
    if (!this.device || !this.context) return;

    // 1. Find the first active camera
    let mainCamera: UCameraComponent | null = null;
    for (const actor of world.actors) {
      if (actor.rootComponent instanceof UCameraComponent) {
        mainCamera = actor.rootComponent;
        break;
      }
    }

    if (!mainCamera) return;

    // 2. Prepare View and Projection matrices
    const aspectRatio = this.context.getCurrentTexture().width / this.context.getCurrentTexture().height;
    const viewMatrix = mainCamera.getViewMatrix();
    const projectionMatrix = mainCamera.getProjectionMatrix(aspectRatio);

    const viewProjMatrix = mat4.create();
    mat4.multiply(viewProjMatrix, projectionMatrix, viewMatrix);
    mat4.copy(this.viewProjMatrix, viewProjMatrix);

    // 3. Update Global Scene Data (Lighting & Shadows)
    let directionalLight: UDirectionalLightComponent | null = null;
    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UDirectionalLightComponent) {
          directionalLight = component;
          break;
        }
      }
      if (directionalLight) break;
    }

    const lightDir = directionalLight ? directionalLight.getForwardVector() : vec3.fromValues(-0.5, -1, -0.5);
    const lightColor = directionalLight ? directionalLight.color : new Float32Array([1.0, 1.0, 1.0]);
    const lightIntensity = directionalLight ? directionalLight.intensity : 1.0;

    // --- Phase 16: Light Space Matrix ---
    const lightViewMatrix = mat4.create();
    const lightProjectionMatrix = mat4.create();
    const lightViewProj = mat4.create();

    // Proyección Ortográfica: Caja de 40x40 metros
    mat4.ortho(lightProjectionMatrix, -20, 20, -20, 20, 1, 500);

    // Posición de luz virtual: -lightDirection * 50
    const lightPos = vec3.create();
    vec3.scale(lightPos, lightDir, -50);
    mat4.lookAt(lightViewMatrix, lightPos, [0, 0, 0], [0, 1, 0]);

    mat4.multiply(lightViewProj, lightProjectionMatrix, lightViewMatrix);

    const sceneData = new Float32Array(24); // 16 (mat4) + 4 (vec4) + 4 (vec4)
    sceneData.set(lightViewProj as any, 0); // lightViewProj (offset 0)
    sceneData.set([...lightDir, 0], 16);    // direction (offset 64)
    sceneData.set([...lightColor.map(c => c * lightIntensity), 1], 20); // color (offset 80)
    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    // Single Encoder for everything
    const commandEncoder = this.device.createCommandEncoder();

    // 4. Shadow Pass
    const shouldCastShadows = directionalLight ? directionalLight.castShadows : true;
    if (shouldCastShadows) {
      const shadowPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowView!,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      };

      const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
      shadowPass.setPipeline(this.shadowPipeline!);

      for (const actor of world.actors) {
        for (const component of actor.components) {
          if (component instanceof UMeshComponent && component.vertexBuffer && component.topology === 'triangle-list' && !component.isGizmo) {
            const modelMatrix = component.getTransformMatrix();
            const lightMVP = mat4.create();
            mat4.multiply(lightMVP, lightViewProj, modelMatrix);

            let uniformBuffer = this.uniformBuffers.get(component.id);
            if (!uniformBuffer) {
              uniformBuffer = this.device.createBuffer({
                size: 144,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
              });
              this.uniformBuffers.set(component.id, uniformBuffer);
            }
            this.device.queue.writeBuffer(uniformBuffer, 0, lightMVP as any);

            let bindGroup = this.bindGroups.get(component.id + "_shadow");
            if (!bindGroup) {
              bindGroup = this.device.createBindGroup({
                layout: this.shadowPipeline!.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
              });
              this.bindGroups.set(component.id + "_shadow", bindGroup);
            }

            shadowPass.setBindGroup(0, bindGroup);
            shadowPass.setVertexBuffer(0, component.vertexBuffer);
            if (component.indexBuffer) {
              shadowPass.setIndexBuffer(component.indexBuffer, 'uint16');
              shadowPass.drawIndexed(component.indexCount);
            } else {
              shadowPass.draw(component.vertexCount);
            }
          }
        }
      }
      shadowPass.end();
    }

    // 5. Main Pass
    const textureView = this.context.getCurrentTexture().createView();
    const depthTexture = this.device.createTexture({
      size: [this.context.getCurrentTexture().width, this.context.getCurrentTexture().height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depthTextureView = depthTexture.createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.15, g: 0.15, b: 0.18, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: depthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setBindGroup(1, this.sceneBindGroup!);

    for (const actor of world.actors) {
      const isSelected = actor.id === world.selectedActorId;
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && !component.isGizmo) {
          if (isSelected && component.topology === 'triangle-list') {
            this.drawOutline(passEncoder, component, viewProjMatrix);
          }
          this.drawMesh(passEncoder, component, viewProjMatrix);
        }
      }
    }
    passEncoder.end();

    // 6. Billboard Pass
    this.drawBillboards(commandEncoder, world, mainCamera, aspectRatio, textureView, depthTextureView);

    // 7. Gizmo Overlay Pass
    const gizmoPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.isGizmo) {
          this.drawMesh(gizmoPassEncoder, component, viewProjMatrix);
        }
      }
    }
    gizmoPassEncoder.end();

    // Final Submission
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private drawBillboards(encoder: GPUCommandEncoder, world: World, camera: UCameraComponent, aspectRatio: number, colorView: GPUTextureView, depthView: GPUTextureView): void {
    if (!this.device || !this.billboardPipeline || !this.billboardQuadBuffer) return;

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView,
        loadOp: 'load',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });

    passEncoder.setPipeline(this.billboardPipeline);
    passEncoder.setVertexBuffer(0, this.billboardQuadBuffer);

    const viewMatrix = camera.getViewMatrix();
    const projectionMatrix = camera.getProjectionMatrix(aspectRatio);

    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UDirectionalLightComponent) {
          const worldPos = actor.rootComponent!.relativeLocation;

          let uniformBuffer = this.uniformBuffers.get(actor.id + "_billboard");
          if (!uniformBuffer) {
            uniformBuffer = this.device.createBuffer({
              size: 192, // 2*mat4 (128) + vec3 (12) + float (4) + vec4 (16) + padding
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.uniformBuffers.set(actor.id + "_billboard", uniformBuffer);
          }

          const billboardData = new Float32Array(40); // 16+16+4+4
          billboardData.set(viewMatrix as any, 0);
          billboardData.set(projectionMatrix as any, 16);
          billboardData.set(worldPos, 32);
          billboardData[35] = 1.0; // Size
          billboardData.set([1.0, 0.84, 0.0, 1.0], 36); // Golden Yellow

          this.device.queue.writeBuffer(uniformBuffer, 0, billboardData);

          let bindGroup = this.bindGroups.get(actor.id + "_billboard");
          if (!bindGroup) {
            bindGroup = this.device.createBindGroup({
              layout: this.billboardPipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
            });
            this.bindGroups.set(actor.id + "_billboard", bindGroup);
          }

          passEncoder.setBindGroup(0, bindGroup);
          passEncoder.draw(4);
        }
      }
    }
    passEncoder.end();
  }

  private drawOutline(passEncoder: GPURenderPassEncoder, mesh: UMeshComponent, viewProjMatrix: mat4): void {
    if (!this.device || !this.outlinePipeline) return;

    passEncoder.setPipeline(this.outlinePipeline);

    const modelMatrix = mesh.getTransformMatrix();
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewProjMatrix, modelMatrix);

    // Outline uses a simplified MVP-only uniform buffer (64 bytes)
    // We can reuse the "meshId_outline" bucket
    let uniformBuffer = this.uniformBuffers.get(mesh.id + "_outline");
    if (!uniformBuffer) {
      uniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformBuffers.set(mesh.id + "_outline", uniformBuffer);
    }

    this.device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as any);

    let bindGroup = this.bindGroups.get(mesh.id + "_outline");
    if (!bindGroup) {
      bindGroup = this.device.createBindGroup({
        layout: this.outlinePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
      this.bindGroups.set(mesh.id + "_outline", bindGroup);
    }

    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, mesh.vertexBuffer);
    if (mesh.indexBuffer) {
      passEncoder.setIndexBuffer(mesh.indexBuffer, 'uint16');
      passEncoder.drawIndexed(mesh.indexCount);
    } else {
      passEncoder.draw(mesh.vertexCount);
    }
  }

  private drawMesh(passEncoder: GPURenderPassEncoder, mesh: UMeshComponent, viewProjMatrix: mat4): void {
    if (!this.device) return;

    // Phase 17.9.7: Gizmos use overlay flags
    const isGizmo = mesh.isGizmo;
    let pipeline = mesh.topology === 'line-list' ? this.linePipeline : this.trianglePipeline;

    if (isGizmo) {
      pipeline = mesh.topology === 'line-list' ? this.gizmoOverlayPipeline : this.gizmoTriangleOverlayPipeline;
    }

    if (!pipeline) return;

    passEncoder.setPipeline(pipeline);

    // 1. Get real Model matrix from component (centralized logic)
    const modelMatrix = mesh.getTransformMatrix();

    // 2. Calculate MVP
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewProjMatrix, modelMatrix);

    // 3. Update or Create Uniform Buffer
    const bufferSize = isGizmo ? 128 : (mesh.topology === 'line-list' ? 64 : 144);

    let uniformBuffer = this.uniformBuffers.get(mesh.id);
    if (!uniformBuffer) {
      uniformBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformBuffers.set(mesh.id, uniformBuffer);
    }

    // 4. Populate Buffer
    this.device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as any);

    if (isGizmo) {
      const color = mesh.material ? mesh.material.baseColor : new Float32Array([1, 1, 1, 1]);
      this.device.queue.writeBuffer(uniformBuffer, 64, color as any);
    } else if (mesh.topology === 'triangle-list') {
      this.device.queue.writeBuffer(uniformBuffer, 64, modelMatrix as any);
      const color = mesh.material ? mesh.material.baseColor : new Float32Array([1, 1, 1, 1]);
      this.device.queue.writeBuffer(uniformBuffer, 128, color as any);
    }

    // Update or Create Bind Group
    let bindGroup = this.bindGroups.get(mesh.id);
    if (!bindGroup) {
      bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: uniformBuffer,
            },
          },
        ],
      });
      this.bindGroups.set(mesh.id, bindGroup);
    }

    // Set buffers and draw
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, mesh.vertexBuffer);

    if (mesh.indexBuffer) {
      passEncoder.setIndexBuffer(mesh.indexBuffer, 'uint16');
      passEncoder.drawIndexed(mesh.indexCount);
    } else {
      passEncoder.draw(mesh.vertexCount);
    }
  }
}
