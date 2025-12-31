// =============================================================================
// VENPOD WebGPU - Common Shader Utilities
// Shared types, constants, and helper functions
// =============================================================================

// Material IDs
const MAT_AIR: u32 = 0u;
const MAT_SAND: u32 = 1u;
const MAT_WATER: u32 = 2u;
const MAT_STONE: u32 = 3u;
const MAT_DIRT: u32 = 4u;
const MAT_WOOD: u32 = 5u;
const MAT_FIRE: u32 = 6u;
const MAT_LAVA: u32 = 7u;
const MAT_ICE: u32 = 8u;
const MAT_OIL: u32 = 9u;
const MAT_GLASS: u32 = 10u;
const MAT_SMOKE: u32 = 11u;
const MAT_ACID: u32 = 12u;
const MAT_HONEY: u32 = 13u;
const MAT_CONCRETE: u32 = 14u;
const MAT_GUNPOWDER: u32 = 15u;
const MAT_CRYSTAL: u32 = 16u;
const MAT_STEAM: u32 = 17u;
const MAT_BEDROCK: u32 = 255u;

// State flags
const STATE_IS_STATIC: u32 = 0x80u;
const STATE_IS_IGNITED: u32 = 0x40u;
const STATE_HAS_MOVED: u32 = 0x20u;
const STATE_LIFE_MASK: u32 = 0x0Fu;

// ============================================================================
// Voxel Bit Packing
// ============================================================================
// Layout (32-bit):
//   Bits 31-24: State
//   Bits 23-16: Velocity
//   Bits 15-08: Variant
//   Bits 07-00: Material ID

fn getMaterial(voxel: u32) -> u32 {
    return voxel & 0xFFu;
}

fn getVariant(voxel: u32) -> u32 {
    return (voxel >> 8u) & 0xFFu;
}

fn getVelocity(voxel: u32) -> u32 {
    return (voxel >> 16u) & 0xFFu;
}

fn getState(voxel: u32) -> u32 {
    return (voxel >> 24u) & 0xFFu;
}

fn packVoxel(material: u32, variant: u32, velocity: u32, state: u32) -> u32 {
    return (material & 0xFFu) |
           ((variant & 0xFFu) << 8u) |
           ((velocity & 0xFFu) << 16u) |
           ((state & 0xFFu) << 24u);
}

fn isStatic(voxel: u32) -> bool {
    return (getState(voxel) & STATE_IS_STATIC) != 0u;
}

fn isAir(voxel: u32) -> bool {
    return getMaterial(voxel) == MAT_AIR;
}

fn isEmpty(material: u32) -> bool {
    return material == MAT_AIR;
}

fn isSolid(voxel: u32) -> bool {
    let mat = getMaterial(voxel);
    return mat == MAT_STONE || mat == MAT_BEDROCK || mat == MAT_GLASS || mat == MAT_WOOD || mat == MAT_ICE;
}

fn isLiquid(voxel: u32) -> bool {
    let mat = getMaterial(voxel);
    return mat == MAT_WATER || mat == MAT_LAVA || mat == MAT_OIL ||
           mat == MAT_ACID || mat == MAT_HONEY || mat == MAT_CONCRETE;
}

fn isPowder(voxel: u32) -> bool {
    let mat = getMaterial(voxel);
    return mat == MAT_SAND || mat == MAT_DIRT || mat == MAT_GUNPOWDER;
}

fn isMovable(material: u32) -> bool {
    return material == MAT_SAND || material == MAT_DIRT || material == MAT_WATER ||
           material == MAT_LAVA || material == MAT_OIL ||
           material == MAT_SMOKE || material == MAT_FIRE || material == MAT_ACID ||
           material == MAT_HONEY || material == MAT_CONCRETE || material == MAT_GUNPOWDER ||
           material == MAT_STEAM;
}

fn canFall(voxel: u32) -> bool {
    return !isAir(voxel) && !isSolid(voxel) && !isStatic(voxel);
}

// ============================================================================
// Grid Indexing
// ============================================================================

fn linearIndex3D(coord: vec3<u32>, gridSize: vec3<u32>) -> u32 {
    return coord.x + coord.y * gridSize.x + coord.z * gridSize.x * gridSize.y;
}

fn linearToCoord3D(index: u32, gridSize: vec3<u32>) -> vec3<u32> {
    let z = index / (gridSize.x * gridSize.y);
    let remainder = index % (gridSize.x * gridSize.y);
    let y = remainder / gridSize.x;
    let x = remainder % gridSize.x;
    return vec3<u32>(x, y, z);
}

fn isInBounds(coord: vec3<i32>, gridSize: vec3<u32>) -> bool {
    return coord.x >= 0 && coord.x < i32(gridSize.x) &&
           coord.y >= 0 && coord.y < i32(gridSize.y) &&
           coord.z >= 0 && coord.z < i32(gridSize.z);
}

// ============================================================================
// PCG Random Number Generator
// ============================================================================

fn pcgHash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn randomFloat(seed: u32) -> f32 {
    return f32(pcgHash(seed)) / 4294967295.0;
}

// ============================================================================
// Material Colors (for palette)
// ============================================================================

fn getMaterialColor(material: u32) -> vec4<f32> {
    switch (material) {
        case 0u: { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }       // AIR
        case 1u: { return vec4<f32>(0.76, 0.70, 0.50, 1.0); }    // SAND
        case 2u: { return vec4<f32>(0.2, 0.4, 0.8, 0.7); }       // WATER
        case 3u: { return vec4<f32>(0.5, 0.5, 0.5, 1.0); }       // STONE
        case 4u: { return vec4<f32>(0.55, 0.35, 0.2, 1.0); }     // DIRT
        case 5u: { return vec4<f32>(0.6, 0.4, 0.2, 1.0); }       // WOOD
        case 6u: { return vec4<f32>(1.0, 0.6, 0.1, 1.0); }       // FIRE
        case 7u: { return vec4<f32>(1.0, 0.3, 0.0, 1.0); }       // LAVA
        case 8u: { return vec4<f32>(0.7, 0.85, 0.95, 0.8); }     // ICE
        case 9u: { return vec4<f32>(0.15, 0.1, 0.2, 0.9); }      // OIL
        case 10u: { return vec4<f32>(0.9, 0.95, 1.0, 0.3); }     // GLASS
        case 11u: { return vec4<f32>(0.3, 0.3, 0.35, 0.4); }     // SMOKE
        case 12u: { return vec4<f32>(0.2, 0.9, 0.2, 0.6); }      // ACID
        case 13u: { return vec4<f32>(0.95, 0.75, 0.2, 0.8); }    // HONEY
        case 14u: { return vec4<f32>(0.6, 0.6, 0.65, 1.0); }     // CONCRETE
        case 15u: { return vec4<f32>(0.2, 0.2, 0.25, 1.0); }     // GUNPOWDER
        case 16u: { return vec4<f32>(0.7, 0.3, 0.9, 0.7); }      // CRYSTAL
        case 17u: { return vec4<f32>(0.9, 0.95, 1.0, 0.3); }     // STEAM
        case 255u: { return vec4<f32>(0.2, 0.2, 0.2, 1.0); }     // BEDROCK
        default: { return vec4<f32>(1.0, 0.0, 1.0, 1.0); }       // Unknown (magenta)
    }
}
