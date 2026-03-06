struct SceneUniforms {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    sunDirection: vec4<f32>,
    sunColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) worldPos: vec3<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    var uv = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    
    var out: VertexOutput;
    out.pos = vec4<f32>(pos[vertexIndex], 1.0, 1.0);
    out.uv = uv[vertexIndex];
    
    // Extrapolate world direction from inverse viewProj
    let ndcX = out.pos.x;
    let ndcY = out.pos.y;
    let ndcPos = vec4<f32>(ndcX, ndcY, 1.0, 1.0);
    var worldPosHover = scene.invViewProj * ndcPos;
    out.worldPos = (worldPosHover.xyz / worldPosHover.w) - scene.cameraPosition.xyz;
    
    return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let viewDir = normalize(input.worldPos);
    let sunDir = normalize(scene.sunDirection.xyz);
    
    // Gradiente de cielo (Rayleigh simplificado)
    let zenithColor = vec3<f32>(0.05, 0.15, 0.4);
    let horizonColor = vec3<f32>(0.4, 0.5, 0.7);
    let skyT = max(0.0, dot(viewDir, vec3<f32>(0.0, 1.0, 0.0)));
    var finalColor = mix(horizonColor, zenithColor, skyT);

    // Disco solar (Mie simplificado)
    let sunInfluence = max(0.0, dot(viewDir, sunDir));
    let sunSize = pow(sunInfluence, 1000.0); // Disco nítido solicitado
    let sunGlow = pow(sunInfluence, 20.0) * 0.5; // Halo
    
    finalColor += (scene.sunColor.rgb * sunSize) + (scene.sunColor.rgb * sunGlow);

    // HDR Tonemapping básico
    finalColor = 1.0 - exp(-finalColor * 1.5);
    
    return vec4<f32>(finalColor, 1.0);
}
