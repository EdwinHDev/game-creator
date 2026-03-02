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
          let diffuse = max(dot(N, L), 0.1);
          
          // Shadow Calculation (Perspective divide & map to 0-1)
          let projCoords = in.fragPosLightSpace.xyz / in.fragPosLightSpace.w;
          let flipY = vec2<f32>(projCoords.x, -projCoords.y); 
          let uv = flipY * 0.5 + 0.5;
          
          // 1. Unconditional sampling to avoid GPU control flow errors
          var shadow = textureSampleCompare(shadowMap, shadowSampler, uv, projCoords.z - 0.005);
          
          // 2. Cancel shadow if coordinates are outside light projection
          let out_of_bounds = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || projCoords.z > 1.0 || projCoords.z < 0.0;
          if (out_of_bounds) {
              shadow = 1.0; 
          }

          let lighting = (0.2 + (diffuse * shadow)) * scene.lightColor.rgb;
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

    Logger.info("WebGPU Renderer initialized with advanced Grid support.");
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

    // Orthographic projection for directional light
    mat4.ortho(lightProjectionMatrix, -50, 50, -50, 50, 1, 500);

    // View matrix looking from lightDir towards origin
    const lightPos = vec3.create();
    vec3.scale(lightPos, lightDir, -100); // 100 units away from origin
    mat4.lookAt(lightViewMatrix, lightPos, [0, 0, 0], [0, 1, 0]);

    mat4.multiply(lightViewProj, lightProjectionMatrix, lightViewMatrix);

    const sceneData = new Float32Array(24); // 16 (mat4) + 4 (vec4) + 4 (vec4)
    sceneData.set(lightViewProj as any, 0); // lightViewProj (offset 0)
    sceneData.set([...lightDir, 0], 16);    // direction (offset 64)
    sceneData.set([...lightColor.map(c => c * lightIntensity), 1], 20); // color (offset 80)
    this.device.queue.writeBuffer(this.sceneUniformBuffer!, 0, sceneData);

    // 4. Shadow Pass Command Encoding
    const shadowEncoder = this.device.createCommandEncoder();

    // --- Phase 16: Shadow Pass ---
    const shadowPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowView!,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };

    const shadowPass = shadowEncoder.beginRenderPass(shadowPassDescriptor);
    shadowPass.setPipeline(this.shadowPipeline!);

    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer && component.topology === 'triangle-list') {
          // In shadow pass, we only draw triangle meshes
          const modelMatrix = component.getTransformMatrix();
          const lightMVP = mat4.create();
          mat4.multiply(lightMVP, lightViewProj, modelMatrix);

          // Reuse uniform buffer logic but we need to write shadow MVP to offset 0
          let uniformBuffer = this.uniformBuffers.get(component.id);
          if (!uniformBuffer) {
            uniformBuffer = this.device.createBuffer({
              size: 144, // MVP (64) + Model (64) + Color (16)
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.uniformBuffers.set(component.id, uniformBuffer);
          }
          this.device.queue.writeBuffer(uniformBuffer, 0, lightMVP as any);

          // Draw for shadow (simplified)
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

    // Submit shadow pass so we can update buffers for main pass
    this.device.queue.submit([shadowEncoder.finish()]);

    // 5. Main Pass
    const textureView = this.context.getCurrentTexture().createView();

    // Create Depth Texture for this pass
    const depthTexture = this.device.createTexture({
      size: [this.context.getCurrentTexture().width, this.context.getCurrentTexture().height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.15, g: 0.15, b: 0.18, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };

    const mainEncoder = this.device.createCommandEncoder();
    const passEncoder = mainEncoder.beginRenderPass(renderPassDescriptor);

    // Bind scene-wide data (Group 1)
    passEncoder.setBindGroup(1, this.sceneBindGroup!);

    // 6. Main Draw Loop
    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer) {
          this.drawMesh(passEncoder, component, viewProjMatrix);
        }
      }
    }

    passEncoder.end();
    this.device.queue.submit([mainEncoder.finish()]);
  }

  private drawMesh(passEncoder: GPURenderPassEncoder, mesh: UMeshComponent, viewProjMatrix: mat4): void {
    if (!this.device) return;

    // Select the correct pipeline for this mesh
    const pipeline = mesh.topology === 'line-list' ? this.linePipeline : this.trianglePipeline;
    if (!pipeline) return;

    passEncoder.setPipeline(pipeline);

    // 1. Get real Model matrix from component (centralized logic)
    const modelMatrix = mesh.getTransformMatrix();

    // 2. Calculate MVP
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewProjMatrix, mesh.getTransformMatrix());

    // 3. Update or Create Uniform Buffer
    const isLineList = mesh.topology === 'line-list';
    const bufferSize = isLineList ? 64 : 144; // MVP (64) + Model (64) + Color (16)

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

    // Write Model Matrix and Color for triangle meshes (Lighting needs world space)
    if (!isLineList) {
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
