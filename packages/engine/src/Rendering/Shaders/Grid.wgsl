struct SceneData {
    viewProjMatrix: mat4x4<f32>,
    invViewProjMatrix: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneData;

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
    output.nearPoint = unprojectPoint(p.x, p.y, 0.0, scene.invViewProjMatrix);
    output.farPoint = unprojectPoint(p.x, p.y, 1.0, scene.invViewProjMatrix);
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
    let t = -input.nearPoint.y / (input.farPoint.y - input.nearPoint.y);
    if (t <= 0.0 || t > 10000.0) { discard; } // Límite físico de 100 metros (10,000 unidades)
    
    let worldPos = input.nearPoint + t * (input.farPoint - input.nearPoint);
    
    // Generar la grilla normal
    let grid = max(makeGrid(worldPos, 0.01), makeGrid(worldPos, 0.001));
    
    // Colores base de los ejes (Iguales a los del Transform Gizmo)
    let colorX = vec3<f32>(1.0, 0.2, 0.2); // Red (X Axis)
    let colorZ = vec3<f32>(0.2, 0.2, 1.0); // Blue (Z Axis)
    let gridColorBase = vec3<f32>(0.2, 0.2, 0.2);
    
    // Determinar si el píxel cae sobre algun eje central matemáticamente igual al grid
    let fwidthX = fwidth(worldPos.x);
    let fwidthZ = fwidth(worldPos.z);
    
    // El grosor matemático de la línea en makeGrid es abs(P) / fwidth(P) limitándose a 1.0 (1 pixel de degradado)
    let isZAxis = 1.0 - min(abs(worldPos.x) / fwidthX, 1.0); // Z Axis (X=0)
    let isXAxis = 1.0 - min(abs(worldPos.z) / fwidthZ, 1.0); // X Axis (Z=0)
    
    var finalColor = gridColorBase;
    
    // Mezclar colores si cae en un eje principal
    if (isXAxis > 0.0) {
        finalColor = mix(finalColor, colorX, isXAxis);
    }
    if (isZAxis > 0.0) {
        finalColor = mix(finalColor, colorZ, isZAxis);
    }
    
    // Desvanecimiento radial suave desde la posicion de la cámara
    let d = distance(scene.cameraPosition.xz, worldPos.xz);
    let horizonDistance = 4000.0; // Distancia donde la grid desaparece
    let radialFade = clamp(1.0 - (d / horizonDistance), 0.0, 1.0);
    // Transicion mas suave usando smoothstep para que se difumine placenteramente
    let smoothFade = smoothstep(0.0, 1.0, radialFade);
    
    let clipPos = scene.viewProjMatrix * vec4<f32>(worldPos, 1.0);
    let depth = clipPos.z / clipPos.w;
    
    var output: FragmentOutput;
    // Usamos el grid nativo garantizando que colorX/Z no cambien el alfa base
    output.color = vec4<f32>(finalColor, grid * smoothFade * 0.5);
    output.depth = depth;
    return output;
}

fn makeGrid(pos: vec3<f32>, scale: f32) -> f32 {
    let coord = pos.xz * scale;
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
}
