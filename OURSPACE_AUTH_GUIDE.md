# OurSpace Authentication Guide

OurSpace is a local profile-customization prototype with account creation, profile persistence, and server-side media uploads.

## Run Locally

Start the main Flask app:

```bash
python backend/app.py
```

Open:

```text
http://localhost:5000/ourspace.html
```

## Features

- Account creation and login.
- Password hashing with PBKDF2-HMAC-SHA256 and per-user salts.
- Profile customization stored in SQLite.
- Public profile view by username.
- Server-side media uploads for profile assets.

## User Flow

1. Open `ourspace.html`.
2. Create an account with a username and password.
3. Customize the profile.
4. Save and publish the profile.
5. Visit `ourspace.html?user=<username>` to view a published profile.

Unauthenticated edits are temporary and should not be treated as saved profile data.

## Runtime Storage

OurSpace writes runtime data under:

```text
backend/ourspace_data/
```

That directory is ignored by Git. It can contain SQLite databases and uploaded user media, so it should not be committed.

## API Endpoints

| endpoint | purpose |
| --- | --- |
| `POST /api/ourspace/register` | Create account. |
| `POST /api/ourspace/login` | Log in. |
| `POST /api/ourspace/logout` | Log out. |
| `GET /api/ourspace/me` | Return current user info. |
| `GET /api/ourspace/profile/load` | Load the current user's profile. |
| `POST /api/ourspace/profile/save` | Save the current user's profile. |
| `POST /api/ourspace/profile/publish` | Publish a profile. |
| `GET /api/ourspace/profile/<username>` | View a published profile. |
| `POST /api/ourspace/upload` | Upload profile media. |
| `GET /api/ourspace/media/<user_id>/<filename>` | Serve uploaded media. |

## Files

- `backend/ourspace_db.py`: database helpers.
- `backend/app.py`: Flask routes.
- `frontend/ourspace.html`: main page.
- `frontend/js/ourspace-auth.js`: auth UI.
- `frontend/js/ourspace-core.js`: profile logic.
- `frontend/js/ourspace-customizer.js`: customization logic.
- `frontend/css/ourspace-base.css`: base styles.

## Security Notes

- Set `SECRET_KEY` in `.env` before running anything beyond local experiments.
- Do not commit `backend/ourspace_data/`.
- Do not use real private user data in screenshots or demos.
