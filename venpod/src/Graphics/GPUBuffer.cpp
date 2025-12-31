// =============================================================================
// VENPOD WebGPU - GPU Buffer Implementation
// =============================================================================

#include "GPUBuffer.h"
#include <cstdio>
#include <algorithm>

namespace VENPOD::Graphics {

// ============================================================================
// GPUBuffer
// ============================================================================

GPUBuffer::~GPUBuffer() {
    Release();
}

GPUBuffer::GPUBuffer(GPUBuffer&& other) noexcept
    : m_buffer(other.m_buffer), m_size(other.m_size) {
    other.m_buffer = nullptr;
    other.m_size = 0;
}

GPUBuffer& GPUBuffer::operator=(GPUBuffer&& other) noexcept {
    if (this != &other) {
        Release();
        m_buffer = other.m_buffer;
        m_size = other.m_size;
        other.m_buffer = nullptr;
        other.m_size = 0;
    }
    return *this;
}

bool GPUBuffer::Create(WGPUDevice device, uint64_t size, BufferUsage usage, const char* label) {
    if (!device || size == 0) return false;

    Release();

    WGPUBufferDescriptor desc = {};
    desc.size = size;
    desc.usage = ToWGPU(usage);
    desc.label = label;
    desc.mappedAtCreation = false;

    m_buffer = wgpuDeviceCreateBuffer(device, &desc);
    if (!m_buffer) {
        printf("[GPUBuffer] Failed to create buffer '%s' (size: %llu)\n",
               label ? label : "unnamed", static_cast<unsigned long long>(size));
        return false;
    }

    m_size = size;
    return true;
}

bool GPUBuffer::CreateWithData(WGPUDevice device, WGPUQueue queue, const void* data, uint64_t size,
                                BufferUsage usage, const char* label) {
    // Add CopyDst flag for initial upload
    BufferUsage fullUsage = usage | BufferUsage::CopyDst;

    if (!Create(device, size, fullUsage, label)) {
        return false;
    }

    if (data) {
        Upload(queue, data, size);
    }

    return true;
}

void GPUBuffer::Upload(WGPUQueue queue, const void* data, uint64_t size, uint64_t offset) {
    if (!m_buffer || !queue || !data || size == 0) return;

    // Ensure we don't write past the buffer
    if (offset + size > m_size) {
        printf("[GPUBuffer] Upload exceeds buffer size\n");
        return;
    }

    wgpuQueueWriteBuffer(queue, m_buffer, offset, data, size);
}

void GPUBuffer::Release() {
    if (m_buffer) {
        wgpuBufferRelease(m_buffer);
        m_buffer = nullptr;
    }
    m_size = 0;
}

// ============================================================================
// VoxelBuffer
// ============================================================================

bool VoxelBuffer::Create(WGPUDevice device, WGPUQueue queue,
                          uint32_t gridSizeX, uint32_t gridSizeY, uint32_t gridSizeZ) {
    m_gridSizeX = gridSizeX;
    m_gridSizeY = gridSizeY;
    m_gridSizeZ = gridSizeZ;

    uint64_t bufferSize = GetBufferSize();
    printf("[VoxelBuffer] Creating %ux%ux%u grid (%llu MB per buffer)\n",
           gridSizeX, gridSizeY, gridSizeZ,
           static_cast<unsigned long long>(bufferSize / (1024 * 1024)));

    // Storage buffers need Storage | CopyDst usage
    BufferUsage usage = BufferUsage::Storage | BufferUsage::CopyDst | BufferUsage::CopySrc;

    if (!m_buffers[0].Create(device, bufferSize, usage, "VoxelBuffer_A")) {
        printf("[VoxelBuffer] Failed to create buffer A\n");
        return false;
    }

    if (!m_buffers[1].Create(device, bufferSize, usage, "VoxelBuffer_B")) {
        printf("[VoxelBuffer] Failed to create buffer B\n");
        return false;
    }

    // Initialize both buffers with AIR
    std::vector<uint32_t> airData(GetTotalVoxels(), 0); // MAT_AIR = 0
    m_buffers[0].Upload(queue, airData.data(), bufferSize);
    m_buffers[1].Upload(queue, airData.data(), bufferSize);

    printf("[VoxelBuffer] Ping-pong buffers created successfully\n");
    return true;
}

void VoxelBuffer::SwapBuffers() {
    m_readIndex = 1 - m_readIndex;
}

void VoxelBuffer::Upload(WGPUQueue queue, const std::vector<uint32_t>& data) {
    if (data.size() != GetTotalVoxels()) {
        printf("[VoxelBuffer] Data size mismatch: got %zu, expected %llu\n",
               data.size(), static_cast<unsigned long long>(GetTotalVoxels()));
        return;
    }

    // Upload to both buffers
    uint64_t size = GetBufferSize();
    m_buffers[0].Upload(queue, data.data(), size);
    m_buffers[1].Upload(queue, data.data(), size);
}

// ============================================================================
// UniformBuffer
// ============================================================================

bool UniformBuffer::Create(WGPUDevice device, uint64_t size, const char* label) {
    // Align to 256 bytes (WebGPU requirement for uniform buffers)
    m_alignedSize = (size + 255) & ~255;

    return m_buffer.Create(device, m_alignedSize,
                           BufferUsage::Uniform | BufferUsage::CopyDst, label);
}

void UniformBuffer::Update(WGPUQueue queue, const void* data, uint64_t size) {
    if (size > m_alignedSize) {
        printf("[UniformBuffer] Update size exceeds buffer size\n");
        return;
    }
    m_buffer.Upload(queue, data, size);
}

} // namespace VENPOD::Graphics
