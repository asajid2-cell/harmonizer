// =============================================================================
// VENPOD WebGPU - GPU Buffer Abstraction
// Storage buffers, uniform buffers, and data upload utilities
// =============================================================================

#pragma once

#include <webgpu/webgpu.h>
#include "../Core/Types.h"
#include <vector>
#include <cstring>

namespace VENPOD::Graphics {

// Buffer usage flags
enum class BufferUsage : uint32_t {
    None = 0,
    Vertex = WGPUBufferUsage_Vertex,
    Index = WGPUBufferUsage_Index,
    Uniform = WGPUBufferUsage_Uniform,
    Storage = WGPUBufferUsage_Storage,
    CopySrc = WGPUBufferUsage_CopySrc,
    CopyDst = WGPUBufferUsage_CopyDst,
    MapRead = WGPUBufferUsage_MapRead,
    MapWrite = WGPUBufferUsage_MapWrite,
};

inline BufferUsage operator|(BufferUsage a, BufferUsage b) {
    return static_cast<BufferUsage>(static_cast<uint32_t>(a) | static_cast<uint32_t>(b));
}

inline uint32_t ToWGPU(BufferUsage usage) {
    return static_cast<uint32_t>(usage);
}

// GPU buffer wrapper
class GPUBuffer {
public:
    GPUBuffer() = default;
    ~GPUBuffer();

    // Non-copyable, movable
    GPUBuffer(const GPUBuffer&) = delete;
    GPUBuffer& operator=(const GPUBuffer&) = delete;
    GPUBuffer(GPUBuffer&& other) noexcept;
    GPUBuffer& operator=(GPUBuffer&& other) noexcept;

    // Create buffer
    bool Create(WGPUDevice device, uint64_t size, BufferUsage usage, const char* label = nullptr);

    // Create with initial data
    bool CreateWithData(WGPUDevice device, WGPUQueue queue, const void* data, uint64_t size,
                        BufferUsage usage, const char* label = nullptr);

    // Upload data (for CopyDst buffers)
    void Upload(WGPUQueue queue, const void* data, uint64_t size, uint64_t offset = 0);

    // Get buffer handle
    WGPUBuffer GetBuffer() const { return m_buffer; }
    uint64_t GetSize() const { return m_size; }
    bool IsValid() const { return m_buffer != nullptr; }

    // Release
    void Release();

private:
    WGPUBuffer m_buffer = nullptr;
    uint64_t m_size = 0;
};

// Specialized storage buffer for voxel data with ping-pong support
class VoxelBuffer {
public:
    VoxelBuffer() = default;
    ~VoxelBuffer() = default;

    // Create ping-pong buffers for voxel grid
    bool Create(WGPUDevice device, WGPUQueue queue, uint32_t gridSizeX, uint32_t gridSizeY, uint32_t gridSizeZ);

    // Swap read/write buffers
    void SwapBuffers();

    // Get current read/write buffers
    WGPUBuffer GetReadBuffer() const { return m_buffers[m_readIndex].GetBuffer(); }
    WGPUBuffer GetWriteBuffer() const { return m_buffers[1 - m_readIndex].GetBuffer(); }

    // Upload initial data
    void Upload(WGPUQueue queue, const std::vector<uint32_t>& data);

    uint32_t GetGridSizeX() const { return m_gridSizeX; }
    uint32_t GetGridSizeY() const { return m_gridSizeY; }
    uint32_t GetGridSizeZ() const { return m_gridSizeZ; }
    uint64_t GetTotalVoxels() const { return static_cast<uint64_t>(m_gridSizeX) * m_gridSizeY * m_gridSizeZ; }
    uint64_t GetBufferSize() const { return GetTotalVoxels() * sizeof(uint32_t); }

    bool IsValid() const { return m_buffers[0].IsValid() && m_buffers[1].IsValid(); }

private:
    GPUBuffer m_buffers[2];
    uint32_t m_readIndex = 0;
    uint32_t m_gridSizeX = 0;
    uint32_t m_gridSizeY = 0;
    uint32_t m_gridSizeZ = 0;
};

// Uniform buffer with automatic alignment and double-buffering
class UniformBuffer {
public:
    UniformBuffer() = default;
    ~UniformBuffer() = default;

    // Create uniform buffer with given size (will be aligned to 256 bytes)
    bool Create(WGPUDevice device, uint64_t size, const char* label = nullptr);

    // Update data
    void Update(WGPUQueue queue, const void* data, uint64_t size);

    WGPUBuffer GetBuffer() const { return m_buffer.GetBuffer(); }
    uint64_t GetSize() const { return m_alignedSize; }
    bool IsValid() const { return m_buffer.IsValid(); }

private:
    GPUBuffer m_buffer;
    uint64_t m_alignedSize = 0;
};

} // namespace VENPOD::Graphics
