struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
    );
    var out: VertexOut;
    out.pos = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    out.uv = pos[vertexIndex];
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // Unproject pixel to world space at y=0
    let far = scene.invViewProj * vec4<f32>(in.uv, 1.0, 1.0);
    let near = scene.invViewProj * vec4<f32>(in.uv, 0.0, 1.0);
    
    let farWorld = far.xyz / far.w;
    let nearWorld = near.xyz / near.w;
    let dir = normalize(farWorld - nearWorld);
    
    // Intersection with plane y=0
    // p = nearWorld + t * dir -> nearWorld.y + t * dir.y = 0 -> t = -nearWorld.y / dir.y
    if (abs(dir.y) < 0.0001) { discard; }
    let t = -nearWorld.y / dir.y;
    if (t < 0.0) { discard; }
    
    let worldPos = nearWorld + t * dir;
    
    // Grid calculation
    let coord = worldPos.xz;
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    let color = 1.0 - min(line, 1.0);
    
    // Distance fading
    let dist = length(worldPos.xz - scene.cameraPosition.xz);
    let alpha = color * (1.0 - smoothstep(20.0, 100.0, dist));
    
    // Main axes
    var gridColor = vec3<f32>(0.3);
    if (abs(worldPos.x) < 0.1) { gridColor = vec3<f32>(0.2, 0.2, 1.0); }
    if (abs(worldPos.z) < 0.1) { gridColor = vec3<f32>(1.0, 0.2, 0.2); }

    return vec4<f32>(gridColor, alpha * 0.5);
}
