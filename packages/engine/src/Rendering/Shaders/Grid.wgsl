struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) nearPoint: vec3<f32>,
    @location(1) farPoint: vec3<f32>,
};

fn unprojectPoint(x: f32, y: f32, z: f32, viewProjInv: mat4x4<f32>) -> vec3<f32> {
    let unprojectedPoint = viewProjInv * vec4<f32>(x, y, z, 1.0);
    return unprojectedPoint.xyz / unprojectedPoint.w;
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
    );
    
    let p = pos[vertexIndex];
    var out: VertexOutput;
    out.nearPoint = unprojectPoint(p.x, p.y, 0.0, scene.invViewProj);
    out.farPoint = unprojectPoint(p.x, p.y, 1.0, scene.invViewProj);
    out.position = vec4<f32>(p, 0.0, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let t = -in.nearPoint.y / (in.farPoint.y - in.nearPoint.y);
    if (t < 0.0) { discard; }
    
    let worldPos = in.nearPoint + t * (in.farPoint - in.nearPoint);
    
    // Grid calculation using fwidth for anti-aliasing
    let coord = worldPos.xz;
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    let color = 1.0 - min(line, 1.0);
    
    // Distance fading
    let dist = length(worldPos.xz - scene.cameraPosition.xz);
    let alpha = color * (1.0 - smoothstep(10.0, 100.0, dist));
    
    // Axes colors
    var gridColor = vec3<f32>(0.3);
    if (abs(worldPos.x) < 0.1) {
        gridColor = vec3<f32>(0.2, 0.2, 1.0); // Z Axis (Blue line at x=0) - Correction: x=0 is Z axis
    }
    if (abs(worldPos.z) < 0.1) {
        gridColor = vec3<f32>(1.0, 0.2, 0.2); // X Axis (Red line at z=0)
    }

    // Depth correction (ensuring it writes to depth correctly if needed, but here we just blend)
    // Actually, we could calculate the depth from the world position if we wanted to interact with geometry depth.
    // clipSpacePos = viewProj * worldPos;
    // depth = clipSpacePos.z / clipSpacePos.w;
    
    return vec4<f32>(gridColor, alpha * 0.5);
}
