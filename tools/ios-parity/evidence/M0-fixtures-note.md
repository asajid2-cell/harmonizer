# M0 fixture note

The deterministic synthetic corpus is committed and is the input for exact-parity gates. It has ten 30-second FLAC fixtures covering pulse, swing, tempo ramp, metre, silence edges, sample rates, and channels.

## Real-track acquisition status

`real_pop`, `real_acoustic`, and `real_electronic` are committed. Each source is a distinct CC0 1.0 Openverse result whose exact direct URL and license are re-verified by `fetch_real.py` immediately before download. They are transcoded to mono, 22.05 kHz, PCM_16 FLAC. See `fixtures/LICENSES.md` for source URLs, genre mapping, and exact transcode commands.
