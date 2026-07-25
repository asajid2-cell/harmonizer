"""
GitHub repository cloning and cleaning utilities
"""

import os
import re
import shutil
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
from loguru import logger


# --- clone URL allowlist -------------------------------------------------------------
# `git clone` treats its URL operand as more than a location. Two of its features turn an
# unvalidated URL into arbitrary command execution as whatever user git runs as:
#   * the `ext::` transport runs a shell command  ->  git clone 'ext::sh -c <cmd>'
#   * a URL beginning with `-` is parsed as an option -> '--upload-pack=<cmd>'
# Neither is reachable if the URL must match a literal https GitHub repo, so match that and
# reject everything else. Deny-by-default: anything not matched is refused, not sanitised.
ALLOWED_REPO_RE = re.compile(
    r'^https://github\.com/'          # scheme + host are fixed, so no ext::/file:///ssh://
    r'[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})/'   # owner
    r'[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})'    # repo
    r'(?:\.git)?/?$'
)

# Branch names land in `--branch <name>`; keep them to git's own ref rules so a crafted
# branch cannot smuggle an option either.
ALLOWED_BRANCH_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$')


class DisallowedRepoURL(ValueError):
    """Raised when a clone URL is not a plain https GitHub repository."""


def validate_repo_url(repo_url: str) -> str:
    url = (repo_url or '').strip()
    if not ALLOWED_REPO_RE.match(url):
        raise DisallowedRepoURL(
            'Only public https://github.com/<owner>/<repo> URLs may be indexed.'
        )
    return url


def validate_branch(branch):
    if branch is None or branch == '':
        return None
    if not ALLOWED_BRANCH_RE.match(branch):
        raise DisallowedRepoURL('Invalid branch name.')
    return branch


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
                  Supports branch-specific URLs like:
                  - https://github.com/user/repo/tree/branch-name
                  - https://github.com/user/repo (uses default branch)
        target_dir: Optional target directory (defaults to temp dir)

    Returns:
        Path to cloned repository

    Raises:
        subprocess.CalledProcessError: If git clone fails
    """
    if target_dir is None:
        target_dir = tempfile.mkdtemp(prefix='codescope_clone_')

    # Parse URL to extract branch if present
    # GitHub URLs with branches: https://github.com/user/repo/tree/branch-name
    branch = None
    clean_url = repo_url

    if '/tree/' in repo_url:
        # Extract branch from URL
        parts = repo_url.split('/tree/')
        clean_url = parts[0]
        branch = parts[1].split('/')[0] if len(parts) > 1 else None
        logger.info(f"Detected branch '{branch}' from URL")

    # deny-by-default before anything reaches git's argv
    clean_url = validate_repo_url(clean_url)
    branch = validate_branch(branch)

    logger.info(f"Cloning {clean_url} to {target_dir}")

    try:
        # Build git clone command
        clone_cmd = ['git', 'clone', '--depth', '1']

        if branch:
            # Clone specific branch
            clone_cmd.extend(['--branch', branch])

        # `--` ends option parsing, so a URL can never be read as a flag even if the
        # allowlist above is ever loosened.
        clone_cmd.extend(['--', clean_url, target_dir])

        # Clone repository (shallow clone for speed)
        env = dict(os.environ,
                   GIT_TERMINAL_PROMPT='0',      # never block on a credential prompt
                   GIT_ALLOW_PROTOCOL='https')   # git itself refuses ext::/file:///ssh://
        subprocess.run(
            clone_cmd,
            env=env,
            check=True,
            capture_output=True,
            text=True
        )

        logger.info(f"Successfully cloned repository to {target_dir}")
        return target_dir

    except subprocess.CalledProcessError as e:
        stderr = e.stderr if e.stderr else str(e)

        # Provide better error messages
        if 'not found' in stderr.lower() and branch:
            error_msg = f"Branch '{branch}' not found in repository. Please check the branch name or use the default branch."
        elif 'authentication' in stderr.lower() or 'permission' in stderr.lower():
            error_msg = "Authentication failed. Make sure the repository is public or provide valid credentials."
        elif 'not found' in stderr.lower():
            error_msg = "Repository not found. Check the URL and ensure the repository exists and is accessible."
        else:
            error_msg = f"Failed to clone repository: {stderr}"

        logger.error(error_msg)
        raise RuntimeError(error_msg)
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
