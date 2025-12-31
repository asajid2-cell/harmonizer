// =============================================================================
// VENPOD WebGPU - Device and Context Implementation
// =============================================================================

#include "WebGPUContext.h"
#include <cstdio>
#include <cassert>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgpu.h>
#endif

namespace VENPOD::Graphics {

WebGPUContext::~WebGPUContext() {
    Shutdown();
}

bool WebGPUContext::Initialize(const WebGPUConfig& config) {
    m_config = config;
    m_width = config.width;
    m_height = config.height;

    printf("[WebGPU] Initializing...\n");

    // Create WebGPU instance
#ifdef __EMSCRIPTEN__
    // On web, we get the instance directly from the browser
    m_instance = wgpuCreateInstance(nullptr);
#else
    WGPUInstanceDescriptor instanceDesc = {};
    m_instance = wgpuCreateInstance(&instanceDesc);
#endif

    if (!m_instance) {
        printf("[WebGPU] ERROR: Failed to create WebGPU instance\n");
        return false;
    }

    // Create surface for the canvas
    SetupSurface();

    // Request adapter
    RequestAdapter();

    return true;
}

void WebGPUContext::SetupSurface() {
#ifdef __EMSCRIPTEN__
    // Get surface from canvas element
    WGPUSurfaceDescriptorFromCanvasHTMLSelector canvasDesc = {};
    canvasDesc.chain.sType = WGPUSType_SurfaceDescriptorFromCanvasHTMLSelector;
    canvasDesc.selector = "#canvas";

    WGPUSurfaceDescriptor surfaceDesc = {};
    surfaceDesc.nextInChain = (const WGPUChainedStruct*)&canvasDesc;

    m_surface = wgpuInstanceCreateSurface(m_instance, &surfaceDesc);
#else
    // Native: Surface creation depends on windowing system
    // For now, headless rendering (no surface)
    m_surface = nullptr;
#endif
}

void WebGPUContext::RequestAdapter() {
    WGPURequestAdapterOptions options = {};
    options.powerPreference = m_config.powerPreference_highPerformance
        ? WGPUPowerPreference_HighPerformance
        : WGPUPowerPreference_LowPower;
    options.compatibleSurface = m_surface;

    wgpuInstanceRequestAdapter(m_instance, &options, OnAdapterRequestEnded, this);
}

void WebGPUContext::OnAdapterRequestEnded(WGPURequestAdapterStatus status,
                                           WGPUAdapter adapter,
                                           const char* message,
                                           void* userdata) {
    auto* ctx = static_cast<WebGPUContext*>(userdata);

    if (status != WGPURequestAdapterStatus_Success) {
        printf("[WebGPU] ERROR: Failed to get adapter: %s\n", message ? message : "unknown error");
        return;
    }

    ctx->m_adapter = adapter;
    printf("[WebGPU] Adapter obtained successfully\n");

    // Request device
    ctx->RequestDevice();
}

void WebGPUContext::RequestDevice() {
    // Request device with required features/limits
    WGPURequiredLimits requiredLimits = {};
    requiredLimits.limits.maxStorageBufferBindingSize = 256 * 1024 * 1024; // 256 MB for voxel buffers
    requiredLimits.limits.maxBufferSize = 256 * 1024 * 1024;
    requiredLimits.limits.maxComputeWorkgroupsPerDimension = 65535;
    requiredLimits.limits.maxComputeWorkgroupStorageSize = 32768;
    requiredLimits.limits.maxComputeInvocationsPerWorkgroup = 512;

    WGPUDeviceDescriptor deviceDesc = {};
    deviceDesc.requiredLimits = &requiredLimits;
    deviceDesc.defaultQueue.label = "Default Queue";

    // Set up device lost callback
    deviceDesc.deviceLostCallback = OnDeviceLost;
    deviceDesc.deviceLostUserdata = this;

    wgpuAdapterRequestDevice(m_adapter, &deviceDesc, OnDeviceRequestEnded, this);
}

void WebGPUContext::OnDeviceRequestEnded(WGPURequestDeviceStatus status,
                                          WGPUDevice device,
                                          const char* message,
                                          void* userdata) {
    auto* ctx = static_cast<WebGPUContext*>(userdata);

    if (status != WGPURequestDeviceStatus_Success) {
        printf("[WebGPU] ERROR: Failed to get device: %s\n", message ? message : "unknown error");
        return;
    }

    ctx->m_device = device;
    ctx->m_queue = wgpuDeviceGetQueue(device);

    // Set up error callback
    wgpuDeviceSetUncapturedErrorCallback(device, OnDeviceError, ctx);

    printf("[WebGPU] Device obtained successfully\n");

    // Configure surface for swapchain
    if (ctx->m_surface) {
        ctx->ConfigureSurface(ctx->m_width, ctx->m_height);
    }

    ctx->m_ready = true;
    printf("[WebGPU] Initialization complete!\n");
}

void WebGPUContext::OnDeviceError(WGPUErrorType type, const char* message, void* userdata) {
    const char* typeStr = "Unknown";
    switch (type) {
        case WGPUErrorType_Validation: typeStr = "Validation"; break;
        case WGPUErrorType_OutOfMemory: typeStr = "OutOfMemory"; break;
        case WGPUErrorType_Internal: typeStr = "Internal"; break;
        case WGPUErrorType_Unknown: typeStr = "Unknown"; break;
        case WGPUErrorType_DeviceLost: typeStr = "DeviceLost"; break;
        default: break;
    }
    printf("[WebGPU] ERROR (%s): %s\n", typeStr, message ? message : "no message");
}

void WebGPUContext::OnDeviceLost(WGPUDeviceLostReason reason, const char* message, void* userdata) {
    const char* reasonStr = "Unknown";
    switch (reason) {
        case WGPUDeviceLostReason_Undefined: reasonStr = "Undefined"; break;
        case WGPUDeviceLostReason_Destroyed: reasonStr = "Destroyed"; break;
        default: break;
    }
    printf("[WebGPU] Device lost (%s): %s\n", reasonStr, message ? message : "no message");
}

void WebGPUContext::ConfigureSurface(uint32_t width, uint32_t height) {
    if (!m_surface || !m_device) return;

    m_width = width;
    m_height = height;

    // Get preferred format
    WGPUSurfaceCapabilities capabilities;
    wgpuSurfaceGetCapabilities(m_surface, m_adapter, &capabilities);
    if (capabilities.formatCount > 0) {
        m_swapchainFormat = capabilities.formats[0];
    }

    WGPUSurfaceConfiguration config = {};
    config.device = m_device;
    config.format = m_swapchainFormat;
    config.usage = WGPUTextureUsage_RenderAttachment;
    config.alphaMode = WGPUCompositeAlphaMode_Auto;
    config.width = width;
    config.height = height;
    config.presentMode = WGPUPresentMode_Fifo; // VSync

    wgpuSurfaceConfigure(m_surface, &config);
    m_surfaceConfigured = true;

    printf("[WebGPU] Surface configured: %dx%d\n", width, height);
}

WGPUTextureView WebGPUContext::GetCurrentSurfaceTextureView() {
    if (!m_surface || !m_surfaceConfigured) return nullptr;

    WGPUSurfaceTexture surfaceTexture;
    wgpuSurfaceGetCurrentTexture(m_surface, &surfaceTexture);

    if (surfaceTexture.status != WGPUSurfaceGetCurrentTextureStatus_Success) {
        printf("[WebGPU] Failed to get current surface texture\n");
        return nullptr;
    }

    WGPUTextureViewDescriptor viewDesc = {};
    viewDesc.format = m_swapchainFormat;
    viewDesc.dimension = WGPUTextureViewDimension_2D;
    viewDesc.mipLevelCount = 1;
    viewDesc.arrayLayerCount = 1;

    return wgpuTextureCreateView(surfaceTexture.texture, &viewDesc);
}

void WebGPUContext::Present() {
    if (m_surface) {
        wgpuSurfacePresent(m_surface);
    }
}

void WebGPUContext::OnResize(uint32_t width, uint32_t height) {
    if (width > 0 && height > 0 && (width != m_width || height != m_height)) {
        ConfigureSurface(width, height);
    }
}

void WebGPUContext::Poll() {
#ifndef __EMSCRIPTEN__
    // On native, we need to tick the device
    if (m_device) {
        wgpuDeviceTick(m_device);
    }
#endif
}

void WebGPUContext::Shutdown() {
    if (m_surface) {
        wgpuSurfaceUnconfigure(m_surface);
        wgpuSurfaceRelease(m_surface);
        m_surface = nullptr;
    }

    if (m_queue) {
        wgpuQueueRelease(m_queue);
        m_queue = nullptr;
    }

    if (m_device) {
        wgpuDeviceRelease(m_device);
        m_device = nullptr;
    }

    if (m_adapter) {
        wgpuAdapterRelease(m_adapter);
        m_adapter = nullptr;
    }

    if (m_instance) {
        wgpuInstanceRelease(m_instance);
        m_instance = nullptr;
    }

    m_ready = false;
    m_surfaceConfigured = false;
    printf("[WebGPU] Shutdown complete\n");
}

} // namespace VENPOD::Graphics
