struct Uniforms {
    mvpMatrix: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec3<f32>,
    @location(1) localPos: vec3<f32>,
}

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) color: vec3<f32>
) -> VertexOut {
    var out: VertexOut;
    out.pos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
    out.color = color;
    out.localPos = pos;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let dist = length(in.localPos.xz);
    let alpha = 1.0 - smoothstep(40.0, 100.0, dist);
    return vec4<f32>(in.color, alpha);
}
