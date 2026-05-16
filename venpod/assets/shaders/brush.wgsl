// =============================================================================
// VENPOD WebGPU - Brush Compute Shader
// Paints/erases voxels in a spherical brush area
// =============================================================================

const MAT_AIR: u32 = 0u;

// Brush modes
const BRUSH_MODE_PAINT: u32 = 0u;
const BRUSH_MODE_ERASE: u32 = 1u;

// Brush shapes
const BRUSH_SHAPE_SPHERE: u32 = 0u;
const BRUSH_SHAPE_CUBE: u32 = 1u;
const BRUSH_SHAPE_CYLINDER: u32 = 2u;

struct BrushConstants {
    positionX: f32,
    positionY: f32,
    positionZ: f32,
    radius: f32,
    material: u32,
    mode: u32,
    shape: u32,
    strength: f32,
    gridSizeX: u32,
    gridSizeY: u32,
    gridSizeZ: u32,
    seed: u32,
}

@group(0) @binding(0) var<uniform> constants: BrushConstants;
@group(0) @binding(1) var<storage, read_write> voxelGrid: array<u32>;

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) |
           ((variant & 0xFFu) << 8u) |
           ((velocity & 0xFFu) << 16u) |
           ((state & 0xFFu) << 24u);
}

fn getMaterial(voxel: u32) -> u32 {
    return voxel & 0xFFu;
}

fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}

fn pcgHash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn isInBrush(pos: vec3<f32>, center: vec3<f32>, radius: f32, shape: u32) -> bool {
    let diff = pos - center;

    switch (shape) {
        case 0u: { // SPHERE
            let dist = length(diff);
            return dist <= radius;
        }
        case 1u: { // CUBE
            return abs(diff.x) <= radius && abs(diff.y) <= radius && abs(diff.z) <= radius;
        }
        case 2u: { // CYLINDER
            let horizDist = sqrt(diff.x * diff.x + diff.z * diff.z);
            return horizDist <= radius && abs(diff.y) <= radius;
        }
        default: {
            return false;
        }
    }
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= constants.gridSizeX || DTid.y >= constants.gridSizeY || DTid.z >= constants.gridSizeZ) {
        return;
    }

    let gridSize = vec3<u32>(constants.gridSizeX, constants.gridSizeY, constants.gridSizeZ);
    let idx = linearIndex3D(DTid, gridSize);

    let brushCenter = vec3<f32>(constants.positionX, constants.positionY, constants.positionZ);
    let voxelCenter = vec3<f32>(f32(DTid.x) + 0.5, f32(DTid.y) + 0.5, f32(DTid.z) + 0.5);

    if (isInBrush(voxelCenter, brushCenter, constants.radius, constants.shape)) {
        let currentVoxel = voxelGrid[idx];
        let currentMaterial = getMaterial(currentVoxel);

        // Generate variant for visual noise
        let rng = pcgHash(DTid.x + DTid.y * 1000u + DTid.z * 1000000u + constants.seed);
        let variant = rng & 0xFFu;

        if (constants.mode == BRUSH_MODE_PAINT) {
            // Paint mode: Replace air or any material with brush material
            // But don't overwrite bedrock
            if (currentMaterial != 255u) { // Not bedrock
                voxelGrid[idx] = packVoxel(constants.material, variant, 0u, 0u);
            }
        } else if (constants.mode == BRUSH_MODE_ERASE) {
            // Erase mode: Replace non-bedrock with air
            if (currentMaterial != 255u && currentMaterial != MAT_AIR) {
                voxelGrid[idx] = packVoxel(MAT_AIR, 0u, 0u, 0u);
            }
        }
    }
}
