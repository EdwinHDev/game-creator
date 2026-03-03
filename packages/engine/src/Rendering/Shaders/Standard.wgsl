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
    cameraPosition: vec4<f32>,
    invViewProj: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(1) var shadowMap: texture_depth_2d;
@group(1) @binding(2) var shadowSampler: sampler_comparison;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) worldPos: vec3<f32>,
    @location(2) shadowPos: vec4<f32>,
}

const PI: f32 = 3.14159265359;

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOut {
    let worldPosVec4 = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    
    var out: VertexOut;
    out.pos = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
    out.worldPos = worldPosVec4.xyz;
    // We treat normal transformation simply for now. Ideally use inverse transpose of modelMatrix.
    out.normal = (uniforms.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
    out.shadowPos = scene.lightViewProj * worldPosVec4;
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
    let cameraPos = scene.cameraPosition.xyz;
    let N = normalize(in.normal);
    let V = normalize(cameraPos - in.worldPos);
    let L = normalize(-scene.lightDirection.xyz);
    let H = normalize(V + L);

    // Cook-Torrance PBR
    var F0 = vec3<f32>(0.04);
    // Phase 27: Force white sun reflections for metals instead of tinting by baseColor
    // Phase 28: Using correct ambient F0 for metals
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
    // Phase 27: Hyper-Intense Specular (20.0)
    let directLighting = (kD * uniforms.baseColor.rgb / PI + specular * 20.0) * scene.lightColor.rgb * NdotL * shadowVisibility;
    
    // Phase 26.1: Dynamic Sky IBL
    let sunY = scene.lightDirection.y;
    var skyColor: vec3<f32>;
    let groundColor = vec3<f32>(0.1, 0.1, 0.1); // Fixed dark ground

    if (sunY < -0.1) {
        skyColor = vec3<f32>(0.1, 0.3, 0.8);
    } else if (sunY < 0.3) {
        let t = (sunY + 0.1) / 0.4;
        skyColor = mix(vec3<f32>(0.1, 0.3, 0.8), vec3<f32>(0.4, 0.1, 0.5), t);
    } else if (sunY < 0.6) {
        let t = (sunY - 0.3) / 0.3;
        skyColor = mix(vec3<f32>(0.4, 0.1, 0.5), vec3<f32>(0.0, 0.0, 0.05), t);
    } else {
        skyColor = vec3<f32>(0.0, 0.0, 0.05);
    }

    let upFactor = dot(N, vec3<f32>(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    let hemiLight = mix(groundColor, skyColor, upFactor);
    
    // Phase 27.2: Fake Sun Disk & IBL Specular Simulation
    let R = reflect(-V, N);

    // 1. Procedural Sun Disk
    let dotSR = max(dot(R, L), 0.0); // R compared to the light direction (L)
    let sunDiskIntensity = pow(dotSR, 2000.0) * 10.0;
    
    // Only apply sun disk if we have line of sight from the sun
    let sunDisk = sunDiskIntensity * scene.lightColor.rgb * shadowVisibility;

    // Phase 28: Energy Conservation Polish
    // 2. Ambient base reflection (Fresnel injected with sky color)
    let F_ambient = fresnelSchlick(max(dot(N, V), 0.0), F0);
    let ambientReflection = F_ambient * skyColor * 0.5; // Scaled down for fake IBL

    // The core ambient illumination (Metals have 0 diffuse ambient)
    let ambientDiffuse = hemiLight * uniforms.baseColor.rgb * (1.0 - uniforms.metallic);
    let ambient = ambientDiffuse + ambientReflection;

    let color = ambient + directLighting + sunDisk;

    // HDR / Tonemapping (simplified)
    let finalColor = color / (color + vec3<f32>(1.0));
    
    return vec4<f32>(finalColor, uniforms.baseColor.a);
}
