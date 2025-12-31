// =============================================================================
// VENPOD WebGPU - Device and Context Management
// Cross-platform WebGPU initialization (Emscripten or Dawn)
// =============================================================================

#pragma once

#include <webgpu/webgpu.h>
#include "../Core/Types.h"
#include <functional>
#include <memory>

namespace VENPOD::Graphics {

// Configuration for WebGPU initialization
struct WebGPUConfig {
    uint32_t width = 1280;
    uint32_t height = 720;
    bool enableTimestampQueries = false;
    bool powerPreference_highPerformance = true;
};

// WebGPU context wrapper - manages device lifecycle
class WebGPUContext {
public:
    WebGPUContext() = default;
    ~WebGPUContext();

    // Non-copyable
    WebGPUContext(const WebGPUContext&) = delete;
    WebGPUContext& operator=(const WebGPUContext&) = delete;

    // Initialize WebGPU (async on web, sync on native)
    // On web, uses Emscripten's built-in WebGPU support
    // Returns false if initialization fails
    bool Initialize(const WebGPUConfig& config);

    // Check if initialization is complete (for async init on web)
    bool IsReady() const { return m_ready; }

    // Poll for device errors/events (call each frame)
    void Poll();

    // Get WebGPU handles
    WGPUInstance GetInstance() const { return m_instance; }
    WGPUAdapter GetAdapter() const { return m_adapter; }
    WGPUDevice GetDevice() const { return m_device; }
    WGPUQueue GetQueue() const { return m_queue; }
    WGPUSurface GetSurface() const { return m_surface; }
    WGPUTextureFormat GetSwapchainFormat() const { return m_swapchainFormat; }

    // Surface/swapchain management
    void ConfigureSurface(uint32_t width, uint32_t height);
    WGPUTextureView GetCurrentSurfaceTextureView();
    void Present();

    // Resize handling
    void OnResize(uint32_t width, uint32_t height);

    uint32_t GetWidth() const { return m_width; }
    uint32_t GetHeight() const { return m_height; }

    // Shutdown
    void Shutdown();

private:
    void RequestAdapter();
    void RequestDevice();
    void SetupSurface();

    static void OnAdapterRequestEnded(WGPURequestAdapterStatus status,
                                       WGPUAdapter adapter,
                                       const char* message,
                                       void* userdata);
    static void OnDeviceRequestEnded(WGPURequestDeviceStatus status,
                                      WGPUDevice device,
                                      const char* message,
                                      void* userdata);
    static void OnDeviceError(WGPUErrorType type, const char* message, void* userdata);
    static void OnDeviceLost(WGPUDeviceLostReason reason, const char* message, void* userdata);

    WGPUInstance m_instance = nullptr;
    WGPUAdapter m_adapter = nullptr;
    WGPUDevice m_device = nullptr;
    WGPUQueue m_queue = nullptr;
    WGPUSurface m_surface = nullptr;
    WGPUTextureFormat m_swapchainFormat = WGPUTextureFormat_BGRA8Unorm;

    WebGPUConfig m_config;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    bool m_ready = false;
    bool m_surfaceConfigured = false;
};

} // namespace VENPOD::Graphics
