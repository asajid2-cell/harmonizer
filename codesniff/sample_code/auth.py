"""Authentication and authorization module"""

import hashlib
import secrets
from typing import Optional, Dict


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """
    Hash a password using SHA-256 with a salt

    Args:
        password: Plain text password to hash
        salt: Optional salt, generates new one if not provided

    Returns:
        Tuple of (hashed_password, salt)
    """
    if salt is None:
        salt = secrets.token_hex(32)

    pwd_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return pwd_hash, salt


def verify_password(password: str, pwd_hash: str, salt: str) -> bool:
    """
    Verify a password against a hash

    Args:
        password: Plain text password to verify
        pwd_hash: Stored password hash
        salt: Password salt

    Returns:
        True if password matches, False otherwise
    """
    computed_hash, _ = hash_password(password, salt)
    return computed_hash == pwd_hash


def authenticate_user(username: str, password: str, user_db: Dict) -> bool:
    """
    Authenticate a user with username and password

    Args:
        username: User's username
        password: User's password
        user_db: Database of user credentials

    Returns:
        True if authentication successful, False otherwise
    """
    if username not in user_db:
        return False

    user_data = user_db[username]
    return verify_password(password, user_data['password_hash'], user_data['salt'])


def generate_session_token(user_id: int) -> str:
    """
    Generate a secure session token for a user

    Args:
        user_id: Unique user identifier

    Returns:
        Random session token
    """
    token = secrets.token_urlsafe(32)
    return f"{user_id}:{token}"


def validate_session(token: str, sessions: Dict) -> Optional[int]:
    """
    Validate a session token and return user ID

    Args:
        token: Session token to validate
        sessions: Active session database

    Returns:
        User ID if valid, None otherwise
    """
    if token not in sessions:
        return None

    session_data = sessions[token]
    if session_data.get('expired', False):
        return None

    return session_data.get('user_id')


class PermissionManager:
    """Manages user permissions and access control"""

    def __init__(self):
        """Initialize the permission manager"""
        self.permissions = {}
        self.roles = {}

    def grant_permission(self, user_id: int, resource: str, action: str):
        """
        Grant a permission to a user

        Args:
            user_id: User to grant permission to
            resource: Resource name
            action: Action type (read, write, delete)
        """
        if user_id not in self.permissions:
            self.permissions[user_id] = []

        perm = f"{resource}:{action}"
        if perm not in self.permissions[user_id]:
            self.permissions[user_id].append(perm)

    def check_permission(self, user_id: int, resource: str, action: str) -> bool:
        """
        Check if a user has a specific permission

        Args:
            user_id: User to check
            resource: Resource name
            action: Action type

        Returns:
            True if user has permission, False otherwise
        """
        if user_id not in self.permissions:
            return False

        perm = f"{resource}:{action}"
        return perm in self.permissions[user_id]

    def assign_role(self, user_id: int, role: str):
        """
        Assign a role to a user

        Args:
            user_id: User to assign role to
            role: Role name (admin, user, guest)
        """
        if user_id not in self.roles:
            self.roles[user_id] = []

        if role not in self.roles[user_id]:
            self.roles[user_id].append(role)

    def has_role(self, user_id: int, role: str) -> bool:
        """
        Check if a user has a specific role

        Args:
            user_id: User to check
            role: Role name

        Returns:
            True if user has role, False otherwise
        """
        return role in self.roles.get(user_id, [])
