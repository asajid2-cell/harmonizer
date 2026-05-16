// =============================================================================
// VENPOD - 3D Voxel Physics Engine (Pure JavaScript WebGPU)
// Falling sand simulation with compute shaders and raymarching
// =============================================================================
console.log('VENPOD: Script loading...');

const VENPOD = {
    // Grid dimensions
    GRID_SIZE_X: 64,
    GRID_SIZE_Y: 48,
    GRID_SIZE_Z: 64,

    // Material IDs
    Materials: {
        AIR: 0,
        SAND: 1,
        WATER: 2,
        STONE: 3,
        DIRT: 4,
        FIRE: 5,
        LAVA: 6,
        OIL: 7,
        ACID: 8,
        GUNPOWDER: 9
    },

    // Material colors (RGBA)
    MaterialColors: [
        [0.0, 0.0, 0.0, 0.0],    // AIR
        [0.76, 0.70, 0.50, 1.0], // SAND
        [0.2, 0.4, 0.8, 0.7],    // WATER
        [0.5, 0.5, 0.5, 1.0],    // STONE
        [0.55, 0.35, 0.17, 1.0], // DIRT
        [1.0, 0.4, 0.1, 1.0],    // FIRE
        [1.0, 0.3, 0.0, 1.0],    // LAVA
        [0.1, 0.05, 0.2, 0.9],   // OIL
        [0.2, 0.9, 0.2, 0.8],    // ACID
        [0.2, 0.2, 0.25, 1.0]    // GUNPOWDER
    ],

    // State
    device: null,
    context: null,
    canvas: null,
    voxelBuffer: null,
    voxelBufferB: null,
    uniformBuffer: null,
    frameIndex: 0,
    paused: false,
    currentMaterial: 1,
    brushRadius: 3,

    // Camera
    camera: {
        position: [32, 35, -25],
        yaw: 0,
        pitch: -0.5,
        forward: [0, 0, 1],
        right: [1, 0, 0],
        up: [0, 1, 0]
    },

    // Input state
    keys: {},
    mouseButtons: [false, false, false],
    mouseCaptured: false,

    // Pipelines
    physicsPipeline: null,
    renderPipeline: null,
    physicsBindGroupA: null,
    physicsBindGroupB: null,
    renderBindGroup: null,

    // Shaders
    physicsShader: `
        struct Uniforms {
            gridSize: vec3<u32>,
            frameIndex: u32,
            deltaTime: f32,
            brushRadius: f32,
            brushMaterial: u32,
            brushActive: u32,
            brushPos: vec3<f32>,
            _pad: f32,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var<storage, read> voxelsIn: array<u32>;
        @group(0) @binding(2) var<storage, read_write> voxelsOut: array<u32>;

        // Material constants
        const AIR: u32 = 0u;
        const SAND: u32 = 1u;
        const WATER: u32 = 2u;
        const STONE: u32 = 3u;
        const DIRT: u32 = 4u;
        const FIRE: u32 = 5u;
        const LAVA: u32 = 6u;
        const OIL: u32 = 7u;
        const ACID: u32 = 8u;
        const GUNPOWDER: u32 = 9u;

        fn idx(x: u32, y: u32, z: u32) -> u32 {
            return x + y * uniforms.gridSize.x + z * uniforms.gridSize.x * uniforms.gridSize.y;
        }

        fn getVoxel(x: i32, y: i32, z: i32) -> u32 {
            if (x < 0 || y < 0 || z < 0 ||
                u32(x) >= uniforms.gridSize.x ||
                u32(y) >= uniforms.gridSize.y ||
                u32(z) >= uniforms.gridSize.z) {
                return STONE; // Solid boundaries
            }
            return voxelsIn[idx(u32(x), u32(y), u32(z))];
        }

        fn setVoxel(x: u32, y: u32, z: u32, mat: u32) {
            voxelsOut[idx(x, y, z)] = mat;
        }

        fn hash(p: vec3<u32>) -> u32 {
            var h = p.x * 374761393u + p.y * 668265263u + p.z * 1440670873u + uniforms.frameIndex * 123456789u;
            h = (h ^ (h >> 13u)) * 1274126177u;
            return h;
        }

        // Check if material is a liquid (flows horizontally)
        fn isLiquid(mat: u32) -> bool {
            return mat == WATER || mat == LAVA || mat == OIL || mat == ACID;
        }

        // Check if material falls due to gravity (powder or liquid)
        fn fallsWithGravity(mat: u32) -> bool {
            return mat == SAND || mat == WATER || mat == LAVA || mat == OIL || mat == ACID || mat == GUNPOWDER || mat == DIRT;
        }

        // Check if material is a powder (sand-like diagonal falling)
        fn isPowder(mat: u32) -> bool {
            return mat == SAND || mat == GUNPOWDER || mat == DIRT;
        }

        // Check if material can be displaced by a falling object
        fn canDisplace(falling: u32, dest: u32) -> bool {
            if (dest == AIR) { return true; }
            // Powders do NOT sink through liquids - they float on top
            // Heavier liquids sink: lava sinks in water/oil, water sinks in oil
            if (falling == LAVA && (dest == WATER || dest == OIL)) { return true; }
            if (falling == WATER && dest == OIL) { return true; }
            return false;
        }

        @compute @workgroup_size(4, 4, 4)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
            let x = gid.x;
            let y = gid.y;
            let z = gid.z;

            if (x >= uniforms.gridSize.x || y >= uniforms.gridSize.y || z >= uniforms.gridSize.z) {
                return;
            }

            let ix = i32(x);
            let iy = i32(y);
            let iz = i32(z);

            let currentMat = getVoxel(ix, iy, iz);
            var newMat = currentMat;

            // Apply brush
            if (uniforms.brushActive == 1u) {
                let dist = length(vec3<f32>(f32(x), f32(y), f32(z)) - uniforms.brushPos);
                if (dist < uniforms.brushRadius) {
                    newMat = uniforms.brushMaterial;
                    setVoxel(x, y, z, newMat);
                    return;
                }
            }

            let rng = hash(gid);
            let below = getVoxel(ix, iy - 1, iz);
            let above = getVoxel(ix, iy + 1, iz);

            // === MATERIAL SWAPPING (liquids only - powder floats on liquid) ===
            // Heavier liquids sink through lighter ones
            if (isLiquid(currentMat)) {
                // Heavier liquid above sinks
                if (currentMat == OIL && (above == WATER || above == LAVA)) {
                    newMat = above;
                }
                else if (currentMat == WATER && above == LAVA) {
                    newMat = above;
                }
            }

            // === GRAVITY FALLING (powders and liquids) ===
            if (fallsWithGravity(currentMat) && newMat == currentMat) {
                // Try to fall straight down
                if (canDisplace(currentMat, below)) {
                    newMat = below; // Swap with what's below (air or lighter liquid)
                }
                // Powders try diagonal falling if blocked
                else if (isPowder(currentMat)) {
                    let dirX = select(-1, 1, (rng & 1u) == 0u);
                    let dirZ = select(-1, 1, (rng & 2u) == 0u);

                    // Try 4 diagonal directions
                    let d1 = getVoxel(ix + dirX, iy - 1, iz);
                    let d2 = getVoxel(ix - dirX, iy - 1, iz);
                    let d3 = getVoxel(ix, iy - 1, iz + dirZ);
                    let d4 = getVoxel(ix, iy - 1, iz - dirZ);

                    if (canDisplace(currentMat, d1) && getVoxel(ix + dirX, iy, iz) == AIR) {
                        newMat = d1;
                    } else if (canDisplace(currentMat, d2) && getVoxel(ix - dirX, iy, iz) == AIR) {
                        newMat = d2;
                    } else if (canDisplace(currentMat, d3) && getVoxel(ix, iy, iz + dirZ) == AIR) {
                        newMat = d3;
                    } else if (canDisplace(currentMat, d4) && getVoxel(ix, iy, iz - dirZ) == AIR) {
                        newMat = d4;
                    }
                }
            }

            // === RECEIVE FALLING MATERIAL ===
            if (currentMat == AIR) {
                // Receive from directly above
                if (fallsWithGravity(above)) {
                    // Don't receive from liquid that will swap UP with heavier liquid above it
                    let aboveAbove = getVoxel(ix, iy + 2, iz);
                    var liquidSwapsUp = false;
                    if (isLiquid(above)) {
                        // Oil swaps up with heavier liquids
                        if (above == OIL && (aboveAbove == WATER || aboveAbove == LAVA)) { liquidSwapsUp = true; }
                        // Water swaps up with lava
                        if (above == WATER && aboveAbove == LAVA) { liquidSwapsUp = true; }
                    }
                    if (!liquidSwapsUp) {
                        newMat = above;
                    }
                }
                // Powder diagonal slide receive
                else {
                    let rdir = select(-1, 1, (rng & 1u) == 0u);
                    let diagAboveX = getVoxel(ix + rdir, iy + 1, iz);
                    let diagAboveZ = getVoxel(ix, iy + 1, iz + rdir);
                    let sideX = getVoxel(ix + rdir, iy, iz);
                    let sideZ = getVoxel(ix, iy, iz + rdir);

                    if (isPowder(diagAboveX) && sideX == AIR) {
                        newMat = diagAboveX;
                    } else if (isPowder(diagAboveZ) && sideZ == AIR) {
                        newMat = diagAboveZ;
                    }
                }
            }

            // === LIQUID FLOWS SIDEWAYS TO HOLE ===
            // Liquid blocked below can flow SIDEWAYS to an air cell that has air below (a hole)
            // IMPORTANT: Only check ONE axis per frame to match receiver logic and prevent mass loss
            // Uses deterministic direction based on frame to match with receive logic
            if (isLiquid(currentMat) && newMat == currentMat && below != AIR) {
                // Deterministic direction: alternate by frame and position
                let evenFrame = (uniforms.frameIndex & 1u) == 0u;
                let xAxisFrame = (uniforms.frameIndex & 2u) == 0u;
                let evenX = (x & 1u) == 0u;
                let evenZ = (z & 1u) == 0u;

                // Only check one axis per frame
                if (xAxisFrame) {
                    let dirX = select(-1, 1, evenFrame == evenX);
                    let sideX = getVoxel(ix + dirX, iy, iz);
                    let belowSideX = getVoxel(ix + dirX, iy - 1, iz);
                    // Flow to side if: side is AIR and below side is AIR (it's above a hole)
                    if (sideX == AIR && belowSideX == AIR) {
                        newMat = AIR;
                    }
                } else {
                    let dirZ = select(-1, 1, evenFrame == evenZ);
                    let sideZ = getVoxel(ix, iy, iz + dirZ);
                    let belowSideZ = getVoxel(ix, iy - 1, iz + dirZ);
                    if (sideZ == AIR && belowSideZ == AIR) {
                        newMat = AIR;
                    }
                }
            }

            // === AIR ABOVE HOLE RECEIVES FROM BLOCKED LIQUID ===
            // Air cell above a hole can receive liquid from same-level blocked neighbor
            // IMPORTANT: Only check ONE axis per frame to prevent multiple receivers from same giver
            // Use bit 1 of frameIndex to alternate: even-ish frames check X, odd-ish check Z
            if (currentMat == AIR && newMat == AIR && below == AIR) {
                let evenFrame = (uniforms.frameIndex & 1u) == 0u;
                let xAxisFrame = (uniforms.frameIndex & 2u) == 0u;
                let evenX = (x & 1u) == 0u;
                let evenZ = (z & 1u) == 0u;

                // Use same formula as giver. Since our position is giver+dir, our parity is flipped,
                // so the same formula gives opposite direction, pointing back at the giver.
                if (xAxisFrame) {
                    let rdirX = select(-1, 1, evenFrame == evenX);
                    let giverX = getVoxel(ix + rdirX, iy, iz);
                    let blockedX = getVoxel(ix + rdirX, iy - 1, iz) != AIR;
                    if (isLiquid(giverX) && blockedX) {
                        newMat = giverX;
                    }
                } else {
                    let rdirZ = select(-1, 1, evenFrame == evenZ);
                    let giverZ = getVoxel(ix, iy, iz + rdirZ);
                    let blockedZ = getVoxel(ix, iy - 1, iz + rdirZ) != AIR;
                    if (isLiquid(giverZ) && blockedZ) {
                        newMat = giverZ;
                    }
                }
            }

            // === FIRE BEHAVIOR ===
            if (currentMat == FIRE) {
                // Fire burns out randomly
                if ((rng & 15u) == 0u) {
                    newMat = AIR;
                }
                // Fire rises
                else if (above == AIR && (rng & 3u) == 0u) {
                    newMat = AIR;
                }
            }

            // === RECEIVE FIRE ===
            if (currentMat == AIR) {
                let fireBelow = getVoxel(ix, iy - 1, iz);
                if (fireBelow == FIRE && (rng & 3u) == 0u) {
                    newMat = FIRE;
                }
            }

            setVoxel(x, y, z, newMat);
        }
    `,

    renderShader: `
        struct Uniforms {
            gridSize: vec3<u32>,
            frameIndex: u32,
            cameraPos: vec3<f32>,
            _pad1: f32,
            cameraForward: vec3<f32>,
            _pad2: f32,
            cameraRight: vec3<f32>,
            _pad3: f32,
            cameraUp: vec3<f32>,
            aspectRatio: f32,
        }

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) uv: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var<storage, read> voxels: array<u32>;

        // Material colors
        const colors = array<vec4<f32>, 10>(
            vec4<f32>(0.0, 0.0, 0.0, 0.0),    // AIR
            vec4<f32>(0.76, 0.70, 0.50, 1.0), // SAND
            vec4<f32>(0.2, 0.4, 0.8, 0.7),    // WATER
            vec4<f32>(0.5, 0.5, 0.5, 1.0),    // STONE
            vec4<f32>(0.55, 0.35, 0.17, 1.0), // DIRT
            vec4<f32>(1.0, 0.4, 0.1, 1.0),    // FIRE
            vec4<f32>(1.0, 0.3, 0.0, 1.0),    // LAVA
            vec4<f32>(0.1, 0.05, 0.2, 0.9),   // OIL
            vec4<f32>(0.2, 0.9, 0.2, 0.8),    // ACID
            vec4<f32>(0.2, 0.2, 0.25, 1.0)    // GUNPOWDER
        );

        @vertex
        fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
            var positions = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(3.0, -1.0),
                vec2<f32>(-1.0, 3.0)
            );
            var output: VertexOutput;
            output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
            output.uv = positions[vertexIndex] * 0.5 + 0.5;
            return output;
        }

        fn idx(x: u32, y: u32, z: u32) -> u32 {
            return x + y * uniforms.gridSize.x + z * uniforms.gridSize.x * uniforms.gridSize.y;
        }

        fn getVoxel(x: i32, y: i32, z: i32) -> u32 {
            if (x < 0 || y < 0 || z < 0 ||
                u32(x) >= uniforms.gridSize.x ||
                u32(y) >= uniforms.gridSize.y ||
                u32(z) >= uniforms.gridSize.z) {
                return 0u;
            }
            return voxels[idx(u32(x), u32(y), u32(z))];
        }

        fn rayMarch(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec4<f32> {
            let gridMin = vec3<f32>(0.0);
            let gridMax = vec3<f32>(uniforms.gridSize);
            let skyColor = vec4<f32>(0.1, 0.1, 0.15, 1.0);

            // Check if camera is inside grid
            let insideGrid = all(rayOrigin >= gridMin) && all(rayOrigin < gridMax);

            var startPos = rayOrigin;

            if (!insideGrid) {
                // Ray-box intersection with safe division
                let invDir = 1.0 / (rayDir + vec3<f32>(0.0001) * sign(rayDir + vec3<f32>(0.0001)));
                let t1 = (gridMin - rayOrigin) * invDir;
                let t2 = (gridMax - rayOrigin) * invDir;
                let tmin = min(t1, t2);
                let tmax = max(t1, t2);
                let tNear = max(max(tmin.x, tmin.y), tmin.z);
                let tFar = min(min(tmax.x, tmax.y), tmax.z);

                if (tNear > tFar || tFar < 0.0) {
                    return skyColor;
                }

                let tEntry = max(tNear, 0.001);
                startPos = rayOrigin + rayDir * tEntry;
            }

            // Clamp start position to be safely inside grid
            startPos = clamp(startPos, gridMin + vec3<f32>(0.001), gridMax - vec3<f32>(0.001));

            // DDA setup with safe values
            var step = vec3<i32>(0);
            if (rayDir.x > 0.0) { step.x = 1; } else if (rayDir.x < 0.0) { step.x = -1; }
            if (rayDir.y > 0.0) { step.y = 1; } else if (rayDir.y < 0.0) { step.y = -1; }
            if (rayDir.z > 0.0) { step.z = 1; } else if (rayDir.z < 0.0) { step.z = -1; }

            let absDir = abs(rayDir) + vec3<f32>(0.0001);
            let tDelta = 1.0 / absDir;

            var voxelPos = vec3<i32>(floor(startPos));

            // Calculate initial tMax values
            var tMaxVec = vec3<f32>(0.0);
            if (step.x > 0) {
                tMaxVec.x = (f32(voxelPos.x + 1) - startPos.x) / absDir.x;
            } else {
                tMaxVec.x = (startPos.x - f32(voxelPos.x)) / absDir.x;
            }
            if (step.y > 0) {
                tMaxVec.y = (f32(voxelPos.y + 1) - startPos.y) / absDir.y;
            } else {
                tMaxVec.y = (startPos.y - f32(voxelPos.y)) / absDir.y;
            }
            if (step.z > 0) {
                tMaxVec.z = (f32(voxelPos.z + 1) - startPos.z) / absDir.z;
            } else {
                tMaxVec.z = (startPos.z - f32(voxelPos.z)) / absDir.z;
            }

            var hitColor = skyColor;
            var lastAxis = 0;

            for (var i = 0u; i < 200u; i++) {
                // Bounds check
                if (voxelPos.x < 0 || voxelPos.y < 0 || voxelPos.z < 0 ||
                    voxelPos.x >= i32(uniforms.gridSize.x) ||
                    voxelPos.y >= i32(uniforms.gridSize.y) ||
                    voxelPos.z >= i32(uniforms.gridSize.z)) {
                    break;
                }

                let mat = getVoxel(voxelPos.x, voxelPos.y, voxelPos.z);
                if (mat > 0u && mat < 10u) {
                    let baseColor = colors[mat];
                    // Calculate normal based on which face was hit
                    var normal = vec3<f32>(0.0);
                    if (lastAxis == 0) {
                        normal.x = -f32(step.x);
                    } else if (lastAxis == 1) {
                        normal.y = -f32(step.y);
                    } else {
                        normal.z = -f32(step.z);
                    }
                    let lightDir = normalize(vec3<f32>(0.5, 1.0, 0.3));
                    let diffuse = max(dot(normal, lightDir), 0.3);
                    hitColor = vec4<f32>(baseColor.rgb * diffuse, 1.0);
                    break;
                }

                // Step to next voxel (DDA)
                if (tMaxVec.x < tMaxVec.y && tMaxVec.x < tMaxVec.z) {
                    voxelPos.x += step.x;
                    tMaxVec.x += tDelta.x;
                    lastAxis = 0;
                } else if (tMaxVec.y < tMaxVec.z) {
                    voxelPos.y += step.y;
                    tMaxVec.y += tDelta.y;
                    lastAxis = 1;
                } else {
                    voxelPos.z += step.z;
                    tMaxVec.z += tDelta.z;
                    lastAxis = 2;
                }
            }

            return hitColor;
        }

        @fragment
        fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
            let uv = input.uv * 2.0 - 1.0;
            let fov = 1.0;

            let rayDir = normalize(
                uniforms.cameraForward +
                uv.x * uniforms.cameraRight * uniforms.aspectRatio * fov +
                uv.y * uniforms.cameraUp * fov
            );

            return rayMarch(uniforms.cameraPos, rayDir);
        }
    `,

    async init(canvas) {
        this.canvas = canvas;
        console.log('VENPOD: Starting initialization...');

        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('No GPU adapter found');
        }
        console.log('VENPOD: Got GPU adapter');

        this.device = await adapter.requestDevice();
        console.log('VENPOD: Got GPU device');

        // Handle device loss
        this.device.lost.then((info) => {
            console.error('VENPOD: WebGPU device lost:', info.message);
        });

        this.context = canvas.getContext('webgpu');
        if (!this.context) {
            throw new Error('Failed to get WebGPU context');
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: format,
            alphaMode: 'premultiplied'
        });
        console.log('VENPOD: Canvas configured with format:', format);

        await this.createBuffers();
        console.log('VENPOD: Buffers created');

        await this.createPipelines(format);
        console.log('VENPOD: Pipelines created');

        this.initializeWorld();
        console.log('VENPOD: World initialized');

        this.setupInput();
        console.log('VENPOD: Input handlers set up');
        console.log('VENPOD: Initialization complete! Device:', !!this.device);

        return true;
    },

    async createBuffers() {
        const totalVoxels = this.GRID_SIZE_X * this.GRID_SIZE_Y * this.GRID_SIZE_Z;

        // Voxel buffers (ping-pong)
        this.voxelBuffer = this.device.createBuffer({
            size: totalVoxels * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.voxelBufferB = this.device.createBuffer({
            size: totalVoxels * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // Physics uniform buffer (48 bytes for aligned struct)
        this.physicsUniformBuffer = this.device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Render uniform buffer
        this.renderUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    },

    async createPipelines(format) {
        // Physics compute pipeline
        const physicsModule = this.device.createShaderModule({
            code: this.physicsShader
        });

        // Check for shader compilation errors
        const physicsInfo = await physicsModule.getCompilationInfo();
        if (physicsInfo.messages.length > 0) {
            console.log('Physics shader compilation messages:');
            physicsInfo.messages.forEach(m => console.log(`  ${m.type}: ${m.message}`));
            if (physicsInfo.messages.some(m => m.type === 'error')) {
                throw new Error('Physics shader compilation failed');
            }
        }

        const physicsBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
            ]
        });

        this.physicsPipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [physicsBindGroupLayout] }),
            compute: { module: physicsModule, entryPoint: 'main' }
        });

        this.physicsBindGroupA = this.device.createBindGroup({
            layout: physicsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.physicsUniformBuffer } },
                { binding: 1, resource: { buffer: this.voxelBuffer } },
                { binding: 2, resource: { buffer: this.voxelBufferB } }
            ]
        });

        this.physicsBindGroupB = this.device.createBindGroup({
            layout: physicsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.physicsUniformBuffer } },
                { binding: 1, resource: { buffer: this.voxelBufferB } },
                { binding: 2, resource: { buffer: this.voxelBuffer } }
            ]
        });

        // Render pipeline
        const renderModule = this.device.createShaderModule({
            code: this.renderShader
        });

        // Check for shader compilation errors
        const renderInfo = await renderModule.getCompilationInfo();
        if (renderInfo.messages.length > 0) {
            console.log('Render shader compilation messages:');
            renderInfo.messages.forEach(m => console.log(`  ${m.type}: ${m.message}`));
            if (renderInfo.messages.some(m => m.type === 'error')) {
                throw new Error('Render shader compilation failed');
            }
        }

        const renderBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
            ]
        });

        this.renderPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
            vertex: { module: renderModule, entryPoint: 'vs_main' },
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',
                targets: [{ format: format }]
            },
            primitive: { topology: 'triangle-list' }
        });

        this.renderBindGroupA = this.device.createBindGroup({
            layout: renderBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.renderUniformBuffer } },
                { binding: 1, resource: { buffer: this.voxelBuffer } }
            ]
        });

        this.renderBindGroupB = this.device.createBindGroup({
            layout: renderBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.renderUniformBuffer } },
                { binding: 1, resource: { buffer: this.voxelBufferB } }
            ]
        });
    },

    initializeWorld() {
        const totalVoxels = this.GRID_SIZE_X * this.GRID_SIZE_Y * this.GRID_SIZE_Z;
        const data = new Uint32Array(totalVoxels);

        // Helper to set voxel
        const setVoxel = (x, y, z, mat) => {
            if (x >= 0 && x < this.GRID_SIZE_X &&
                y >= 0 && y < this.GRID_SIZE_Y &&
                z >= 0 && z < this.GRID_SIZE_Z) {
                data[x + y * this.GRID_SIZE_X + z * this.GRID_SIZE_X * this.GRID_SIZE_Y] = mat;
            }
        };

        // Simple noise function for terrain
        const noise = (x, z) => {
            const s1 = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3;
            const s2 = Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 2;
            const s3 = Math.sin(x * 0.2) * Math.sin(z * 0.15) * 1.5;
            return s1 + s2 + s3;
        };

        // Create terrain with varied height
        for (let z = 0; z < this.GRID_SIZE_Z; z++) {
            for (let x = 0; x < this.GRID_SIZE_X; x++) {
                // Calculate terrain height (base + noise)
                const baseHeight = 8;
                const terrainHeight = Math.floor(baseHeight + noise(x, z));

                // Bedrock layer
                setVoxel(x, 0, z, this.Materials.STONE);

                // Stone layers
                for (let y = 1; y < terrainHeight - 2; y++) {
                    setVoxel(x, y, z, this.Materials.STONE);
                }

                // Dirt layers
                for (let y = Math.max(1, terrainHeight - 2); y < terrainHeight; y++) {
                    setVoxel(x, y, z, this.Materials.DIRT);
                }

                // Top layer - sand near edges, dirt elsewhere
                const edgeDist = Math.min(x, z, this.GRID_SIZE_X - x - 1, this.GRID_SIZE_Z - z - 1);
                if (edgeDist < 8) {
                    setVoxel(x, terrainHeight, z, this.Materials.SAND);
                }
            }
        }

        // Central sand pile/dune
        const cx = 32, cz = 32;
        for (let z = cz - 12; z < cz + 12; z++) {
            for (let x = cx - 12; x < cx + 12; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
                if (dist < 12) {
                    const baseY = Math.floor(8 + noise(x, z));
                    const pileHeight = Math.floor((12 - dist) * 0.8);
                    for (let y = baseY; y < baseY + pileHeight; y++) {
                        setVoxel(x, y, z, this.Materials.SAND);
                    }
                }
            }
        }

        // Water pool with raised edges (for overflow demonstration)
        for (let z = 42; z < 58; z++) {
            for (let x = 42; x < 58; x++) {
                const inPool = x > 44 && x < 56 && z > 44 && z < 56;
                if (inPool) {
                    // Dig out the pool
                    for (let y = 4; y < 12; y++) {
                        setVoxel(x, y, z, this.Materials.AIR);
                    }
                    // Fill with water
                    for (let y = 4; y < 9; y++) {
                        setVoxel(x, y, z, this.Materials.WATER);
                    }
                } else {
                    // Stone walls around pool
                    for (let y = 4; y < 11; y++) {
                        setVoxel(x, y, z, this.Materials.STONE);
                    }
                }
            }
        }

        // Deep basin/canyon for flood filling
        for (let z = 15; z < 30; z++) {
            for (let x = 40; x < 55; x++) {
                // Dig out a canyon
                const depth = Math.floor(4 + Math.sin(z * 0.3) * 2);
                for (let y = 2; y < 10 + depth; y++) {
                    setVoxel(x, y, z, this.Materials.AIR);
                }
                // Leave some water at the bottom
                setVoxel(x, 2, z, this.Materials.WATER);
                setVoxel(x, 3, z, this.Materials.WATER);
            }
        }

        // Lava pool in opposite corner (contained)
        for (let z = 5; z < 18; z++) {
            for (let x = 5; x < 18; x++) {
                const inLava = x > 6 && x < 17 && z > 6 && z < 17;
                if (inLava) {
                    for (let y = 2; y < 6; y++) {
                        setVoxel(x, y, z, this.Materials.LAVA);
                    }
                } else {
                    // Stone containment
                    for (let y = 2; y < 8; y++) {
                        setVoxel(x, y, z, this.Materials.STONE);
                    }
                }
            }
        }

        // Some oil floating on water in a corner
        for (let z = 52; z < 56; z++) {
            for (let x = 46; x < 50; x++) {
                setVoxel(x, 9, z, this.Materials.OIL);
                setVoxel(x, 10, z, this.Materials.OIL);
            }
        }

        this.device.queue.writeBuffer(this.voxelBuffer, 0, data);
        this.device.queue.writeBuffer(this.voxelBufferB, 0, data);
    },

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === 'p') this.paused = !this.paused;
            if (e.key >= '1' && e.key <= '9') {
                this.currentMaterial = parseInt(e.key);
                this.updateMaterialUI();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseButtons[e.button] = true;
            if (!this.mouseCaptured) {
                this.canvas.requestPointerLock();
                this.mouseCaptured = true;
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseButtons[e.button] = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.mouseCaptured) {
                this.camera.yaw += e.movementX * 0.002;
                this.camera.pitch -= e.movementY * 0.002;
                this.camera.pitch = Math.max(-1.5, Math.min(1.5, this.camera.pitch));
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.mouseCaptured = document.pointerLockElement === this.canvas;
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    updateMaterialUI() {
        const swatches = document.querySelectorAll('.material-swatch');
        swatches.forEach((s, i) => {
            s.classList.toggle('selected', i + 1 === this.currentMaterial);
        });
    },

    updateCamera(dt) {
        // Update camera direction
        this.camera.forward = [
            Math.cos(this.camera.pitch) * Math.sin(this.camera.yaw),
            Math.sin(this.camera.pitch),
            Math.cos(this.camera.pitch) * Math.cos(this.camera.yaw)
        ];

        this.camera.right = [
            Math.cos(this.camera.yaw),
            0,
            -Math.sin(this.camera.yaw)
        ];

        this.camera.up = [
            -Math.sin(this.camera.pitch) * Math.sin(this.camera.yaw),
            Math.cos(this.camera.pitch),
            -Math.sin(this.camera.pitch) * Math.cos(this.camera.yaw)
        ];

        // Movement
        const speed = 20 * dt;
        if (this.keys['w']) {
            this.camera.position[0] += this.camera.forward[0] * speed;
            this.camera.position[1] += this.camera.forward[1] * speed;
            this.camera.position[2] += this.camera.forward[2] * speed;
        }
        if (this.keys['s']) {
            this.camera.position[0] -= this.camera.forward[0] * speed;
            this.camera.position[1] -= this.camera.forward[1] * speed;
            this.camera.position[2] -= this.camera.forward[2] * speed;
        }
        if (this.keys['a']) {
            this.camera.position[0] -= this.camera.right[0] * speed;
            this.camera.position[2] -= this.camera.right[2] * speed;
        }
        if (this.keys['d']) {
            this.camera.position[0] += this.camera.right[0] * speed;
            this.camera.position[2] += this.camera.right[2] * speed;
        }
        if (this.keys[' ']) {
            this.camera.position[1] += speed;
        }
        if (this.keys['shift']) {
            this.camera.position[1] -= speed;
        }
    },

    update(dt) {
        this.updateCamera(dt);

        if (this.paused) return;

        // Calculate brush position (in front of camera)
        const brushDist = 35;
        const brushPos = [
            this.camera.position[0] + this.camera.forward[0] * brushDist,
            this.camera.position[1] + this.camera.forward[1] * brushDist,
            this.camera.position[2] + this.camera.forward[2] * brushDist
        ];

        const brushActive = this.mouseButtons[0] || this.mouseButtons[2];
        const brushMaterial = this.mouseButtons[2] ? 0 : this.currentMaterial;

        // Update physics uniforms (matches WGSL struct alignment)
        // Layout: gridSize(0-11), frameIndex(12), deltaTime(16), brushRadius(20),
        //         brushMaterial(24), brushActive(28), brushPos(32-43), _pad(44)
        const physicsData = new ArrayBuffer(48);
        const physicsView = new DataView(physicsData);
        physicsView.setUint32(0, this.GRID_SIZE_X, true);
        physicsView.setUint32(4, this.GRID_SIZE_Y, true);
        physicsView.setUint32(8, this.GRID_SIZE_Z, true);
        physicsView.setUint32(12, this.frameIndex, true);
        physicsView.setFloat32(16, dt, true);
        physicsView.setFloat32(20, this.brushRadius, true);
        physicsView.setUint32(24, brushMaterial, true);
        physicsView.setUint32(28, brushActive ? 1 : 0, true);
        physicsView.setFloat32(32, brushPos[0], true);
        physicsView.setFloat32(36, brushPos[1], true);
        physicsView.setFloat32(40, brushPos[2], true);

        this.device.queue.writeBuffer(this.physicsUniformBuffer, 0, physicsData);

        // Run physics compute shader
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.physicsPipeline);
        pass.setBindGroup(0, this.frameIndex % 2 === 0 ? this.physicsBindGroupA : this.physicsBindGroupB);
        pass.dispatchWorkgroups(
            Math.ceil(this.GRID_SIZE_X / 4),
            Math.ceil(this.GRID_SIZE_Y / 4),
            Math.ceil(this.GRID_SIZE_Z / 4)
        );
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        this.frameIndex++;
    },

    render() {
        // Update render uniforms
        const renderData = new ArrayBuffer(128);
        const renderView = new DataView(renderData);
        renderView.setUint32(0, this.GRID_SIZE_X, true);
        renderView.setUint32(4, this.GRID_SIZE_Y, true);
        renderView.setUint32(8, this.GRID_SIZE_Z, true);
        renderView.setUint32(12, this.frameIndex, true);
        renderView.setFloat32(16, this.camera.position[0], true);
        renderView.setFloat32(20, this.camera.position[1], true);
        renderView.setFloat32(24, this.camera.position[2], true);
        renderView.setFloat32(32, this.camera.forward[0], true);
        renderView.setFloat32(36, this.camera.forward[1], true);
        renderView.setFloat32(40, this.camera.forward[2], true);
        renderView.setFloat32(48, this.camera.right[0], true);
        renderView.setFloat32(52, this.camera.right[1], true);
        renderView.setFloat32(56, this.camera.right[2], true);
        renderView.setFloat32(64, this.camera.up[0], true);
        renderView.setFloat32(68, this.camera.up[1], true);
        renderView.setFloat32(72, this.camera.up[2], true);
        renderView.setFloat32(76, this.canvas.width / this.canvas.height, true);

        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderData);

        const encoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.renderPipeline);
        // After physics, frameIndex is incremented. If odd, physics wrote to B, so render from B
        pass.setBindGroup(0, this.frameIndex % 2 === 1 ? this.renderBindGroupB : this.renderBindGroupA);
        pass.draw(3);
        pass.end();

        this.device.queue.submit([encoder.finish()]);
    },

    getStats() {
        return {
            frame: this.frameIndex,
            paused: this.paused,
            material: this.currentMaterial
        };
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VENPOD;
}

// Make VENPOD available globally
window.VENPOD = VENPOD;

console.log('VENPOD: Script loaded, VENPOD object created');
