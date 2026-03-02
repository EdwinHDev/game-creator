struct Uniforms {
    mvpMatrix: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
    return uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
}
