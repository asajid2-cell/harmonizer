// =============================================================================
// VENPOD WebGPU - Compute and Render Pipeline Abstractions
// =============================================================================

#pragma once

#include <webgpu/webgpu.h>
#include "../Core/Types.h"
#include <string>
#include <vector>

namespace VENPOD::Graphics {

// Compute pipeline wrapper
class ComputePipeline {
public:
    ComputePipeline() = default;
    ~ComputePipeline();

    // Non-copyable
    ComputePipeline(const ComputePipeline&) = delete;
    ComputePipeline& operator=(const ComputePipeline&) = delete;

    // Create compute pipeline from WGSL shader source
    bool Create(WGPUDevice device, const std::string& shaderSource,
                const std::string& entryPoint = "main",
                const char* label = nullptr);

    // Create with explicit bind group layout
    bool CreateWithLayout(WGPUDevice device, const std::string& shaderSource,
                          const std::string& entryPoint,
                          WGPUBindGroupLayout layout,
                          const char* label = nullptr);

    // Get handles
    WGPUComputePipeline GetPipeline() const { return m_pipeline; }
    WGPUBindGroupLayout GetBindGroupLayout(uint32_t index = 0) const;
    bool IsValid() const { return m_pipeline != nullptr; }

    void Release();

private:
    WGPUComputePipeline m_pipeline = nullptr;
    WGPUShaderModule m_shaderModule = nullptr;
};

// Render pipeline wrapper for fullscreen passes
class RenderPipeline {
public:
    RenderPipeline() = default;
    ~RenderPipeline();

    // Non-copyable
    RenderPipeline(const RenderPipeline&) = delete;
    RenderPipeline& operator=(const RenderPipeline&) = delete;

    // Create fullscreen render pipeline
    bool CreateFullscreen(WGPUDevice device,
                          const std::string& vertexSource,
                          const std::string& fragmentSource,
                          WGPUTextureFormat targetFormat,
                          const char* label = nullptr);

    // Get handles
    WGPURenderPipeline GetPipeline() const { return m_pipeline; }
    WGPUBindGroupLayout GetBindGroupLayout(uint32_t index = 0) const;
    bool IsValid() const { return m_pipeline != nullptr; }

    void Release();

private:
    WGPURenderPipeline m_pipeline = nullptr;
    WGPUShaderModule m_vertexModule = nullptr;
    WGPUShaderModule m_fragmentModule = nullptr;
};

// Bind group builder helper
class BindGroupBuilder {
public:
    BindGroupBuilder() = default;

    // Add buffer binding
    BindGroupBuilder& AddBuffer(uint32_t binding, WGPUBuffer buffer,
                                 uint64_t offset = 0, uint64_t size = WGPU_WHOLE_SIZE);

    // Add texture binding
    BindGroupBuilder& AddTextureView(uint32_t binding, WGPUTextureView view);

    // Add sampler binding
    BindGroupBuilder& AddSampler(uint32_t binding, WGPUSampler sampler);

    // Build the bind group
    WGPUBindGroup Build(WGPUDevice device, WGPUBindGroupLayout layout, const char* label = nullptr);

    // Clear for reuse
    void Clear();

private:
    std::vector<WGPUBindGroupEntry> m_entries;
};

// Helper to create shader module from WGSL source
WGPUShaderModule CreateShaderModule(WGPUDevice device, const std::string& source, const char* label = nullptr);

// Helper to create a simple sampler
WGPUSampler CreateLinearSampler(WGPUDevice device);
WGPUSampler CreateNearestSampler(WGPUDevice device);

} // namespace VENPOD::Graphics
