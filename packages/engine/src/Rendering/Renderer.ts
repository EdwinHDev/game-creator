import { Logger } from '../Core/Logger';

/**
 * Handles WebGPU rendering operations and GPU resource management.
 */
export class Renderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private pipeline: GPURenderPipeline | null = null;

  constructor() { }

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
          return vec4<f32>(in.color, 1.0);
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    // Create Pipeline
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 24, // 3 floats pos + 3 floats color
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: undefined, // Simple 3D for now without depth buffer
    });

    Logger.info("WebGPU Renderer initialized successfully with MVP pipeline");
  }

  /**
   * Performs the main render pass.
   */
  public render(): void {
    if (!this.device || !this.context || !this.pipeline) return;

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
    passEncoder.setPipeline(this.pipeline);

    // In future phases, we will bind groups and draw meshes here

    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
