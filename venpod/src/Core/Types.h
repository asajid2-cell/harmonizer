// =============================================================================
// VENPOD WebGPU - Core Types
// Platform-agnostic type definitions for WebGPU voxel engine
// =============================================================================

#pragma once

#include <cstdint>
#include <string>
#include <optional>
#include <variant>

namespace VENPOD {

// Result type for error handling
template<typename T>
using Result = std::variant<T, std::string>;

template<typename T>
inline bool IsOk(const Result<T>& result) {
    return std::holds_alternative<T>(result);
}

template<typename T>
inline T& GetValue(Result<T>& result) {
    return std::get<T>(result);
}

template<typename T>
inline const T& GetValue(const Result<T>& result) {
    return std::get<T>(result);
}

template<typename T>
inline const std::string& GetError(const Result<T>& result) {
    return std::get<std::string>(result);
}

// Success result for void operations
struct Success {};
using VoidResult = Result<Success>;

inline VoidResult Ok() { return Success{}; }
inline VoidResult Err(const std::string& msg) { return msg; }

// Vector types (compatible with shader uniforms)
struct Vec2 {
    float x, y;
    Vec2() : x(0), y(0) {}
    Vec2(float x_, float y_) : x(x_), y(y_) {}
};

struct Vec3 {
    float x, y, z;
    Vec3() : x(0), y(0), z(0) {}
    Vec3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}

    Vec3 operator+(const Vec3& other) const { return Vec3(x + other.x, y + other.y, z + other.z); }
    Vec3 operator-(const Vec3& other) const { return Vec3(x - other.x, y - other.y, z - other.z); }
    Vec3 operator*(float s) const { return Vec3(x * s, y * s, z * s); }
    Vec3 operator/(float s) const { return Vec3(x / s, y / s, z / s); }
};

struct Vec4 {
    float x, y, z, w;
    Vec4() : x(0), y(0), z(0), w(0) {}
    Vec4(float x_, float y_, float z_, float w_) : x(x_), y(y_), z(z_), w(w_) {}
    Vec4(const Vec3& v, float w_) : x(v.x), y(v.y), z(v.z), w(w_) {}
};

struct UVec3 {
    uint32_t x, y, z;
    UVec3() : x(0), y(0), z(0) {}
    UVec3(uint32_t x_, uint32_t y_, uint32_t z_) : x(x_), y(y_), z(z_) {}
};

// Math utilities
inline float dot(const Vec3& a, const Vec3& b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

inline Vec3 cross(const Vec3& a, const Vec3& b) {
    return Vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

inline float length(const Vec3& v) {
    return sqrtf(dot(v, v));
}

inline Vec3 normalize(const Vec3& v) {
    float len = length(v);
    if (len > 0.0001f) {
        return v / len;
    }
    return Vec3(0, 1, 0);
}

inline float clamp(float v, float minVal, float maxVal) {
    if (v < minVal) return minVal;
    if (v > maxVal) return maxVal;
    return v;
}

// Material IDs (must match WGSL shaders)
namespace Material {
    constexpr uint32_t AIR = 0;
    constexpr uint32_t SAND = 1;
    constexpr uint32_t WATER = 2;
    constexpr uint32_t STONE = 3;
    constexpr uint32_t DIRT = 4;
    constexpr uint32_t WOOD = 5;
    constexpr uint32_t FIRE = 6;
    constexpr uint32_t LAVA = 7;
    constexpr uint32_t ICE = 8;
    constexpr uint32_t OIL = 9;
    constexpr uint32_t GLASS = 10;
    constexpr uint32_t SMOKE = 11;
    constexpr uint32_t ACID = 12;
    constexpr uint32_t HONEY = 13;
    constexpr uint32_t CONCRETE = 14;
    constexpr uint32_t GUNPOWDER = 15;
    constexpr uint32_t CRYSTAL = 16;
    constexpr uint32_t STEAM = 17;
    constexpr uint32_t BEDROCK = 255;
}

// Voxel packing utilities (matches WGSL)
inline uint32_t PackVoxel(uint32_t material, uint32_t variant = 0, uint32_t velocity = 0, uint32_t state = 0) {
    return (material & 0xFF) |
           ((variant & 0xFF) << 8) |
           ((velocity & 0xFF) << 16) |
           ((state & 0xFF) << 24);
}

inline uint32_t GetMaterial(uint32_t voxel) {
    return voxel & 0xFF;
}

inline uint32_t GetVariant(uint32_t voxel) {
    return (voxel >> 8) & 0xFF;
}

} // namespace VENPOD
