(function initHarmonizerConfig(global) {
    var existing = global.HARMONIZER_CONFIG || {};
    global.HARMONIZER_CONFIG = Object.assign(
        {
            /**
             * Base URL for API calls. Leave blank to use same-origin requests
             * (e.g. when frontend is served by the Flask app). Set to the full
             * deployed backend URL when the frontend is hosted separately.
             */
            apiBaseUrl: "https://harmonizer-backend-bofk.onrender.com",
        },
        existing,
    );
})(typeof window !== "undefined" ? window : globalThis);
