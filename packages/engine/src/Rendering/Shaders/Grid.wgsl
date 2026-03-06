struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    sunDirection: vec4<f32>,
    sunColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
    gridParams: vec4<f32>, // rgb = base color, w = opacity
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32> // Screen coordinates [-1, 1]
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var p = vec2<f32>(0.0);
    if(idx == 0u) { p = vec2(-1.0, -1.0); }
    else if(idx == 1u) { p = vec2( 1.0, -1.0); }
    else if(idx == 2u) { p = vec2(-1.0,  1.0); }
    else if(idx == 3u) { p = vec2(-1.0,  1.0); }
    else if(idx == 4u) { p = vec2( 1.0, -1.0); }
    else if(idx == 5u) { p = vec2( 1.0,  1.0); }
    
    var out: VertexOutput;
    // We render at the far plane (z=1.0 in NDC)
    out.pos = vec4<f32>(p, 1.0, 1.0);
    out.uv = p;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Unproject each screen pixel to the world far plane
    let p_ndc = vec4<f32>(in.uv, 1.0, 1.0);
    let p_world_h = scene.invViewProj * p_ndc;
    let p_world = p_world_h.xyz / p_world_h.w;
    
    let ray_origin = scene.cameraPosition.xyz;
    let ray_dir = normalize(p_world - ray_origin);
    
    // Intersect ray with ground plane (Y = 0)
    let t = -ray_origin.y / ray_dir.y;
    
    // Discard if we are looking above the horizon or the hit is behind us
    if (t <= 0.0) { discard; }
    
    let world_hit = ray_origin + t * ray_dir;
    
    // Procedural grid lines
    let coord = world_hit.xz / 100.0; // 100 units = 1 grid cell
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    let color_val = 1.0 - min(line, 1.0);
    
    // Fade based on distance to prevent aliasing at horizon
    let dist = length(world_hit - ray_origin);
    let fade = exp(-dist * 0.0005);
    
    // Axis coloring (X=Red, Z=Blue) to match gizmos
    let isX = 1.0 - saturate(abs(world_hit.z) / fwidth(world_hit.z));
    let isZ = 1.0 - saturate(abs(world_hit.x) / fwidth(world_hit.x));
    
    var finalColor = scene.gridParams.rgb; // Base dynamic grid color
    finalColor = mix(finalColor, vec3<f32>(1.0, 0.2, 0.2), isX);
    finalColor = mix(finalColor, vec3<f32>(0.2, 0.2, 1.0), isZ);
    
    let alpha = color_val * fade * scene.gridParams.w;
    if (alpha <= 0.01) { discard; }
    
    return vec4<f32>(finalColor, alpha);
}
