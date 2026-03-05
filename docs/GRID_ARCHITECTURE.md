# 🏁 Game Creator - Arquitectura de Rejilla Profesional (Infinite Grid)

## 1. Concepto Técnico
La rejilla no es geometría real. Es un **Post-Process Plane** dibujado en el mundo que utiliza un shader procedural para proyectar líneas infinitas.

## 2. Especificaciones de Implementación

### A. El Sombreador (Shader)
- **Cálculo de Fracción:** Se utiliza `fwidth` y funciones `log10` para determinar el grosor de línea constante independientemente del zoom.
- **Coordenadas de Mundo:** Las líneas se calculan a partir de la posición real `worldPosition` enviada desde el Vertex Shader.

### B. El Componente (UGridComponent)
Cada `World` puede tener (o no) un sistema de rejilla. 
- Propiedades: `gridSize`, `gridColor`, `bIsInfinite`, `opacity`.

### C. Fase de Renderizado
- Se ejecuta después del `MainPass` pero antes de los `Gizmos`.
- Utiliza **Depth Testing** para permitir que los objetos tapen la rejilla, pero no escribe en el Depth Buffer (evitando conflictos de transparencia).

## 3. Hoja de Ruta
1. **Fase 1:** Limpiar el `Renderer.ts` de intentos de mallas manuales.
2. **Fase 2:** Crear el `GridPipeline` que use un Quad que siempre cubra el campo de visión.
3. **Fase 3:** Implementar el shader matemático de líneas finas.