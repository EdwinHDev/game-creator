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
    // Generate full-screen triangle
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    // uv.y maps from 0 (top) to 1 (bottom) in the visible screen bounds
    var uv = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    
    var out: VertexOut;
    // Z = 1.0 forces it to the far clip plane
    out.pos = vec4<f32>(pos[vertexIndex], 1.0, 1.0);
    out.uv = uv[vertexIndex];
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // 1. Calculate World Ray (View Direction)
    let ndcX = in.uv.x * 2.0 - 1.0;
    let ndcY = 1.0 - in.uv.y * 2.0; // Standard UV to NDC
    let ndcPos = vec4<f32>(ndcX, ndcY, 1.0, 1.0);
    
    var worldPosHover = scene.invViewProj * ndcPos;
    worldPosHover = worldPosHover / worldPosHover.w;
    
    let V = normalize(worldPosHover.xyz - scene.cameraPosition.xyz);
    let L = normalize(-scene.lightDirection.xyz); // Direction TO sun
    
    // 2. Atmospheric Sky Gradient (Unreal Style)
    let sunY = L.y;
    let viewY = V.y;
    
    // Base Zenith and Horizon colors adjusted by sun height
    var zenithColor = vec3<f32>(0.05, 0.1, 0.4);
    var horizonColor = vec3<f32>(0.4, 0.5, 0.7);
    
    if (sunY < 0.2) {
        // Sunset colors
        let sunsetFactor = clamp((sunY + 0.1) / 0.3, 0.0, 1.0);
        zenithColor = mix(vec3<f32>(0.05, 0.05, 0.1), zenithColor, sunsetFactor);
        horizonColor = mix(vec3<f32>(0.8, 0.3, 0.1), horizonColor, sunsetFactor);
    }
    
    // Simple vertical gradient based on V.y (height)
    let height = clamp(viewY * 1.5, 0.0, 1.0);
    var skyColor = mix(horizonColor, zenithColor, pow(height, 0.6));
    
    // 3. Fake Sun Bloom Integration
    let dotVL = max(dot(V, L), 0.0);
    let sunIntensity = scene.lightColor.w;
    let sunGlow = pow(dotVL, 128.0) * horizonColor * sunIntensity; // Soft atmosphere glow
    let sunDisk = pow(dotVL, 2048.0) * scene.lightColor.rgb * 5.0 * sunIntensity; // Brighter disk
    
    skyColor += sunGlow + sunDisk;
    
    // Ground placeholder (to avoid seeing weird artifacts below horizon)
    if (viewY < 0.0) {
        skyColor = vec3<f32>(0.02, 0.02, 0.02);
    }

    // HDR Tonemapping for sky
    skyColor = skyColor / (skyColor + vec3<f32>(1.0));

    return vec4<f32>(skyColor, 1.0);
}
