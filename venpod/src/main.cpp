// =============================================================================
// VENPOD WebGPU - Main Entry Point
// Cross-platform WebAssembly/Native falling sand simulation
// =============================================================================

#include "Core/Types.h"
#include "Graphics/WebGPUContext.h"
#include "Simulation/VoxelWorld.h"

#include <cstdio>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/html5.h>
#endif

// Global application state
struct AppState {
    VENPOD::Graphics::WebGPUContext context;
    VENPOD::Simulation::VoxelWorld world;
    VENPOD::Simulation::CameraParams camera;
    VENPOD::Simulation::BrushParams brush;

    // Input state
    bool keys[256] = {false};
    bool mouseButtons[3] = {false};
    float mouseX = 0, mouseY = 0;
    float mouseDeltaX = 0, mouseDeltaY = 0;
    bool mouseCaptured = false;

    // Timing
    double lastFrameTime = 0;
    uint64_t frameCount = 0;

    // Settings
    float cameraSpeed = 50.0f;
    float mouseSensitivity = 0.002f;
    uint32_t currentMaterial = VENPOD::Material::SAND;
    float brushRadius = 5.0f;

    bool running = true;
    bool initialized = false;
};

static AppState g_app;

// Forward declarations
void MainLoop();
void ProcessInput(float dt);
void UpdateCamera(float dt);
#ifdef __EMSCRIPTEN__
EM_BOOL OnKeyDown(int eventType, const EmscriptenKeyboardEvent* event, void* userData);
EM_BOOL OnKeyUp(int eventType, const EmscriptenKeyboardEvent* event, void* userData);
EM_BOOL OnMouseDown(int eventType, const EmscriptenMouseEvent* event, void* userData);
EM_BOOL OnMouseUp(int eventType, const EmscriptenMouseEvent* event, void* userData);
EM_BOOL OnMouseMove(int eventType, const EmscriptenMouseEvent* event, void* userData);
EM_BOOL OnWheel(int eventType, const EmscriptenWheelEvent* event, void* userData);
#endif

// ============================================================================
// Main Entry Point
// ============================================================================

int main(int argc, char* argv[]) {
    (void)argc;
    (void)argv;

    printf("===========================================\n");
    printf("  VENPOD WebGPU - Voxel Physics Engine\n");
    printf("  WebAssembly Tech Demo\n");
    printf("===========================================\n");

    // Initialize WebGPU context
    VENPOD::Graphics::WebGPUConfig config;
    config.width = 1280;
    config.height = 720;

#ifdef __EMSCRIPTEN__
    // Get canvas size
    double canvasWidth, canvasHeight;
    emscripten_get_element_css_size("#canvas", &canvasWidth, &canvasHeight);
    config.width = static_cast<uint32_t>(canvasWidth);
    config.height = static_cast<uint32_t>(canvasHeight);
#endif

    printf("[Main] Initializing WebGPU context (%dx%d)...\n", config.width, config.height);

    if (!g_app.context.Initialize(config)) {
        printf("[Main] ERROR: Failed to initialize WebGPU context\n");
        return 1;
    }

#ifdef __EMSCRIPTEN__
    // Set up input handlers
    emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_DOCUMENT, nullptr, true, OnKeyDown);
    emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_DOCUMENT, nullptr, true, OnKeyUp);
    emscripten_set_mousedown_callback("#canvas", nullptr, true, OnMouseDown);
    emscripten_set_mouseup_callback("#canvas", nullptr, true, OnMouseUp);
    emscripten_set_mousemove_callback("#canvas", nullptr, true, OnMouseMove);
    emscripten_set_wheel_callback("#canvas", nullptr, true, OnWheel);

    // Start main loop
    emscripten_set_main_loop(MainLoop, 0, false);
#else
    // Native main loop (for testing with Dawn)
    while (g_app.running) {
        MainLoop();
        g_app.context.Poll();
    }
#endif

    return 0;
}

// ============================================================================
// Main Loop
// ============================================================================

void MainLoop() {
    // Wait for WebGPU to be ready
    if (!g_app.context.IsReady()) {
        return;
    }

    // First-time initialization
    if (!g_app.initialized) {
        printf("[Main] WebGPU ready, initializing voxel world...\n");

        VENPOD::Simulation::VoxelWorldConfig worldConfig;
        worldConfig.gridSizeX = 128;
        worldConfig.gridSizeY = 64;
        worldConfig.gridSizeZ = 128;

        if (!g_app.world.Initialize(g_app.context, worldConfig)) {
            printf("[Main] ERROR: Failed to initialize voxel world\n");
#ifdef __EMSCRIPTEN__
            emscripten_cancel_main_loop();
#endif
            return;
        }

        // Set up initial camera
        g_app.camera = g_app.world.GetCamera();
        g_app.camera.fov = 1.047f; // 60 degrees
        g_app.camera.aspectRatio = static_cast<float>(g_app.context.GetWidth()) /
                                   static_cast<float>(g_app.context.GetHeight());

        g_app.initialized = true;
        printf("[Main] Initialization complete! Controls:\n");
        printf("  WASD: Move camera\n");
        printf("  Mouse: Look around (click to capture)\n");
        printf("  LMB: Paint voxels\n");
        printf("  RMB: Erase voxels\n");
        printf("  Scroll: Change brush size\n");
        printf("  1-9: Select material\n");
        printf("  Space/Shift: Up/Down\n");
        printf("  P: Pause simulation\n");
        printf("  ESC: Release mouse\n");
    }

    // Calculate delta time
#ifdef __EMSCRIPTEN__
    double currentTime = emscripten_get_now() / 1000.0;
#else
    double currentTime = 0; // TODO: Native timing
#endif
    float dt = static_cast<float>(currentTime - g_app.lastFrameTime);
    if (dt > 0.1f) dt = 0.1f; // Clamp for stability
    if (dt < 0.001f) dt = 0.016f; // Minimum 60fps equivalent
    g_app.lastFrameTime = currentTime;

    // Process input
    ProcessInput(dt);

    // Update camera
    UpdateCamera(dt);
    g_app.world.SetCamera(g_app.camera);

    // Update simulation
    g_app.world.Update(dt);

    // Handle brush
    if (g_app.mouseButtons[0] || g_app.mouseButtons[2]) {
        // Calculate brush position (10 units in front of camera)
        float dist = 10.0f;
        g_app.brush.position = g_app.camera.position + g_app.camera.forward * dist;
        g_app.brush.radius = g_app.brushRadius;
        g_app.brush.material = g_app.currentMaterial;
        g_app.brush.mode = g_app.mouseButtons[2] ? 1 : 0; // RMB = erase
        g_app.brush.shape = 0; // Sphere
        g_app.brush.active = true;
        g_app.brush.hasValidPosition = true;

        g_app.world.ApplyBrush(g_app.brush);
    }

    // Update brush preview
    g_app.brush.position = g_app.camera.position + g_app.camera.forward * 10.0f;
    g_app.brush.hasValidPosition = true;
    g_app.world.SetBrushPreview(g_app.brush);

    // Render
    WGPUTextureView targetView = g_app.context.GetCurrentSurfaceTextureView();
    if (targetView) {
        g_app.world.Render(targetView);
        wgpuTextureViewRelease(targetView);
        g_app.context.Present();
    }

    // Reset mouse delta
    g_app.mouseDeltaX = 0;
    g_app.mouseDeltaY = 0;
    g_app.frameCount++;
}

// ============================================================================
// Input Processing
// ============================================================================

void ProcessInput(float dt) {
    (void)dt;

    // Material selection (1-9 keys)
    if (g_app.keys['1']) g_app.currentMaterial = VENPOD::Material::SAND;
    if (g_app.keys['2']) g_app.currentMaterial = VENPOD::Material::WATER;
    if (g_app.keys['3']) g_app.currentMaterial = VENPOD::Material::STONE;
    if (g_app.keys['4']) g_app.currentMaterial = VENPOD::Material::DIRT;
    if (g_app.keys['5']) g_app.currentMaterial = VENPOD::Material::LAVA;
    if (g_app.keys['6']) g_app.currentMaterial = VENPOD::Material::FIRE;
    if (g_app.keys['7']) g_app.currentMaterial = VENPOD::Material::OIL;
    if (g_app.keys['8']) g_app.currentMaterial = VENPOD::Material::ACID;
    if (g_app.keys['9']) g_app.currentMaterial = VENPOD::Material::GUNPOWDER;

    // Pause toggle
    static bool pWasPressed = false;
    if (g_app.keys['P'] && !pWasPressed) {
        g_app.world.SetPaused(!g_app.world.IsPaused());
        printf("[Main] Simulation %s\n", g_app.world.IsPaused() ? "PAUSED" : "RESUMED");
    }
    pWasPressed = g_app.keys['P'];
}

void UpdateCamera(float dt) {
    // Mouse look (only when captured)
    if (g_app.mouseCaptured) {
        g_app.camera.yaw += g_app.mouseDeltaX * g_app.mouseSensitivity;
        g_app.camera.pitch -= g_app.mouseDeltaY * g_app.mouseSensitivity;

        // Clamp pitch
        const float maxPitch = 1.57f;
        g_app.camera.pitch = VENPOD::clamp(g_app.camera.pitch, -maxPitch, maxPitch);

        // Calculate camera basis from yaw/pitch
        g_app.camera.forward.x = cosf(g_app.camera.pitch) * cosf(g_app.camera.yaw);
        g_app.camera.forward.y = sinf(g_app.camera.pitch);
        g_app.camera.forward.z = cosf(g_app.camera.pitch) * sinf(g_app.camera.yaw);
        g_app.camera.forward = VENPOD::normalize(g_app.camera.forward);

        g_app.camera.right = VENPOD::normalize(VENPOD::cross(g_app.camera.forward, VENPOD::Vec3(0, 1, 0)));
        g_app.camera.up = VENPOD::cross(g_app.camera.right, g_app.camera.forward);
    }

    // Movement
    float moveSpeed = g_app.cameraSpeed * dt;
    if (g_app.keys['W'] || g_app.keys['w']) g_app.camera.position = g_app.camera.position + g_app.camera.forward * moveSpeed;
    if (g_app.keys['S'] || g_app.keys['s']) g_app.camera.position = g_app.camera.position - g_app.camera.forward * moveSpeed;
    if (g_app.keys['A'] || g_app.keys['a']) g_app.camera.position = g_app.camera.position - g_app.camera.right * moveSpeed;
    if (g_app.keys['D'] || g_app.keys['d']) g_app.camera.position = g_app.camera.position + g_app.camera.right * moveSpeed;
    if (g_app.keys[' ']) g_app.camera.position = g_app.camera.position + VENPOD::Vec3(0, 1, 0) * moveSpeed;
    if (g_app.keys[16]) g_app.camera.position = g_app.camera.position - VENPOD::Vec3(0, 1, 0) * moveSpeed; // Shift
}

// ============================================================================
// Emscripten Input Callbacks
// ============================================================================

#ifdef __EMSCRIPTEN__

EM_BOOL OnKeyDown(int eventType, const EmscriptenKeyboardEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    int key = event->keyCode;
    if (key >= 0 && key < 256) {
        g_app.keys[key] = true;
    }

    // ESC releases mouse capture
    if (key == 27) {
        g_app.mouseCaptured = false;
        emscripten_exit_pointerlock();
    }

    return true;
}

EM_BOOL OnKeyUp(int eventType, const EmscriptenKeyboardEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    int key = event->keyCode;
    if (key >= 0 && key < 256) {
        g_app.keys[key] = false;
    }

    return true;
}

EM_BOOL OnMouseDown(int eventType, const EmscriptenMouseEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    if (event->button == 0) g_app.mouseButtons[0] = true;
    if (event->button == 1) g_app.mouseButtons[1] = true;
    if (event->button == 2) g_app.mouseButtons[2] = true;

    // Request pointer lock on click
    if (!g_app.mouseCaptured) {
        emscripten_request_pointerlock("#canvas", false);
        g_app.mouseCaptured = true;
    }

    return true;
}

EM_BOOL OnMouseUp(int eventType, const EmscriptenMouseEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    if (event->button == 0) g_app.mouseButtons[0] = false;
    if (event->button == 1) g_app.mouseButtons[1] = false;
    if (event->button == 2) g_app.mouseButtons[2] = false;

    return true;
}

EM_BOOL OnMouseMove(int eventType, const EmscriptenMouseEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    g_app.mouseX = static_cast<float>(event->clientX);
    g_app.mouseY = static_cast<float>(event->clientY);

    if (g_app.mouseCaptured) {
        g_app.mouseDeltaX = static_cast<float>(event->movementX);
        g_app.mouseDeltaY = static_cast<float>(event->movementY);
    }

    return true;
}

EM_BOOL OnWheel(int eventType, const EmscriptenWheelEvent* event, void* userData) {
    (void)eventType;
    (void)userData;

    // Adjust brush radius
    g_app.brushRadius -= static_cast<float>(event->deltaY) * 0.01f;
    g_app.brushRadius = VENPOD::clamp(g_app.brushRadius, 1.0f, 30.0f);

    return true;
}

#endif // __EMSCRIPTEN__
