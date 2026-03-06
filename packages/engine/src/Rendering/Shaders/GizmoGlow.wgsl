struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    color: vec4<f32>,
    axisId: f32,
    inflation: f32,
    opacityScale: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
}

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOut {
    var out: VertexOut;
    // Inflate the mesh along the normal
    let inflatedPos = pos + normalize(normal) * uniforms.inflation;
    
    out.pos = uniforms.mvpMatrix * vec4<f32>(inflatedPos, 1.0);
    out.color = uniforms.color;
    
    // Pass transformed normal for Fresnel calculation
    // Using simple MVP transform for normalization in fragment shader
    out.normal = (uniforms.mvpMatrix * vec4<f32>(normal, 0.0)).xyz;
    
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // Soften edges using a simple screen-space Fresnel approximation
    // Objects facing the camera (center of cylinder) will be more transparent
    // Objects at the edges (tangent to view) will be more opaque
    let normalXY = normalize(in.normal.xy);
    let edgeRefactor = clamp(length(in.normal.xy), 0.0, 1.0);
    
    // We want the glow to be softer towards the outside
    // Fresnel = (1.0 - dot(N, V))^power. Here V is roughly (0,0,1) in clip space
    // So dot(N, V) is just N.z.
    let N = normalize(in.normal);
    let V = vec3<f32>(0.0, 0.0, 1.0);
    let fresnel = pow(1.0 - abs(dot(N, V)), 2.0);
    
    let alpha = in.color.a * uniforms.opacityScale * fresnel;
    
    return vec4<f32>(in.color.rgb, alpha);
}
