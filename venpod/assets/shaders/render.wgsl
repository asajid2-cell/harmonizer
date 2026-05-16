// =============================================================================
// VENPOD WebGPU - Raymarching Render Shaders
// Fullscreen vertex shader + DDA voxel raymarching fragment shader
// =============================================================================

// Material IDs
const MAT_AIR: u32 = 0u;

// Frame constants from CPU
struct FrameConstants {
    cameraPosition: vec4<f32>,    // xyz = position, w = fov
    cameraForward: vec4<f32>,     // xyz = forward, w = aspectRatio
    cameraRight: vec4<f32>,       // xyz = right, w = unused
    cameraUp: vec4<f32>,          // xyz = up, w = unused
    gridSize: vec4<u32>,          // xyz = grid dimensions, w = unused
    brushPosition: vec4<f32>,     // xyz = brush pos, w = radius
    brushParams: vec4<f32>,       // x = material, y = shape, z = hasValidPosition, w = unused
}

// Bindings
@group(0) @binding(0) var<uniform> frame: FrameConstants;
@group(0) @binding(1) var<storage, read> voxelGrid: array<u32>;

// Vertex output / Fragment input
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// ============================================================================
// Fullscreen Vertex Shader
// ============================================================================

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Fullscreen triangle (3 vertices covering screen)
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );

    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.uv = uvs[vertexIndex];

    return output;
}

// ============================================================================
// Helper Functions
// ============================================================================

fn getMaterial(voxel: u32) -> u32 {
    return voxel & 0xFFu;
}

fn getVariant(voxel: u32) -> u32 {
    return (voxel >> 8u) & 0xFFu;
}

fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}

fn getVoxel(worldPos: vec3<i32>) -> u32 {
    // Bounds check
    if (worldPos.x < 0 || worldPos.x >= i32(frame.gridSize.x) ||
        worldPos.y < 0 || worldPos.y >= i32(frame.gridSize.y) ||
        worldPos.z < 0 || worldPos.z >= i32(frame.gridSize.z)) {
        return 0u; // AIR outside bounds
    }

    let gridSize = vec3<u32>(frame.gridSize.x, frame.gridSize.y, frame.gridSize.z);
    let idx = linearIndex3D(vec3<u32>(worldPos), gridSize);
    return voxelGrid[idx];
}

fn getMaterialColor(material: u32, variant: u32) -> vec4<f32> {
    // Variant adds subtle color variation
    let variantNoise = (f32(variant) / 255.0) * 0.1 - 0.05;

    var color: vec4<f32>;

    switch (material) {
        case 0u: { color = vec4<f32>(0.0, 0.0, 0.0, 0.0); }       // AIR
        case 1u: { color = vec4<f32>(0.76, 0.70, 0.50, 1.0); }    // SAND
        case 2u: { color = vec4<f32>(0.2, 0.4, 0.8, 0.7); }       // WATER
        case 3u: { color = vec4<f32>(0.5, 0.5, 0.5, 1.0); }       // STONE
        case 4u: { color = vec4<f32>(0.55, 0.35, 0.2, 1.0); }     // DIRT
        case 5u: { color = vec4<f32>(0.6, 0.4, 0.2, 1.0); }       // WOOD
        case 6u: { color = vec4<f32>(1.0, 0.6, 0.1, 1.0); }       // FIRE
        case 7u: { color = vec4<f32>(1.0, 0.3, 0.0, 1.0); }       // LAVA
        case 8u: { color = vec4<f32>(0.7, 0.85, 0.95, 0.8); }     // ICE
        case 9u: { color = vec4<f32>(0.15, 0.1, 0.2, 0.9); }      // OIL
        case 10u: { color = vec4<f32>(0.9, 0.95, 1.0, 0.3); }     // GLASS
        case 11u: { color = vec4<f32>(0.3, 0.3, 0.35, 0.4); }     // SMOKE
        case 12u: { color = vec4<f32>(0.2, 0.9, 0.2, 0.6); }      // ACID
        case 13u: { color = vec4<f32>(0.95, 0.75, 0.2, 0.8); }    // HONEY
        case 14u: { color = vec4<f32>(0.6, 0.6, 0.65, 1.0); }     // CONCRETE
        case 15u: { color = vec4<f32>(0.2, 0.2, 0.25, 1.0); }     // GUNPOWDER
        case 16u: { color = vec4<f32>(0.7, 0.3, 0.9, 0.7); }      // CRYSTAL
        case 17u: { color = vec4<f32>(0.9, 0.95, 1.0, 0.3); }     // STEAM
        case 255u: { color = vec4<f32>(0.2, 0.2, 0.2, 1.0); }     // BEDROCK
        default: { color = vec4<f32>(1.0, 0.0, 1.0, 1.0); }       // Unknown
    }

    color = vec4<f32>(color.rgb * (1.0 + variantNoise), color.a);
    return color;
}

// Box intersection for ray entry
fn intersectBox(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
    let invDir = 1.0 / rayDir;
    let t0 = (boxMin - rayOrigin) * invDir;
    let t1 = (boxMax - rayOrigin) * invDir;

    let tNear = min(t0, t1);
    let tFar = max(t0, t1);

    let tMin = max(max(tNear.x, tNear.y), tNear.z);
    let tMax = min(min(tFar.x, tFar.y), tFar.z);

    return vec2<f32>(tMin, tMax);
}

// ============================================================================
// DDA Raymarching
// ============================================================================

fn raymarch(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec4<f32> {
    let maxDist = 500.0;
    let maxSteps = 512;

    let gridMin = vec3<f32>(0.0, 0.0, 0.0);
    let gridMax = vec3<f32>(f32(frame.gridSize.x), f32(frame.gridSize.y), f32(frame.gridSize.z));

    // Find ray entry into grid
    let tBox = intersectBox(rayOrigin, rayDir, gridMin, gridMax);
    if (tBox.y < tBox.x || tBox.y < 0.0) {
        // Miss grid - return sky
        return getSkyColor(rayDir);
    }

    // Start from grid entry (or ray origin if inside)
    let startPos = rayOrigin + rayDir * max(tBox.x, 0.0);

    // DDA setup
    var voxelPos = vec3<i32>(floor(startPos));
    let deltaDist = abs(1.0 / rayDir);
    let step = vec3<i32>(sign(rayDir));

    var sideDist: vec3<f32>;
    if (rayDir.x > 0.0) {
        sideDist.x = (f32(voxelPos.x) + 1.0 - startPos.x) * deltaDist.x;
    } else {
        sideDist.x = (startPos.x - f32(voxelPos.x)) * deltaDist.x;
    }
    if (rayDir.y > 0.0) {
        sideDist.y = (f32(voxelPos.y) + 1.0 - startPos.y) * deltaDist.y;
    } else {
        sideDist.y = (startPos.y - f32(voxelPos.y)) * deltaDist.y;
    }
    if (rayDir.z > 0.0) {
        sideDist.z = (f32(voxelPos.z) + 1.0 - startPos.z) * deltaDist.z;
    } else {
        sideDist.z = (startPos.z - f32(voxelPos.z)) * deltaDist.z;
    }

    var normal = vec3<f32>(0.0, 1.0, 0.0);
    var dist = 0.0;

    // DDA traversal
    for (var i = 0; i < maxSteps; i++) {
        let voxel = getVoxel(voxelPos);
        let material = getMaterial(voxel);

        // Hit non-air voxel
        if (material != MAT_AIR) {
            let variant = getVariant(voxel);
            let baseColor = getMaterialColor(material, variant);

            // Simple diffuse lighting
            let lightDir = normalize(vec3<f32>(0.5, 1.0, 0.3));
            let ndotl = max(dot(normal, lightDir), 0.2);

            var finalColor = baseColor.rgb * ndotl;

            // Depth fog
            let fogFactor = clamp(dist / maxDist, 0.0, 1.0);
            let fogColor = vec3<f32>(0.5, 0.6, 0.7);
            finalColor = mix(finalColor, fogColor, fogFactor * 0.5);

            return vec4<f32>(finalColor, baseColor.a);
        }

        // Step to next voxel
        if (sideDist.x < sideDist.y) {
            if (sideDist.x < sideDist.z) {
                sideDist.x += deltaDist.x;
                voxelPos.x += step.x;
                normal = vec3<f32>(f32(-step.x), 0.0, 0.0);
                dist = sideDist.x;
            } else {
                sideDist.z += deltaDist.z;
                voxelPos.z += step.z;
                normal = vec3<f32>(0.0, 0.0, f32(-step.z));
                dist = sideDist.z;
            }
        } else {
            if (sideDist.y < sideDist.z) {
                sideDist.y += deltaDist.y;
                voxelPos.y += step.y;
                normal = vec3<f32>(0.0, f32(-step.y), 0.0);
                dist = sideDist.y;
            } else {
                sideDist.z += deltaDist.z;
                voxelPos.z += step.z;
                normal = vec3<f32>(0.0, 0.0, f32(-step.z));
                dist = sideDist.z;
            }
        }

        if (dist > maxDist) {
            break;
        }
    }

    return getSkyColor(rayDir);
}

fn getSkyColor(rayDir: vec3<f32>) -> vec4<f32> {
    let skyFactor = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
    let skyTop = vec3<f32>(0.3, 0.5, 0.8);
    let skyBottom = vec3<f32>(0.8, 0.9, 1.0);
    let skyColor = mix(skyBottom, skyTop, skyFactor);
    return vec4<f32>(skyColor, 1.0);
}

// ============================================================================
// Fragment Shader
// ============================================================================

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Camera data
    let cameraPos = frame.cameraPosition.xyz;
    let forward = frame.cameraForward.xyz;
    let right = frame.cameraRight.xyz;
    let up = frame.cameraUp.xyz;
    let fov = frame.cameraPosition.w;
    let aspectRatio = frame.cameraForward.w;

    // Calculate ray direction from UV
    var ndc = input.uv * 2.0 - 1.0;
    ndc.y = -ndc.y; // Flip Y

    let tanHalfFov = tan(fov * 0.5);
    let rayDir = normalize(
        forward +
        right * ndc.x * tanHalfFov * aspectRatio +
        up * ndc.y * tanHalfFov
    );

    // Raymarch the voxel world
    var color = raymarch(cameraPos, rayDir);

    // Draw brush preview if valid
    if (frame.brushParams.z > 0.5) {
        let brushPos = frame.brushPosition.xyz;
        let brushRadius = frame.brushPosition.w;

        // Ray-sphere intersection for preview
        let oc = cameraPos - brushPos;
        let b = dot(oc, rayDir);
        let c = dot(oc, oc) - brushRadius * brushRadius;
        let discriminant = b * b - c;

        if (discriminant > 0.0) {
            var t = -b - sqrt(discriminant);
            if (t < 0.0) {
                t = -b + sqrt(discriminant);
            }
            if (t > 2.0) { // Don't draw if too close
                let hitPoint = cameraPos + rayDir * t;
                let brushNormal = normalize(hitPoint - brushPos);

                // Fresnel for edge glow
                let fresnel = pow(1.0 - abs(dot(brushNormal, rayDir)), 2.0);
                let previewAlpha = mix(0.15, 0.4, fresnel);

                // Get material color for preview
                let brushMaterial = u32(frame.brushParams.x);
                let previewColor = getMaterialColor(brushMaterial, 128u).rgb;

                color = vec4<f32>(mix(color.rgb, previewColor, previewAlpha), color.a);
            }
        }
    }

    // Draw crosshair at center
    let pixelPos = input.uv * vec2<f32>(f32(frame.gridSize.x), f32(frame.gridSize.y)); // Approximate screen size
    let centerDist = length(input.uv - 0.5);
    if (centerDist < 0.002 || (centerDist > 0.008 && centerDist < 0.012)) {
        color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }

    return color;
}
