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

    // When running the frontend locally (file:// or localhost), default to the same-origin backend.
    // Otherwise fall back to the hosted backend URL. Users can still override via window.HARMONIZER_CONFIG.
    var defaultApiBase = "";

    global.HARMONIZER_CONFIG = Object.assign(
        {
            /**
             * Base URL for API calls. Leave blank to use same-origin requests
             * (e.g. when frontend is served by the Flask app). Set to the full
             * deployed backend URL when the frontend is hosted separately.
             */
            apiBaseUrl: defaultApiBase,
        },
        existing,
    );
})(typeof window !== "undefined" ? window : globalThis);
