# 🌌 LIGHTING_ARCHITECTURE.md (v3.0 - Unreal Engine Standard)

## 1. Filosofía Sistémica
La iluminación en *Game Creator* no es un post-proceso, sino un **Pipeline de Datos Físicos**. Ningún objeto debe tener sombras negras puras; cada píxel debe responder a la interacción entre la luz directa, la dispersión atmosférica y la luz ambiental (IBL).

### Directivas de Escala
- **100 Unidades de Motor (UU) = 1 Metro**.
- Todas las intensidades lumínicas y cálculos de sombras se rigen por esta escala.

---

## 2. El Ecosistema Atmosférico (Visual del Cielo)
Sustituimos los fondos planos por un simulador planetario basado en física.

### A. Sky Atmosphere System
- **Modelo Físico:** Implementación de dispersión de **Rayleigh** (genera el azul del cielo) y **Mie** (bruma y halo solar).
- **Shader Procedimental (`Sky.wgsl`):** Calcula el color del cenit, el horizonte y el disco solar en tiempo real basándose exclusivamente en el vector de dirección del sol. No utiliza texturas estáticas.
- **Renderizado:** Se dibuja como una esfera infinita antes que cualquier otro objeto, sin escribir en el Z-Buffer.

### B. Directional Light (El Sol)
- **Actor Controlador:** Actúa como el cerebro del cielo mediante la bandera `bUsedAsAtmosphereSunLight`.
- **Sincronización:** Su rotación (`FRotator`) determina la posición del sol en el firmamento. Al bajar del horizonte, el sistema transiciona automáticamente a modo noche.

---

## 3. Oclusión Profesional (Sombras)
Las sombras deben ser estables, suaves y proporcionales a la escala del mundo.

### A. Frustum Fitting Dinámico
- La cámara de sombras no es estática. Debe **centrarse en la posición de la cámara del jugador** pero alinearse con la dirección del sol, asegurando que el área visible siempre tenga sombras de alta calidad.
- **Área de Cobertura:** 50 metros a la redonda (5000 UU) como estándar para el frustum ortográfico.

### B. Suavizado Avanzado (PCF)
- **Percentage Closer Filtering (PCF):** El shader `Standard.wgsl` realiza un muestreo de 4x4 (16 muestras) sobre el mapa de sombras para generar bordes suaves y cinematográficos.

### C. Slope-Scaled Bias
- El bias se calcula dinámicamente según la inclinación de la cara del objeto para eliminar el *Shadow Acne* sin provocar que las sombras "vuelen" (*Peter Panning*).

---

## 4. Image-Based Lighting - IBL (Luz Ambiental)
Es el sistema encargado de bañar las sombras con el color del entorno.

### A. USkyLightComponent
- **Modo CapturedScene:** Toma un muestreo 360° del *Sky Atmosphere* para generar un **Irradiance Map** (difuso) y un **Specular Map** (reflejos).
- **Modo HDRI:** Permite cargar archivos `.hdr` externos para iluminar escenas con datos fotorrealistas.

---

## 5. Pipeline PBR Unificado (Materiales)
El shader `Standard.wgsl` debe aplicar la ecuación de energía profesional:
`Color Final = (LuzDirecta * Sombras) + (LuzAmbiental * OclusiónAmbiental) + Emisivo`

---

## 6. Hoja de Ruta de Reconstrucción

### Fase 1: Purga y Estandarización
- [ ] Eliminar toda lógica de "suelo negro" o trucos visuales en los shaders.
- [ ] Implementar la rotación del Sol basada en la matriz de mundo real del Actor.

### Fase 2: Sombras Profesionales
- [ ] Configurar la cámara de sombras para que siga a la cámara del usuario.
- [ ] Implementar el filtro PCF de 16 muestras en el shader Standard.

### Fase 3: Integración IBL
- [ ] Activar la captura del SkyLight para que las sombras se tiñan del azul de la atmósfera.
- [ ] Añadir soporte nativo para archivos HDRI.