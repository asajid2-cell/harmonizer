// =============================================================================
// VENPOD WebGPU - Voxel World
// Manages voxel data, physics simulation, and rendering
// =============================================================================

#pragma once

#include "../Core/Types.h"
#include "../Graphics/WebGPUContext.h"
#include "../Graphics/GPUBuffer.h"
#include "../Graphics/Pipeline.h"
#include <string>
#include <memory>

namespace VENPOD::Simulation {

// Configuration for voxel world
struct VoxelWorldConfig {
    uint32_t gridSizeX = 128;
    uint32_t gridSizeY = 64;
    uint32_t gridSizeZ = 128;
};

// Brush parameters for painting
struct BrushParams {
    Vec3 position;
    float radius = 5.0f;
    uint32_t material = Material::SAND;
    uint32_t mode = 0;  // 0 = paint, 1 = erase
    uint32_t shape = 0; // 0 = sphere, 1 = cube, 2 = cylinder
    bool active = false;
    bool hasValidPosition = false;
};

// Camera parameters
struct CameraParams {
    Vec3 position;
    Vec3 forward;
    Vec3 right;
    Vec3 up;
    float fov = 1.047f; // 60 degrees
    float aspectRatio = 16.0f / 9.0f;
    float yaw = 0.0f;
    float pitch = 0.0f;
};

// Shader source storage (embedded WGSL)
struct ShaderSources {
    std::string physics;
    std::string initialize;
    std::string brush;
    std::string renderVertex;
    std::string renderFragment;
};

class VoxelWorld {
public:
    VoxelWorld() = default;
    ~VoxelWorld();

    // Initialize the voxel world
    bool Initialize(Graphics::WebGPUContext& context, const VoxelWorldConfig& config = {});

    // Update simulation (one physics step)
    void Update(float deltaTime);

    // Render the world
    void Render(WGPUTextureView targetView);

    // Apply brush
    void ApplyBrush(const BrushParams& brush);

    // Camera control
    void SetCamera(const CameraParams& camera);
    CameraParams& GetCamera() { return m_camera; }
    const CameraParams& GetCamera() const { return m_camera; }

    // Brush preview
    void SetBrushPreview(const BrushParams& brush);

    // Getters
    uint32_t GetGridSizeX() const { return m_config.gridSizeX; }
    uint32_t GetGridSizeY() const { return m_config.gridSizeY; }
    uint32_t GetGridSizeZ() const { return m_config.gridSizeZ; }
    bool IsPaused() const { return m_paused; }
    void SetPaused(bool paused) { m_paused = paused; }

    uint32_t GetFrameIndex() const { return m_frameIndex; }

    void Shutdown();

private:
    bool LoadShaders();
    bool CreatePipelines();
    bool CreateBuffers();
    bool InitializeWorld();

    // Update uniform buffers before rendering
    void UpdateFrameUniforms();

    Graphics::WebGPUContext* m_context = nullptr;
    VoxelWorldConfig m_config;

    // Voxel data (ping-pong buffers)
    Graphics::VoxelBuffer m_voxelBuffers;

    // Uniform buffers
    Graphics::UniformBuffer m_physicsUniform;
    Graphics::UniformBuffer m_initUniform;
    Graphics::UniformBuffer m_brushUniform;
    Graphics::UniformBuffer m_frameUniform;

    // Compute pipelines
    Graphics::ComputePipeline m_physicsPipeline;
    Graphics::ComputePipeline m_initPipeline;
    Graphics::ComputePipeline m_brushPipeline;

    // Render pipeline
    Graphics::RenderPipeline m_renderPipeline;

    // Bind groups (recreated when buffers swap)
    WGPUBindGroup m_physicsBindGroup = nullptr;
    WGPUBindGroup m_initBindGroup = nullptr;
    WGPUBindGroup m_brushBindGroup = nullptr;
    WGPUBindGroup m_renderBindGroup = nullptr;

    // Shader sources
    ShaderSources m_shaders;

    // Camera and brush state
    CameraParams m_camera;
    BrushParams m_brushPreview;

    // Simulation state
    uint32_t m_frameIndex = 0;
    bool m_paused = false;
    bool m_initialized = false;
};

} // namespace VENPOD::Simulation
