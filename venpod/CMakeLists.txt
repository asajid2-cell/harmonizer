# =============================================================================
# VENPOD WebGPU - CMake Build Configuration
# Cross-platform build for WebAssembly (Emscripten) and Native (Dawn)
# =============================================================================

cmake_minimum_required(VERSION 3.16)
project(VENPOD VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(VENPOD_SOURCES
    src/main.cpp
    src/Core/Types.h
    src/Graphics/WebGPUContext.h
    src/Graphics/WebGPUContext.cpp
    src/Graphics/GPUBuffer.h
    src/Graphics/GPUBuffer.cpp
    src/Graphics/Pipeline.h
    src/Graphics/Pipeline.cpp
    src/Simulation/VoxelWorld.h
    src/Simulation/VoxelWorld.cpp
)

# Create executable
add_executable(venpod ${VENPOD_SOURCES})

target_include_directories(venpod PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Platform-specific configuration
if(EMSCRIPTEN)
    message(STATUS "Building for WebAssembly (Emscripten)")

    # Compile flags (needed for WebGPU headers)
    target_compile_options(venpod PRIVATE
        "-sUSE_WEBGPU=1"
    )

    # Link flags
    set(EMSCRIPTEN_LINK_FLAGS
        "-sUSE_WEBGPU=1"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sINITIAL_MEMORY=256MB"
        "-sMAXIMUM_MEMORY=1GB"
        "-sSTACK_SIZE=1MB"
        "-sASSERTIONS=1"
        "-sSAFE_HEAP=0"
        "-sNO_EXIT_RUNTIME=1"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
        "-sASYNCIFY"
        "-sASYNCIFY_STACK_SIZE=65536"
        "--shell-file=${CMAKE_CURRENT_SOURCE_DIR}/web/shell.html"
    )

    # Debug vs Release
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        list(APPEND EMSCRIPTEN_LINK_FLAGS "-g" "-O0")
    else()
        list(APPEND EMSCRIPTEN_LINK_FLAGS "-O3" "-flto")
    endif()

    # Join flags
    string(REPLACE ";" " " EMSCRIPTEN_LINK_FLAGS_STR "${EMSCRIPTEN_LINK_FLAGS}")

    set_target_properties(venpod PROPERTIES
        SUFFIX ".html"
        LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
    )

    # Copy assets if they exist
    if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/assets)
        add_custom_command(TARGET venpod POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_CURRENT_SOURCE_DIR}/assets
            $<TARGET_FILE_DIR:venpod>/assets
            COMMENT "Copying assets to build directory"
        )
    endif()

else()
    message(STATUS "Building for Native (requires Dawn WebGPU)")

    # Find Dawn (Google's WebGPU implementation)
    # You'll need to build/install Dawn separately
    find_package(Dawn QUIET)
    if(Dawn_FOUND)
        target_link_libraries(venpod PRIVATE dawn::dawn)
    else()
        message(WARNING "Dawn not found. Native build may not work.")
        message(STATUS "For web builds, use: emcmake cmake .. && emmake make")
    endif()
endif()

# Installation
install(TARGETS venpod RUNTIME DESTINATION bin)
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/assets)
    install(DIRECTORY assets DESTINATION share/venpod)
endif()

# Print build info
message(STATUS "VENPOD WebGPU Configuration:")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Build Type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  Emscripten: ${EMSCRIPTEN}")
