struct Scene { mvpMatrix: mat4x4<f32> };
@group(0) @binding(0) var<uniform> scene: Scene;

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
    return scene.mvpMatrix * vec4<f32>(position, 1.0);
}
