# Image Optimization Quick Start

## 🚀 Getting Started in 3 Steps

### 1. Install Dependencies (if needed)
```bash
pip install Pillow
```

### 2. Start Using Immediately
**No configuration required!** All images served through `/media/` are automatically optimized.

```html
<!-- This image is now automatically served as WebP/AVIF -->
<img src="/media/uploads/photo.jpg">
```

### 3. Optional: Pre-warm Cache
```bash
cd backend
python optimize_images.py
```

---

## Quick Examples

### Resize Images
```html
<!-- Resize to max 800x600 -->
<img src="/media/uploads/photo.jpg?w=800&h=600">
```

### Force Format
```html
<!-- Force WebP -->
<img src="/media/uploads/photo.jpg?fmt=webp">
```

### Frontend Helper
```html
<script src="/js/image-loader.js"></script>
<script>
  // Optimize all images on page
  ImageOptimizer.optimizeImages();
</script>
```

---

## API Quick Reference

```bash
# Get cache stats
curl http://localhost:4000/api/image-cache/stats

# Clear cache
curl -X POST http://localhost:4000/api/image-cache/clear

# Batch optimize all images
curl -X POST http://localhost:4000/api/image-cache/batch-optimize
```

---

## Expected Results

- **60-90% smaller** image file sizes
- **Automatic format conversion** (WebP/AVIF)
- **Faster page loads** proportional to file size reduction
- **Zero breaking changes** to existing code

---

## Full Documentation

See [IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md) for complete documentation.
