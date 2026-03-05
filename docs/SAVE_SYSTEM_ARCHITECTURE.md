# 💾 Game Creator - Arquitectura de Serialización y Guardado

## 1. Filosofía Base (El Modelo Unreal Engine)
En Game Creator, la persistencia de datos se divide estrictamente en dos ecosistemas con propósitos y tecnologías diferentes: **Autoría (Editor)** y **Progreso (Juego)**. 

Queda estrictamente prohibido serializar el estado global del motor en un único archivo monolítico, ya que bloquea el hilo principal (Main Thread) en proyectos de gran escala.

## 2. Guardado de Proyecto (Modo Editor)
El objetivo es guardar el trabajo del desarrollador en su disco duro físico.

### A. Estructura de Archivos (Separación de Assets)
El `ProjectSystem` no guarda un "Mundo", guarda "Recursos". Un proyecto se compone de múltiples archivos:
- `project.gc` (Configuración global, resolución, nivel de inicio).
- `/Maps/level_01.gmap` (Contiene exclusivamente la jerarquía de Actores, sus Transforms y punteros a los Assets que utilizan).
- `/Materials/wood.gmat` (Configuración PBR).

### B. Tecnología (File System Access API & OPFS)
- Se utilizará la **File System Access API** para que el usuario seleccione el directorio de su proyecto en el sistema operativo.
- Se mantendrán los "File Handles" (Punteros a los archivos) en memoria para permitir atajos de teclado rápidos (Ctrl+S) sin volver a abrir ventanas de diálogo, sobreescribiendo únicamente el archivo o nivel actualmente activo.

## 3. Guardado de Partida (Modo Juego / Runtime)
El objetivo es guardar el progreso del jugador final de forma invisible, rápida y sin diálogos del sistema operativo.

### A. El Objeto `USaveGame`
El estado del `World` activo NUNCA se guarda completo durante el juego. Solo se guarda lo que muta.
- Se implementará una clase base `USaveGame` (heredera de `UObject`).
- Los desarrolladores crearán subclases (ej. `RPGSaveGame`) definiendo propiedades específicas (`health`, `inventory`, `currentLevel`).
- En los `UActorComponent`, se implementará un flag (ej. `bSaveGame: true`) para marcar propiedades que deben ser inyectadas en el `USaveGame`.

### B. Tecnología (IndexedDB)
- En la plantilla del juego final (Game Template), el motor utilizará **IndexedDB** (a través de un wrapper como `idb`) para almacenar los objetos `USaveGame`.
- Esto permite guardados asíncronos (`async/await`) en segundo plano sin interrumpir los fotogramas por segundo (FPS).

## 4. Evolución de la Serialización
Actualmente se utiliza `JSON.stringify`. Para la escalabilidad futura (fase MMO o mapas gigantes), el sistema de serialización de `UObject` será encapsulado en una clase `USerializer`.
- **Fase actual:** Serialización a JSON estructurado.
- **Fase futura:** Serialización a formatos binarios (como MessagePack o BSON) para reducir el tamaño del archivo en disco en un 60% y acelerar los tiempos de carga drásticamente.