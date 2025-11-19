"""Data validation and sanitization utilities"""

import re
from typing import Any, List, Optional
from datetime import datetime


def validate_email(email: str) -> bool:
    """
    Validate email address format

    Args:
        email: Email address to validate

    Returns:
        True if valid email format, False otherwise
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone: str) -> bool:
    """
    Validate phone number format

    Args:
        phone: Phone number to validate

    Returns:
        True if valid phone format, False otherwise
    """
    pattern = r'^\+?1?\d{9,15}$'
    return bool(re.match(pattern, phone.replace('-', '').replace(' ', '')))


def sanitize_input(user_input: str) -> str:
    """
    Sanitize user input to prevent injection attacks

    Args:
        user_input: Raw user input

    Returns:
        Sanitized input string
    """
    # Remove SQL injection attempts
    dangerous_patterns = ['--', ';', '/*', '*/', 'xp_', 'sp_', 'DROP', 'DELETE', 'INSERT']

    sanitized = user_input
    for pattern in dangerous_patterns:
        sanitized = sanitized.replace(pattern, '')

    return sanitized.strip()


def validate_date(date_string: str, format: str = '%Y-%m-%d') -> bool:
    """
    Validate date string format

    Args:
        date_string: Date string to validate
        format: Expected date format

    Returns:
        True if valid date format, False otherwise
    """
    try:
        datetime.strptime(date_string, format)
        return True
    except ValueError:
        return False


def validate_range(value: int, min_val: int, max_val: int) -> bool:
    """
    Validate that a value is within a range

    Args:
        value: Value to check
        min_val: Minimum allowed value
        max_val: Maximum allowed value

    Returns:
        True if value in range, False otherwise
    """
    return min_val <= value <= max_val


class DataValidator:
    """Comprehensive data validation"""

    def __init__(self):
        """Initialize validator"""
        self.errors = []

    def validate_required(self, data: dict, required_fields: List[str]) -> bool:
        """
        Check that all required fields are present

        Args:
            data: Data dictionary to validate
            required_fields: List of required field names

        Returns:
            True if all fields present, False otherwise
        """
        self.errors = []

        for field in required_fields:
            if field not in data or data[field] is None or data[field] == '':
                self.errors.append(f"Missing required field: {field}")

        return len(self.errors) == 0

    def validate_type(self, value: Any, expected_type: type) -> bool:
        """
        Validate value type

        Args:
            value: Value to check
            expected_type: Expected Python type

        Returns:
            True if correct type, False otherwise
        """
        return isinstance(value, expected_type)

    def validate_length(self, value: str, min_len: int = 0, max_len: int = 255) -> bool:
        """
        Validate string length

        Args:
            value: String to validate
            min_len: Minimum length
            max_len: Maximum length

        Returns:
            True if length valid, False otherwise
        """
        return min_len <= len(value) <= max_len

    def get_errors(self) -> List[str]:
        """
        Get validation error messages

        Returns:
            List of error messages
        """
        return self.errors.copy()
