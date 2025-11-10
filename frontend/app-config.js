(function initHarmonizerConfig(global) {
    var existing = global.HARMONIZER_CONFIG || {};
    var hostname = "";
    try {
        if (global.location) {
            hostname = (global.location.hostname || "").toLowerCase();
        }
    } catch (err) {
        hostname = "";
    }

    var isLocalhost =
        !hostname ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local");

    // Always prefer same-origin requests; the Flask+Gunicorn server serves both frontend and backend.
    // Users hosting the frontend separately can override via window.HARMONIZER_CONFIG before this script loads.
    var defaultApiBase = "";

    global.HARMONIZER_CONFIG = Object.assign(
        {
            /**
             * Base URL for API calls. Leave blank to use same-origin requests
             * (e.g. when frontend is served by the Flask app). Set to the full
             * deployed backend URL when the frontend is hosted separately.
             */
            apiBaseUrl: defaultApiBase,

            /**
             * Enable RL logging hooks. On by default so RL data keeps flowing.
             * Set to false via window.HARMONIZER_CONFIG if you need to disable.
             */
            rlLoggingEnabled: true,

            /**
             * Allow switching between baseline vs RL policy for experimentation.
             * Options: "auto" (default), "baseline", "rl".
             */
            rlPolicyMode: "auto",
        },
        existing,
    );
})(typeof window !== "undefined" ? window : globalThis);
