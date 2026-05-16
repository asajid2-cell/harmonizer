# Demo Script

Target length: 60-90 seconds.

## Story

Show Harmonizer as a creative browser lab rather than a single-purpose product.

1. Open the Internet Discotheque homepage.
2. Launch Harmonizer and show the audio visualizer UI.
3. Open OurSpace and show the profile customization surface with safe sample data.
4. Open Eldrichify or Disco-teque if the needed API key is configured.
5. Open CodeSniff and show the search/index workflow if the FastAPI service is running.

## Capture Plan

| asset | destination | workflow/state | method | privacy checks | placement |
| --- | --- | --- | --- | --- | --- |
| homepage screenshot | `docs/assets/homepage.png` | clean launcher after local start | browser screenshot | no local path, no private username, no open dev tools | README demo section |
| harmonizer screenshot | `docs/assets/harmonizer.png` | visualizer loaded with safe demo audio | browser screenshot | audio title/metadata approved for public view | README and docs |
| ourspace screenshot | `docs/assets/ourspace.png` | sample public profile only | browser screenshot | no real user data or uploaded private media | README and docs |
| workflow video | `docs/assets/demo.webm` | 60-90 second navigation through the main tools | screen recording | no browser tabs, tokens, terminal, local files, or private media | README demo section |

Do not publish raw Playwright artifact folders as demo material.
