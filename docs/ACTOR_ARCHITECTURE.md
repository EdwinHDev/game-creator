# 🎭 Game Creator - Arquitectura de Actores y Componentes (Escalabilidad MMO)

## 1. Filosofía Base (El Modelo Unreal Engine)
En Game Creator, todo objeto interactivo o visible en el nivel es un **Actor**. Sin embargo, la lógica y los datos no están programados rígidamente en el Actor, sino delegados a sus **Componentes**.

### La Regla de Oro: Composición sobre Herencia
- Un Actor (`AActor`) es un contenedor lógico y una entidad de red.
- **NO** creamos subclases gigantes (ej. `class JefeOrco extends AActor`).
- En su lugar, ensamblamos actores añadiendo componentes (ej. `UHealthComponent`, `UMeshComponent`, `UAIComponent`).

## 2. Anatomía de un Actor (`AActor`)
Para ser profesional y escalable, nuestra clase `AActor` debe poseer estas propiedades fundamentales:

- `id`: Identificador único (UUID) crucial para multijugador y serialización de guardado.
- `name`: Nombre legible para el Editor (ej. "Player_1").
- `tags`: Array de strings (ej. `["Player", "Damageable"]`) para filtrado rápido sin chequear clases.
- `rootComponent`: Puntero a un `USceneComponent` principal que le otorga su Transformación (Posición, Rotación, Escala) en el mundo 3D.
- `components`: Array de `UActorComponent` adjuntos al Actor.
- `bIsHidden`: Flag rápido para desactivar el renderizado (útil para Object Pooling).
- `bCanTick`: Flag para apagar su actualización por frame si el objeto está inactivo, ahorrando CPU.

## 3. Ciclo de Vida del Actor
El motor garantiza un orden estricto de ejecución, igual que UE:
1. `Awake()`: Inicialización en memoria (antes de que empiece el juego).
2. `BeginPlay()`: Inicia su lógica cuando entra al mundo activo.
3. `Tick(deltaTime)`: Actualización por frame (física, input). Solo se ejecuta si `bCanTick` es true.
4. `EndPlay()` o `Destroy()`: Limpieza de memoria, desregistro de eventos.

## 4. Estrategia de Rendimiento Extremo (El Estándar MMO)
Para permitir miles de Actores en pantalla en el ecosistema WebGPU:

### A. Instanced Rendering (Dibujado Masivo)
El `Renderer` no dibujará malla por malla. 
Agrupará todos los `UMeshComponent` que compartan la misma Geometría y Material, recopilará sus Matrices (Transforms) en un **Storage Buffer (SSBO)** y enviará un solo comando a WebGPU usando `drawIndexedIndirect` o Instancing (`instanceCount: 1000`).

### B. Object Pooling (Reciclaje de Memoria Web)
Prohibido usar `new AActor()` o `actor.destroy()` masivamente durante el gameplay (ej. proyectiles, mobs base). Se debe implementar un `PoolManager` que oculte (`bIsHidden = true`) y desactive (`bCanTick = false`) a los actores muertos, y los reviva reseteando sus variables cuando se necesiten de nuevo para evitar que el Garbage Collector congele el juego.

### C. Frustum & Distance Culling
Los Actores que estén fuera del campo de visión de la cámara (`Camera Frustum`) o a más de X unidades de distancia no enviarán sus datos al Render Proxy. Su lógica (`Tick`) puede reducir su frecuencia (ej. ejecutarse cada 10 frames en vez de cada frame).

## 5. Hoja de Ruta de Implementación

Para cimentar esta estructura en nuestro código actual:

### Fase 1: Saneamiento del Core
- [ ] Asegurar que `AActor` maneje correctamente su jerarquía de `USceneComponent` (hijos moviéndose junto a sus padres).
- [ ] Implementar el sistema de `Tags` en `AActor` para búsquedas eficientes en el `World`.

### Fase 2: Ciclo de Vida Estricto
- [ ] Implementar el orquestador en `World.ts` que controle el `BeginPlay` y el bucle de `Tick` respetando el flag `bCanTick`.

### Fase 3: Preparación para Instancing en Renderer
- [ ] Separar la lógica de Matrices del `UMeshComponent` hacia un colector central en el Renderer.
- [ ] Preparar WebGPU para recibir Arrays de Matrices (Transforms) masivos en lugar de bindGroups individuales por actor.