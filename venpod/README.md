# VENPOD WebGPU - Voxel Physics Engine

A falling sand simulation running entirely in the browser using WebGPU and WebAssembly.

## Features

- **GPU-Accelerated Physics**: Falling sand, water, lava, and 15+ material types
- **WebGPU Rendering**: DDA raymarching for voxel rendering at 60fps
- **Interactive Painting**: Add/remove voxels with mouse
- **Cross-Platform**: Runs in any browser with WebGPU support

## Building

### Prerequisites

1. **Emscripten SDK** (for WebAssembly build)
   ```bash
   # Install Emscripten
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh  # Linux/Mac
   # or: emsdk_env.bat    # Windows
   ```

### Build for Web (WebAssembly)

```bash
cd venpod

# Create build directory
mkdir build-web && cd build-web

# Configure with Emscripten
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
emmake make -j4

# Output will be in build-web/venpod.html
```

### Running Locally

```bash
# From the build-web directory
python3 -m http.server 8080

# Then open: http://localhost:8080/venpod.html
```

**Note**: WebGPU requires HTTPS or localhost. You cannot open the HTML file directly.

## Controls

| Input | Action |
|-------|--------|
| WASD | Move camera |
| Mouse | Look around (click canvas to capture) |
| LMB | Paint voxels |
| RMB | Erase voxels |
| Scroll | Change brush size |
| 1-9 | Select material |
| Space/Shift | Move up/down |
| P | Pause simulation |
| ESC | Release mouse |

## Materials

1. Sand - Falls, slides diagonally
2. Water - Falls, spreads horizontally
3. Stone - Solid, doesn't move
4. Dirt - Falls like sand
5. Lava - Flows like liquid
6. Fire - Burns upward
7. Oil - Dark liquid
8. Acid - Green toxic liquid
9. Gunpowder - Explosive powder

## Browser Support

WebGPU is required. Supported browsers:
- **Chrome 113+** (enabled by default)
- **Edge 113+** (enabled by default)
- **Firefox Nightly** (enable `dom.webgpu.enabled` in about:config)
- **Safari Technology Preview** (macOS only)

## Architecture

```
venpod/
├── src/
│   ├── Core/Types.h           # Core types and math
│   ├── Graphics/
│   │   ├── WebGPUContext.*    # WebGPU initialization
│   │   ├── GPUBuffer.*        # Buffer management
│   │   └── Pipeline.*         # Compute/render pipelines
│   ├── Simulation/
│   │   └── VoxelWorld.*       # Simulation and rendering
│   └── main.cpp               # Entry point
├── assets/shaders/            # WGSL shaders
│   ├── physics.wgsl           # Physics simulation
│   ├── brush.wgsl             # Voxel painting
│   ├── initialize.wgsl        # World generation
│   └── render.wgsl            # DDA raymarching
├── web/shell.html             # HTML template
└── CMakeLists.txt             # Build configuration
```

## Technical Details

- **Grid Size**: 128×64×128 voxels (1M voxels)
- **Voxel Format**: 32-bit packed (material, variant, velocity, state)
- **Physics**: Ping-pong buffers with atomic operations for collision
- **Rendering**: DDA raymarching, max 512 steps per ray

## License

Part of the VENPOD project. Originally written in DirectX 12, ported to WebGPU for browser compatibility.
