struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    sunDirection: vec4<f32>,
    sunColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) nearPoint: vec3<f32>,
    @location(1) farPoint: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
    );
    let p = pos[VertexIndex];
    
    var output: VertexOutput;
    output.position = vec4<f32>(p, 0.0, 1.0);
    output.nearPoint = unprojectPoint(p.x, p.y, 0.0, scene.invViewProj);
    output.farPoint = unprojectPoint(p.x, p.y, 1.0, scene.invViewProj);
    return output;
}

fn unprojectPoint(x: f32, y: f32, z: f32, invVP: mat4x4<f32>) -> vec3<f32> {
    let unprojected = invVP * vec4<f32>(x, y, z, 1.0);
    return unprojected.xyz / unprojected.w;
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @builtin(frag_depth) depth: f32,
};

@fragment
fn fs_main(input: VertexOutput) -> FragmentOutput {
    let rayDir = input.farPoint - input.nearPoint;
    let t = -input.nearPoint.y / rayDir.y;
    
    // Si el rayo no intersecta el plano Y=0 o está detrás de la cámara:
    if (t <= 0.0 || isnan(t)) { discard; }
    
    let worldPos = input.nearPoint + t * rayDir;
    
    // Generar la grilla normal
    let grid = max(makeGrid(worldPos, 0.1), makeGrid(worldPos, 0.01));
    
    // Desvanecimiento radial suave desde la posicion de la cámara
    let d = distance(scene.cameraPosition.xz, worldPos.xz);
    let horizonDistance = 100.0; // Distancia donde la grid desaparece suavemente
    let smoothFade = smoothstep(horizonDistance, horizonDistance * 0.5, d);
    
    let alpha = grid * smoothFade * 0.5;
    
    // Área invisible si no hay grid o estamos muy lejos
    if (alpha <= 0.0) { discard; }
    
    // Colores base de los ejes
    let colorX = vec3<f32>(0.9, 0.1, 0.1); // Red (X Axis)
    let colorZ = vec3<f32>(0.1, 0.1, 0.9); // Blue (Z Axis)
    let gridColorBase = vec3<f32>(0.3, 0.3, 0.3);
    
    // Resaltar ejes centrales (X=0 y Z=0)
    let fwidthX = fwidth(worldPos.x);
    let fwidthZ = fwidth(worldPos.z);
    let isZAxis = 1.0 - min(abs(worldPos.x) / fwidthX, 1.0);
    let isXAxis = 1.0 - min(abs(worldPos.z) / fwidthZ, 1.0);
    
    var finalColor = gridColorBase;
    if (isXAxis > 0.0) { finalColor = mix(finalColor, colorX, isXAxis); }
    if (isZAxis > 0.0) { finalColor = mix(finalColor, colorZ, isZAxis); }
    
    let clipPos = scene.viewProj * vec4<f32>(worldPos, 1.0);
    let depth = clipPos.z / clipPos.w;
    
    var output: FragmentOutput;
    if (alpha <= 0.0) {
        output.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        output.depth = 1.0;
        discard;
    } else {
        output.color = vec4<f32>(finalColor, alpha);
        output.depth = depth;
    }
    return output;
}

fn makeGrid(pos: vec3<f32>, scale: f32) -> f32 {
    let coord = pos.xz * scale;
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
}
