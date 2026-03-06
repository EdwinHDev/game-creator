import { Engine } from '../Core/Engine';
import { World } from '../Framework/World';
import { AActor } from '../Framework/AActor';
import { UMeshComponent } from '../Components/UMeshComponent';
import { UCameraComponent } from '../Components/UCameraComponent';
import { UDirectionalLightComponent } from '../Components/UDirectionalLightComponent';
import { ESkyLightSourceType, USkyLightComponent } from '../Components/USkyLightComponent';
import { UMaterial } from './UMaterial';
import { Renderer } from './Renderer';
import { vec3, quat } from 'gl-matrix';

/**
 * Isolated renderer to preview a material on a sphere.
 * Now utilizes the standardized Engine/World architecture for isolated rendering.
 */
export class MaterialPreviewer {
  private renderer: Renderer;
  private world: World;
  private previewCamera: UCameraComponent;
  private sphereMesh: UMeshComponent;
  private skyComponent: USkyLightComponent;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;

  private rotX: number = 0;
  private rotY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.canvas = canvas;
    const engine = Engine.getInstance();
    this.renderer = engine.getRenderer();

    // 1. Inicializar contexto para el canvas local
    this.context = canvas.getContext('webgpu') as GPUCanvasContext;
    this.context.configure({
      device: device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque'
    });

    // 2. Crear mundo dedicado (MaterialPreviewWorld)
    this.world = engine.createWorld('MaterialPreviewWorld');

    // 3. Setup Escena de Previsualización (Lookdev Studio)

    // A. Esfera de Previsualización
    const sphereActor = this.world.spawnActor(AActor, 'PreviewSphere', true);
    this.sphereMesh = sphereActor.addComponent(UMeshComponent);
    this.sphereMesh.setPrimitive('Primitive_Sphere');
    sphereActor.rootComponent = this.sphereMesh;

    // B. Cámara de Estudio
    const cameraActor = this.world.spawnActor(AActor, 'PreviewCamera', true);
    this.previewCamera = cameraActor.addComponent(UCameraComponent);
    cameraActor.rootComponent = this.previewCamera;
    this.previewCamera.relativeLocation = vec3.fromValues(0, 0, 3.5);

    // C. Luz Direccional (Studio Light - Key Light)
    const lightActor = this.world.spawnActor(AActor, 'PreviewLight', true);
    const sun = lightActor.addComponent(UDirectionalLightComponent);
    sun.color = new Float32Array([1, 1, 1]);
    sun.intensity = 1.5;
    lightActor.rootComponent = sun;

    // Rotación diagonal clásica para resaltar volúmenes
    const lightRotation = quat.create();
    quat.fromEuler(lightRotation, -45, -45, 0);
    sun.relativeRotation = lightRotation;

    // D. SkyLight (IBL para reflejos realistas)
    const skyActor = this.world.spawnActor(AActor, 'PreviewSky', true);
    this.skyComponent = skyActor.addComponent(USkyLightComponent);
    this.skyComponent.intensity = 1.0;

    // Interacción por ratón
    this.initInteraction();
  }

  private initInteraction() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.rotY += deltaX * 0.01;
      this.rotX += deltaY * 0.01;
      this.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotX));

      // Aplicar rotación a la esfera (Lookdev standard)
      const rotation = quat.create();
      quat.fromEuler(rotation, this.rotX * (180 / Math.PI), this.rotY * (180 / Math.PI), 0);
      this.sphereMesh.relativeRotation = rotation;

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  /**
   * Carga un HDRI específico para el previewer.
   */
  public async loadEnvironment(path: string = '/environments/pretoria_gardens_1k.hdr') {
    // Phase 63.3: Environment loading will be handled by the UAssetManager/RGBELoader later.
    // For now, we update the component state.
    this.skyComponent.sourceType = ESkyLightSourceType.SpecifiedCubemap;
    this.skyComponent.cubemapAssetId = path;
  }

  /**
   * Renderiza el material actual en el mundo de previsualización.
   */
  public render(material: UMaterial) {
    if (!this.world || !this.renderer) return;

    // Sincronizar material editado con la esfera
    this.sphereMesh.material = material;

    // Actualizar jerarquía del mundo (matrices)
    this.world.tick(0);

    const targetView = this.context.getCurrentTexture().createView();

    // Renderizar mundo aislado en el visor offscreen
    this.renderer.render(
      this.world,
      targetView,
      this.canvas.width,
      this.canvas.height,
      this.previewCamera
    );
  }

  public destroy() {
    // En una implementación completa, aquí limpiaríamos el mundo del motor
    console.log("[MaterialPreviewer] Visor de material destruido.");
  }
}

