# VENPOD Prototype

This directory contains an early WebGPU/WASM voxel prototype kept for project context. It is not the current VENPOD engine.

## What Is Here

- C++ source for the browser prototype.
- WGSL shader assets.
- CMake build configuration.
- A web shell template.

The Emscripten SDK is not vendored. Install it outside the repository, or use the ignored path `venpod/emsdk/` for local experiments.

## Build Locally

Install Emscripten from the official SDK instructions, then from this directory:

```bash
mkdir build-web
cd build-web
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make -j4
```

Serve the output from the build directory:

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080/venpod.html
```

WebGPU requires HTTPS or localhost. Opening the HTML file directly will not work in most browsers.

## Controls

| Input | Action |
| --- | --- |
| `WASD` | Move camera. |
| Mouse | Look around after pointer capture. |
| Left mouse | Paint voxels. |
| Right mouse | Erase voxels. |
| Scroll | Change brush size. |
| `1` through `9` | Select material. |
| Space or Shift | Move up or down. |
| `P` | Pause simulation. |
| Escape | Release pointer capture. |

## Notes

The checked-in source is useful for reference and experiments. Build outputs, SDK installs, and generated files should remain untracked.
