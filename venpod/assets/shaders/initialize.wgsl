// =============================================================================
// VENPOD WebGPU - Initialize Compute Shader
// Creates initial test pattern in voxel world
// =============================================================================

const MAT_AIR: u32 = 0u;
const MAT_SAND: u32 = 1u;
const MAT_WATER: u32 = 2u;
const MAT_STONE: u32 = 3u;
const MAT_DIRT: u32 = 4u;
const MAT_BEDROCK: u32 = 255u;

struct InitConstants {
    gridSizeX: u32,
    gridSizeY: u32,
    gridSizeZ: u32,
    seed: u32,
}

@group(0) @binding(0) var<uniform> constants: InitConstants;
@group(0) @binding(1) var<storage, read_write> voxelGrid: array<u32>;

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) |
           ((variant & 0xFFu) << 8u) |
           ((velocity & 0xFFu) << 16u) |
           ((state & 0xFFu) << 24u);
}

fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}

fn pcgHash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) {
        return;
    }

    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(DTid, gridSize);

    // Generate random variant for visual noise
    let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.seed);
    let variant = rng & 0xFFu;

    var voxel: u32 = packVoxel(MAT_AIR, 0u, 0u, 0u);

    // Create bedrock floor at Y=0
    if (DTid.y == 0u) {
        voxel = packVoxel(MAT_BEDROCK, variant, 0u, 0u);
    }
    // Create some terrain hills
    else {
        let centerX = f32(constants.gridSizeX) / 2.0;
        let centerZ = f32(constants.gridSizeZ) / 2.0;

        // Distance from center
        let dx = f32(DTid.x) - centerX;
        let dz = f32(DTid.z) - centerZ;
        let dist = sqrt(dx * dx + dz * dz);

        // Create a bowl-shaped terrain with noise
        let baseHeight = 5.0 + sin(f32(DTid.x) * 0.1) * 3.0 + cos(f32(DTid.z) * 0.1) * 3.0;
        let heightNoise = f32((rng >> 8u) & 0x7u) - 3.5;
        let terrainHeight = baseHeight + heightNoise;

        if (f32(DTid.y) <= terrainHeight) {
            // Stone base
            if (f32(DTid.y) < terrainHeight - 2.0) {
                voxel = packVoxel(MAT_STONE, variant, 0u, 0u);
            }
            // Dirt layer
            else if (f32(DTid.y) < terrainHeight - 0.5) {
                voxel = packVoxel(MAT_DIRT, variant, 0u, 0u);
            }
            // Top layer sand
            else {
                voxel = packVoxel(MAT_SAND, variant, 0u, 0u);
            }
        }

        // Create walls around the perimeter (containment)
        let wallThickness = 2u;
        if (DTid.x < wallThickness || DTid.x >= constants.gridSizeX - wallThickness ||
            DTid.z < wallThickness || DTid.z >= constants.gridSizeZ - wallThickness) {
            if (DTid.y < 30u) {
                voxel = packVoxel(MAT_STONE, variant, 0u, 0u);
            }
        }

        // Add a water pool in the corner
        if (DTid.x >= 10u && DTid.x < 40u &&
            DTid.z >= 10u && DTid.z < 40u &&
            DTid.y > 0u && DTid.y < 8u) {
            // Clear the area first, then fill with water
            if (f32(DTid.y) > terrainHeight || DTid.y < 6u) {
                if (DTid.y >= 1u && DTid.y <= 5u) {
                    voxel = packVoxel(MAT_WATER, variant, 0u, 0u);
                }
            }
        }

        // Add some sand piles that will fall
        let sandPileX = constants.gridSizeX / 2u;
        let sandPileZ = constants.gridSizeZ / 2u;
        let pileDx = i32(DTid.x) - i32(sandPileX);
        let pileDz = i32(DTid.z) - i32(sandPileZ);
        let pileDist = sqrt(f32(pileDx * pileDx + pileDz * pileDz));

        if (pileDist < 15.0 && DTid.y >= 20u && DTid.y < 35u) {
            let pileHeight = 35.0 - pileDist;
            if (f32(DTid.y) < pileHeight + 20.0) {
                voxel = packVoxel(MAT_SAND, variant, 0u, 0u);
            }
        }
    }

    voxelGrid[idx] = voxel;
}
