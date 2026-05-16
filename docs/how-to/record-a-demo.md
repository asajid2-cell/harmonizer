# Record A Demo

Use this guide to capture public screenshots or a short demo video without leaking local data.

## Prepare The App

1. Start the main app.
2. Use a clean browser profile or a private window.
3. Load only sample data approved for public use.
4. Close terminals, private tabs, and file browsers before recording.

## Capture Suggested Screens

| Asset | Page | State | Privacy check |
| --- | --- | --- | --- |
| Homepage screenshot | `/` | Internet Discotheque launcher loaded | no local path or account name visible |
| Harmonizer screenshot | `/harmonizer.html` | visualizer loaded with demo audio | audio metadata is approved for public view |
| OurSpace screenshot | `/ourspace.html` | sample profile only | no real user data or private media |
| CodeSniff screenshot | CodeSniff UI | sample indexed repository | no private repository paths or tokens |

## Record A Short Walkthrough

Target length: 60 to 90 seconds.

1. Start on the launcher.
2. Open Harmonizer and show the audio visualizer.
3. Open OurSpace and show a sample profile.
4. Open Eldrichify if local model checkpoints are configured.
5. Open CodeSniff if the FastAPI service is running.

## Before Publishing

Check the recording for:

- browser tabs or bookmarks;
- terminal prompts with local usernames;
- `.env` values or API keys;
- private media;
- generated Playwright artifact folders.

Do not commit raw capture folders. Keep only selected public assets under a documented `docs/assets/` path if they are needed.
