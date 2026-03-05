# 💡 Game Creator - Arquitectura de Iluminación y Ecosistema Visual

## 1. Filosofía Base (El Modelo Unreal Engine)
En Game Creator, la iluminación no es un cálculo rígido dentro de un shader, sino un **Ecosistema Dinámico**. 
- **Mundos Estériles:** Por defecto, un `World` no tiene luz. Si el usuario no añade un componente de iluminación, el mundo se renderiza en total oscuridad (negro). No existen "luces globales hardcodeadas" en el código del renderizador.
- **Separación de Responsabilidades:** La emisión de luz (Física), la recolección de luz (Motor) y la interpretación visual (Lente de Cámara / Post-Proceso) son sistemas independientes.

## 2. Los Componentes de Luz (Actores)
El motor provee componentes específicos que el desarrollador instancia en su escena. Cada uno tiene un propósito físico claro:

### A. UDirectionalLightComponent (El Sol)
- **Propósito:** Luz principal para exteriores. Emite rayos paralelos desde el infinito.
- **Impacto PBR:** Afecta el Diffuse (Color) y genera el Specular Highlight (Brillo focal) directo.
- **Sombras:** Proyecta sombras direccionales (Cascaded Shadow Maps en el futuro).

### B. USkyLightComponent (El Entorno / HDRI)
- **Propósito:** Captura el entorno (cielo procedural o archivo `.hdr` de usuario) para simular la luz ambiental y los reflejos (Image-Based Lighting - IBL).
- **Regla de Uso:** Si se usa un HDRI fotorrealista, este componente es el único responsable de pintar los reflejos en los metales y suavizar las sombras.

### C. Luces Locales (UPointLight, USpotLight, URectLight)
- *Para implementación futura.* Luces posicionales con radio de decaimiento (Attenuation) para interiores, antorchas, linternas o luces de estudio.

## 3. El Pipeline de Datos (Del Game Thread a la GPU)
Para que el motor sea escalable y soporte múltiples luces sin reescribir shaders, usamos un modelo orientado a datos:

1. **Recolección:** En cada frame, el `Renderer` solicita al `World` activo todas las entidades que hereden de `ULightComponent`.
2. **Estructuración:** El Renderer empaqueta la información (Color, Intensidad, Posición, Tipo de Luz) en un arreglo contiguo de memoria (`LightUniformBuffer` o un SSBO).
3. **Inyección:** Este buffer masivo se envía a la GPU de una sola vez.
4. **Cálculo (WGSL):** El shader `Standard.wgsl` contiene un bucle `for` que itera sobre todas las luces del buffer, sumando la contribución PBR de cada una al píxel final.

## 4. Post-Proceso (La Lente)
El tratamiento final del color se separa de la matemática de la luz.
- **Tone Mapping (ACES):** Mapeo de valores HDR (Alto Rango Dinámico) a LDR (pantallas estándar) para evitar que los brillos extremos "quemen" la imagen con blancos puros sin detalle.
- **Exposición:** Multiplicador global que permite ajustar la entrada de luz a la cámara (preparando el terreno para Auto-Exposure).
- **Corrección Gamma:** Conversión estricta de Espacio Lineal a sRGB justo antes de pintar en pantalla.

---

## 5. Hoja de Ruta de Implementación (Paso a Paso)

Para migrar nuestro sistema actual a esta arquitectura profesional sin romper el motor, seguiremos este orden estricto:

### Fase 1: Limpieza y Entorno Cero
- [ ] Eliminar luces hardcodeadas en `Renderer.ts` y `MaterialPreviewer.ts`.
- [ ] Asegurar que si el mundo no tiene luces, se vea negro.

### Fase 2: Formalización de Componentes Fundamentales
- [ ] Estandarizar `UDirectionalLightComponent` asegurando que exporte correctamente su dirección, color e intensidad hacia el buffer.
- [ ] Crear el `USkyLightComponent` para manejar la carga de HDRIs y texturas ambientales (sacando esta lógica del Renderer).

### Fase 3: El Gestor de Luces (Light Buffer)
- [ ] Crear el struct de datos de luces en `Renderer.ts` (`LightUniformBuffer`).
- [ ] Refactorizar `Standard.wgsl` para leer desde este buffer dinámico mediante un bucle, en lugar de recibir una sola `scene.lightColor`.

### Fase 4: Integración del Ecosistema en el Editor (Lookdev)
- [ ] Actualizar el Material Previewer para que instancie su propio `PreviewWorld`.
- [ ] Añadir a ese `PreviewWorld` un `UDirectionalLightComponent` y un `USkyLightComponent` (con un HDRI de estudio) preconfigurados.
- [ ] Garantizar aislamiento total: Los ajustes de luz en el visor principal no afectan al visor de materiales y viceversa.