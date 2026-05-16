// =============================================================================
// VENPOD WebGPU - Physics Compute Shader
// Falling sand simulation with atomic operations
// =============================================================================

// Material IDs (inline since WGSL doesn't have #include)
const MAT_AIR: u32 = 0u;
const MAT_SAND: u32 = 1u;
const MAT_WATER: u32 = 2u;
const MAT_STONE: u32 = 3u;
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

// Physics constants uniform
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

// Helper functions
fn getMaterial(voxel: u32) -> u32 {
    return voxel & 0xFFu;
}

fn getVariant(voxel: u32) -> u32 {
    return (voxel >> 8u) & 0xFFu;
}

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) |
           ((variant & 0xFFu) << 8u) |
           ((velocity & 0xFFu) << 16u) |
           ((state & 0xFFu) << 24u);
}

fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}

fn isMovable(material: u32) -> bool {
    return material == MAT_SAND || material == MAT_DIRT || material == MAT_WATER ||
           material == MAT_LAVA || material == MAT_OIL ||
           material == MAT_SMOKE || material == MAT_FIRE || material == MAT_ACID ||
           material == MAT_HONEY || material == MAT_CONCRETE || material == MAT_GUNPOWDER ||
           material == MAT_STEAM;
}

fn isEmpty(material: u32) -> bool {
    return material == MAT_AIR;
}

fn isLiquid(material: u32) -> bool {
    return material == MAT_WATER || material == MAT_LAVA || material == MAT_OIL ||
           material == MAT_ACID || material == MAT_HONEY || material == MAT_CONCRETE;
}

fn isPowder(material: u32) -> bool {
    return material == MAT_SAND || material == MAT_DIRT || material == MAT_GUNPOWDER;
}

fn pcgHash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn getVoxelSafe(pos: vec3<i32>) -> u32 {
    if (pos.x < 0 || pos.x >= i32(constants.gridSizeX) ||
        pos.y < 0 || pos.y >= i32(constants.gridSizeY) ||
        pos.z < 0 || pos.z >= i32(constants.gridSizeZ)) {
        return packVoxel(MAT_BEDROCK, 0u, 0u, 0u);
    }

    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(vec3<u32>(pos), gridSize);
    return voxelGridIn[idx];
}

fn setVoxel(pos: vec3<u32>, voxel: u32) {
    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(pos, gridSize);
    atomicStore(&voxelGridOut[idx], voxel);
}

fn tryMoveVoxel(currentVoxel: u32, fromPos: vec3<u32>, toPos: vec3<i32>) -> bool {
    // Bounds check
    if (toPos.x < 0 || toPos.x >= i32(constants.gridSizeX) ||
        toPos.y < 0 || toPos.y >= i32(constants.gridSizeY) ||
        toPos.z < 0 || toPos.z >= i32(constants.gridSizeZ)) {
        return false;
    }

    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let destIdx = linearIndex3D(vec3<u32>(toPos), gridSize);
    let airVoxel = packVoxel(MAT_AIR, 0u, 0u, 0u);
    let material = getMaterial(currentVoxel);
    let variant = getVariant(currentVoxel);
    let newVoxel = packVoxel(material, variant, 0u, 0u);

    // Try to atomically claim the destination (only if it's AIR)
    let result = atomicCompareExchangeWeak(&voxelGridOut[destIdx], airVoxel, newVoxel);

    if (result.exchanged) {
        // Successfully moved - clear current position
        setVoxel(fromPos, airVoxel);
        return true;
    }
    return false;
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    // Bounds check
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) {
        return;
    }

    let pos = vec3<i32>(DTid);
    let currentVoxel = getVoxelSafe(pos);
    let material = getMaterial(currentVoxel);

    // AIR: Initialize output buffer position
    if (material == MAT_AIR) {
        setVoxel(DTid, packVoxel(MAT_AIR, 0u, 0u, 0u));
        return;
    }

    // BEDROCK: Never moves
    if (material == MAT_BEDROCK) {
        setVoxel(DTid, currentVoxel);
        return;
    }

    // Static/non-movable: Stay in place
    if (!isMovable(material)) {
        setVoxel(DTid, currentVoxel);
        return;
    }

    // === FALLING SAND PHYSICS ===

    // Try to fall straight down first
    let belowPos = pos + vec3<i32>(0, -1, 0);
    if (belowPos.y >= 0) {
        let belowVoxel = getVoxelSafe(belowPos);
        let belowMaterial = getMaterial(belowVoxel);

        if (isEmpty(belowMaterial)) {
            if (tryMoveVoxel(currentVoxel, DTid, belowPos)) {
                return;
            }
        }

        // Powders: Try diagonal down sliding
        if (isPowder(material)) {
            let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.frameIndex);

            // 4 diagonal-down directions
            var diagDirs: array<vec3<i32>, 4>;
            diagDirs[0] = vec3<i32>(1, -1, 0);
            diagDirs[1] = vec3<i32>(-1, -1, 0);
            diagDirs[2] = vec3<i32>(0, -1, 1);
            diagDirs[3] = vec3<i32>(0, -1, -1);

            let startDir = rng % 4u;
            for (var i = 0u; i < 4u; i++) {
                let dirIdx = (startDir + i) % 4u;
                let diagPos = pos + diagDirs[dirIdx];

                if (diagPos.x >= 0 && diagPos.x < i32(constants.gridSizeX) &&
                    diagPos.y >= 0 &&
                    diagPos.z >= 0 && diagPos.z < i32(constants.gridSizeZ)) {

                    let diagVoxel = getVoxelSafe(diagPos);
                    if (isEmpty(getMaterial(diagVoxel))) {
                        if (tryMoveVoxel(currentVoxel, DTid, diagPos)) {
                            return;
                        }
                    }
                }
            }
        }

        // Liquids: Try diagonal-down, then horizontal spread
        if (isLiquid(material)) {
            let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.frameIndex);

            // Diagonal-down first
            var diagDownDirs: array<vec3<i32>, 4>;
            diagDownDirs[0] = vec3<i32>(1, -1, 0);
            diagDownDirs[1] = vec3<i32>(-1, -1, 0);
            diagDownDirs[2] = vec3<i32>(0, -1, 1);
            diagDownDirs[3] = vec3<i32>(0, -1, -1);

            let startDiag = rng % 4u;
            for (var i = 0u; i < 4u; i++) {
                let dirIdx = (startDiag + i) % 4u;
                let diagPos = pos + diagDownDirs[dirIdx];

                if (diagPos.x >= 0 && diagPos.x < i32(constants.gridSizeX) &&
                    diagPos.y >= 0 &&
                    diagPos.z >= 0 && diagPos.z < i32(constants.gridSizeZ)) {

                    let diagVoxel = getVoxelSafe(diagPos);
                    if (isEmpty(getMaterial(diagVoxel))) {
                        if (tryMoveVoxel(currentVoxel, DTid, diagPos)) {
                            return;
                        }
                    }
                }
            }

            // Horizontal spread
            var horizDirs: array<vec3<i32>, 4>;
            horizDirs[0] = vec3<i32>(1, 0, 0);
            horizDirs[1] = vec3<i32>(-1, 0, 0);
            horizDirs[2] = vec3<i32>(0, 0, 1);
            horizDirs[3] = vec3<i32>(0, 0, -1);

            let startHoriz = (rng >> 2u) % 4u;
            for (var j = 0u; j < 4u; j++) {
                let dirIdx = (startHoriz + j) % 4u;
                let sidePos = pos + horizDirs[dirIdx];

                if (sidePos.x >= 0 && sidePos.x < i32(constants.gridSizeX) &&
                    sidePos.z >= 0 && sidePos.z < i32(constants.gridSizeZ)) {

                    let sideVoxel = getVoxelSafe(sidePos);
                    if (isEmpty(getMaterial(sideVoxel))) {
                        if (tryMoveVoxel(currentVoxel, DTid, sidePos)) {
                            return;
                        }
                    }
                }
            }
        }
    }

    // No movement possible - stay put
    setVoxel(DTid, currentVoxel);
}
