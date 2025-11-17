/**
 * Image Optimization Helper
 * Automatically adds optimization parameters to media URLs for faster loading.
 */

const ImageOptimizer = {
    /**
     * Configuration for image optimization
     */
    config: {
        // Preferred format (will fallback based on browser support)
        preferredFormat: 'webp',

        // Default max dimensions
        defaultMaxWidth: 1920,
        defaultMaxHeight: 1080,

        // Responsive breakpoints
        breakpoints: {
            thumbnail: { w: 150, h: 150 },
            small: { w: 400, h: 400 },
            medium: { w: 800, h: 800 },
            large: { w: 1200, h: 1200 },
            xlarge: { w: 1920, h: 1080 }
        }
    },

    /**
     * Check if browser supports WebP
     */
    supportsWebP: null,
    checkWebPSupport() {
        if (this.supportsWebP !== null) return this.supportsWebP;

        const canvas = document.createElement('canvas');
        if (canvas.getContext && canvas.getContext('2d')) {
            const dataURL = canvas.toDataURL('image/webp');
            this.supportsWebP = dataURL.indexOf('data:image/webp') === 0;
        } else {
            this.supportsWebP = false;
        }
        return this.supportsWebP;
    },

    /**
     * Check if browser supports AVIF
     */
    supportsAVIF: null,
    async checkAVIFSupport() {
        if (this.supportsAVIF !== null) return this.supportsAVIF;

        const avif = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

        try {
            const img = new Image();
            const promise = new Promise((resolve) => {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
            });
            img.src = avif;
            this.supportsAVIF = await promise;
        } catch {
            this.supportsAVIF = false;
        }

        return this.supportsAVIF;
    },

    /**
     * Get optimal format based on browser support
     */
    async getOptimalFormat() {
        if (await this.checkAVIFSupport()) {
            return 'avif';
        }
        if (this.checkWebPSupport()) {
            return 'webp';
        }
        return 'jpeg';
    },

    /**
     * Optimize media URL with query parameters
     * @param {string} url - Original media URL
     * @param {object} options - Optimization options
     * @param {number} options.maxWidth - Maximum width
     * @param {number} options.maxHeight - Maximum height
     * @param {string} options.size - Preset size (thumbnail, small, medium, large, xlarge)
     * @param {string} options.format - Force specific format (webp, avif, jpeg)
     * @returns {string} Optimized URL
     */
    optimizeURL(url, options = {}) {
        // Check if already optimized
        if (url.includes('?w=') || url.includes('&w=')) {
            return url;
        }

        // Check if this is a media URL
        if (!url.includes('/media/')) {
            return url;
        }

        // Get dimensions
        let width, height;
        if (options.size && this.config.breakpoints[options.size]) {
            const breakpoint = this.config.breakpoints[options.size];
            width = breakpoint.w;
            height = breakpoint.h;
        } else {
            width = options.maxWidth;
            height = options.maxHeight;
        }

        // Build query params
        const params = new URLSearchParams();
        if (width) params.set('w', width);
        if (height) params.set('h', height);
        if (options.format) params.set('fmt', options.format);

        const queryString = params.toString();
        if (!queryString) return url;

        // Add params to URL
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${queryString}`;
    },

    /**
     * Optimize all images on the page
     * @param {string} selector - CSS selector for images (default: 'img[src*="/media/"]')
     * @param {object} options - Optimization options
     */
    optimizeImages(selector = 'img[src*="/media/"]', options = {}) {
        const images = document.querySelectorAll(selector);
        images.forEach(img => {
            const optimizedURL = this.optimizeURL(img.src, options);
            if (optimizedURL !== img.src) {
                // Use data-original to track original URL
                img.dataset.original = img.src;
                img.src = optimizedURL;
            }
        });
    },

    /**
     * Create responsive image srcset
     * @param {string} baseURL - Base media URL
     * @param {array} sizes - Array of size presets (e.g., ['small', 'medium', 'large'])
     * @returns {string} srcset string
     */
    createSrcSet(baseURL, sizes = ['small', 'medium', 'large']) {
        return sizes.map(size => {
            const breakpoint = this.config.breakpoints[size];
            if (!breakpoint) return null;

            const url = this.optimizeURL(baseURL, { size });
            return `${url} ${breakpoint.w}w`;
        }).filter(Boolean).join(', ');
    },

    /**
     * Lazy load images with optimization
     * @param {string} selector - CSS selector for images
     * @param {object} options - Optimization options
     */
    lazyLoad(selector = 'img[data-src]', options = {}) {
        const images = document.querySelectorAll(selector);

        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const dataSrc = img.dataset.src;

                    if (dataSrc) {
                        const optimizedURL = this.optimizeURL(dataSrc, options);
                        img.src = optimizedURL;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px' // Start loading 50px before entering viewport
        });

        images.forEach(img => imageObserver.observe(img));
    },

    /**
     * Preload critical images with optimization
     * @param {array} urls - Array of image URLs to preload
     * @param {object} options - Optimization options
     */
    preload(urls, options = {}) {
        urls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = this.optimizeURL(url, options);
            document.head.appendChild(link);
        });
    }
};

// Auto-detect format support on load
if (typeof window !== 'undefined') {
    // Check WebP support synchronously
    ImageOptimizer.checkWebPSupport();

    // Check AVIF support asynchronously
    ImageOptimizer.checkAVIFSupport().then(supported => {
        console.log(`[ImageOptimizer] AVIF: ${supported ? '✓' : '✗'}, WebP: ${ImageOptimizer.supportsWebP ? '✓' : '✗'}`);
    });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageOptimizer;
}
