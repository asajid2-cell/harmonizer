// =============================================================================
// VENPOD WebGPU - Voxel World Implementation
// =============================================================================

#include "VoxelWorld.h"
#include <cstdio>
#include <cmath>

namespace VENPOD::Simulation {

// Embedded shader sources (will be loaded from files in production)
static const char* g_physicsShader = R"(
const MAT_AIR: u32 = 0u;
const MAT_SAND: u32 = 1u;
const MAT_WATER: u32 = 2u;
const MAT_DIRT: u32 = 4u;
const MAT_LAVA: u32 = 7u;
const MAT_OIL: u32 = 9u;
const MAT_SMOKE: u32 = 11u;
const MAT_FIRE: u32 = 6u;
const MAT_ACID: u32 = 12u;
const MAT_HONEY: u32 = 13u;
const MAT_CONCRETE: u32 = 14u;
const MAT_GUNPOWDER: u32 = 15u;
const MAT_STEAM: u32 = 17u;
const MAT_BEDROCK: u32 = 255u;

struct PhysicsConstants {
    gridSizeX: u32,
    gridSizeY: u32,
    gridSizeZ: u32,
    frameIndex: u32,
    deltaTime: f32,
    gravity: f32,
    simulationFlags: u32,
    padding: u32,
}

@group(0) @binding(0) var<uniform> constants: PhysicsConstants;
@group(0) @binding(1) var<storage, read> voxelGridIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> voxelGridOut: array<atomic<u32>>;

fn getMaterial(voxel: u32) -> u32 { return voxel & 0xFFu; }
fn getVariant(voxel: u32) -> u32 { return (voxel >> 8u) & 0xFFu; }
fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) | ((variant & 0xFFu) << 8u) | ((velocity & 0xFFu) << 16u) | ((state & 0xFFu) << 24u);
}
fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}
fn isMovable(material: u32) -> bool {
    return material == MAT_SAND || material == MAT_DIRT || material == MAT_WATER ||
           material == MAT_LAVA || material == MAT_OIL || material == MAT_SMOKE ||
           material == MAT_FIRE || material == MAT_ACID || material == MAT_HONEY ||
           material == MAT_CONCRETE || material == MAT_GUNPOWDER || material == MAT_STEAM;
}
fn isEmpty(material: u32) -> bool { return material == MAT_AIR; }
fn isLiquid(material: u32) -> bool {
    return material == MAT_WATER || material == MAT_LAVA || material == MAT_OIL ||
           material == MAT_ACID || material == MAT_HONEY || material == MAT_CONCRETE;
}
fn isPowder(material: u32) -> bool { return material == MAT_SAND || material == MAT_DIRT || material == MAT_GUNPOWDER; }
fn pcgHash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
fn getVoxelSafe(pos: vec3<i32>) -> u32 {
    if (pos.x < 0 || pos.x >= i32(constants.gridSizeX) || pos.y < 0 || pos.y >= i32(constants.gridSizeY) || pos.z < 0 || pos.z >= i32(constants.gridSizeZ)) {
        return packVoxel(MAT_BEDROCK, 0u, 0u, 0u);
    }
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    return voxelGridIn[linearIndex3D(vec3<u32>(pos), gridSize)];
}
fn setVoxel(pos: vec3<u32>, voxel: u32) {
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    atomicStore(&voxelGridOut[linearIndex3D(pos, gridSize)], voxel);
}
fn tryMoveVoxel(currentVoxel: u32, fromPos: vec3<u32>, toPos: vec3<i32>) -> bool {
    if (toPos.x < 0 || toPos.x >= i32(constants.gridSizeX) || toPos.y < 0 || toPos.y >= i32(constants.gridSizeY) || toPos.z < 0 || toPos.z >= i32(constants.gridSizeZ)) { return false; }
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let destIdx = linearIndex3D(vec3<u32>(toPos), gridSize);
    let airVoxel = packVoxel(MAT_AIR, 0u, 0u, 0u);
    let material = getMaterial(currentVoxel);
    let variant = getVariant(currentVoxel);
    let newVoxel = packVoxel(material, variant, 0u, 0u);
    let result = atomicCompareExchangeWeak(&voxelGridOut[destIdx], airVoxel, newVoxel);
    if (result.exchanged) { setVoxel(fromPos, airVoxel); return true; }
    return false;
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) { return; }
    let pos = vec3<i32>(DTid);
    let currentVoxel = getVoxelSafe(pos);
    let material = getMaterial(currentVoxel);
    if (material == MAT_AIR) { setVoxel(DTid, packVoxel(MAT_AIR, 0u, 0u, 0u)); return; }
    if (material == MAT_BEDROCK) { setVoxel(DTid, currentVoxel); return; }
    if (!isMovable(material)) { setVoxel(DTid, currentVoxel); return; }
    let belowPos = pos + vec3<i32>(0, -1, 0);
    if (belowPos.y >= 0) {
        let belowVoxel = getVoxelSafe(belowPos);
        if (isEmpty(getMaterial(belowVoxel))) { if (tryMoveVoxel(currentVoxel, DTid, belowPos)) { return; } }
        if (isPowder(material)) {
            let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.frameIndex);
            var diagDirs: array<vec3<i32>, 4>;
            diagDirs[0] = vec3<i32>(1, -1, 0); diagDirs[1] = vec3<i32>(-1, -1, 0);
            diagDirs[2] = vec3<i32>(0, -1, 1); diagDirs[3] = vec3<i32>(0, -1, -1);
            let startDir = rng % 4u;
            for (var i = 0u; i < 4u; i++) {
                let dirIdx = (startDir + i) % 4u;
                let diagPos = pos + diagDirs[dirIdx];
                if (diagPos.x >= 0 && diagPos.x < i32(constants.gridSizeX) && diagPos.y >= 0 && diagPos.z >= 0 && diagPos.z < i32(constants.gridSizeZ)) {
                    if (isEmpty(getMaterial(getVoxelSafe(diagPos)))) { if (tryMoveVoxel(currentVoxel, DTid, diagPos)) { return; } }
                }
            }
        }
        if (isLiquid(material)) {
            let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.frameIndex);
            var diagDownDirs: array<vec3<i32>, 4>;
            diagDownDirs[0] = vec3<i32>(1, -1, 0); diagDownDirs[1] = vec3<i32>(-1, -1, 0);
            diagDownDirs[2] = vec3<i32>(0, -1, 1); diagDownDirs[3] = vec3<i32>(0, -1, -1);
            let startDiag = rng % 4u;
            for (var i = 0u; i < 4u; i++) {
                let dirIdx = (startDiag + i) % 4u;
                let diagPos = pos + diagDownDirs[dirIdx];
                if (diagPos.x >= 0 && diagPos.x < i32(constants.gridSizeX) && diagPos.y >= 0 && diagPos.z >= 0 && diagPos.z < i32(constants.gridSizeZ)) {
                    if (isEmpty(getMaterial(getVoxelSafe(diagPos)))) { if (tryMoveVoxel(currentVoxel, DTid, diagPos)) { return; } }
                }
            }
            var horizDirs: array<vec3<i32>, 4>;
            horizDirs[0] = vec3<i32>(1, 0, 0); horizDirs[1] = vec3<i32>(-1, 0, 0);
            horizDirs[2] = vec3<i32>(0, 0, 1); horizDirs[3] = vec3<i32>(0, 0, -1);
            let startHoriz = (rng >> 2u) % 4u;
            for (var j = 0u; j < 4u; j++) {
                let dirIdx = (startHoriz + j) % 4u;
                let sidePos = pos + horizDirs[dirIdx];
                if (sidePos.x >= 0 && sidePos.x < i32(constants.gridSizeX) && sidePos.z >= 0 && sidePos.z < i32(constants.gridSizeZ)) {
                    if (isEmpty(getMaterial(getVoxelSafe(sidePos)))) { if (tryMoveVoxel(currentVoxel, DTid, sidePos)) { return; } }
                }
            }
        }
    }
    setVoxel(DTid, currentVoxel);
}
)";

static const char* g_initShader = R"(
const MAT_AIR: u32 = 0u;
const MAT_SAND: u32 = 1u;
const MAT_STONE: u32 = 3u;
const MAT_DIRT: u32 = 4u;
const MAT_WATER: u32 = 2u;
const MAT_BEDROCK: u32 = 255u;

struct InitConstants { gridSizeX: u32, gridSizeY: u32, gridSizeZ: u32, seed: u32, }
@group(0) @binding(0) var<uniform> constants: InitConstants;
@group(0) @binding(1) var<storage, read_write> voxelGrid: array<u32>;

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) | ((variant & 0xFFu) << 8u) | ((velocity & 0xFFu) << 16u) | ((state & 0xFFu) << 24u);
}
fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 { return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y; }
fn pcgHash(seed: u32) -> u32 { var state = seed * 747796405u + 2891336453u; let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) { return; }
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(DTid, gridSize);
    let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.seed);
    let variant = rng & 0xFFu;
    var voxel: u32 = packVoxel(MAT_AIR, 0u, 0u, 0u);
    if (DTid.y == 0u) { voxel = packVoxel(MAT_BEDROCK, variant, 0u, 0u); }
    else {
        let baseHeight = 5.0 + sin(f32(DTid.x) * 0.1) * 3.0 + cos(f32(DTid.z) * 0.1) * 3.0;
        let heightNoise = f32((rng >> 8u) & 0x7u) - 3.5;
        let terrainHeight = baseHeight + heightNoise;
        if (f32(DTid.y) <= terrainHeight) {
            if (f32(DTid.y) < terrainHeight - 2.0) { voxel = packVoxel(MAT_STONE, variant, 0u, 0u); }
            else if (f32(DTid.y) < terrainHeight - 0.5) { voxel = packVoxel(MAT_DIRT, variant, 0u, 0u); }
            else { voxel = packVoxel(MAT_SAND, variant, 0u, 0u); }
        }
        let wallThickness = 2u;
        if (DTid.x < wallThickness || DTid.x >= constants.gridSizeX - wallThickness || DTid.z < wallThickness || DTid.z >= constants.gridSizeZ - wallThickness) {
            if (DTid.y < 30u) { voxel = packVoxel(MAT_STONE, variant, 0u, 0u); }
        }
        let sandPileX = constants.gridSizeX / 2u;
        let sandPileZ = constants.gridSizeZ / 2u;
        let pileDx = i32(DTid.x) - i32(sandPileX);
        let pileDz = i32(DTid.z) - i32(sandPileZ);
        let pileDist = sqrt(f32(pileDx * pileDx + pileDz * pileDz));
        if (pileDist < 15.0 && DTid.y >= 20u && DTid.y < 35u) {
            let pileHeight = 35.0 - pileDist;
            if (f32(DTid.y) < pileHeight + 20.0) { voxel = packVoxel(MAT_SAND, variant, 0u, 0u); }
        }
    }
    voxelGrid[idx] = voxel;
}
)";

static const char* g_brushShader = R"(
const MAT_AIR: u32 = 0u;
struct BrushConstants { positionX: f32, positionY: f32, positionZ: f32, radius: f32, material: u32, mode: u32, shape: u32, strength: f32, gridSizeX: u32, gridSizeY: u32, gridSizeZ: u32, seed: u32, }
@group(0) @binding(0) var<uniform> constants: BrushConstants;
@group(0) @binding(1) var<storage, read_write> voxelGrid: array<u32>;

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 { return (material & 0xFFu) | ((variant & 0xFFu) << 8u) | ((velocity & 0xFFu) << 16u) | ((state & 0xFFu) << 24u); }
fn getMaterial(voxel: u32) -> u32 { return voxel & 0xFFu; }
fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 { return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y; }
fn pcgHash(seed: u32) -> u32 { var state = seed * 747796405u + 2891336453u; let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }
fn isInBrush(pos: vec3<f32>, center: vec3<f32>, radius: f32, shape: u32) -> bool {
    let diff = pos - center;
    switch (shape) {
        case 0u: { return length(diff) <= radius; }
        case 1u: { return abs(diff.x) <= radius && abs(diff.y) <= radius && abs(diff.z) <= radius; }
        case 2u: { return sqrt(diff.x * diff.x + diff.z * diff.z) <= radius && abs(diff.y) <= radius; }
        default: { return false; }
    }
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) { return; }
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(DTid, gridSize);
    let brushCenter = vec3<f32>(constants.positionX, constants.positionY, constants.positionZ);
    let voxelCenter = vec3<f32>(f32(DTid.x) + 0.5, f32(DTid.y) + 0.5, f32(DTid.z) + 0.5);
    if (isInBrush(voxelCenter, brushCenter, constants.radius, constants.shape)) {
        let currentVoxel = voxelGrid[idx];
        let currentMaterial = getMaterial(currentVoxel);
        let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.seed);
        let variant = rng & 0xFFu;
        if (constants.mode == 0u) { if (currentMaterial != 255u) { voxelGrid[idx] = packVoxel(constants.material, variant, 0u, 0u); } }
        else if (constants.mode == 1u) { if (currentMaterial != 255u && currentMaterial != MAT_AIR) { voxelGrid[idx] = packVoxel(MAT_AIR, 0u, 0u, 0u); } }
    }
}
)";

static const char* g_renderVertexShader = R"(
struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, }
@vertex fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    var uvs = array<vec2<f32>, 3>(vec2<f32>(0.0, 1.0), vec2<f32>(2.0, 1.0), vec2<f32>(0.0, -1.0));
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}
)";

static const char* g_renderFragmentShader = R"(
const MAT_AIR: u32 = 0u;
struct FrameConstants {
    cameraPosition: vec4<f32>, cameraForward: vec4<f32>, cameraRight: vec4<f32>, cameraUp: vec4<f32>,
    gridSize: vec4<u32>, brushPosition: vec4<f32>, brushParams: vec4<f32>,
}
@group(0) @binding(0) var<uniform> frame: FrameConstants;
@group(0) @binding(1) var<storage, read> voxelGrid: array<u32>;

struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, }
fn getMaterial(voxel: u32) -> u32 { return voxel & 0xFFu; }
fn getVariant(voxel: u32) -> u32 { return (voxel >> 8u) & 0xFFu; }
fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 { return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y; }
fn getVoxel(worldPos: vec3<i32>) -> u32 {
    if (worldPos.x < 0 || worldPos.x >= i32(frame.gridSize.x) || worldPos.y < 0 || worldPos.y >= i32(frame.gridSize.y) || worldPos.z < 0 || worldPos.z >= i32(frame.gridSize.z)) { return 0u; }
    let gridSize = vec3<u32>(frame.gridSize.x, frame.gridSize.y, frame.gridSize.z);
    return voxelGrid[linearIndex3D(vec3<u32>(worldPos), gridSize)];
}
fn getMaterialColor(material: u32, variant: u32) -> vec4<f32> {
    let variantNoise = (f32(variant) / 255.0) * 0.1 - 0.05;
    var color: vec4<f32>;
    switch (material) {
        case 0u: { color = vec4<f32>(0.0, 0.0, 0.0, 0.0); }
        case 1u: { color = vec4<f32>(0.76, 0.70, 0.50, 1.0); }
        case 2u: { color = vec4<f32>(0.2, 0.4, 0.8, 0.7); }
        case 3u: { color = vec4<f32>(0.5, 0.5, 0.5, 1.0); }
        case 4u: { color = vec4<f32>(0.55, 0.35, 0.2, 1.0); }
        case 5u: { color = vec4<f32>(0.6, 0.4, 0.2, 1.0); }
        case 6u: { color = vec4<f32>(1.0, 0.6, 0.1, 1.0); }
        case 7u: { color = vec4<f32>(1.0, 0.3, 0.0, 1.0); }
        case 8u: { color = vec4<f32>(0.7, 0.85, 0.95, 0.8); }
        case 9u: { color = vec4<f32>(0.15, 0.1, 0.2, 0.9); }
        case 10u: { color = vec4<f32>(0.9, 0.95, 1.0, 0.3); }
        case 11u: { color = vec4<f32>(0.3, 0.3, 0.35, 0.4); }
        case 12u: { color = vec4<f32>(0.2, 0.9, 0.2, 0.6); }
        case 13u: { color = vec4<f32>(0.95, 0.75, 0.2, 0.8); }
        case 14u: { color = vec4<f32>(0.6, 0.6, 0.65, 1.0); }
        case 15u: { color = vec4<f32>(0.2, 0.2, 0.25, 1.0); }
        case 16u: { color = vec4<f32>(0.7, 0.3, 0.9, 0.7); }
        case 17u: { color = vec4<f32>(0.9, 0.95, 1.0, 0.3); }
        case 255u: { color = vec4<f32>(0.2, 0.2, 0.2, 1.0); }
        default: { color = vec4<f32>(1.0, 0.0, 1.0, 1.0); }
    }
    return vec4<f32>(color.rgb * (1.0 + variantNoise), color.a);
}
fn intersectBox(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
    let invDir = 1.0 / rayDir;
    let t0 = (boxMin - rayOrigin) * invDir;
    let t1 = (boxMax - rayOrigin) * invDir;
    let tNear = min(t0, t1);
    let tFar = max(t0, t1);
    return vec2<f32>(max(max(tNear.x, tNear.y), tNear.z), min(min(tFar.x, tFar.y), tFar.z));
}
fn getSkyColor(rayDir: vec3<f32>) -> vec4<f32> {
    let skyFactor = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
    return vec4<f32>(mix(vec3<f32>(0.8, 0.9, 1.0), vec3<f32>(0.3, 0.5, 0.8), skyFactor), 1.0);
}
fn raymarch(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec4<f32> {
    let maxDist = 500.0; let maxSteps = 512;
    let gridMin = vec3<f32>(0.0, 0.0, 0.0);
    let gridMax = vec3<f32>(f32(frame.gridSize.x), f32(frame.gridSize.y), f32(frame.gridSize.z));
    let tBox = intersectBox(rayOrigin, rayDir, gridMin, gridMax);
    if (tBox.y < tBox.x || tBox.y < 0.0) { return getSkyColor(rayDir); }
    let startPos = rayOrigin + rayDir * max(tBox.x, 0.0);
    var voxelPos = vec3<i32>(floor(startPos));
    let deltaDist = abs(1.0 / rayDir);
    let step = vec3<i32>(sign(rayDir));
    var sideDist: vec3<f32>;
    if (rayDir.x > 0.0) { sideDist.x = (f32(voxelPos.x) + 1.0 - startPos.x) * deltaDist.x; } else { sideDist.x = (startPos.x - f32(voxelPos.x)) * deltaDist.x; }
    if (rayDir.y > 0.0) { sideDist.y = (f32(voxelPos.y) + 1.0 - startPos.y) * deltaDist.y; } else { sideDist.y = (startPos.y - f32(voxelPos.y)) * deltaDist.y; }
    if (rayDir.z > 0.0) { sideDist.z = (f32(voxelPos.z) + 1.0 - startPos.z) * deltaDist.z; } else { sideDist.z = (startPos.z - f32(voxelPos.z)) * deltaDist.z; }
    var normal = vec3<f32>(0.0, 1.0, 0.0); var dist = 0.0;
    for (var i = 0; i < maxSteps; i++) {
        let voxel = getVoxel(voxelPos);
        let material = getMaterial(voxel);
        if (material != MAT_AIR) {
            let variant = getVariant(voxel);
            let baseColor = getMaterialColor(material, variant);
            let lightDir = normalize(vec3<f32>(0.5, 1.0, 0.3));
            let ndotl = max(dot(normal, lightDir), 0.2);
            var finalColor = baseColor.rgb * ndotl;
            let fogFactor = clamp(dist / maxDist, 0.0, 1.0);
            finalColor = mix(finalColor, vec3<f32>(0.5, 0.6, 0.7), fogFactor * 0.5);
            return vec4<f32>(finalColor, baseColor.a);
        }
        if (sideDist.x < sideDist.y) {
            if (sideDist.x < sideDist.z) { sideDist.x += deltaDist.x; voxelPos.x += step.x; normal = vec3<f32>(f32(-step.x), 0.0, 0.0); dist = sideDist.x; }
            else { sideDist.z += deltaDist.z; voxelPos.z += step.z; normal = vec3<f32>(0.0, 0.0, f32(-step.z)); dist = sideDist.z; }
        } else {
            if (sideDist.y < sideDist.z) { sideDist.y += deltaDist.y; voxelPos.y += step.y; normal = vec3<f32>(0.0, f32(-step.y), 0.0); dist = sideDist.y; }
            else { sideDist.z += deltaDist.z; voxelPos.z += step.z; normal = vec3<f32>(0.0, 0.0, f32(-step.z)); dist = sideDist.z; }
        }
        if (dist > maxDist) { break; }
    }
    return getSkyColor(rayDir);
}

@fragment fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let cameraPos = frame.cameraPosition.xyz;
    let forward = frame.cameraForward.xyz;
    let right = frame.cameraRight.xyz;
    let up = frame.cameraUp.xyz;
    let fov = frame.cameraPosition.w;
    let aspectRatio = frame.cameraForward.w;
    var ndc = input.uv * 2.0 - 1.0; ndc.y = -ndc.y;
    let tanHalfFov = tan(fov * 0.5);
    let rayDir = normalize(forward + right * ndc.x * tanHalfFov * aspectRatio + up * ndc.y * tanHalfFov);
    var color = raymarch(cameraPos, rayDir);
    if (frame.brushParams.z > 0.5) {
        let brushPos = frame.brushPosition.xyz;
        let brushRadius = frame.brushPosition.w;
        let oc = cameraPos - brushPos;
        let b = dot(oc, rayDir);
        let c = dot(oc, oc) - brushRadius * brushRadius;
        let discriminant = b * b - c;
        if (discriminant > 0.0) {
            var t = -b - sqrt(discriminant);
            if (t < 0.0) { t = -b + sqrt(discriminant); }
            if (t > 2.0) {
                let hitPoint = cameraPos + rayDir * t;
                let brushNormal = normalize(hitPoint - brushPos);
                let fresnel = pow(1.0 - abs(dot(brushNormal, rayDir)), 2.0);
                let previewAlpha = mix(0.15, 0.4, fresnel);
                let brushMaterial = u32(frame.brushParams.x);
                let previewColor = getMaterialColor(brushMaterial, 128u).rgb;
                color = vec4<f32>(mix(color.rgb, previewColor, previewAlpha), color.a);
            }
        }
    }
    let centerDist = length(input.uv - 0.5);
    if (centerDist < 0.003 || (centerDist > 0.008 && centerDist < 0.012)) { color = vec4<f32>(1.0, 1.0, 1.0, 1.0); }
    return color;
}
)";

VoxelWorld::~VoxelWorld() {
    Shutdown();
}

bool VoxelWorld::Initialize(Graphics::WebGPUContext& context, const VoxelWorldConfig& config) {
    m_context = &context;
    m_config = config;

    printf("[VoxelWorld] Initializing %ux%ux%u grid...\n", config.gridSizeX, config.gridSizeY, config.gridSizeZ);

    // Load shaders
    if (!LoadShaders()) {
        printf("[VoxelWorld] Failed to load shaders\n");
        return false;
    }

    // Create buffers
    if (!CreateBuffers()) {
        printf("[VoxelWorld] Failed to create buffers\n");
        return false;
    }

    // Create pipelines
    if (!CreatePipelines()) {
        printf("[VoxelWorld] Failed to create pipelines\n");
        return false;
    }

    // Initialize world
    if (!InitializeWorld()) {
        printf("[VoxelWorld] Failed to initialize world\n");
        return false;
    }

    // Set up initial camera
    m_camera.position = Vec3(
        static_cast<float>(config.gridSizeX) / 2.0f,
        static_cast<float>(config.gridSizeY) / 2.0f,
        static_cast<float>(config.gridSizeZ) / 2.0f
    );
    m_camera.forward = Vec3(0, 0, 1);
    m_camera.right = Vec3(1, 0, 0);
    m_camera.up = Vec3(0, 1, 0);
    m_camera.aspectRatio = static_cast<float>(context.GetWidth()) / static_cast<float>(context.GetHeight());

    m_initialized = true;
    printf("[VoxelWorld] Initialization complete!\n");
    return true;
}

bool VoxelWorld::LoadShaders() {
    m_shaders.physics = g_physicsShader;
    m_shaders.initialize = g_initShader;
    m_shaders.brush = g_brushShader;
    m_shaders.renderVertex = g_renderVertexShader;
    m_shaders.renderFragment = g_renderFragmentShader;
    return true;
}

bool VoxelWorld::CreateBuffers() {
    WGPUDevice device = m_context->GetDevice();
    WGPUQueue queue = m_context->GetQueue();

    // Create voxel ping-pong buffers
    if (!m_voxelBuffers.Create(device, queue, m_config.gridSizeX, m_config.gridSizeY, m_config.gridSizeZ)) {
        return false;
    }

    // Create uniform buffers
    if (!m_physicsUniform.Create(device, 32, "PhysicsUniform")) return false;
    if (!m_initUniform.Create(device, 16, "InitUniform")) return false;
    if (!m_brushUniform.Create(device, 48, "BrushUniform")) return false;
    if (!m_frameUniform.Create(device, 128, "FrameUniform")) return false;

    return true;
}

bool VoxelWorld::CreatePipelines() {
    WGPUDevice device = m_context->GetDevice();

    // Physics pipeline
    if (!m_physicsPipeline.Create(device, m_shaders.physics, "main", "PhysicsPipeline")) {
        return false;
    }

    // Initialize pipeline
    if (!m_initPipeline.Create(device, m_shaders.initialize, "main", "InitPipeline")) {
        return false;
    }

    // Brush pipeline
    if (!m_brushPipeline.Create(device, m_shaders.brush, "main", "BrushPipeline")) {
        return false;
    }

    // Render pipeline (fullscreen)
    std::string combinedRender = m_shaders.renderVertex + "\n" + m_shaders.renderFragment;
    if (!m_renderPipeline.CreateFullscreen(device, m_shaders.renderVertex, m_shaders.renderFragment,
                                            m_context->GetSwapchainFormat(), "RenderPipeline")) {
        return false;
    }

    return true;
}

bool VoxelWorld::InitializeWorld() {
    WGPUDevice device = m_context->GetDevice();
    WGPUQueue queue = m_context->GetQueue();

    // Update init uniform
    struct InitConstants {
        uint32_t gridSizeX, gridSizeY, gridSizeZ, seed;
    } initConst = {m_config.gridSizeX, m_config.gridSizeY, m_config.gridSizeZ, 12345};
    m_initUniform.Update(queue, &initConst, sizeof(initConst));

    // Create bind group for init
    Graphics::BindGroupBuilder builder;
    builder.AddBuffer(0, m_initUniform.GetBuffer())
           .AddBuffer(1, m_voxelBuffers.GetWriteBuffer());
    WGPUBindGroupLayout layout = m_initPipeline.GetBindGroupLayout(0);
    WGPUBindGroup bindGroup = builder.Build(device, layout, "InitBindGroup");

    // Create command encoder
    WGPUCommandEncoderDescriptor encDesc = {};
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);

    // Dispatch init shader
    WGPUComputePassDescriptor passDesc = {};
    WGPUComputePassEncoder pass = wgpuCommandEncoderBeginComputePass(encoder, &passDesc);
    wgpuComputePassEncoderSetPipeline(pass, m_initPipeline.GetPipeline());
    wgpuComputePassEncoderSetBindGroup(pass, 0, bindGroup, 0, nullptr);

    uint32_t workgroupsX = (m_config.gridSizeX + 7) / 8;
    uint32_t workgroupsY = (m_config.gridSizeY + 7) / 8;
    uint32_t workgroupsZ = (m_config.gridSizeZ + 7) / 8;
    wgpuComputePassEncoderDispatchWorkgroups(pass, workgroupsX, workgroupsY, workgroupsZ);
    wgpuComputePassEncoderEnd(pass);

    // Submit
    WGPUCommandBufferDescriptor cmdDesc = {};
    WGPUCommandBuffer cmdBuffer = wgpuCommandEncoderFinish(encoder, &cmdDesc);
    wgpuQueueSubmit(queue, 1, &cmdBuffer);

    // Cleanup
    wgpuCommandBufferRelease(cmdBuffer);
    wgpuCommandEncoderRelease(encoder);
    wgpuComputePassEncoderRelease(pass);
    wgpuBindGroupRelease(bindGroup);
    wgpuBindGroupLayoutRelease(layout);

    // Swap to make initialized data the read buffer
    m_voxelBuffers.SwapBuffers();

    printf("[VoxelWorld] World initialized with test pattern\n");
    return true;
}

void VoxelWorld::Update(float deltaTime) {
    if (m_paused || !m_initialized) return;

    WGPUDevice device = m_context->GetDevice();
    WGPUQueue queue = m_context->GetQueue();

    // Update physics uniform
    struct PhysicsConstants {
        uint32_t gridSizeX, gridSizeY, gridSizeZ, frameIndex;
        float deltaTime, gravity;
        uint32_t simulationFlags, padding;
    } physConst = {
        m_config.gridSizeX, m_config.gridSizeY, m_config.gridSizeZ, m_frameIndex,
        deltaTime, 9.8f, 0, 0
    };
    m_physicsUniform.Update(queue, &physConst, sizeof(physConst));

    // Create bind group for physics
    Graphics::BindGroupBuilder builder;
    builder.AddBuffer(0, m_physicsUniform.GetBuffer())
           .AddBuffer(1, m_voxelBuffers.GetReadBuffer())
           .AddBuffer(2, m_voxelBuffers.GetWriteBuffer());
    WGPUBindGroupLayout layout = m_physicsPipeline.GetBindGroupLayout(0);
    WGPUBindGroup bindGroup = builder.Build(device, layout, "PhysicsBindGroup");

    // Create command encoder
    WGPUCommandEncoderDescriptor encDesc = {};
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);

    // Dispatch physics shader
    WGPUComputePassDescriptor passDesc = {};
    WGPUComputePassEncoder pass = wgpuCommandEncoderBeginComputePass(encoder, &passDesc);
    wgpuComputePassEncoderSetPipeline(pass, m_physicsPipeline.GetPipeline());
    wgpuComputePassEncoderSetBindGroup(pass, 0, bindGroup, 0, nullptr);

    uint32_t workgroupsX = (m_config.gridSizeX + 7) / 8;
    uint32_t workgroupsY = (m_config.gridSizeY + 7) / 8;
    uint32_t workgroupsZ = (m_config.gridSizeZ + 7) / 8;
    wgpuComputePassEncoderDispatchWorkgroups(pass, workgroupsX, workgroupsY, workgroupsZ);
    wgpuComputePassEncoderEnd(pass);

    // Submit
    WGPUCommandBufferDescriptor cmdDesc = {};
    WGPUCommandBuffer cmdBuffer = wgpuCommandEncoderFinish(encoder, &cmdDesc);
    wgpuQueueSubmit(queue, 1, &cmdBuffer);

    // Cleanup
    wgpuCommandBufferRelease(cmdBuffer);
    wgpuCommandEncoderRelease(encoder);
    wgpuComputePassEncoderRelease(pass);
    wgpuBindGroupRelease(bindGroup);
    wgpuBindGroupLayoutRelease(layout);

    // Swap buffers
    m_voxelBuffers.SwapBuffers();
    m_frameIndex++;
}

void VoxelWorld::ApplyBrush(const BrushParams& brush) {
    if (!brush.active || !m_initialized) return;

    WGPUDevice device = m_context->GetDevice();
    WGPUQueue queue = m_context->GetQueue();

    // Update brush uniform
    struct BrushConstants {
        float positionX, positionY, positionZ, radius;
        uint32_t material, mode, shape;
        float strength;
        uint32_t gridSizeX, gridSizeY, gridSizeZ, seed;
    } brushConst = {
        brush.position.x, brush.position.y, brush.position.z, brush.radius,
        brush.material, brush.mode, brush.shape, 1.0f,
        m_config.gridSizeX, m_config.gridSizeY, m_config.gridSizeZ, m_frameIndex
    };
    m_brushUniform.Update(queue, &brushConst, sizeof(brushConst));

    // Create bind group for brush
    Graphics::BindGroupBuilder builder;
    builder.AddBuffer(0, m_brushUniform.GetBuffer())
           .AddBuffer(1, m_voxelBuffers.GetWriteBuffer()); // Paint on write buffer
    WGPUBindGroupLayout layout = m_brushPipeline.GetBindGroupLayout(0);
    WGPUBindGroup bindGroup = builder.Build(device, layout, "BrushBindGroup");

    // Create command encoder
    WGPUCommandEncoderDescriptor encDesc = {};
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);

    // Dispatch brush shader
    WGPUComputePassDescriptor passDesc = {};
    WGPUComputePassEncoder pass = wgpuCommandEncoderBeginComputePass(encoder, &passDesc);
    wgpuComputePassEncoderSetPipeline(pass, m_brushPipeline.GetPipeline());
    wgpuComputePassEncoderSetBindGroup(pass, 0, bindGroup, 0, nullptr);

    uint32_t workgroupsX = (m_config.gridSizeX + 7) / 8;
    uint32_t workgroupsY = (m_config.gridSizeY + 7) / 8;
    uint32_t workgroupsZ = (m_config.gridSizeZ + 7) / 8;
    wgpuComputePassEncoderDispatchWorkgroups(pass, workgroupsX, workgroupsY, workgroupsZ);
    wgpuComputePassEncoderEnd(pass);

    // Submit
    WGPUCommandBufferDescriptor cmdDesc = {};
    WGPUCommandBuffer cmdBuffer = wgpuCommandEncoderFinish(encoder, &cmdDesc);
    wgpuQueueSubmit(queue, 1, &cmdBuffer);

    // Cleanup
    wgpuCommandBufferRelease(cmdBuffer);
    wgpuCommandEncoderRelease(encoder);
    wgpuComputePassEncoderRelease(pass);
    wgpuBindGroupRelease(bindGroup);
    wgpuBindGroupLayoutRelease(layout);
}

void VoxelWorld::SetCamera(const CameraParams& camera) {
    m_camera = camera;
}

void VoxelWorld::SetBrushPreview(const BrushParams& brush) {
    m_brushPreview = brush;
}

void VoxelWorld::UpdateFrameUniforms() {
    WGPUQueue queue = m_context->GetQueue();

    struct FrameConstants {
        float camPosX, camPosY, camPosZ, fov;
        float forwardX, forwardY, forwardZ, aspectRatio;
        float rightX, rightY, rightZ, pad1;
        float upX, upY, upZ, pad2;
        uint32_t gridSizeX, gridSizeY, gridSizeZ, pad3;
        float brushPosX, brushPosY, brushPosZ, brushRadius;
        float brushMaterial, brushShape, brushValid, pad4;
    } frameConst = {
        m_camera.position.x, m_camera.position.y, m_camera.position.z, m_camera.fov,
        m_camera.forward.x, m_camera.forward.y, m_camera.forward.z, m_camera.aspectRatio,
        m_camera.right.x, m_camera.right.y, m_camera.right.z, 0.0f,
        m_camera.up.x, m_camera.up.y, m_camera.up.z, 0.0f,
        m_config.gridSizeX, m_config.gridSizeY, m_config.gridSizeZ, 0,
        m_brushPreview.position.x, m_brushPreview.position.y, m_brushPreview.position.z, m_brushPreview.radius,
        static_cast<float>(m_brushPreview.material), static_cast<float>(m_brushPreview.shape),
        m_brushPreview.hasValidPosition ? 1.0f : 0.0f, 0.0f
    };

    m_frameUniform.Update(queue, &frameConst, sizeof(frameConst));
}

void VoxelWorld::Render(WGPUTextureView targetView) {
    if (!m_initialized || !targetView) return;

    WGPUDevice device = m_context->GetDevice();
    WGPUQueue queue = m_context->GetQueue();

    // Update frame uniforms
    UpdateFrameUniforms();

    // Create bind group for rendering
    Graphics::BindGroupBuilder builder;
    builder.AddBuffer(0, m_frameUniform.GetBuffer())
           .AddBuffer(1, m_voxelBuffers.GetReadBuffer()); // Read from current frame
    WGPUBindGroupLayout layout = m_renderPipeline.GetBindGroupLayout(0);
    WGPUBindGroup bindGroup = builder.Build(device, layout, "RenderBindGroup");

    // Create command encoder
    WGPUCommandEncoderDescriptor encDesc = {};
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);

    // Render pass
    WGPURenderPassColorAttachment colorAttachment = {};
    colorAttachment.view = targetView;
    colorAttachment.loadOp = WGPULoadOp_Clear;
    colorAttachment.storeOp = WGPUStoreOp_Store;
    colorAttachment.clearValue = {0.3, 0.5, 0.8, 1.0};

    WGPURenderPassDescriptor passDesc = {};
    passDesc.colorAttachmentCount = 1;
    passDesc.colorAttachments = &colorAttachment;

    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &passDesc);
    wgpuRenderPassEncoderSetPipeline(pass, m_renderPipeline.GetPipeline());
    wgpuRenderPassEncoderSetBindGroup(pass, 0, bindGroup, 0, nullptr);
    wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0); // Fullscreen triangle
    wgpuRenderPassEncoderEnd(pass);

    // Submit
    WGPUCommandBufferDescriptor cmdDesc = {};
    WGPUCommandBuffer cmdBuffer = wgpuCommandEncoderFinish(encoder, &cmdDesc);
    wgpuQueueSubmit(queue, 1, &cmdBuffer);

    // Cleanup
    wgpuCommandBufferRelease(cmdBuffer);
    wgpuCommandEncoderRelease(encoder);
    wgpuRenderPassEncoderRelease(pass);
    wgpuBindGroupRelease(bindGroup);
    wgpuBindGroupLayoutRelease(layout);
}

void VoxelWorld::Shutdown() {
    if (m_physicsBindGroup) {
        wgpuBindGroupRelease(m_physicsBindGroup);
        m_physicsBindGroup = nullptr;
    }
    if (m_initBindGroup) {
        wgpuBindGroupRelease(m_initBindGroup);
        m_initBindGroup = nullptr;
    }
    if (m_brushBindGroup) {
        wgpuBindGroupRelease(m_brushBindGroup);
        m_brushBindGroup = nullptr;
    }
    if (m_renderBindGroup) {
        wgpuBindGroupRelease(m_renderBindGroup);
        m_renderBindGroup = nullptr;
    }

    m_physicsPipeline.Release();
    m_initPipeline.Release();
    m_brushPipeline.Release();
    m_renderPipeline.Release();

    m_initialized = false;
}

} // namespace VENPOD::Simulation
