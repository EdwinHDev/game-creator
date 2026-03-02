import { mat4 } from 'gl-matrix';
import { Logger } from '../Core/Logger';
import { World } from '../Framework/World';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UMeshComponent } from '../Components/UMeshComponent';

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

    // Create basic shader module
    const shaderCode = `
      struct Uniforms {
          mvpMatrix: mat4x4<f32>,
          baseColor: vec4<f32>,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) color: vec3<f32>,
      }

      @vertex
      fn vs_main(
          @location(0) pos: vec3<f32>,
          @location(1) color: vec3<f32>
      ) -> VertexOut {
          var out: VertexOut;
          out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
          out.color = color;
          return out;
      }

      @fragment
      fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
          return uniforms.baseColor;
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
        arrayStride: 24, // 3 floats pos + 3 floats color
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

    const vpMatrix = mat4.create();
    mat4.multiply(vpMatrix, projectionMatrix, viewMatrix);

    // 3. Command Encoding
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.15, g: 0.15, b: 0.18, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    // 4. Iterate over meshes
    for (const actor of world.actors) {
      for (const component of actor.components) {
        if (component instanceof UMeshComponent && component.vertexBuffer) {
          this.drawMesh(passEncoder, component, vpMatrix);
        }
      }
    }

    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private drawMesh(passEncoder: GPURenderPassEncoder, mesh: UMeshComponent, vpMatrix: mat4): void {
    if (!this.device) return;

    // Select the correct pipeline for this mesh
    const pipeline = mesh.topology === 'line-list' ? this.linePipeline : this.trianglePipeline;
    if (!pipeline) return;

    passEncoder.setPipeline(pipeline);

    // Calculate Model matrix
    const modelMatrix = mat4.create();
    mat4.fromRotationTranslationScale(
      modelMatrix,
      mesh.relativeRotation,
      mesh.relativeLocation,
      mesh.relativeScale
    );

    // Calculate MVP
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, vpMatrix, modelMatrix);

    // Update or Create Uniform Buffer
    const isLineList = mesh.topology === 'line-list';
    const bufferSize = isLineList ? 64 : 80;

    let uniformBuffer = this.uniformBuffers.get(mesh.id);
    if (!uniformBuffer) {
      uniformBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformBuffers.set(mesh.id, uniformBuffer);
    }

    this.device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as any);

    // Write material color for triangle meshes
    if (!isLineList) {
      const color = mesh.material ? mesh.material.baseColor : new Float32Array([1, 1, 1, 1]);
      this.device.queue.writeBuffer(uniformBuffer, 64, color as any);
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
