# Configure OurSpace Auth

Use this guide to run the OurSpace profile prototype with local accounts and media uploads.

## Start The App

```bash
python backend/app.py
```

Open:

```text
http://localhost:5000/ourspace.html
```

## Set Required Configuration

Set a Flask session secret:

```text
SECRET_KEY=<long-random-value>
```

For a fresh local database, set an admin password if you need admin access:

```text
OURSPACE_ADMIN_PASSWORD=<local-admin-password>
```

If `OURSPACE_ADMIN_PASSWORD` is blank when the database is first created, the admin password is initialized to a random value that is not printed.

## Create A Test Account

1. Open `ourspace.html`.
2. Register with a local username and password.
3. Log in.
4. Customize the profile.
5. Save and publish.
6. Open `ourspace.html?user=<username>` to view the public profile.

Use sample data only. Do not upload private media for public screenshots or demos.

## Keep Runtime Data Local

OurSpace writes SQLite data and uploaded media under:

```text
backend/ourspace_data/
```

That path is ignored by Git. If it appears in `git status`, stop and fix the ignore rules before committing.

## Useful Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/ourspace/register` | Create an account. |
| `POST /api/ourspace/login` | Log in. |
| `POST /api/ourspace/logout` | Log out. |
| `GET /api/ourspace/me` | Return the current session user. |
| `GET /api/ourspace/profile/load` | Load the current user's profile. |
| `POST /api/ourspace/profile/save` | Save the current user's profile. |
| `POST /api/ourspace/profile/publish` | Publish a profile. |
| `GET /api/ourspace/profile/<username>` | View a published profile. |
| `POST /api/ourspace/upload` | Upload profile media. |
| `GET /api/ourspace/media/<user_id>/<filename>` | Serve uploaded media. |
