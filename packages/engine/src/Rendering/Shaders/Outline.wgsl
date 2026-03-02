struct Uniforms {
    mvpMatrix: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
}

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOut {
    var out: VertexOut;
    let thickness = 0.03;
    let pushedPos = pos + normalize(normal) * thickness;
    out.pos = uniforms.mvpMatrix * vec4<f32>(pushedPos, 1.0);
    return out;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.6, 0.0, 1.0); // Orange
}
