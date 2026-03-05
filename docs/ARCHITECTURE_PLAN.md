# 📘 Game Creator - Manifiesto Arquitectónico y Plan de Desarrollo

## 1. Identidad del Proyecto
**Game Creator** es un motor de videojuegos 3D y editor web profesional de alto rendimiento.
- **Inspiración Arquitectónica:** Unreal Engine (Modelo de Actores, Componentes, Mundos y Pipeline PBR).
- **Stack Tecnológico:** TypeScript puro, WebGPU para renderizado de bajo nivel, y Web Components (Vanilla) para la interfaz de usuario del Editor.
- **Estructura:** Monorepo compuesto por tres paquetes principales:
  1. `packages/engine`: El núcleo del motor. Contiene matemáticas, framework (AActor, Componentes), recursos (Assets) y el Renderizador WebGPU.
  2. `packages/editor`: La herramienta de autoría. Interfaz basada en Web Components (`AppShell`, `Viewport`, `DetailsPanel`, etc.) que consume el Engine.
  3. `packages/game-template`: La plantilla base para compilar y exportar el juego final al usuario.

## 2. Principios Fundamentales de Diseño (El Estilo UE)

Para garantizar la escalabilidad y mantener un rendimiento óptimo en la web (evitando el Garbage Collection y cuellos de botella del hilo principal), el desarrollo se rige por los siguientes pilares:

### Pilar A: Soporte Multi-Mundo (Isolated Worlds)
El `Engine` actúa como un orquestador global (Singleton) que gestiona múltiples instancias de `World`.
- `MainWorld`: El mundo principal donde se edita el juego.
- `PreviewWorlds`: Mundos aislados utilizados por visores secundarios (Material Previewer, Mesh Previewer). Ninguna física, luz o configuración del MainWorld debe "gotear" hacia los PreviewWorlds.

### Pilar B: Renderizado Agnóstico y Render Targets (Offscreen)
El `Renderer` no debe asumir que dibuja en el `<canvas>` principal de la ventana. 
Actúa como una función pura: `Render(World, Camera, RenderTarget)`. Los Web Components del editor pueden solicitar al Renderer que dibuje un `PreviewWorld` y envíe el resultado a una textura en memoria, la cual se muestra en el panel de UI sin conflictos de contexto WebGPU.

### Pilar C: Render Proxies y Data-Oriented Design
Para lidiar con las limitaciones de recursos de la web:
- Los `AActor` y `UComponent` viven exclusivamente en la lógica de TypeScript (Game Thread).
- Cuando un componente se mueve o actualiza, no hace llamadas directas a WebGPU. Envía sus datos a una capa intermedia (Render Proxy).
- El Renderer utiliza **SSBOs (Shader Storage Buffer Objects)** gigantes para almacenar los Transforms y Materiales de *todos* los objetos, permitiendo renderizar la escena en la menor cantidad de "Draw Calls" posibles (Instancing).

### Pilar D: Sistema de Iluminación Global
La iluminación no se "hardcodea" en el shader. El Renderer recolecta todos los `ULightComponent` (`UDirectionalLight`, `UPointLight`, `USkyLight` para HDRI) del mundo activo, llena un buffer estructurado de luces (`LightUniformBuffer`), y el shader PBR (`Standard.wgsl`) itera sobre este buffer para calcular la contribución de luz dinámicamente.

---

## 3. Hoja de Ruta de Refactorización Activa

El proyecto se encuentra en una fase de realineación arquitectónica para soportar los pilares mencionados. El orden estricto de ejecución es el siguiente:

### Fase 1: Desacoplamiento del Renderer y Render Targets
- [ ] Eliminar la dependencia del Canvas global dentro de la lógica central del `Renderer`.
- [ ] Implementar el soporte para recibir un `GPUTextureView` (Render Target) como destino de dibujado en cada frame.
- [ ] Actualizar el `Viewport` del editor para proporcionar su propio Render Target al Engine.

### Fase 2: Gestión Multi-Mundo en el Engine
- [ ] Modificar `Engine.ts` para que pueda contener un registro de múltiples `World`s.
- [ ] Establecer un mecanismo para marcar un `World` como activo o iterar sobre mundos específicos para pases de renderizado en segundo plano (UI Previews).

### Fase 3: Proxies de Escena (Gestión de Memoria WebGPU)
- [ ] Desvincular la creación de BindGroups y Buffers individuales dentro de cada `UMeshComponent`.
- [ ] Crear un gestor de Buffers en el Renderer que recolecte los `modelMatrix` e información de materiales en un bloque contiguo de memoria por frame.

### Fase 4: Refactorización del Sistema de Luces y HDRI
- [ ] Crear el componente oficial `USkyLightComponent` para manejar los HDRI y el entorno (Ambient).
- [ ] Configurar el `LightUniformBuffer` en WebGPU y actualizar `Standard.wgsl` para procesar luces mediante bucles basados en la data del World.

### Fase 5: Reescritura del Material Previewer
- [ ] Eliminar la implementación antigua de `MaterialPreviewer.ts`.
- [ ] Crear una nueva clase basada en la arquitectura formal que instancie un `PreviewWorld`.
- [ ] Implementar un "Entorno Lookdev": Agregar al PreviewWorld una cámara estática, un `USkyLightComponent` neutral y un `UDirectionalLightComponent` blanco y brillante. Ambos mundos permanecerán 100% independientes en su iluminación.

---
*Nota para el Asistente AI: Lee este documento y ajusta tus respuestas estrictamente a esta arquitectura. No propongas atajos ("hacks") que rompan el aislamiento de los mundos o acoplen el renderizador a la UI.*