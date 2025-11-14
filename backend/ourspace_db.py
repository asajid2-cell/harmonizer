"""OurSpace Database Models and Setup"""
import sqlite3
import json
import hashlib
import secrets
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime

# Database file location
DB_PATH = Path(__file__).parent / "ourspace_data" / "ourspace.db"


def get_db():
    """Get database connection"""
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hash password with salt"""
    if salt is None:
        salt = secrets.token_hex(32)

    # Use PBKDF2 with SHA256
    password_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000  # iterations
    ).hex()

    return password_hash, salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verify password against hash"""
    computed_hash, _ = hash_password(password, salt)
    return computed_hash == password_hash


def init_db():
    """Initialize database with schema"""
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            profile_published BOOLEAN DEFAULT 0
        )
    """)

    # Settings table for admin password
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # Profiles table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            profile_data TEXT NOT NULL,
            last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            visits INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Friends table (bidirectional friendship)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, friend_id)
        )
    """)

    # Friend requests table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(from_user_id, to_user_id),
            CHECK(status IN ('pending', 'accepted', 'rejected'))
        )
    """)

    # Messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Blocked users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocked_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blocked_user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, blocked_user_id)
        )
    """)

    # Profile comments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS profile_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_user_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            comment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Create indexes for performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_username ON users(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_profile ON profiles(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_friendships ON friendships(user_id, friend_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_friend_requests ON friend_requests(to_user_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages ON messages(to_user_id, read)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_users ON blocked_users(user_id, blocked_user_id)")

    # Initialize admin password if not exists
    cursor.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'")
    if not cursor.fetchone():
        admin_password = ""
        admin_hash, admin_salt = hash_password(admin_password)
        cursor.execute("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)", (admin_hash,))
        cursor.execute("INSERT INTO settings (key, value) VALUES ('admin_password_salt', ?)", (admin_salt,))
        print("[DB] Admin password initialized")

    conn.commit()
    conn.close()


def create_user(username: str, password: str) -> Optional[int]:
    """Create a new user"""
    password_hash, salt = hash_password(password)

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            (username, password_hash, salt)
        )

        user_id = cursor.lastrowid

        # Create default profile
        default_profile = {
            "theme": {
                "name": "classic",
                "colors": {
                    "background": "#0066cc",
                    "text": "#ffffff",
                    "links": "#00ccff",
                    "borders": "#ffffff",
                    "widgetBg": "#003399"
                },
                "fonts": {
                    "family": "Arial, sans-serif",
                    "size": 14,
                    "effects": {"shadow": False, "glow": False}
                },
                "background": {
                    "type": "pattern",
                    "pattern": "hearts",
                    "image": "",
                    "repeat": "repeat",
                    "attachment": "fixed",
                    "gradient": ""
                },
                "effects": {
                    "falling": {"enabled": False, "type": "hearts", "speed": 2},
                    "cursorTrail": {"enabled": False, "type": "sparkle"},
                    "blink": False,
                    "glitter": False
                }
            },
            "profile": {
                "name": username,
                "tagline": "✨ living my best life ✨",
                "mood": {"text": "chillin", "icon": "ðŸ˜Ž"},
                "bannerImage": "",
                "profilePic": ""
            },
            "widgets": {
                "aboutMe": {"content": f"<p>Hey! I'm {username}. Welcome to my page!</p>"},
                "interests": {
                    "music": "Everything!",
                    "movies": "Action, Comedy",
                    "tv": "The best shows",
                    "books": "Fantasy, Sci-Fi"
                },
                "topFriends": {"slots": 8, "friends": []},
                "comments": {"entries": []},
                "pictureWall": {"columns": 3, "images": []},
                "music": {
                    "audioData": "",
                    "title": "No track loaded",
                    "autoplay": False,
                    "volume": 50
                },
                "customHtml": {"html": "", "global": ""}
            },
            "meta": {
                "created": datetime.now().isoformat(),
                "lastModified": datetime.now().isoformat(),
                "visits": 0
            }
        }

        cursor.execute(
            "INSERT INTO profiles (user_id, profile_data, visits) VALUES (?, ?, ?)",
            (user_id, json.dumps(default_profile), 0)
        )

        conn.commit()
        conn.close()

        return user_id
    except sqlite3.IntegrityError:
        return None  # Username already exists


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate user and return user data"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, username, password_hash, salt, profile_published FROM users WHERE username = ?",
        (username,)
    )

    user = cursor.fetchone()

    if user and verify_password(password, user['password_hash'], user['salt']):
        # Update last login
        cursor.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
            (user['id'],)
        )
        conn.commit()
        conn.close()

        return {
            "id": user['id'],
            "username": user['username'],
            "profile_published": bool(user['profile_published'])
        }

    conn.close()
    return None


def get_user_profile(user_id: int) -> Optional[Dict[str, Any]]:
    """Get user's profile data"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT profile_data, visits FROM profiles WHERE user_id = ?",
        (user_id,)
    )

    profile = cursor.fetchone()
    conn.close()

    if profile:
        return {
            "data": json.loads(profile['profile_data']),
            "visits": profile['visits']
        }

    return None


def get_user_profile_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Get user's profile by username (for viewing other profiles)"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT u.id, u.username, u.profile_published, p.profile_data, p.visits
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.username = ?
    """, (username,))

    result = cursor.fetchone()

    if result and result['profile_published']:
        # Increment visit counter
        cursor.execute(
            "UPDATE profiles SET visits = visits + 1 WHERE user_id = ?",
            (result['id'],)
        )
        conn.commit()

    conn.close()

    if result:
        return {
            "user_id": result['id'],
            "username": result['username'],
            "published": bool(result['profile_published']),
            "data": json.loads(result['profile_data']) if result['profile_data'] else None,
            "visits": result['visits'] if result['visits'] else 0
        }

    return None


def save_user_profile(user_id: int, profile_data: Dict[str, Any]) -> bool:
    """Save user's profile data"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO profiles (user_id, profile_data, last_modified, visits)
            VALUES (?, ?, CURRENT_TIMESTAMP, 0)
            ON CONFLICT(user_id) DO UPDATE SET
                profile_data = excluded.profile_data,
                last_modified = CURRENT_TIMESTAMP
            """,
            (user_id, json.dumps(profile_data))
        )

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving profile: {e}")
        return False


def publish_profile(user_id: int) -> bool:
    """Publish user's profile to make it visible to others"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE users SET profile_published = 1 WHERE id = ?",
            (user_id,)
        )

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error publishing profile: {e}")
        return False


def add_friend(user_id: int, friend_id: int) -> bool:
    """Add a friend (bidirectional)"""
    if user_id == friend_id:
        return False

    try:
        conn = get_db()
        cursor = conn.cursor()

        # Add friendship both ways
        cursor.execute(
            "INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
            (user_id, friend_id)
        )
        cursor.execute(
            "INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
            (friend_id, user_id)
        )

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error adding friend: {e}")
        return False


def remove_friend(user_id: int, friend_id: int) -> bool:
    """Remove a friend (bidirectional)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Remove friendship both ways
        cursor.execute(
            "DELETE FROM friendships WHERE user_id = ? AND friend_id = ?",
            (user_id, friend_id)
        )
        cursor.execute(
            "DELETE FROM friendships WHERE user_id = ? AND friend_id = ?",
            (friend_id, user_id)
        )

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error removing friend: {e}")
        return False


def get_friends(user_id: int) -> List[Dict[str, Any]]:
    """Get user's friends list"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT u.id, u.username, u.profile_published
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
        ORDER BY u.username
    """, (user_id,))

    friends = [
        {
            "id": row['id'],
            "username": row['username'],
            "published": bool(row['profile_published'])
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return friends


def search_users(query: str, limit: int = 20) -> List[Dict[str, str]]:
    """Search for users by username"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT username FROM users
        WHERE username LIKE ? AND profile_published = 1
        ORDER BY username
        LIMIT ?
    """, (f"%{query}%", limit))

    users = [{"username": row['username']} for row in cursor.fetchall()]

    conn.close()
    return users


def verify_admin_password(admin_password: str) -> bool:
    """Verify admin password for password reset"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'")
        hash_row = cursor.fetchone()
        cursor.execute("SELECT value FROM settings WHERE key = 'admin_password_salt'")
        salt_row = cursor.fetchone()

        conn.close()

        if hash_row and salt_row:
            return verify_password(admin_password, hash_row['value'], salt_row['value'])

        return False
    except Exception as e:
        print(f"Error verifying admin password: {e}")
        return False


def reset_user_password(username: str, new_password: str, admin_password: str) -> bool:
    """Reset a user's password with admin password verification"""
    # Verify admin password first
    if not verify_admin_password(admin_password):
        print(f"[Password Reset] Failed - Invalid admin password")
        return False

    try:
        conn = get_db()
        cursor = conn.cursor()

        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()

        if not user:
            conn.close()
            print(f"[Password Reset] Failed - User '{username}' not found")
            return False

        # Hash new password
        new_hash, new_salt = hash_password(new_password)

        # Update password
        cursor.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
            (new_hash, new_salt, username)
        )

        conn.commit()
        conn.close()

        print(f"[Password Reset] Success - Password reset for user '{username}'")
        return True

    except Exception as e:
        print(f"Error resetting password: {e}")
        return False


# Friend Request Functions

def send_friend_request(from_user_id: int, to_username: str) -> bool:
    """Send a friend request to another user"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get to_user_id from username
        cursor.execute("SELECT id FROM users WHERE username = ?", (to_username,))
        to_user = cursor.fetchone()
        if not to_user:
            conn.close()
            return False

        to_user_id = to_user['id']

        # Check if already friends
        cursor.execute("""
            SELECT id FROM friendships
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        """, (from_user_id, to_user_id, to_user_id, from_user_id))
        if cursor.fetchone():
            conn.close()
            return False  # Already friends

        # Check if request already exists
        cursor.execute("""
            SELECT id FROM friend_requests
            WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
        """, (from_user_id, to_user_id))
        if cursor.fetchone():
            conn.close()
            return False  # Request already sent

        # Check if user is blocked
        cursor.execute("""
            SELECT id FROM blocked_users
            WHERE user_id = ? AND blocked_user_id = ?
        """, (to_user_id, from_user_id))
        if cursor.fetchone():
            conn.close()
            return False  # Blocked

        # Create friend request
        cursor.execute("""
            INSERT INTO friend_requests (from_user_id, to_user_id, status)
            VALUES (?, ?, 'pending')
        """, (from_user_id, to_user_id))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error sending friend request: {e}")
        return False


def get_pending_friend_requests(user_id: int) -> list[dict]:
    """Get pending friend requests for a user"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT fr.id, fr.from_user_id, u.username, fr.created_at
            FROM friend_requests fr
            JOIN users u ON fr.from_user_id = u.id
            WHERE fr.to_user_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
        """, (user_id,))

        requests = [{
            "id": row['id'],
            "from_user_id": row['from_user_id'],
            "username": row['username'],
            "created_at": row['created_at']
        } for row in cursor.fetchall()]

        conn.close()
        return requests

    except Exception as e:
        print(f"Error getting friend requests: {e}")
        return []


def accept_friend_request(request_id: int, user_id: int) -> bool:
    """Accept a friend request"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get request details
        cursor.execute("""
            SELECT from_user_id, to_user_id FROM friend_requests
            WHERE id = ? AND to_user_id = ? AND status = 'pending'
        """, (request_id, user_id))
        request = cursor.fetchone()

        if not request:
            conn.close()
            return False

        from_user_id = request['from_user_id']
        to_user_id = request['to_user_id']

        # Create bidirectional friendship
        cursor.execute("""
            INSERT OR IGNORE INTO friendships (user_id, friend_id)
            VALUES (?, ?)
        """, (from_user_id, to_user_id))

        cursor.execute("""
            INSERT OR IGNORE INTO friendships (user_id, friend_id)
            VALUES (?, ?)
        """, (to_user_id, from_user_id))

        # Update request status
        cursor.execute("""
            UPDATE friend_requests SET status = 'accepted'
            WHERE id = ?
        """, (request_id,))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error accepting friend request: {e}")
        return False


def reject_friend_request(request_id: int, user_id: int) -> bool:
    """Reject a friend request"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE friend_requests SET status = 'rejected'
            WHERE id = ? AND to_user_id = ? AND status = 'pending'
        """, (request_id, user_id))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    except Exception as e:
        print(f"Error rejecting friend request: {e}")
        return False


# Message Functions

def send_message(from_user_id: int, to_username: str, subject: str, body: str) -> bool:
    """Send a message to another user"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get to_user_id from username
        cursor.execute("SELECT id FROM users WHERE username = ?", (to_username,))
        to_user = cursor.fetchone()
        if not to_user:
            conn.close()
            return False

        to_user_id = to_user['id']

        # Check if sender is blocked
        cursor.execute("""
            SELECT id FROM blocked_users
            WHERE user_id = ? AND blocked_user_id = ?
        """, (to_user_id, from_user_id))
        if cursor.fetchone():
            conn.close()
            return False  # Blocked

        cursor.execute("""
            INSERT INTO messages (from_user_id, to_user_id, subject, body)
            VALUES (?, ?, ?, ?)
        """, (from_user_id, to_user_id, subject, body))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error sending message: {e}")
        return False


def get_inbox(user_id: int) -> list[dict]:
    """Get user's inbox messages"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT m.id, m.from_user_id, u.username as from_username,
                   m.subject, m.body, m.read, m.created_at
            FROM messages m
            JOIN users u ON m.from_user_id = u.id
            WHERE m.to_user_id = ?
            ORDER BY m.created_at DESC
        """, (user_id,))

        messages = [{
            "id": row['id'],
            "from_user_id": row['from_user_id'],
            "from_username": row['from_username'],
            "subject": row['subject'],
            "body": row['body'],
            "read": bool(row['read']),
            "created_at": row['created_at']
        } for row in cursor.fetchall()]

        conn.close()
        return messages

    except Exception as e:
        print(f"Error getting inbox: {e}")
        return []


def get_sent_messages(user_id: int) -> list[dict]:
    """Get user's sent messages"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT m.id, m.to_user_id, u.username as to_username,
                   m.subject, m.body, m.created_at
            FROM messages m
            JOIN users u ON m.to_user_id = u.id
            WHERE m.from_user_id = ?
            ORDER BY m.created_at DESC
        """, (user_id,))

        messages = [{
            "id": row['id'],
            "to_user_id": row['to_user_id'],
            "to_username": row['to_username'],
            "subject": row['subject'],
            "body": row['body'],
            "created_at": row['created_at']
        } for row in cursor.fetchall()]

        conn.close()
        return messages

    except Exception as e:
        print(f"Error getting sent messages: {e}")
        return []


def mark_message_read(message_id: int, user_id: int) -> bool:
    """Mark a message as read"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE messages SET read = 1
            WHERE id = ? AND to_user_id = ?
        """, (message_id, user_id))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    except Exception as e:
        print(f"Error marking message as read: {e}")
        return False


def get_unread_count(user_id: int) -> int:
    """Get count of unread messages"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*) as count FROM messages
            WHERE to_user_id = ? AND read = 0
        """, (user_id,))

        result = cursor.fetchone()
        conn.close()
        return result['count'] if result else 0

    except Exception as e:
        print(f"Error getting unread count: {e}")
        return 0


def delete_message(message_id: int, user_id: int) -> bool:
    """Delete a message (only if it's yours)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM messages
            WHERE id = ? AND to_user_id = ?
        """, (message_id, user_id))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    except Exception as e:
        print(f"Error deleting message: {e}")
        return False


# Comments Functions

def add_profile_comment(profile_username: str, author: str, text: str) -> bool:
    """Add a public comment to a user's profile"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE username = ?", (profile_username,))
        profile_user = cursor.fetchone()
        if not profile_user:
            conn.close()
            return False

        cursor.execute("""
            INSERT INTO profile_comments (profile_user_id, author, comment)
            VALUES (?, ?, ?)
        """, (profile_user['id'], author, text))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error adding profile comment: {e}")
        return False


def get_profile_comments(profile_username: str, limit: int = 100) -> list[dict]:
    """Get latest comments for a user's profile"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT pc.id, pc.author, pc.comment, pc.created_at
            FROM profile_comments pc
            JOIN users u ON pc.profile_user_id = u.id
            WHERE u.username = ?
            ORDER BY pc.created_at DESC
            LIMIT ?
        """, (profile_username, limit))

        comments = [{
            "id": row['id'],
            "author": row['author'],
            "text": row['comment'],
            "created_at": row['created_at']
        } for row in cursor.fetchall()]

        conn.close()
        return comments

    except Exception as e:
        print(f"Error getting profile comments: {e}")
        return []


def delete_profile_comment(owner_user_id: int, comment_id: int) -> bool:
    """Delete a profile comment (only profile owner can delete)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM profile_comments
            WHERE id = ? AND profile_user_id = ?
        """, (comment_id, owner_user_id))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    except Exception as e:
        print(f"Error deleting profile comment: {e}")
        return False


# Blocking Functions

def block_user(user_id: int, block_username: str) -> bool:
    """Block a user"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get blocked user ID
        cursor.execute("SELECT id FROM users WHERE username = ?", (block_username,))
        blocked_user = cursor.fetchone()
        if not blocked_user:
            conn.close()
            return False

        blocked_user_id = blocked_user['id']

        # Add to blocked users
        cursor.execute("""
            INSERT OR IGNORE INTO blocked_users (user_id, blocked_user_id)
            VALUES (?, ?)
        """, (user_id, blocked_user_id))

        # Remove existing friendship if any
        cursor.execute("""
            DELETE FROM friendships
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        """, (user_id, blocked_user_id, blocked_user_id, user_id))

        # Remove pending friend requests
        cursor.execute("""
            DELETE FROM friend_requests
            WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
        """, (user_id, blocked_user_id, blocked_user_id, user_id))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error blocking user: {e}")
        return False


def unblock_user(user_id: int, unblock_username: str) -> bool:
    """Unblock a user"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get unblocked user ID
        cursor.execute("SELECT id FROM users WHERE username = ?", (unblock_username,))
        unblocked_user = cursor.fetchone()
        if not unblocked_user:
            conn.close()
            return False

        unblocked_user_id = unblocked_user['id']

        cursor.execute("""
            DELETE FROM blocked_users
            WHERE user_id = ? AND blocked_user_id = ?
        """, (user_id, unblocked_user_id))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    except Exception as e:
        print(f"Error unblocking user: {e}")
        return False


def get_blocked_users(user_id: int) -> list[dict]:
    """Get list of blocked users"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT b.blocked_user_id, u.username, b.created_at
            FROM blocked_users b
            JOIN users u ON b.blocked_user_id = u.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        """, (user_id,))

        blocked = [{
            "user_id": row['blocked_user_id'],
            "username": row['username'],
            "created_at": row['created_at']
        } for row in cursor.fetchall()]

        conn.close()
        return blocked

    except Exception as e:
        print(f"Error getting blocked users: {e}")
        return []


def is_blocked(user_id: int, other_user_id: int) -> bool:
    """Check if a user is blocked"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id FROM blocked_users
            WHERE user_id = ? AND blocked_user_id = ?
        """, (user_id, other_user_id))

        result = cursor.fetchone()
        conn.close()
        return result is not None

    except Exception as e:
        print(f"Error checking if blocked: {e}")
        return False


def check_db() -> bool:
    """Check if database is accessible and properly initialized"""
    try:
        if not DB_PATH.exists():
            return False

        conn = get_db()
        cursor = conn.cursor()

        # Try a simple query to verify database is functional
        cursor.execute("SELECT COUNT(*) FROM users")
        cursor.fetchone()

        conn.close()
        return True
    except Exception as e:
        print(f"[DB] Health check failed: {e}")
        return False


# Initialize database on module import
init_db()
