"""Error handling and logging utilities"""

import logging
import traceback
from typing import Optional, Callable
from functools import wraps


# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error"""

    def __init__(self, message: str, code: Optional[int] = None):
        """
        Initialize application error

        Args:
            message: Error message
            code: Optional error code
        """
        super().__init__(message)
        self.message = message
        self.code = code


class ValidationError(AppError):
    """Data validation error"""

    def __init__(self, message: str, field: Optional[str] = None):
        """
        Initialize validation error

        Args:
            message: Error message
            field: Field that failed validation
        """
        super().__init__(message, code=400)
        self.field = field


class AuthenticationError(AppError):
    """Authentication failed error"""

    def __init__(self, message: str = "Authentication failed"):
        """
        Initialize authentication error

        Args:
            message: Error message
        """
        super().__init__(message, code=401)


class PermissionError(AppError):
    """Permission denied error"""

    def __init__(self, message: str = "Permission denied"):
        """
        Initialize permission error

        Args:
            message: Error message
        """
        super().__init__(message, code=403)


def log_error(error: Exception, context: Optional[dict] = None):
    """
    Log an error with context

    Args:
        error: Exception that occurred
        context: Additional context information
    """
    logger.error(f"Error: {str(error)}")

    if context:
        logger.error(f"Context: {context}")

    logger.error(f"Traceback: {traceback.format_exc()}")


def handle_exception(func: Callable) -> Callable:
    """
    Decorator to handle exceptions in functions

    Args:
        func: Function to wrap

    Returns:
        Wrapped function with exception handling
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            log_error(e, context={'function': func.__name__, 'args': args, 'kwargs': kwargs})
            raise

    return wrapper


def retry_on_error(max_attempts: int = 3, delay: float = 1.0):
    """
    Decorator to retry function on error

    Args:
        max_attempts: Maximum retry attempts
        delay: Delay between retries in seconds
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            import time

            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")

                    if attempt < max_attempts - 1:
                        time.sleep(delay)

            log_error(last_error, context={'function': func.__name__, 'attempts': max_attempts})
            raise last_error

        return wrapper

    return decorator


def safe_execute(func: Callable, default_value: any = None) -> any:
    """
    Safely execute a function and return default on error

    Args:
        func: Function to execute
        default_value: Value to return on error

    Returns:
        Function result or default value
    """
    try:
        return func()
    except Exception as e:
        log_error(e)
        return default_value


class ErrorHandler:
    """Central error handler"""

    def __init__(self):
        """Initialize error handler"""
        self.error_counts = {}

    def handle(self, error: Exception, context: Optional[dict] = None):
        """
        Handle an error

        Args:
            error: Exception to handle
            context: Additional context
        """
        error_type = type(error).__name__
        self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1

        log_error(error, context)

    def get_stats(self) -> dict:
        """
        Get error statistics

        Returns:
            Dictionary of error counts by type
        """
        return self.error_counts.copy()
