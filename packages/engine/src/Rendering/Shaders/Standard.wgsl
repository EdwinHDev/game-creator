struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    baseColor: vec4<f32>,
    roughness: f32,
    metallic: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct SceneUniforms {
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(1) var shadowMap: texture_depth_2d;
@group(1) @binding(2) var shadowSampler: sampler_comparison;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) shadowPos: vec4<f32>,
    @location(2) worldPos: vec3<f32>,
}

const PI: f32 = 3.14159265359;

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOut {
    var out: VertexOut;
    let worldPos4 = uniforms.modelMatrix * vec4<f32>(pos, 1.0);
    out.worldPos = worldPos4.xyz;
    out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
    
    out.normal = normalize((uniforms.modelMatrix * vec4<f32>(normal, 0.0)).xyz);
    out.shadowPos = scene.lightViewProj * worldPos4;
    
    return out;
}

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
    let cameraPos = vec3<f32>(0.0, 0.0, 0.0); // Simplified for now
    let N = normalize(in.normal);
    let V = normalize(cameraPos - in.worldPos);
    let L = normalize(-scene.lightDirection.xyz);
    let H = normalize(V + L);

    // Cook-Torrance PBR
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, uniforms.baseColor.rgb, uniforms.metallic);

    let NDF = DistributionGGX(N, H, uniforms.roughness);
    let G = GeometrySmith(N, V, L, uniforms.roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - uniforms.metallic;

    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    // Shadow Calculation
    let shadowCoords = in.shadowPos.xyz / in.shadowPos.w;
    let flipCorrect = vec2<f32>(0.5, -0.5);
    let posUV = shadowCoords.xy * flipCorrect + 0.5;
    let shadowVisibility = textureSampleCompare(shadowMap, shadowSampler, posUV, shadowCoords.z - 0.005);

    let NdotL = max(dot(N, L), 0.0);
    // Phase 24.5: Massive Specular Boost (5.0) for high-impact glints
    let directLighting = (kD * uniforms.baseColor.rgb / PI + specular * 5.0) * scene.lightColor.rgb * NdotL * shadowVisibility;
    
    // Phase 24.6: Hemispheric Ambient Lighting
    let skyColor = vec3<f32>(0.1, 0.2, 0.4);
    let groundColor = vec3<f32>(0.1, 0.1, 0.1);
    let upFactor = dot(N, vec3<f32>(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    let hemiLight = mix(groundColor, skyColor, upFactor);
    let ambient = hemiLight * uniforms.baseColor.rgb;

    let color = ambient + directLighting;

    // HDR / Tonemapping (simplified)
    let finalColor = color / (color + vec3<f32>(1.0));
    
    return vec4<f32>(finalColor, uniforms.baseColor.a);
}
