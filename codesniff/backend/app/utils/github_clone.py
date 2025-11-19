"""
GitHub repository cloning and cleaning utilities
"""

import os
import shutil
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
from loguru import logger


# Extensions to exclude (large files, media, etc.)
EXCLUDED_EXTENSIONS = {
    # Media
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico', '.webp',
    '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.wmv', '.flv',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',

    # Archives
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',

    # Binaries
    '.exe', '.dll', '.so', '.dylib', '.bin',

    # Database
    '.db', '.sqlite', '.sqlite3',

    # Fonts
    '.ttf', '.otf', '.woff', '.woff2',
}

# Directories to exclude
EXCLUDED_DIRS = {
    'node_modules', '__pycache__', '.git', '.svn', '.hg',
    'venv', 'env', '.venv', 'virtualenv',
    'dist', 'build', '.next', '.nuxt',
    'coverage', '.pytest_cache', '.mypy_cache',
    'vendor', 'bower_components',
}


def clone_github_repo(repo_url: str, target_dir: Optional[str] = None) -> str:
    """
    Clone a GitHub repository to a temporary directory

    Args:
        repo_url: GitHub repository URL (https or git)
        target_dir: Optional target directory (defaults to temp dir)

    Returns:
        Path to cloned repository

    Raises:
        subprocess.CalledProcessError: If git clone fails
    """
    if target_dir is None:
        target_dir = tempfile.mkdtemp(prefix='codescope_clone_')

    logger.info(f"Cloning {repo_url} to {target_dir}")

    try:
        # Clone repository (shallow clone for speed)
        subprocess.run(
            ['git', 'clone', '--depth', '1', repo_url, target_dir],
            check=True,
            capture_output=True,
            text=True
        )

        logger.info(f"Successfully cloned repository to {target_dir}")
        return target_dir

    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to clone repository: {e.stderr}")
        raise
    except FileNotFoundError:
        raise RuntimeError("Git is not installed or not in PATH")


def clean_repository(repo_path: str) -> dict:
    """
    Remove unnecessary files from cloned repository

    Args:
        repo_path: Path to repository

    Returns:
        Dict with cleanup statistics
    """
    logger.info(f"Cleaning repository at {repo_path}")

    stats = {
        'files_removed': 0,
        'dirs_removed': 0,
        'bytes_freed': 0,
    }

    repo_path_obj = Path(repo_path)

    # Remove excluded directories
    for root, dirs, files in os.walk(repo_path, topdown=True):
        # Filter out excluded directories (modifies dirs in-place)
        dirs_to_remove = [d for d in dirs if d in EXCLUDED_DIRS]
        for dir_name in dirs_to_remove:
            dir_path = Path(root) / dir_name
            try:
                size = sum(f.stat().st_size for f in dir_path.rglob('*') if f.is_file())
                shutil.rmtree(dir_path)
                stats['dirs_removed'] += 1
                stats['bytes_freed'] += size
                logger.debug(f"Removed directory: {dir_path}")
            except Exception as e:
                logger.warning(f"Failed to remove {dir_path}: {e}")

        # Remove excluded directories from traversal
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

    # Remove excluded file types
    for root, _, files in os.walk(repo_path):
        for file_name in files:
            file_path = Path(root) / file_name
            ext = file_path.suffix.lower()

            # Check if extension should be excluded
            should_remove = ext in EXCLUDED_EXTENSIONS

            # Also check file size for certain extensions
            if not should_remove and ext in {'.json', '.csv', '.xml'}:
                try:
                    if file_path.stat().st_size > 1_000_000:  # >1MB
                        should_remove = True
                except:
                    pass

            if should_remove:
                try:
                    size = file_path.stat().st_size
                    file_path.unlink()
                    stats['files_removed'] += 1
                    stats['bytes_freed'] += size
                    logger.debug(f"Removed file: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to remove {file_path}: {e}")

    logger.info(
        f"Cleanup complete: {stats['files_removed']} files, "
        f"{stats['dirs_removed']} directories removed, "
        f"{stats['bytes_freed'] / 1024 / 1024:.2f} MB freed"
    )

    return stats


def cleanup_temp_repo(repo_path: str):
    """
    Remove temporary repository directory

    Args:
        repo_path: Path to repository
    """
    try:
        shutil.rmtree(repo_path)
        logger.info(f"Removed temporary repository at {repo_path}")
    except Exception as e:
        logger.warning(f"Failed to remove temporary repository: {e}")
