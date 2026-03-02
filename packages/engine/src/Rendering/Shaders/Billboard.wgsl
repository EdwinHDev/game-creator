struct BillboardUniforms {
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    worldPos: vec3<f32>,
    size: f32,
    color: vec4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: BillboardUniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@location(0) pos: vec2<f32>) -> VertexOut {
    var out: VertexOut;
    let posView = (uniforms.viewMatrix * vec4<f32>(uniforms.worldPos, 1.0)).xyz;
    let offset = pos * uniforms.size;
    out.pos = uniforms.projectionMatrix * vec4<f32>(posView.xy + offset, posView.z, 1.0);
    out.uv = pos * 0.5 + 0.5;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let dist = length(in.uv - 0.5);
    if (dist > 0.45) { discard; }
    let color = uniforms.color.rgb;
    let glow = 1.0 - smoothstep(0.2, 0.45, dist);
    return vec4<f32>(color, uniforms.color.a * glow);
}
