struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    baseColor: vec4<f32>,
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
}

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOut {
    var out: VertexOut;
    let worldPos = uniforms.modelMatrix * vec4<f32>(pos, 1.0);
    out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
    
    // Phase 22.2: Transform and Normalize Normal to World Space
    out.normal = normalize((uniforms.modelMatrix * vec4<f32>(normal, 0.0)).xyz);
    
    // Phase 22.3: Calculate Shadow Position
    out.shadowPos = scene.lightViewProj * worldPos;
    
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let L = normalize(-scene.lightDirection.xyz);
    
    let diffuseIntensity = max(dot(N, L), 0.0);
    
    // Phase 22.3: Shadow Calculation
    let shadowCoords = in.shadowPos.xyz / in.shadowPos.w;
    // Convert from clips-space [-1, 1] to UV [0, 1]. 
    let flipCorrect = vec2<f32>(0.5, -0.5);
    let posUV = shadowCoords.xy * flipCorrect + 0.5;
    
    // Apply dynamic bias (Phase 22.3: 0.005 fixed as requested)
    let shadowVisibility = textureSampleCompare(
        shadowMap,
        shadowSampler,
        posUV,
        shadowCoords.z - 0.005
    );
    
    let ambient = 0.2;
    let lighting = (ambient + (diffuseIntensity * scene.lightColor.rgb * shadowVisibility));
    
    return vec4<f32>(uniforms.baseColor.rgb * lighting, uniforms.baseColor.a);
}
