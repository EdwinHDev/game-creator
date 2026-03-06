# 💡 Game Creator - Arquitectura de Iluminación y Ecosistema Visual

## 1. Filosofía Base (El Modelo Unreal Engine)
La iluminación en Game Creator se basa en el **Physically Based Rendering (PBR)** y la **Iluminación Basada en Imágenes (IBL)**. El objetivo es que ningún objeto tenga sombras negras puras (irrealistas), sino que "respire" el color del cielo y el entorno.

- **Mundos Estériles:** Por defecto, un `World` no tiene luz. Si el usuario no añade componentes de iluminación, el mundo se renderiza en total oscuridad.
- **Interconectividad:** Los sistemas de atmósfera, sol y luz ambiental trabajan en conjunto para generar un resultado visual coherente.

## 2. Los 3 Pilares Atmosféricos

### A. Sky Atmosphere (El Motor Físico)
En lugar de una textura fija, el cielo es un shader procedimental que simula la interacción de la luz con la atmósfera.
- **Rayleigh Scattering:** Crea el degradado azul característico del cielo durante el día.
- **Mie Scattering:** Crea el brillo blanquecino (glare) alrededor del sol.
- **Dinamsmo:** El color del cielo se recalcula en tiempo real basado en el vector de dirección del sol.

### B. Directional Light (El Sol)
Actúa como la fuente de luz primaria y el controlador del ciclo día/noche.
- **Propiedad Clave:** `bUsedAsAtmosphereSunLight`. Al rotar este actor, se actualiza el vector `SunDirection` en el shader de atmósfera.
- **Horizonte:** Si el sol baja del horizonte, el cielo entra en modo noche automáticamente, cambiando la dispersión de luz.

### C. Sky Light (Iluminación Ambiental)
Este componente es el que "baña" los objetos con la luz del entorno para que las sombras tengan color y detalle.
- **SourceType - Captured Scene:** El motor toma el render del Sky Atmosphere y genera un mapa de irradiación en tiempo real.
- **SourceType - Specified Cubemap (HDRI):** El usuario carga un archivo `.hdr` para definir la iluminación ambiental y los reflejos.
- **Salida Técnica:** Genera un **Irradiance Map** (para el color de las sombras) y un **Prefiltered Env Map** (para los reflejos metálicos).

## 3. Pipeline de Renderizado (PBR Workflow)
Para evitar una iluminación plana, el shader `Standard.wgsl` sigue esta ecuación de energía:
`Color Final = (Luz Directa * Sombras) + (Luz Ambiental * Oclusión Ambiental) + Emisivo`

## 4. Hoja de Ruta de Implementación

### Fase 1: Limpieza y Entorno Cero
- [x] Eliminar luces hardcodeadas en `Renderer.ts`.
- [x] Asegurar que si el mundo no tiene luces, se vea negro.

### Fase 2: Formalización de Componentes
- [x] Estandarizar `UDirectionalLightComponent` con soporte para dirección y color.
- [ ] Implementar el sistema de atmósfera procedimental (Rayleigh/Mie).
- [ ] Crear el `USkyLightComponent` para el manejo de IBL.

### Fase 3: El Gestor de Luces (Light Buffer)
- [ ] Crear el struct de datos de luces en `Renderer.ts` (`LightUniformBuffer`).
- [ ] Refactorizar `Standard.wgsl` para leer desde este buffer dinámico mediante un bucle.

### Fase 4: Post-Proceso y Lookdev
- [ ] Tone Mapping (ACES) para el manejo de altos rangos dinámicos.
- [ ] Exposición automática y corrección Gamma sRGB.