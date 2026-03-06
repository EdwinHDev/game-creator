struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    baseColor: vec4<f32>,
    roughness: f32,
    metallic: f32,
    shadowBias: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var baseColorSampler: sampler;
@group(0) @binding(2) var albedoMap: texture_2d<f32>;
@group(0) @binding(3) var roughnessMap: texture_2d<f32>;
@group(0) @binding(4) var normalMap: texture_2d<f32>;

struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    sunDirection: vec4<f32>,
    sunColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(1) var shadowMap: texture_depth_2d;
@group(1) @binding(2) var shadowSampler: sampler_comparison;

struct Light {
    direction: vec4<f32>,
    color: vec4<f32>, // rgb + intensidad en el canal w
};

struct LightData {
    lights: array<Light, 4>,
    lightCount: u32,
};
@group(1) @binding(3) var<uniform> lightData: LightData;

// --- GROUP 2: ENVIRONMENT (IBL) ---
@group(2) @binding(0) var irradianceMap: texture_cube<f32>;
@group(2) @binding(1) var environmentSampler: sampler;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) worldNormal: vec3<f32>,
    @location(1) worldPos: vec3<f32>,
    @location(2) shadowPos: vec4<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) tangent: vec4<f32>,
}

const PI: f32 = 3.14159265359;

// Función helper para calcular la inversa de una matriz 3x3 en WGSL
fn inverse3x3(m: mat3x3<f32>) -> mat3x3<f32> {
    let a00 = m[0][0]; let a01 = m[0][1]; let a02 = m[0][2];
    let a10 = m[1][0]; let a11 = m[1][1]; let a12 = m[1][2];
    let a20 = m[2][0]; let a21 = m[2][1]; let a22 = m[2][2];

    let b01 = a22 * a11 - a12 * a21;
    let b11 = -a22 * a10 + a12 * a20;
    let b21 = a21 * a10 - a11 * a20;

    let det = a00 * b01 + a01 * b11 + a02 * b21;
    let invDet = 1.0 / det;

    return mat3x3<f32>(
        b01 * invDet,
        (-a22 * a01 + a02 * a21) * invDet,
        (a12 * a01 - a02 * a11) * invDet,
        b11 * invDet,
        (a22 * a00 - a02 * a20) * invDet,
        (-a12 * a00 + a02 * a10) * invDet,
        b21 * invDet,
        (-a21 * a00 + a01 * a20) * invDet,
        (a11 * a00 - a01 * a10) * invDet
    );
}

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) tangent: vec4<f32>
) -> VertexOut {
    let worldPosVec4 = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    
    var out: VertexOut;
    out.pos = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
    out.worldPos = worldPosVec4.xyz;
    
    // CORRECCIÓN PROFESIONAL DE NORMALES:
    // Para evitar errores por escalas no-uniformes, usamos la matriz normal 
    // (Inversa Transpuesta de la matriz de modelo 3x3)
    let normalMatrix = transpose(inverse3x3(mat3x3<f32>(
        uniforms.modelMatrix[0].xyz,
        uniforms.modelMatrix[1].xyz,
        uniforms.modelMatrix[2].xyz
    )));
    
    out.worldNormal = normalize(normalMatrix * normal);
    
    // NORMAL BIAS: desplaza el punto de muestreo de sombra a lo largo de la normal
    // del mundo para evitar self-shadowing sin depender solo del depth bias.
    // 2 UU ≈ 2 cm a escala 100UU=1m — suficiente sin Peter Panning.
    let normalBiasOffset = out.worldNormal * 2.0;
    let shadowPosInput = vec4<f32>(worldPosVec4.xyz + normalBiasOffset, 1.0);
    out.shadowPos = scene.lightViewProj * shadowPosInput;
    
    out.uv = uv;
    // Phase 34: Convert the 3D tangential direction to world space
    out.tangent = vec4<f32>((uniforms.modelMatrix * vec4<f32>(tangent.xyz, 0.0)).xyz, tangent.w);
    return out;
}

// PBR Helper Functions
fn DistributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;
    let num = a2;
    var denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    return num / denom;
}

fn GeometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = (roughness + 1.0);
    let k = (r * r) / 8.0;
    let num = NdotV;
    let denom = NdotV * (1.0 - k) + k;
    return num / denom;
}

fn GeometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2 = GeometrySchlickGGX(NdotV, roughness);
    let ggx1 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn fetch_shadow(posUV: vec2<f32>, depth: f32, offset: vec2<f32>) -> f32 {
    let size = 1.0 / 2048.0;
    // textureSampleCompareLevel: callable from non-uniform control flow
    // offset is in texel units — caller controls the spread
    return textureSampleCompareLevel(shadowMap, shadowSampler, posUV + offset * size, depth);
}

// --- POISSON DISK 16 PUNTOS ---
// Distribución orgánica de muestras en un disco unitario.
// Elimina las "capas" y el patrón cuadriculado del PCF regular.
const poissonDisk = array<vec2<f32>, 32>(
    vec2<f32>(-0.613392, 0.617481),
    vec2<f32>(0.170299, -0.040254),
    vec2<f32>(-0.299417, 0.791925),
    vec2<f32>(0.645680, 0.493210),
    vec2<f32>(-0.651784, 0.717887),
    vec2<f32>(0.421346, 0.027031),
    vec2<f32>(-0.817194, -0.271096),
    vec2<f32>(-0.705474, -0.668203),
    vec2<f32>(0.977050, -0.108615),
    vec2<f32>(0.063326, 0.142369),
    vec2<f32>(0.203528, 0.214331),
    vec2<f32>(-0.667531, 0.326090),
    vec2<f32>(-0.098422, -0.295755),
    vec2<f32>(-0.885922, 0.215369),
    vec2<f32>(0.566637, 0.605213),
    vec2<f32>(0.039766, -0.396100),
    vec2<f32>(0.751946, 0.179642),
    vec2<f32>(0.191059, -0.829304),
    vec2<f32>(0.512613, -0.457173),
    vec2<f32>(-0.400329, 0.395781),
    vec2<f32>(-0.042846, -0.672583),
    vec2<f32>(0.669357, -0.252044),
    vec2<f32>(-0.258013, -0.320436),
    vec2<f32>(0.137837, 0.697412),
    vec2<f32>(-0.781609, -0.197341),
    vec2<f32>(-0.169123, 0.201201),
    vec2<f32>(0.301323, -0.396561),
    vec2<f32>(-0.627341, 0.612142),
    vec2<f32>(0.563065, -0.640621),
    vec2<f32>(0.246473, 0.311311),
    vec2<f32>(-0.584144, -0.641551),
    vec2<f32>(0.016335, -0.923412)
);

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // 1. LECTURA DE TEXTURAS Y DECODIFICACIÓN sRGB -> LINEAR (CRÍTICO PARA COLOR VIVO)
    let rawTexColor = textureSample(albedoMap, baseColorSampler, in.uv);
    // Quitar filtro sRGB a la textura para matemática pura
    let albedoLinear = pow(rawTexColor.rgb, vec3<f32>(2.2)); 
    
    let texRoughness = textureSample(roughnessMap, baseColorSampler, in.uv).r;
    
    var N = normalize(in.worldNormal);
    let mapNormal = textureSample(normalMap, baseColorSampler, in.uv).rgb;
    let localNormal = mapNormal * 2.0 - 1.0;

    if (length(in.tangent.xyz) > 0.001) {
        let T = normalize(in.tangent.xyz);
        let B = normalize(cross(N, T)) * in.tangent.w;
        let TBN = mat3x3<f32>(T, B, N);
        if (length(localNormal) > 0.01) {
            N = normalize(TBN * localNormal);
        }
    }
    
    // Quitar filtro sRGB al color base seleccionado en el panel UI
    let baseColorLinear = pow(uniforms.baseColor.rgb, vec3<f32>(2.2));
    let diffuseColor = baseColorLinear * albedoLinear;
    let finalRoughness = uniforms.roughness * texRoughness;

    let cameraPos = scene.cameraPosition.xyz;
    let V = normalize(cameraPos - in.worldPos);
    let shadowCoords = in.shadowPos.xyz / in.shadowPos.w;
    let flipCorrect = vec2<f32>(0.5, -0.5);
    let posUV = shadowCoords.xy * flipCorrect + 0.5;
    // --- SLOPE-SCALED BIAS ---
    // NdotL dinámico: más bias cuando el ángulo es rasante (evita shadow acné)
    let sunL      = normalize(lightData.lights[0].direction.xyz);
    let NdotL_b   = max(dot(N, sunL), 0.0);
    let slopeBias = uniforms.shadowBias + (1.0 - NdotL_b) * uniforms.shadowBias * 4.0;
    let depth = shadowCoords.z - slopeBias;

    // --- POISSON DISK SAMPLING — 32 MUESTRAS, ROTACIÓN PER-PÍXEL ---
    // Rotamos el disco usando un ruido basado en la posición de pantalla (in.pos.xy).
    // Esto rompe los patrones de "capas" y los convierte en un grano fino (dithering).
    // Radio de 4.0: Balance fino entre suavidad y ruido visual.
    let noise = hash22(in.pos.xy);
    let angle = noise.x * 6.28318530718;
    let s = sin(angle);
    let c = cos(angle);
    let rot = mat2x2<f32>(c, -s, s, c);

    var shadowVisibility = 0.0;
    let poissonRadius = 4.0; 
    for (var i = 0; i < 32; i++) {
        let offset = rot * poissonDisk[i] * poissonRadius;
        shadowVisibility += fetch_shadow(posUV, depth, offset);
    }
    shadowVisibility /= 32.0;

    // --- SOFT SHADOW BOUNDARY (Elimina el recuadro marcado) ---
    // Calculamos un factor de desvanecimiento suave cerca de los bordes del frustum [0.0, 1.0]
    // OBS: Usamos posUV (rango 0-1) para que el fade coincida con el mapa.
    let edgeFade = min(
        min(smoothstep(0.0, 0.1, posUV.x), smoothstep(1.0, 0.9, posUV.x)),
        min(smoothstep(0.0, 0.1, posUV.y), smoothstep(1.0, 0.9, posUV.y))
    );
    
    // Desvanece la sombra hacia 1.0 (sin sombra) en los bordes para un look natural
    shadowVisibility = mix(1.0, shadowVisibility, edgeFade);

    // Boundary: Check simple para Z (Near/Far clipping)
    let inFrustumZ = shadowCoords.z >= 0.0 && shadowCoords.z <= 1.0;
    shadowVisibility = select(1.0, shadowVisibility, inFrustumZ);


    // Cook-Torrance PBR Base Reflection
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, diffuseColor, uniforms.metallic);

    // Multi-Light PBR Loop (Phase 3 Lighting Architecture)
    var totalDirectLighting = vec3<f32>(0.0);
    for (var i = 0u; i < lightData.lightCount; i++) {
        let light = lightData.lights[i];
        let L = normalize(light.direction.xyz); // Direction TOWARDS the light source
        let H = normalize(V + L);
        let lightColorArr = light.color.rgb;
        let lightIntensityVal = light.color.w;

        // Cook-Torrance per light
        let NDF_l = DistributionGGX(N, H, finalRoughness);
        let G_l = GeometrySmith(N, V, L, uniforms.roughness);
        let F_l = fresnelSchlick(max(dot(H, V), 0.0), F0);

        let kS_l = F_l;
        var kD_l = vec3<f32>(1.0) - kS_l;
        kD_l *= 1.0 - uniforms.metallic;

        let numerator_l = NDF_l * G_l * F_l;
        let denominator_l = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
        let specular_l = numerator_l / denominator_l;

        let NdotL_l = max(dot(N, L), 0.0);
        let specularGain_l = mix(20.0, 0.0, uniforms.roughness);
        
        // Shadow only applies to the first light in this phase (Standard practice for simple forward)
        var visibility = 1.0;
        if (i == 0u) {
            visibility = shadowVisibility;
        }

        totalDirectLighting += (kD_l * diffuseColor / PI + specular_l * specularGain_l) * lightColorArr * lightIntensityVal * NdotL_l * visibility;
    }
    
    let directLighting = totalDirectLighting;
    
    // 2. IBL HDRI INTEGRADO (DIFUSO Y ESPECULAR)
    let F_ambient = fresnelSchlick(max(dot(N, V), 0.0), F0);

    // A) Reflejo Especular (Usando vector R)
    let R = reflect(-V, N);
    // Para el futuro: textureSampleLevel con mipmaps para roughness en SpecifiedCubemap
    let hdrSpecColor = textureSample(irradianceMap, environmentSampler, R).rgb;

    // Si el material NO es metálico, reducimos el reflejo especular al mínimo (4%) 
    let iblFactor = mix(0.04, 1.0, uniforms.metallic); 
    let ambientReflection = F_ambient * hdrSpecColor * (1.0 - finalRoughness) * iblFactor;

    // B) Iluminación Difusa Ambiental (Usando vector N)
    let hdrDiffColor = textureSample(irradianceMap, environmentSampler, N).rgb;

    let ambientDiffuse = hdrDiffColor * diffuseColor * (1.0 - uniforms.metallic) * 1.2;

    // Restaurar el flujo PBR estándar
    let finalColor = directLighting + ambientDiffuse + ambientReflection;

    // Aplica el gamma normal y fuerza la opacidad a 1.0 para depurar solidez
    return vec4<f32>(pow(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0/2.2)), 1.0);
}
