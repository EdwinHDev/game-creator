# 📏 Game Creator - Arquitectura de Escala y Unidades (Estándar UU)

## 1. Regla Fundamental: El Estándar Unreal
Para garantizar la compatibilidad con flujos de trabajo profesionales y precisión en cálculos físicos/lumínicos, Game Creator adopta las **Unreal Units (UU)**:

- **1 Unidad de Motor (1.0) = 1 Centímetro (cm).**
- **100 Unidades = 1 Metro (m).**

## 2. Configuración de Primitivos (Base Geometry)
Para que el flujo de trabajo sea intuitivo, todos los primitivos generados por el `UAssetManager` deben estar normalizados a metros en su tamaño base:

- **Cubo:** 100.0 x 100.0 x 100.0 unidades.
- **Plano:** 100.0 x 100.0 unidades.
- **Esfera/Cilindro:** 50.0 de radio y 100.0 de altura.

*Resultado:* Un actor con escala `(1, 1, 1)` medirá exactamente 1 metro cuadrado/cúbico en el mundo.

## 3. Óptica y Cámara
Debido al uso de centímetros, los rangos de precisión del Depth Buffer deben ajustarse para evitar el *Z-Fighting*:

- **Near Clip Plane:** 10.0 (Cualquier objeto a menos de 10cm de la cámara será recortado).
- **Far Clip Plane:** 200,000.0 (Rango de renderizado de 2 kilómetros).

## 4. Sistema de Rejilla (Grid) Profesional
La rejilla del editor debe reflejar estas unidades para ayudar al diseño de niveles:

- **Líneas Primarias (Métricas):** Dibujadas cada **100 UU**.
- **Líneas Secundarias (Centesimales):** Dibujadas cada **10 UU**.
- **Fading (Desvanecimiento):** La rejilla debe realizar un *fade-out* exponencial entre los 5,000 UU (50m) y 10,000 UU (100m) para mantener la claridad visual.

## 5. Físicas e Iluminación (Contrato Matemático)
- **Gravedad:** Definida por defecto en `-980.0` unidades/s².
- **Atenuación de Luz:** Se calcula basándose en el cuadrado inverso de la distancia en centímetros. Una luz con radio 500 iluminará un área de 5 metros.