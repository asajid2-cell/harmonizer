# Image Optimization System

Comprehensive server-side image optimization with automatic format conversion, resizing, and caching for maximum loading performance.

## Features

✨ **Automatic Format Conversion**
- WebP (85% quality, widely supported)
- AVIF (80% quality, best compression)
- JPEG fallback for compatibility
- Content negotiation based on Accept headers

🚀 **On-the-Fly Optimization**
- Automatic resizing with aspect ratio preservation
- Smart caching (no reprocessing for repeat requests)
- Query parameter support for custom dimensions
- Zero configuration required for basic usage

💾 **Intelligent Caching**
- File-based cache in `backend/uploads/_optimized/`
- Cache invalidation based on source file mtime
- Separate cache entries for different sizes/formats
- Cache management API endpoints

📊 **Performance Benefits**
- 60-85% file size reduction with WebP
- 70-90% file size reduction with AVIF
- Lazy loading support
- Responsive image srcsets
- Browser cache headers (1 year max-age)

---

## Architecture

### Backend Components

**1. `backend/image_optimizer.py`** - Core optimization engine
- `ImageOptimizer` class handles all compression logic
- PIL/Pillow for image processing
- Format detection and conversion
- Dimension calculation and resizing
- Cache key generation using SHA-256 hashing

**2. `backend/app.py`** - Flask integration
- Modified `/media/<path:filename>` route
- Automatic optimization for image requests
- Query parameter parsing (?w=800&h=600&fmt=webp)
- Accept header negotiation
- Cache management API endpoints

**3. `backend/optimize_images.py`** - CLI batch optimizer
- Pre-generate optimized variants
- Cache warming for existing images
- Statistics reporting

### Frontend Components

**1. `frontend/js/image-loader.js`** - Client-side helper
- Automatic URL optimization
- Format support detection (WebP/AVIF)
- Responsive srcset generation
- Lazy loading with IntersectionObserver
- Preloading for critical images

---

## Usage

### Basic Usage (Automatic)

The system works automatically for all images served through `/media/`:

```html
<!-- Original URL -->
<img src="/media/uploads/photo.jpg">

<!-- Automatically served as optimized WebP/AVIF based on browser support -->
```

### Manual Optimization with Query Parameters

```html
<!-- Resize to 800x600 max -->
<img src="/media/uploads/photo.jpg?w=800&h=600">

<!-- Force WebP format -->
<img src="/media/uploads/photo.jpg?fmt=webp">

<!-- Combine parameters -->
<img src="/media/uploads/photo.jpg?w=400&h=400&fmt=avif">
```

### Using Frontend Helper

```javascript
// Load the helper
<script src="/js/image-loader.js"></script>

// Optimize all media images on page
ImageOptimizer.optimizeImages('img[src*="/media/"]', {
    size: 'medium'  // Uses 800x800 preset
});

// Create responsive srcset
const srcset = ImageOptimizer.createSrcSet(
    '/media/uploads/photo.jpg',
    ['small', 'medium', 'large']
);
// Result: "/media/uploads/photo.jpg?w=400 400w, /media/uploads/photo.jpg?w=800 800w, ..."

// Lazy load images
ImageOptimizer.lazyLoad('img[data-src]', {
    maxWidth: 800,
    maxHeight: 600
});

// Preload critical images
ImageOptimizer.preload([
    '/media/uploads/hero.jpg',
    '/media/uploads/logo.png'
], { size: 'large' });
```

### Responsive Images

```html
<picture>
    <source
        srcset="/media/uploads/photo.jpg?w=400&fmt=avif 400w,
                /media/uploads/photo.jpg?w=800&fmt=avif 800w,
                /media/uploads/photo.jpg?w=1200&fmt=avif 1200w"
        type="image/avif">
    <source
        srcset="/media/uploads/photo.jpg?w=400&fmt=webp 400w,
                /media/uploads/photo.jpg?w=800&fmt=webp 800w,
                /media/uploads/photo.jpg?w=1200&fmt=webp 1200w"
        type="image/webp">
    <img
        src="/media/uploads/photo.jpg?w=800"
        alt="Responsive image"
        sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px">
</picture>
```

---

## API Endpoints

### GET /media/<path:filename>

Serve media files with automatic optimization.

**Query Parameters:**
- `w` (int): Maximum width in pixels
- `h` (int): Maximum height in pixels
- `fmt` (string): Force format (webp, avif, jpeg)

**Headers:**
- `Accept`: Used for automatic format negotiation

**Example:**
```bash
curl http://localhost:4000/media/uploads/photo.jpg?w=800&h=600 \
  -H "Accept: image/avif,image/webp,*/*"
```

### GET /api/image-cache/stats

Get cache statistics.

**Response:**
```json
{
    "cache_folder": "/path/to/uploads/_optimized",
    "cached_files": 142,
    "total_size_bytes": 45678912,
    "total_size_mb": 43.56
}
```

### POST /api/image-cache/clear

Clear optimization cache.

**Query Parameters:**
- `older_than_days` (int, optional): Only clear files older than N days

**Example:**
```bash
# Clear all cache
curl -X POST http://localhost:4000/api/image-cache/clear

# Clear cache older than 30 days
curl -X POST http://localhost:4000/api/image-cache/clear?older_than_days=30
```

### POST /api/image-cache/batch-optimize

Pre-generate optimized variants for all images.

**Response:**
```json
{
    "success": true,
    "total_files": 50,
    "optimized": 48,
    "failed": 2,
    "elapsed_seconds": 12.34
}
```

---

## CLI Tools

### Batch Optimization Script

```bash
cd backend

# Show cache stats only
python optimize_images.py --stats-only

# Optimize all images (WebP + AVIF)
python optimize_images.py

# Clear cache and re-optimize
python optimize_images.py --clear-cache

# Generate only WebP
python optimize_images.py --formats webp

# Custom dimensions
python optimize_images.py --max-width 1200 --max-height 800

# Clear cache older than 7 days
python optimize_images.py --older-than 7
```

**Example Output:**
```
======================================================================
IMAGE OPTIMIZATION CACHE
======================================================================

Cache folder: /path/to/uploads/_optimized
Cached files: 0
Total size: 0.0 MB

----------------------------------------------------------------------
BATCH OPTIMIZATION
----------------------------------------------------------------------

Found 25 images to optimize
Generating formats: webp, avif

[1/25] eldrichify/abc123.png
  WEBP: 245,678 → 89,234 bytes (-63.7%)
  AVIF: 245,678 → 67,891 bytes (-72.4%)

[2/25] imgen/def456.jpg
  WEBP: 123,456 → 45,678 bytes (-63.0%)
  AVIF: 123,456 → 34,567 bytes (-72.0%)

======================================================================
SUMMARY
======================================================================

Total files: 25
Optimized: 25
Failed: 0
Elapsed time: 8.45 seconds

Cache size: 3.2 MB (50 files)

✓ Batch optimization complete
```

---

## Performance Comparison

### File Size Reduction

| Original Format | Size    | WebP       | AVIF       |
|----------------|---------|------------|------------|
| PNG            | 500 KB  | 180 KB (-64%) | 120 KB (-76%) |
| JPEG           | 300 KB  | 150 KB (-50%) | 100 KB (-67%) |
| Large PNG      | 2 MB    | 600 KB (-70%) | 450 KB (-77%) |

### Loading Time Improvement

With a 3G connection (750 KB/s):

| Image Size | Original | Optimized (WebP) | Savings |
|-----------|----------|------------------|---------|
| 500 KB    | 0.67s    | 0.24s            | 64%     |
| 1 MB      | 1.33s    | 0.53s            | 60%     |
| 2 MB      | 2.67s    | 0.80s            | 70%     |

---

## Configuration

### Optimization Settings

Edit `backend/image_optimizer.py` to customize:

```python
class ImageOptimizer:
    def __init__(self, upload_folder, cache_folder=None):
        # Default max dimensions
        self.DEFAULT_MAX_WIDTH = 1920
        self.DEFAULT_MAX_HEIGHT = 1080

        # Quality settings (0-100)
        self.WEBP_QUALITY = 85
        self.AVIF_QUALITY = 80
        self.JPEG_QUALITY = 85
```

### Frontend Presets

Edit `frontend/js/image-loader.js`:

```javascript
breakpoints: {
    thumbnail: { w: 150, h: 150 },
    small: { w: 400, h: 400 },
    medium: { w: 800, h: 800 },
    large: { w: 1200, h: 1200 },
    xlarge: { w: 1920, h: 1080 }
}
```

---

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebP    | ✓ 32+  | ✓ 65+   | ✓ 14+  | ✓ 18+ |
| AVIF    | ✓ 85+  | ✓ 93+   | ✓ 16+  | ✓ 121+ |

Automatic fallback to JPEG for older browsers.

---

## Cache Management

### Cache Structure

```
backend/uploads/
├── _optimized/              # Cache folder
│   ├── abc123...webp        # Cached WebP variant
│   ├── abc123...avif        # Cached AVIF variant
│   ├── def456...webp
│   └── ...
├── eldrichify/
│   └── original.png         # Original files
└── imgen/
    └── photo.jpg
```

### Cache Invalidation

Cache automatically invalidates when:
- Source file is modified (mtime changes)
- Source file is deleted
- Optimization parameters change (w, h, fmt)

### Manual Cache Clearing

```python
from image_optimizer import ImageOptimizer

optimizer = ImageOptimizer(upload_folder)

# Clear all cache
optimizer.clear_cache()

# Clear cache older than 30 days
optimizer.clear_cache(older_than_days=30)

# Get stats
stats = optimizer.get_cache_stats()
print(f"Cache: {stats['total_size_mb']} MB, {stats['cached_files']} files")
```

---

## Troubleshooting

### Images Not Optimizing

1. Check if PIL/Pillow is installed:
```bash
pip install Pillow
```

2. Verify cache folder exists and is writable:
```python
from pathlib import Path
cache = Path('backend/uploads/_optimized')
cache.mkdir(parents=True, exist_ok=True)
```

3. Check server logs for optimization errors:
```bash
# Look for "[ImageOptimizer]" or "[Media]" log entries
tail -f backend.log
```

### Cache Not Working

1. Verify cache key generation:
```python
optimizer = ImageOptimizer(upload_folder)
key = optimizer.get_cache_key(path, 'webp', 800, 600)
print(f"Cache key: {key}")
```

2. Check file permissions on cache folder

3. Clear cache and regenerate:
```bash
python optimize_images.py --clear-cache
```

### Format Support Issues

Test browser support in console:
```javascript
// Test WebP
ImageOptimizer.checkWebPSupport()

// Test AVIF
ImageOptimizer.checkAVIFSupport().then(console.log)
```

---

## Best Practices

### 1. Pre-Optimize on Upload

When users upload images, optimize them immediately:

```python
from image_optimizer import ImageOptimizer

optimizer = ImageOptimizer(UPLOAD_FOLDER)

# After saving uploaded file
optimizer.get_optimized_image(filename, accept_header='image/webp')
optimizer.get_optimized_image(filename, accept_header='image/avif')
```

### 2. Use Appropriate Sizes

Don't load massive images for thumbnails:

```javascript
// Thumbnail grid
ImageOptimizer.optimizeImages('.thumbnail', { size: 'thumbnail' });

// Hero images
ImageOptimizer.optimizeImages('.hero-image', { size: 'xlarge' });
```

### 3. Lazy Load Below-the-Fold Images

```html
<!-- Above the fold: load immediately -->
<img src="/media/hero.jpg?w=1920&fmt=webp" loading="eager">

<!-- Below the fold: lazy load -->
<img data-src="/media/gallery1.jpg" loading="lazy">

<script>
ImageOptimizer.lazyLoad('img[data-src]', { size: 'medium' });
</script>
```

### 4. Cache Warming

Pre-generate optimized variants for critical images:

```bash
# Run after deploying new content
python optimize_images.py
```

### 5. Monitor Cache Size

```bash
# Add to cron: clear old cache weekly
0 0 * * 0 cd /path/to/backend && python optimize_images.py --older-than 30
```

---

## Future Enhancements

- [ ] Smart cropping with face detection
- [ ] Blur placeholder generation (LQIP)
- [ ] Progressive JPEG optimization
- [ ] SVG optimization
- [ ] CDN integration
- [ ] Image analytics (most requested sizes)
- [ ] Automatic Art Direction (different crops for mobile/desktop)

---

## License

Part of the Harmonizer project.
