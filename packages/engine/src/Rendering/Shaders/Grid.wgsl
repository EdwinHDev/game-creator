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
    var pos = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0)
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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Calcular intersección con el plano del suelo (Y=0)
    let t = -input.nearPoint.y / (input.farPoint.y - input.nearPoint.y);
    
    // Descartar fragmentos por encima del horizonte o detrás de la cámara
    if (t <= 0.0) { discard; }
    
    let worldPos = input.nearPoint + t * (input.farPoint - input.nearPoint);
    
    // 2. Generar rejilla matemática (10cm y 1m en unidades Unreal)
    let grid10 = makeGrid(worldPos, 0.1);    // Rejilla de 10 unidades (10cm)
    let grid100 = makeGrid(worldPos, 0.01);  // Rejilla de 100 unidades (1m)
    let grid = max(grid10, grid100);
    
    // 3. --- CALIBRACIÓN DE FADING PROFESIONAL ---
    // Usamos una caída exponencial: fade = e^(-distancia * factor)
    // Escala grande: visible hasta los ~50 metros (5000 unidades).
    let fade = exp(-t * 0.0005); 
    
    // 4. Color y Opacidad
    let baseColor = vec3<f32>(0.2, 0.2, 0.2); // Gris oscuro neutro
    let finalAlpha = grid * fade * 0.5;      // 0.5 es el brillo máximo cerca
    
    // Evitar renderizar píxeles casi invisibles
    if (finalAlpha < 0.01) { discard; }

    return vec4<f32>(baseColor, finalAlpha);
}

fn makeGrid(pos: vec3<f32>, scale: f32) -> f32 {
    let coord = pos.xz * scale;
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
}
