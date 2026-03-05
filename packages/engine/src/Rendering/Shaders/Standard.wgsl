struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    baseColor: vec4<f32>,
    roughness: f32,
    metallic: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var baseColorSampler: sampler;
@group(0) @binding(2) var albedoMap: texture_2d<f32>;
@group(0) @binding(3) var roughnessMap: texture_2d<f32>;
@group(0) @binding(4) var normalMap: texture_2d<f32>;

struct SceneUniforms {
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    invViewProj: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(1) var shadowMap: texture_depth_2d;
@group(1) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(3) var envMap: texture_2d<f32>;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) worldPos: vec3<f32>,
    @location(2) shadowPos: vec4<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) tangent: vec4<f32>,
}

const PI: f32 = 3.14159265359;

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
    // We treat normal transformation simply for now. Ideally use inverse transpose of modelMatrix.
    out.normal = (uniforms.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
    out.shadowPos = scene.lightViewProj * worldPosVec4;
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

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // 1. LECTURA DE TEXTURAS Y DECODIFICACIÓN sRGB -> LINEAR (CRÍTICO PARA COLOR VIVO)
    let rawTexColor = textureSample(albedoMap, baseColorSampler, in.uv);
    // Quitar filtro sRGB a la textura para matemática pura
    let albedoLinear = pow(rawTexColor.rgb, vec3<f32>(2.2)); 
    
    let texRoughness = textureSample(roughnessMap, baseColorSampler, in.uv).r;
    
    var N = normalize(in.normal);
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
    let L = normalize(-scene.lightDirection.xyz);
    let H = normalize(V + L);

    // Cook-Torrance PBR
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, diffuseColor, uniforms.metallic);

    let NDF = DistributionGGX(N, H, finalRoughness);
    let G = GeometrySmith(N, V, L, uniforms.roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - uniforms.metallic;

    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    let shadowCoords = in.shadowPos.xyz / in.shadowPos.w;
    let flipCorrect = vec2<f32>(0.5, -0.5);
    let posUV = shadowCoords.xy * flipCorrect + 0.5;
    let shadowVisibility = textureSampleCompare(shadowMap, shadowSampler, posUV, shadowCoords.z - 0.005);

    let NdotL = max(dot(N, L), 0.0);
    let specularGain = mix(20.0, 0.0, uniforms.roughness);
    let directLighting = (kD * diffuseColor / PI + specular * specularGain) * scene.lightColor.rgb * NdotL * shadowVisibility;
    
    // 2. IBL HDRI INTEGRADO (DIFUSO Y ESPECULAR)
    let envDims = vec2<f32>(textureDimensions(envMap));
    let invAtan = vec2<f32>(0.1591, 0.3183);

    // A) Reflejo Especular (Usando vector R)
    let R = reflect(-V, N);
    var uvEnvSpec = vec2<f32>(atan2(R.z, R.x), asin(R.y));
    uvEnvSpec = uvEnvSpec * invAtan + 0.5;
    let texelX_Spec = u32(clamp(uvEnvSpec.x * envDims.x, 0.0, envDims.x - 1.0));
    let texelY_Spec = u32(clamp((1.0 - uvEnvSpec.y) * envDims.y, 0.0, envDims.y - 1.0));
    let hdrSpecColor = textureLoad(envMap, vec2<u32>(texelX_Spec, texelY_Spec), 0u).rgb;

    let F_ambient = fresnelSchlick(max(dot(N, V), 0.0), F0);
    let roughnessAttenuation = 1.0 - finalRoughness;
    
    // TRUCO IBL: Si no es metálico, reducimos la fuerza del reflejo HDRI nítido 
    // para simular la dispersión de luz de un material dieléctrico.
    let specIntensity = mix(0.1, 1.0, uniforms.metallic); 

    let ambientReflection = F_ambient * hdrSpecColor * roughnessAttenuation * specIntensity;

    // B) Iluminación Difusa Ambiental (Usando vector N en el HDRI)
    var uvEnvDiff = vec2<f32>(atan2(N.z, N.x), asin(N.y));
    uvEnvDiff = uvEnvDiff * invAtan + 0.5;
    let texelX_Diff = u32(clamp(uvEnvDiff.x * envDims.x, 0.0, envDims.x - 1.0));
    let texelY_Diff = u32(clamp((1.0 - uvEnvDiff.y) * envDims.y, 0.0, envDims.y - 1.0));
    let hdrDiffColor = textureLoad(envMap, vec2<u32>(texelX_Diff, texelY_Diff), 0u).rgb;

    // Escalar la luz ambiente a la mitad para que no asfixie la textura
    let ambientDiffuse = hdrDiffColor * diffuseColor * (1.0 - uniforms.metallic);

    let ambient = ambientDiffuse + ambientReflection;
    let color = ambient + directLighting;

    // 3. COLOR GRADING FINAL NEUTRO Y CODIFICACIÓN GAMMA
    let exposure = 1.0; 
    let exposedColor = color * exposure;

    let mappedColor = clamp(exposedColor, vec3<f32>(0.0), vec3<f32>(1.0));
    
    // Volver a aplicar el filtro sRGB para el monitor
    let gamma = 2.2;
    let gammaCorrected = pow(mappedColor, vec3<f32>(1.0 / gamma));
    
    return vec4<f32>(gammaCorrected, uniforms.baseColor.a * rawTexColor.a);
}
