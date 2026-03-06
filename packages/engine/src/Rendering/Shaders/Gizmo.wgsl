struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    color: vec4<f32>,
    axisId: f32,
    inflation: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(@location(0) pos: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOut {
    var out: VertexOut;
    var inflated_pos = pos;
    if (uniforms.inflation > 0.0) {
        inflated_pos = pos + normal * uniforms.inflation;
    }
    out.pos = uniforms.mvpMatrix * vec4<f32>(inflated_pos, 1.0);
    out.color = uniforms.color;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    if (uniforms.axisId > 0.5) {
        return vec4<f32>(uniforms.axisId / 255.0, 0.0, 0.0, 1.0);
    }
    return in.color;
}
