# 🛠️ Game Creator - Arquitectura de Gizmos y Herramientas de Edición

## 1. Filosofía Base (El Modelo Unreal Engine)
Los Gizmos son **Actores de Transformación** diseñados para manipular la `modelMatrix` de otros actores seleccionados. No pertenecen a la lógica del juego, sino al entorno del Editor.

## 2. Pilares de Implementación

### A. El Pase de Renderizado de Primer Plano (Foreground)
- Los Gizmos deben renderizarse después de la geometría opaca y transparente.
- **Depth Testing:** Deben ignorar el buffer de profundidad del mundo para que nunca queden ocultos detrás de una malla, pero deben usar su propio buffer de profundidad interno para que el eje X no se dibuje detrás del eje Z del mismo gizmo.

### B. Escalado Independiente de la Distancia (Screen-Space Scaling)
Para que un Gizmo sea usable, su tamaño en pantalla debe ser constante.
- **Fórmula:** En cada frame, el `USceneComponent` del Gizmo calcula:
  `Scale = (DistanceToCamera / FieldOfView) * EditorScaleConstant`.
- Esto garantiza que el usuario siempre pueda interactuar con él, sin importar si el objeto está a 1 metro o a 100 metros.

### C. Interacción mediante ID Picking (Hit Proxies)
En lugar de Raycasting matemático en CPU:
1. El Renderer dibuja el Gizmo en un buffer invisible (Texture ID) donde cada eje tiene un color único (Eje X = 1, Eje Y = 2, Eje Z = 3).
2. Al hacer clic, leemos el píxel bajo el mouse en esa textura.
3. Si el valor es 1, sabemos instantáneamente que el usuario está arrastrando el eje X.

## 3. Estados del Gizmo
Un Gizmo profesional debe implementar estos estados visuales:
- **Default:** Colores estándar (X:Rojo, Y:Verde, Z:Azul).
- **Hover:** El eje bajo el mouse brilla (emisión) para indicar interactividad.
- **Active:** Los demás ejes se vuelven semitransparentes mientras uno está siendo arrastrado para reducir el ruido visual.

## 4. Tipos de Gizmos (Estandarización)
El motor debe proveer tres modos básicos:
1. **Translation (W):** Flechas para movimiento.
2. **Rotation (E):** Círculos/Toroides para rotación.
3. **Scale (R):** Cubos en los extremos para escalado.

## 5. Hoja de Ruta de Refactorización

### Fase 1: Separación de Lógica
- [ ] Mover el `GizmoManager` de `editor` a un sistema de utilidad dentro del `engine`.
- [ ] Convertir el Gizmo en un `AActor` compuesto por `UMeshComponents` que utilicen los primitivos ya creados (`Primitive_Cone` para flechas, `Primitive_Cylinder` para el cuerpo).

### Fase 2: Renderizado Especializado
- [ ] Crear un `GizmoMaterial` (Shader) que soporte el escalado automático basado en la posición de la cámara.
- [ ] Implementar el pase de renderizado que limpie el Depth Buffer antes de dibujar los gizmos.

### Fase 3: Picking de Precisión
- [ ] Implementar el sistema de lectura de píxeles (Render Target ID) para eliminar el Raycasting manual del CPU.