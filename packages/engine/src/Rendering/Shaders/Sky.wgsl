struct SceneUniforms {
    lightDirection: vec4<f32>,
    lightColor: vec4<f32>,
    lightViewProj: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    invViewProj: mat4x4<f32>,
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
    let sunY = scene.lightDirection.y;
    var topColor: vec3<f32>;
    var bottomColor: vec3<f32>;

    if (sunY < -0.1) {
        // Day
        topColor = vec3<f32>(0.1, 0.3, 0.8);     // Azul oscuro
        bottomColor = vec3<f32>(0.4, 0.7, 1.0);  // Azul claro
    } else if (sunY < 0.3) {
        // Sunset / Sunrise (interpolating from -0.1 to 0.3)
        let t = (sunY + 0.1) / 0.4;
        
        let dayTop = vec3<f32>(0.1, 0.3, 0.8);
        let dayBot = vec3<f32>(0.4, 0.7, 1.0);
        
        let duskTop = vec3<f32>(0.4, 0.1, 0.5); // Púrpura
        let duskBot = vec3<f32>(1.0, 0.4, 0.1); // Naranja
        
        topColor = mix(dayTop, duskTop, t);
        bottomColor = mix(dayBot, duskBot, t);
    } else if (sunY < 0.6) {
        // Dusk into Night
        let t = (sunY - 0.3) / 0.3;
        
        let duskTop = vec3<f32>(0.4, 0.1, 0.5);
        let duskBot = vec3<f32>(1.0, 0.4, 0.1);
        
        let nightTop = vec3<f32>(0.0, 0.0, 0.05); // Negro / Azul marino
        let nightBot = vec3<f32>(0.0, 0.0, 0.2);
        
        topColor = mix(duskTop, nightTop, t);
        bottomColor = mix(duskBot, nightBot, t);
    } else {
        // Night
        topColor = vec3<f32>(0.0, 0.0, 0.05);
        bottomColor = vec3<f32>(0.0, 0.0, 0.2);
    }

    var finalColor = mix(topColor, bottomColor, in.uv.y);
    
    // Phase 28: Fake Sun Bloom (Ray Marching Far Plane)
    // 1. Calculate World Ray
    let ndcX = in.uv.x * 2.0 - 1.0;
    let ndcY = -(in.uv.y * 2.0 - 1.0); // Flip Y for WebGPU NDC
    let ndcPos = vec4<f32>(ndcX, ndcY, 1.0, 1.0);
    
    var worldPosHover = scene.invViewProj * ndcPos;
    worldPosHover = worldPosHover / worldPosHover.w;
    
    let V = normalize(worldPosHover.xyz - scene.cameraPosition.xyz);
    let L = normalize(-scene.lightDirection.xyz);
    
    // 2. Halo logic
    let dotVL = max(dot(V, L), 0.0);
    let bloomIntensity = pow(dotVL, 400.0) * 2.0; // Soft halo
    let sunDisk = pow(dotVL, 2000.0) * 10.0;     // Core disk
    
    let sunColor = vec3<f32>(1.0, 0.95, 0.8) * scene.lightColor.rgb;
    finalColor = finalColor + (bloomIntensity + sunDisk) * sunColor;

    // HDR Tonemapping for sky
    finalColor = finalColor / (finalColor + vec3<f32>(1.0));

    return vec4<f32>(finalColor, 1.0);
}
