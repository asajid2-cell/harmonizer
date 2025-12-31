// =============================================================================
// VENPOD WebGPU - Pipeline Implementation
// =============================================================================

#include "Pipeline.h"
#include <cstdio>

namespace VENPOD::Graphics {

// ============================================================================
// Shader Module Helper
// ============================================================================

WGPUShaderModule CreateShaderModule(WGPUDevice device, const std::string& source, const char* label) {
    WGPUShaderModuleWGSLDescriptor wgslDesc = {};
    wgslDesc.chain.sType = WGPUSType_ShaderModuleWGSLDescriptor;
    wgslDesc.code = source.c_str();

    WGPUShaderModuleDescriptor desc = {};
    desc.nextInChain = (const WGPUChainedStruct*)&wgslDesc;
    desc.label = label;

    WGPUShaderModule module = wgpuDeviceCreateShaderModule(device, &desc);
    if (!module) {
        printf("[Shader] Failed to create shader module '%s'\n", label ? label : "unnamed");
    }
    return module;
}

// ============================================================================
// ComputePipeline
// ============================================================================

ComputePipeline::~ComputePipeline() {
    Release();
}

bool ComputePipeline::Create(WGPUDevice device, const std::string& shaderSource,
                              const std::string& entryPoint, const char* label) {
    Release();

    m_shaderModule = CreateShaderModule(device, shaderSource, label);
    if (!m_shaderModule) {
        return false;
    }

    WGPUComputePipelineDescriptor desc = {};
    desc.label = label;
    desc.compute.module = m_shaderModule;
    desc.compute.entryPoint = entryPoint.c_str();
    desc.layout = nullptr; // Auto-layout

    m_pipeline = wgpuDeviceCreateComputePipeline(device, &desc);
    if (!m_pipeline) {
        printf("[ComputePipeline] Failed to create pipeline '%s'\n", label ? label : "unnamed");
        Release();
        return false;
    }

    printf("[ComputePipeline] Created pipeline '%s'\n", label ? label : "unnamed");
    return true;
}

bool ComputePipeline::CreateWithLayout(WGPUDevice device, const std::string& shaderSource,
                                        const std::string& entryPoint,
                                        WGPUBindGroupLayout layout, const char* label) {
    Release();

    m_shaderModule = CreateShaderModule(device, shaderSource, label);
    if (!m_shaderModule) {
        return false;
    }

    // Create pipeline layout
    WGPUPipelineLayoutDescriptor layoutDesc = {};
    layoutDesc.bindGroupLayoutCount = 1;
    layoutDesc.bindGroupLayouts = &layout;

    WGPUPipelineLayout pipelineLayout = wgpuDeviceCreatePipelineLayout(device, &layoutDesc);
    if (!pipelineLayout) {
        printf("[ComputePipeline] Failed to create pipeline layout\n");
        Release();
        return false;
    }

    WGPUComputePipelineDescriptor desc = {};
    desc.label = label;
    desc.compute.module = m_shaderModule;
    desc.compute.entryPoint = entryPoint.c_str();
    desc.layout = pipelineLayout;

    m_pipeline = wgpuDeviceCreateComputePipeline(device, &desc);

    wgpuPipelineLayoutRelease(pipelineLayout);

    if (!m_pipeline) {
        printf("[ComputePipeline] Failed to create pipeline '%s'\n", label ? label : "unnamed");
        Release();
        return false;
    }

    return true;
}

WGPUBindGroupLayout ComputePipeline::GetBindGroupLayout(uint32_t index) const {
    if (!m_pipeline) return nullptr;
    return wgpuComputePipelineGetBindGroupLayout(m_pipeline, index);
}

void ComputePipeline::Release() {
    if (m_pipeline) {
        wgpuComputePipelineRelease(m_pipeline);
        m_pipeline = nullptr;
    }
    if (m_shaderModule) {
        wgpuShaderModuleRelease(m_shaderModule);
        m_shaderModule = nullptr;
    }
}

// ============================================================================
// RenderPipeline
// ============================================================================

RenderPipeline::~RenderPipeline() {
    Release();
}

bool RenderPipeline::CreateFullscreen(WGPUDevice device,
                                       const std::string& vertexSource,
                                       const std::string& fragmentSource,
                                       WGPUTextureFormat targetFormat,
                                       const char* label) {
    Release();

    m_vertexModule = CreateShaderModule(device, vertexSource, "Fullscreen_VS");
    if (!m_vertexModule) {
        return false;
    }

    m_fragmentModule = CreateShaderModule(device, fragmentSource, "Fullscreen_PS");
    if (!m_fragmentModule) {
        Release();
        return false;
    }

    // Vertex state - fullscreen triangle (no vertex buffer)
    WGPUVertexState vertexState = {};
    vertexState.module = m_vertexModule;
    vertexState.entryPoint = "main";
    vertexState.bufferCount = 0;

    // Fragment state
    WGPUColorTargetState colorTarget = {};
    colorTarget.format = targetFormat;
    colorTarget.writeMask = WGPUColorWriteMask_All;

    WGPUFragmentState fragmentState = {};
    fragmentState.module = m_fragmentModule;
    fragmentState.entryPoint = "main";
    fragmentState.targetCount = 1;
    fragmentState.targets = &colorTarget;

    // Primitive state
    WGPUPrimitiveState primitiveState = {};
    primitiveState.topology = WGPUPrimitiveTopology_TriangleList;
    primitiveState.frontFace = WGPUFrontFace_CCW;
    primitiveState.cullMode = WGPUCullMode_None;

    // Multisample state
    WGPUMultisampleState multisampleState = {};
    multisampleState.count = 1;
    multisampleState.mask = ~0u;

    // Create pipeline
    WGPURenderPipelineDescriptor desc = {};
    desc.label = label;
    desc.vertex = vertexState;
    desc.primitive = primitiveState;
    desc.fragment = &fragmentState;
    desc.multisample = multisampleState;
    desc.layout = nullptr; // Auto-layout

    m_pipeline = wgpuDeviceCreateRenderPipeline(device, &desc);
    if (!m_pipeline) {
        printf("[RenderPipeline] Failed to create pipeline '%s'\n", label ? label : "unnamed");
        Release();
        return false;
    }

    printf("[RenderPipeline] Created pipeline '%s'\n", label ? label : "unnamed");
    return true;
}

WGPUBindGroupLayout RenderPipeline::GetBindGroupLayout(uint32_t index) const {
    if (!m_pipeline) return nullptr;
    return wgpuRenderPipelineGetBindGroupLayout(m_pipeline, index);
}

void RenderPipeline::Release() {
    if (m_pipeline) {
        wgpuRenderPipelineRelease(m_pipeline);
        m_pipeline = nullptr;
    }
    if (m_vertexModule) {
        wgpuShaderModuleRelease(m_vertexModule);
        m_vertexModule = nullptr;
    }
    if (m_fragmentModule) {
        wgpuShaderModuleRelease(m_fragmentModule);
        m_fragmentModule = nullptr;
    }
}

// ============================================================================
// BindGroupBuilder
// ============================================================================

BindGroupBuilder& BindGroupBuilder::AddBuffer(uint32_t binding, WGPUBuffer buffer,
                                               uint64_t offset, uint64_t size) {
    WGPUBindGroupEntry entry = {};
    entry.binding = binding;
    entry.buffer = buffer;
    entry.offset = offset;
    entry.size = size;
    m_entries.push_back(entry);
    return *this;
}

BindGroupBuilder& BindGroupBuilder::AddTextureView(uint32_t binding, WGPUTextureView view) {
    WGPUBindGroupEntry entry = {};
    entry.binding = binding;
    entry.textureView = view;
    m_entries.push_back(entry);
    return *this;
}

BindGroupBuilder& BindGroupBuilder::AddSampler(uint32_t binding, WGPUSampler sampler) {
    WGPUBindGroupEntry entry = {};
    entry.binding = binding;
    entry.sampler = sampler;
    m_entries.push_back(entry);
    return *this;
}

WGPUBindGroup BindGroupBuilder::Build(WGPUDevice device, WGPUBindGroupLayout layout, const char* label) {
    WGPUBindGroupDescriptor desc = {};
    desc.label = label;
    desc.layout = layout;
    desc.entryCount = m_entries.size();
    desc.entries = m_entries.data();

    return wgpuDeviceCreateBindGroup(device, &desc);
}

void BindGroupBuilder::Clear() {
    m_entries.clear();
}

// ============================================================================
// Sampler Helpers
// ============================================================================

WGPUSampler CreateLinearSampler(WGPUDevice device) {
    WGPUSamplerDescriptor desc = {};
    desc.minFilter = WGPUFilterMode_Linear;
    desc.magFilter = WGPUFilterMode_Linear;
    desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
    desc.addressModeU = WGPUAddressMode_ClampToEdge;
    desc.addressModeV = WGPUAddressMode_ClampToEdge;
    desc.addressModeW = WGPUAddressMode_ClampToEdge;
    desc.maxAnisotropy = 1;
    return wgpuDeviceCreateSampler(device, &desc);
}

WGPUSampler CreateNearestSampler(WGPUDevice device) {
    WGPUSamplerDescriptor desc = {};
    desc.minFilter = WGPUFilterMode_Nearest;
    desc.magFilter = WGPUFilterMode_Nearest;
    desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
    desc.addressModeU = WGPUAddressMode_ClampToEdge;
    desc.addressModeV = WGPUAddressMode_ClampToEdge;
    desc.addressModeW = WGPUAddressMode_ClampToEdge;
    desc.maxAnisotropy = 1;
    return wgpuDeviceCreateSampler(device, &desc);
}

} // namespace VENPOD::Graphics
