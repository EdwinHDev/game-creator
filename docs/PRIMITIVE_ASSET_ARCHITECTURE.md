# 🧊 Game Creator - Arquitectura de Primitivos y Gestión de Recursos (Assets)

## 1. El Concepto de Separación (Data vs. Entidad)
En Game Creator, existe una separación estricta entre **lo que un objeto ES** (sus datos geométricos) y **dónde ESTÁ** (su representación en el mundo).

- **UAsset (Recurso/Geometría):** Es la forma matemática (Vértices, Normales, UVs). Reside en la memoria estática.
- **AActor (Entidad):** Es el contenedor lógico que vive en el nivel.
- **UMeshComponent (El Puente):** Es el componente del Actor que dice: *"Yo existo en las coordenadas X,Y,Z, y quiero dibujarme usando este UAsset"*.

## 2. Instanciación de Actores vs Duplicación de Memoria
Cuando el usuario instancía "10 Cubos" en el editor, el flujo de memoria dictamina que:
1. Se instancian `10 AActor` en el Game Thread.
2. Se instancian `10 UMeshComponent` adheridos a esos actores.
3. Se instancian `10 UTransformComponent` para sus posiciones espaciales.
4. **NO se instancian 10 mallas.** Los 10 `UMeshComponent` mantienen un puntero por referencia (Reference Couting / Pointer) al único `UAsset_Cube` gestionado por el motor.

## 3. Primitivos del Sistema (Built-in Geometry)
El motor debe inicializar e inyectar en el `UAssetManager` las siguientes formas primitivas generadas procedimentalmente durante el arranque del motor, evitando que tengan que ser descargadas como archivos externos:

- `Primitive_Plane`
- `Primitive_Cube`
- `Primitive_Sphere`
- `Primitive_Cylinder`
- `Primitive_Cone`
- `Primitive_Capsule` (Vital para el sistema de físicas y Player Controllers).

## 4. El Patrón "Flyweight" en WebGPU
Esta arquitectura es la implementación nativa del patrón de diseño de software *Flyweight*, enfocado en la minimización del uso de memoria:
- El `Renderer` al procesar el Frame, agrupará (Sort & Batch) a todos los `UMeshComponent` que compartan el mismo `UAsset`.
- Generará un bloque SSBO con las matrices de transformación de cada grupo.
- Utilizará instanciación acelerada por hardware (`drawIndexed(indexCount, instanceCount)`) para dibujar todos los cubos, esferas o monstruos idénticos en un solo paso hacia la GPU.

## 5. Regla de Uniformidad
Para el Renderizador o el Gestor de Recursos, **un Primitivo no es especial**. El motor trata matemáticamente igual al `Primitive_Cube` generado por código, que a un `Character_Dragon.gltf` importado por el usuario. Ambos son simples contenedores de vértices (UAsset). La lógica de dibujado instanciado aplica para todo.