"""
Image optimization module for on-the-fly compression and format conversion.
Provides WebP/AVIF conversion, resizing, and caching for optimal load times.
"""

import hashlib
import mimetypes
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image
import io

class ImageOptimizer:
    """Handles image optimization with caching."""

    def __init__(self, upload_folder: Path, cache_folder: Optional[Path] = None):
        self.upload_folder = Path(upload_folder)
        self.cache_folder = cache_folder or (self.upload_folder / "_optimized")
        self.cache_folder.mkdir(parents=True, exist_ok=True)

        # Optimization settings
        self.DEFAULT_MAX_WIDTH = 1920
        self.DEFAULT_MAX_HEIGHT = 1080
        self.WEBP_QUALITY = 85
        self.AVIF_QUALITY = 80
        self.JPEG_QUALITY = 85

        # Supported image formats
        self.IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'}

    def is_image(self, filename: str) -> bool:
        """Check if file is an image."""
        ext = Path(filename).suffix.lower()
        return ext in self.IMAGE_FORMATS

    def get_cache_key(
        self,
        original_path: Path,
        format: str,
        max_width: Optional[int] = None,
        max_height: Optional[int] = None
    ) -> str:
        """Generate cache key based on file path, mtime, format, and dimensions."""
        stat = original_path.stat()
        components = [
            str(original_path),
            str(stat.st_mtime),
            str(stat.st_size),
            format,
            str(max_width or 'auto'),
            str(max_height or 'auto')
        ]
        key_str = '|'.join(components)
        return hashlib.sha256(key_str.encode()).hexdigest()

    def get_cached_path(
        self,
        cache_key: str,
        format: str
    ) -> Path:
        """Get path for cached optimized image."""
        return self.cache_folder / f"{cache_key}.{format}"

    def get_optimal_format(self, accept_header: Optional[str]) -> str:
        """
        Determine optimal format based on client support.
        Priority: AVIF > WebP > JPEG
        """
        if not accept_header:
            return 'webp'  # Default to WebP

        accept_lower = accept_header.lower()

        # Check for AVIF support (best compression)
        if 'image/avif' in accept_lower:
            return 'avif'

        # Check for WebP support (widely supported, good compression)
        if 'image/webp' in accept_lower:
            return 'webp'

        # Fallback to JPEG for compatibility
        return 'jpeg'

    def calculate_resize_dimensions(
        self,
        original_width: int,
        original_height: int,
        max_width: Optional[int] = None,
        max_height: Optional[int] = None
    ) -> Tuple[int, int]:
        """Calculate new dimensions while maintaining aspect ratio."""
        max_w = max_width or self.DEFAULT_MAX_WIDTH
        max_h = max_height or self.DEFAULT_MAX_HEIGHT

        # If image is already smaller, don't upscale
        if original_width <= max_w and original_height <= max_h:
            return original_width, original_height

        # Calculate scaling factor
        width_ratio = max_w / original_width
        height_ratio = max_h / original_height
        scale_factor = min(width_ratio, height_ratio)

        new_width = int(original_width * scale_factor)
        new_height = int(original_height * scale_factor)

        return new_width, new_height

    def optimize_image(
        self,
        original_path: Path,
        output_format: str,
        max_width: Optional[int] = None,
        max_height: Optional[int] = None
    ) -> bytes:
        """
        Optimize image: resize, convert format, and compress.
        Returns optimized image as bytes.
        """
        # Open image
        with Image.open(original_path) as img:
            # Convert RGBA to RGB for JPEG/WebP/AVIF if needed
            if img.mode in ('RGBA', 'LA') and output_format in ('jpeg', 'jpg'):
                # Create white background
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                else:
                    background.paste(img, mask=img.split()[1])
                img = background
            elif img.mode not in ('RGB', 'RGBA'):
                # Convert other modes to RGB
                img = img.convert('RGB')

            # Calculate new dimensions
            new_width, new_height = self.calculate_resize_dimensions(
                img.width, img.height, max_width, max_height
            )

            # Resize if needed
            if (new_width, new_height) != (img.width, img.height):
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Optimize and convert format
            buffer = io.BytesIO()

            if output_format == 'webp':
                img.save(
                    buffer,
                    format='WEBP',
                    quality=self.WEBP_QUALITY,
                    method=6  # Best quality/compression trade-off
                )
            elif output_format == 'avif':
                img.save(
                    buffer,
                    format='AVIF',
                    quality=self.AVIF_QUALITY,
                    speed=4  # Balance between speed and compression
                )
            elif output_format in ('jpeg', 'jpg'):
                img.save(
                    buffer,
                    format='JPEG',
                    quality=self.JPEG_QUALITY,
                    optimize=True
                )
            elif output_format == 'png':
                img.save(
                    buffer,
                    format='PNG',
                    optimize=True
                )
            else:
                # Fallback: save in original format
                img.save(buffer, format=img.format or 'PNG')

            return buffer.getvalue()

    def get_optimized_image(
        self,
        filename: str,
        accept_header: Optional[str] = None,
        max_width: Optional[int] = None,
        max_height: Optional[int] = None,
        force_format: Optional[str] = None
    ) -> Tuple[bytes, str]:
        """
        Get optimized image, using cache if available.
        Returns (image_bytes, mimetype)
        """
        original_path = self.upload_folder / filename

        if not original_path.exists():
            raise FileNotFoundError(f"Image not found: {filename}")

        if not self.is_image(filename):
            # Not an image, return as-is
            with open(original_path, 'rb') as f:
                data = f.read()
            mimetype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
            return data, mimetype

        # Determine output format
        output_format = force_format or self.get_optimal_format(accept_header)

        # Generate cache key
        cache_key = self.get_cache_key(original_path, output_format, max_width, max_height)
        cached_path = self.get_cached_path(cache_key, output_format)

        # Check cache
        if cached_path.exists():
            with open(cached_path, 'rb') as f:
                data = f.read()
            mimetype = f'image/{output_format}'
            return data, mimetype

        # Generate optimized image
        try:
            optimized_data = self.optimize_image(
                original_path,
                output_format,
                max_width,
                max_height
            )

            # Save to cache
            with open(cached_path, 'wb') as f:
                f.write(optimized_data)

            mimetype = f'image/{output_format}'
            return optimized_data, mimetype

        except Exception as e:
            # Fallback: return original if optimization fails
            print(f"[ImageOptimizer] Failed to optimize {filename}: {e}")
            with open(original_path, 'rb') as f:
                data = f.read()
            mimetype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
            return data, mimetype

    def clear_cache(self, older_than_days: Optional[int] = None):
        """Clear optimization cache, optionally only files older than specified days."""
        import time

        if older_than_days is None:
            # Clear all cache
            for cached_file in self.cache_folder.glob('*'):
                if cached_file.is_file():
                    cached_file.unlink()
            print(f"[ImageOptimizer] Cleared all cache files")
        else:
            # Clear old files
            cutoff_time = time.time() - (older_than_days * 86400)
            removed_count = 0
            for cached_file in self.cache_folder.glob('*'):
                if cached_file.is_file() and cached_file.stat().st_mtime < cutoff_time:
                    cached_file.unlink()
                    removed_count += 1
            print(f"[ImageOptimizer] Removed {removed_count} cached files older than {older_than_days} days")

    def get_cache_stats(self) -> dict:
        """Get cache statistics."""
        cache_files = list(self.cache_folder.glob('*'))
        total_size = sum(f.stat().st_size for f in cache_files if f.is_file())

        return {
            'cache_folder': str(self.cache_folder),
            'cached_files': len(cache_files),
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2)
        }
