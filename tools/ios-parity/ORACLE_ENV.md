# Oracle environment

Read 2026-10-01. This is the environment that produces the Swift port's goldens, so it is pinned
to the **live production container**, not to whatever the PC happened to have.

## How it was read

Tier-3 (authorized, HS1):

```
keysafe run harmonizer-admin -EnvVar KS -Command "powershell -NoProfile -File C:/Users/Ahmed/t3ssh.ps1 harmonizer-admin sudo docker exec harmonizer pip freeze"
keysafe run harmonizer-admin -EnvVar KS -Command "powershell -NoProfile -File C:/Users/Ahmed/t3ssh.ps1 harmonizer-admin \"echo <b64> | base64 -d | sudo docker exec -i harmonizer python\""
```

The second probe printed, verbatim:

```
PY 3.11.15 (main, Jun 11 2026, 01:09:01) [GCC 14.2.0]
SNDFILE 1.2.2
NUMPY 2.4.4 SCIPY 1.17.1 LIBROSA 0.11.0 SKLEARN 1.9.0
```

## Prod vs oracle venv vs the PC default

| Component | Prod (`harmonizer:prod`) | Oracle venv (`tools/ios-parity/.venv`) | PC default (`C:\Python311`) | Match |
|---|---|---|---|---|
| Python | 3.11.15 | 3.11.0 | 3.11.0 | **patch gap only** |
| librosa | 0.11.0 | 0.11.0 | 0.11.0 | yes |
| numpy | 2.4.4 | 2.4.4 | 1.26.4 | pinned |
| scipy | 1.17.1 | 1.17.1 | 1.16.2 | pinned |
| soundfile | 0.14.0 | 0.14.0 | 0.13.1 | pinned |
| libsndfile | 1.2.2 | 1.2.2 | 1.2.2 | yes |
| scikit-learn | 1.9.0 | 1.9.0 | 1.7.2 | pinned |
| numba / llvmlite | 0.65.1 / 0.47.0 | 0.65.1 / 0.47.0 | - | pinned |
| soxr | 1.1.0 | 1.1.0 | - | pinned |

The oracle venv reproduces the prod set at every version that can change a DSP result. The only
residual difference is the **CPython patch level (3.11.15 vs 3.11.0)**. That can move libm
transcendentals by an ULP, which the P3 gate already treats as the one accepted divergence kind
(`PARITY_EXCEPTIONS.md`, proven by a softmax pick margin < 1e-12). If a knife-edge case shows up,
the fallback is to run the oracle under a 3.11.15 build; nothing else needs to change.

## Reproducing

```bash
cd tools/ios-parity
C:/Python311/python.exe -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-oracle.txt
./.venv/Scripts/python.exe -c "import librosa,numpy,scipy,soundfile,sklearn;print(numpy.__version__)"
```

`.venv/` is git-ignored; `requirements-oracle.txt` is the committed source of truth.

## JS side

The trace harness runs the shipped browser source unmodified under Node + jsdom. Node and jsdom
versions are recorded in `js/package.json` / `js/package-lock.json` (Node v22.20.0, jsdom 26.1.0).
`trace.mjs` asserts the Mulberry32 stream against a pinned vector at startup (seeds 1, 42, 0xC0FFEE;
see `RNG_VECTOR`), so a Node/JS engine change or a bad port cannot silently move the traces. The
same vectors are the P2 `ParityRNG` acceptance set on the Swift side; print them with
`node js/trace.mjs --rng-vector`.
