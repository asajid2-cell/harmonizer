#!/usr/bin/env python3
"""
CLI tool for batch image optimization.
Optimizes all images in the uploads folder and generates WebP/AVIF variants.
"""

import argparse
import time
from pathlib import Path
from image_optimizer import ImageOptimizer


def main():
    parser = argparse.ArgumentParser(description='Batch optimize images in uploads folder')
    parser.add_argument(
        '--clear-cache',
        action='store_true',
        help='Clear optimization cache before optimizing'
    )
    parser.add_argument(
        '--older-than',
        type=int,
        metavar='DAYS',
        help='Only clear cache files older than N days'
    )
    parser.add_argument(
        '--stats-only',
        action='store_true',
        help='Only show cache statistics without optimizing'
    )
    parser.add_argument(
        '--formats',
        nargs='+',
        choices=['webp', 'avif', 'jpeg'],
        default=['webp', 'avif'],
        help='Formats to generate (default: webp avif)'
    )
    parser.add_argument(
        '--max-width',
        type=int,
        help='Maximum width for optimized images (default: 1920)'
    )
    parser.add_argument(
        '--max-height',
        type=int,
        help='Maximum height for optimized images (default: 1080)'
    )

    args = parser.parse_args()

    # Initialize optimizer
    backend_dir = Path(__file__).parent
    upload_folder = backend_dir / 'uploads'
    optimizer = ImageOptimizer(upload_folder)

    # Show cache stats
    print("\n" + "="*70)
    print("IMAGE OPTIMIZATION CACHE")
    print("="*70)

    stats = optimizer.get_cache_stats()
    print(f"\nCache folder: {stats['cache_folder']}")
    print(f"Cached files: {stats['cached_files']}")
    print(f"Total size: {stats['total_size_mb']} MB")

    if args.stats_only:
        return

    # Clear cache if requested
    if args.clear_cache:
        print("\n" + "-"*70)
        print("CLEARING CACHE")
        print("-"*70)
        optimizer.clear_cache(older_than_days=args.older_than)
        print("✓ Cache cleared")

    # Batch optimize
    print("\n" + "-"*70)
    print("BATCH OPTIMIZATION")
    print("-"*70)

    # Find all images
    image_files = []
    for ext in optimizer.IMAGE_FORMATS:
        image_files.extend(upload_folder.rglob(f'*{ext}'))

    # Filter out cached files
    image_files = [
        f for f in image_files
        if optimizer.cache_folder not in f.parents
    ]

    print(f"\nFound {len(image_files)} images to optimize")
    print(f"Generating formats: {', '.join(args.formats)}")

    if not image_files:
        print("✓ No images to optimize")
        return

    # Optimize each image
    optimized_count = 0
    failed_count = 0
    start_time = time.time()

    for i, img_path in enumerate(image_files, 1):
        rel_path = img_path.relative_to(upload_folder)
        print(f"\n[{i}/{len(image_files)}] {rel_path}")

        try:
            for fmt in args.formats:
                accept_header = f'image/{fmt}'

                # Get original size
                original_size = img_path.stat().st_size

                # Optimize
                optimized_data, _ = optimizer.get_optimized_image(
                    str(rel_path),
                    accept_header=accept_header,
                    max_width=args.max_width,
                    max_height=args.max_height
                )

                # Calculate savings
                optimized_size = len(optimized_data)
                savings_percent = ((original_size - optimized_size) / original_size) * 100

                print(f"  {fmt.upper()}: {original_size:,} → {optimized_size:,} bytes "
                      f"({savings_percent:+.1f}%)")

            optimized_count += 1

        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            failed_count += 1

    elapsed_time = time.time() - start_time

    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"\nTotal files: {len(image_files)}")
    print(f"Optimized: {optimized_count}")
    print(f"Failed: {failed_count}")
    print(f"Elapsed time: {elapsed_time:.2f} seconds")

    # Show updated cache stats
    stats = optimizer.get_cache_stats()
    print(f"\nCache size: {stats['total_size_mb']} MB ({stats['cached_files']} files)")
    print("\n✓ Batch optimization complete")


if __name__ == '__main__':
    main()
