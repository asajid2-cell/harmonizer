"use strict";

var HARMONIZER_CONFIG = window.HARMONIZER_CONFIG || {};
var API_BASE_URL = (HARMONIZER_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
function resolveApiUrl(path) {
    if (!path) {
        return API_BASE_URL || "";
    }
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    if (path.charAt(0) !== "/") {
        path = "/" + path;
    }
    return API_BASE_URL ? API_BASE_URL + path : path;
}

function clampVolume(value) {
    var num = typeof value === "number" ? value : 0;
    if (!isFinite(num)) {
        num = 0;
    }
    if (num < 0) {
        return 0;
    }
    if (num > 1) {
        return 1;
    }
    return num;
}

function createHtmlAudioController(sourceUrl, options) {
    if (!sourceUrl) {
        console.warn("[AudioController] Missing source URL");
        return null;
    }
    var resolved = resolveApiUrl(sourceUrl);
    var audio = new Audio(resolved);
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.loop = !!(window.harmonizerLoopEnabled);
    audio.volume = clampVolume(options && typeof options.volume === "number" ? options.volume : 1);

    // Debug logging for loop behavior
    console.log('[AudioController] Created audio with loop =', audio.loop);
    audio.addEventListener('ended', function() {
        console.log('[AudioController] Audio ended event fired! loop =', audio.loop, 'currentTime =', audio.currentTime, 'duration =', audio.duration);
    });
    audio.addEventListener('pause', function() {
        console.log('[AudioController] Audio paused, loop =', audio.loop, 'currentTime =', audio.currentTime);
    });

    var requestFrame = (typeof window !== "undefined" && window.requestAnimationFrame) ?
        window.requestAnimationFrame.bind(window) :
        function(cb) { return setTimeout(cb, 16); };
    var cancelFrame = (typeof window !== "undefined" && window.cancelAnimationFrame) ?
        window.cancelAnimationFrame.bind(window) :
        clearTimeout;
    var fadeHandle = null;

    function cancelFade() {
        if (fadeHandle) {
            cancelFrame(fadeHandle);
            fadeHandle = null;
        }
    }

    function safeSeek(time) {
        var target = Math.max(0, typeof time === "number" ? time : 0);
        try {
            audio.currentTime = target;
            return;
        } catch (err) {
            // Some browsers require metadata before seeking
        }
        var onReady = function() {
            audio.removeEventListener("loadedmetadata", onReady);
            audio.removeEventListener("canplay", onReady);
            try {
                audio.currentTime = target;
            } catch (seekErr) {
                console.warn("[AudioController] Seek failed for", resolved, seekErr);
            }
        };
        audio.addEventListener("loadedmetadata", onReady);
        audio.addEventListener("canplay", onReady);
    }

    function playInternal() {
        var playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(function(err) {
                console.warn("[AudioController] Playback rejected for", resolved, err);
            });
        }
    }

    function fadeTo(volume, durationMs) {
        cancelFade();
        var targetVolume = clampVolume(volume);
        if (!durationMs || durationMs <= 0) {
            audio.volume = targetVolume;
            return;
        }
        var startVolume = clampVolume(audio.volume);
        var startTime = performance.now();
        function step(now) {
            var t = Math.min(1, (now - startTime) / durationMs);
            // equal-power crossfade curve
            var curve = Math.cos((1 - t) * Math.PI * 0.5);
            var nextVolume = startVolume + (targetVolume - startVolume) * curve;
            audio.volume = clampVolume(nextVolume);
            if (t < 1) {
                fadeHandle = requestFrame(step);
            } else {
                fadeHandle = null;
            }
        }
        fadeHandle = requestFrame(step);
    }

    return {
        audio: audio,
        ensureLoaded: function() {
            try {
                audio.load();
            } catch (err) {
                console.warn("[AudioController] load() failed for", resolved, err);
            }
        },
        playFrom: function(time) {
            if (typeof time === "number") {
                safeSeek(time);
            }
            playInternal();
        },
        ensurePlaying: function() {
            if (audio.paused) {
                playInternal();
            }
        },
        pause: function() {
            cancelFade();
            audio.pause();
        },
        stop: function() {
            cancelFade();
            audio.pause();
            try {
                audio.currentTime = 0;
            } catch (err) {}
        },
        seek: safeSeek,
        setVolume: function(value) {
            cancelFade();
            audio.volume = clampVolume(value);
        },
        getVolume: function() {
            return audio.volume;
        },
        setLoop: function(enabled) {
            audio.loop = !!enabled;
        },
        getLoop: function() {
            return audio.loop;
        },
        fadeTo: fadeTo
    };
}

function debounce(fn, wait) {
    var delay = (typeof wait === "number" && wait >= 0) ? wait : 60;
    var timerId = null;
    return function debounced() {
        var context = this;
        var args = arguments;
        if (timerId !== null) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(function invoke() {
            timerId = null;
            fn.apply(context, args);
        }, delay);
    };
}

function measureOrbitSize() {
    var orbitNode = document.querySelector(".viz-orbit");
    if (orbitNode) {
        var rect = orbitNode.getBoundingClientRect();
        if (rect && rect.width) {
            var minSide = Math.min(rect.width, rect.height || rect.width);
            if (minSide > 0) {
                return minSide;
            }
            return rect.width;
        }
    }
    var fallback = $("#tiles").innerWidth();
    if (!fallback || fallback < 100) {
        fallback = $(window).width() - 140;
    }
    return fallback;
}

function applyOrbitLayout(size) {
    var safe = Math.max(280, Math.floor(size || 0));
    orbitLayout.size = safe;
    orbitLayout.padding = Math.max(40, safe * 0.10);
    orbitLayout.center = { x: safe / 2, y: safe / 2 };
    // Reserve proper margin: 80px for outer elements + buffer
    var margin = 100;
    var maxRadius = (safe / 2) - margin;
    orbitLayout.baseRadius = Math.max(70, maxRadius * 0.95);
    orbitLayout.outerRadius = maxRadius * 1.025;
    orbitLayout.haloRadius = maxRadius * 1.15;
}

function clearOrbitBase() {
    if (!orbitBaseElements || !orbitBaseElements.length) {
        orbitBaseElements = [];
        return;
    }
    orbitBaseElements.forEach(function(el) {
        if (el && typeof el.remove === "function") {
            el.remove();
        }
    });
    orbitBaseElements = [];
}

function renderOrbitBase() {
    if ((mode !== "jukebox" && mode !== "eternal") || !paper) {
        clearOrbitBase();
        return;
    }
    clearOrbitBase();
    var layout = orbitLayout;
    var center = layout.center;
    var halo = paper.circle(center.x, center.y, layout.haloRadius);
    halo.attr({
        stroke: "none",
        fill: "rgba(207, 148, 255, 0.06)"
    });
    halo.toBack();
    orbitBaseElements.push(halo);

    var outerRing = paper.circle(center.x, center.y, layout.outerRadius);
    outerRing.attr({
        stroke: "rgba(255, 255, 255, 0.22)",
        "stroke-width": 2.4,
        "stroke-dasharray": "- "
    });
    orbitBaseElements.push(outerRing);

    var innerRing = paper.circle(center.x, center.y, layout.baseRadius);
    innerRing.attr({
        stroke: "rgba(255, 255, 255, 0.12)",
        "stroke-width": 1.2
    });
    orbitBaseElements.push(innerRing);

    for (var i = 0; i < 12; i++) {
        var angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        var tickInner = layout.outerRadius + 6;
        var tickOuter = tickInner + 14;
        var x1 = center.x + Math.cos(angle) * tickInner;
        var y1 = center.y + Math.sin(angle) * tickInner;
        var x2 = center.x + Math.cos(angle) * tickOuter;
        var y2 = center.y + Math.sin(angle) * tickOuter;
        var tick = paper.path(["M", x1, y1, "L", x2, y2].join(" "));
        tick.attr({
            stroke: "rgba(255, 255, 255, 0.18)",
            "stroke-width": i % 3 === 0 ? 2 : 1
        });
        orbitBaseElements.push(tick);
    }

    orbitBaseElements.forEach(function(el) {
        if (el && typeof el.toBack === "function") {
            el.toBack();
        }
    });
}

function configureCanvasForMode() {
    var usingOrbit = mode === "jukebox" || mode === "eternal";
    if (usingOrbit) {
        var orbitSize = measureOrbitSize();
        if (!orbitSize || orbitSize < 60) {
            orbitSize = 520;
        }
        applyOrbitLayout(orbitSize);
        W = orbitLayout.size;
        H = orbitLayout.size;
        TH = orbitLayout.size;
        CH = 0;
    } else {
        var containerWidth = $(".viz-orbit").innerWidth();
        if (!containerWidth || containerWidth < 100) {
            containerWidth = $("#tiles").innerWidth();
        }
        if (!containerWidth || containerWidth < 100) {
            containerWidth = $(window).width() - 140;
        }
        containerWidth = Math.max(640, Math.floor(containerWidth));
        W = containerWidth;
        H = 300;
        TH = 450;
        CH = (TH - H) - 10;
    }
    return usingOrbit;
}

function applyModeLayout() {
    // Sync body data-mode attribute with JavaScript mode variable
    if (document.body && document.body.dataset) {
        document.body.dataset.mode = mode;
    }

    var orbitMode = configureCanvasForMode();
    if (paper) {
        paper.setSize(W, TH);
    }
    syncOrbitContainerSize();
    if (orbitMode) {
        renderOrbitBase();
        requestOrbitRedraw();
    } else {
        clearOrbitBase();
    }
    return orbitMode;
}

function requestOrbitRedraw() {
    if (mode !== "jukebox" && mode !== "eternal") {
        return;
    }
    if (pendingOrbitRedraw) {
        return;
    }
    pendingOrbitRedraw = true;
    requestAnimationFrame(function() {
        pendingOrbitRedraw = false;
        if (curTrack && curTrack.analysis && curTrack.analysis.segments) {
            createCircularTiles(curTrack.analysis.segments);
        } else {
            renderOrbitBase();
        }
    });
}

function syncOrbitContainerSize() {
    var tilesNode = document.getElementById("tiles");
    if (!tilesNode) {
        return;
    }
    if (mode === "jukebox" || mode === "eternal") {
        var size = orbitLayout.size;
        tilesNode.style.width = size + "px";
        tilesNode.style.height = size + "px";
        tilesNode.style.maxWidth = size + "px";
        tilesNode.style.margin = "0 auto";
    } else {
        tilesNode.style.width = "";
        tilesNode.style.height = "";
        tilesNode.style.maxWidth = "";
        tilesNode.style.margin = "";
    }
}

var remixer = null;
var driver = null;
var mode = "canon";
var curTrack = null;
var masterQs = null;
var masterGain = .55;
var masterColor = "#E8B4B8";
var otherColor = "#F9F6F2";
var overlayColorPalette = [
    "#F9F6F2",
    "#C7E7FF",
    "#F2D2FF",
    "#CFFFE2",
    "#FFD9C2",
    "#D6D1FF",
    "#FFE3F3",
];
var activeOverlayChips = [];
var trackDuration;
var masterCursor = null;
var otherCursor = null;
var masterCursorCircle = null;
var otherCursorCircle = null;
var jukeboxBackdrop = {
    wave: null,
    wave2: null,
    ring: null,
    glow: null,
};

var paper = null;
var W = 1000;
var H = 300;
var TH = 450;
var CH = (TH - H) - 10;
var orbitLayout = {
    size: 600,
    padding: 48,
    center: { x: 300, y: 300 },
    baseRadius: 220,
    outerRadius: 236,
    haloRadius: 255
};
var orbitBaseElements = [];
var pendingOrbitRedraw = false;
var cmin = [100,100,100];
var cmax = [-100,-100,-100];
var rootStyle = document.documentElement.style;
var baseNoteStrength = 0;
var notePulseTimer = null;
var tiles = [];
var isTrackReady = false;
var serverLoopCandidateMap = {};
var canonLoopCandidates = [];
var loopPaths = [];
var loopPathMap = {}; // Map of "source-target" to path object

// Queue management
var trackQueue = [];
var currentQueueIndex = -1;
var selectedQueueIndex = -1;
var autoPlayNext = false;
var playbackState = {
    hasStarted: false,
    isPaused: false
};

function markPlaybackStarted() {
    playbackState.hasStarted = true;
    playbackState.isPaused = false;
}

function markPlaybackPaused() {
    if (playbackState.hasStarted) {
        playbackState.isPaused = true;
    }
}

function resetPlaybackState() {
    playbackState.hasStarted = false;
    playbackState.isPaused = false;
}

function canResumePlayback() {
    return playbackState.hasStarted && playbackState.isPaused;
}
var ADVANCED_DEFAULTS = {
    canonOverlay: {
        musicality: 65,
        minOffsetBeats: 8,
        maxOffsetBeats: 64,
        dwellBeats: 6,
        density: 2,
        jumpBubbleBeats: 8,
        variation: 2,
        rlMinDwellBeats: 8,
        rlRepeatPenalty: 12
    },
    eternalOverlay: {
        musicality: 60,
        minOffsetBeats: 8,
        maxOffsetBeats: 64,
        dwellBeats: 6,
        density: 2,
        jumpBubbleBeats: 8,
        variation: 2
    },
    jukeboxLoop: {
        musicality: 55,
        minLoopBeats: 12,
        maxSequentialBeats: 36,
        loopThreshold: 0.55,
        sectionBias: 0.6,
        jumpVariance: 0.4
    },
    eternalLoop: {
        musicality: 100,
        minLoopBeats: 12,
        maxSequentialBeats: 90,
        loopThreshold: 0.76,
        sectionBias: 0.20,
        jumpVariance: 0.65
    },
    sculptorConfig: {
        durationScale: 1.0,
        minSectionSeconds: 6,
        maxSectionSeconds: 32,
        previewSeconds: 4,
        transitionOverlapSeconds: 0.5
    }
};

function cloneSettings(obj) {
    return JSON.parse(JSON.stringify(obj));
}

var advancedSettings = {
    canonOverlay: cloneSettings(ADVANCED_DEFAULTS.canonOverlay),
    eternalOverlay: cloneSettings(ADVANCED_DEFAULTS.eternalOverlay),
    jukeboxLoop: cloneSettings(ADVANCED_DEFAULTS.jukeboxLoop),
    eternalLoop: cloneSettings(ADVANCED_DEFAULTS.eternalLoop),
    sculptorConfig: cloneSettings(ADVANCED_DEFAULTS.sculptorConfig)
};

var canonAdvancedEnabled = false;
var canonSettings = advancedSettings.canonOverlay;

var advancedEnabled = {
    canonOverlay: false,
    eternalOverlay: false,
    jukeboxLoop: false,
    eternalLoop: false,
    sculptorConfig: false
};
var canonLoopGraph = {};
var DEFAULT_CANON_RL_TUNING = {
    minDwell: 8,
    repeatPenalty: 12
};

function getGlobalRLModel() {
    if (typeof window !== "undefined" && window.harmonizerRLModel) {
        return window.harmonizerRLModel;
    }
    return null;
}

function getGlobalPolicyMode(modeName) {
    if (typeof window !== "undefined") {
        var variant = (window.harmonizerModelVariant || "").toLowerCase();
        if (variant === "b" || variant === "baseline") {
            return "baseline";
        }
    }
    var globalMode =
        (typeof window !== "undefined" && window.harmonizerPolicyMode) ||
        (typeof HARMONIZER_CONFIG !== "undefined" &&
            HARMONIZER_CONFIG.rlPolicyMode) ||
        null;
    if (globalMode) {
        return (globalMode || "rl").toLowerCase();
    }
    var normalizedMode = (modeName || "").toLowerCase();
    var defaultPolicy = "rl";  // All modes use RL policy by default for intelligent jumping
    if (normalizedMode === "canon" || normalizedMode === "jukebox" || normalizedMode === "eternal" || normalizedMode === "autoharmonizer") {
        defaultPolicy = "rl";
    }
    return defaultPolicy;
}

function ensureGlobalRLTally(model) {
    var defaultStats = {
        total: 0,
        penalized: 0,
        boosted: 0,
        fallback: 0,
        modelVersion: model ? model.trained_at || model.version : null,
    };
    if (typeof window === "undefined") {
        return defaultStats;
    }
    if (!window.harmonizerRLTally) {
        window.harmonizerRLTally = Object.assign({}, defaultStats);
    }
    if (
        model &&
        !window.harmonizerRLTally.modelVersion &&
        (model.trained_at || model.version)
    ) {
        window.harmonizerRLTally.modelVersion =
            model.trained_at || model.version;
    }
    return window.harmonizerRLTally;
}

function getSharedRLTally() {
    return ensureGlobalRLTally(getGlobalRLModel());
}

function computeHeuristicScore(edge) {
    if (!edge) {
        return 0;
    }
    var similarity =
        typeof edge.similarity === "number"
            ? Math.max(0, Math.min(1, edge.similarity))
            : 0;
    var span = Math.max(0, typeof edge.span === "number" ? edge.span : 0);
    var sameSection = edge.sameSection ? 1 : 0;
    var isCanonJump =
        edge.reason === "canon_pair" || edge.reason === "canon_loop";
    var isSequential = edge.reason === "sequential";

    var spanPenalty = isCanonJump
        ? Math.min(span / 512, 0.12)
        : Math.min(span / 256, 0.25);
    var sectionAdj = sameSection ? 0.05 : -0.02;
    var canonBonus = isCanonJump ? 0.2 : 0;
    var sequentialPenalty = isSequential ? 0.12 : 0;
    var bonusForSmoothShortHop =
        !isSequential && span <= 16 ? 0.04 : 0;

    var score =
        similarity +
        canonBonus +
        sectionAdj +
        bonusForSmoothShortHop -
        spanPenalty -
        sequentialPenalty;

    if (edge.reason === "manual") {
        score -= 0.05;
    }

    return Math.max(0, Math.min(1, score));
}

function scoreJumpQuality(edge, options) {
    options = options || {};
    var rlModel = getGlobalRLModel();
    var tally = ensureGlobalRLTally(rlModel);
    if (tally) {
        tally.total += 1;
    }
    if (getGlobalPolicyMode(options.modeName) !== "rl") {
        if (tally) {
            tally.fallback += 1;
        }
        return null;
    }
    if (!rlModel || rlModel.type === "empty") {
        if (tally) {
            tally.fallback += 1;
        }
        return computeHeuristicScore(edge);
    }
    var totalBeats =
        typeof options.totalBeats === "number"
            ? Math.max(1, options.totalBeats)
            : masterQs && masterQs.length
            ? masterQs.length
            : 1;
    var baseIndex =
        typeof edge.source === "number"
            ? edge.source
            : typeof options.currentIndex === "number"
            ? options.currentIndex
            : 0;
    var features = {
        similarity:
            typeof edge.similarity === "number" ? edge.similarity : 0,
        span_norm: typeof edge.span === "number" ? edge.span / 64 : 0,
        same_section: edge.sameSection ? 1 : 0,
        mode_jukebox: options.modeName === "jukebox" ? 1 : 0,
        mode_eternal: options.modeName === "eternal" ? 1 : 0,
        delta_beats: Math.abs(edge.target - baseIndex) / Math.max(1, totalBeats),
        dwell_norm:
            ((typeof options.dwellBeats === "number"
                ? options.dwellBeats
                : options.minLoopBeats || 8) /
                64) ||
            0,
    };
    if (rlModel.type === "gbrt") {
        var rlScore = evaluateGbrtScore(rlModel, features);
        if (typeof rlScore !== "number") {
            if (tally) {
                tally.fallback += 1;
            }
            return computeHeuristicScore(edge);
        }
        var heuristicScore = computeHeuristicScore(edge);
        var blend = 0.75;
        var combined =
            rlScore * blend + heuristicScore * (1 - blend);

        var recentJumpBeats =
            typeof options.recentJumpBeats === "number"
                ? options.recentJumpBeats
                : 0;
        var minJumpDwell =
            typeof options.minJumpDwell === "number"
                ? options.minJumpDwell
                : getCanonRlMinDwell();

        if (
            edge.reason !== "sequential" &&
            typeof edge.span === "number" &&
            edge.span > 64 &&
            recentJumpBeats < minJumpDwell
        ) {
            var deficit = minJumpDwell - recentJumpBeats;
            var penalty = Math.min(
                0.35,
                (deficit / Math.max(1, minJumpDwell)) * 0.35,
            );
            combined -= penalty;
            if (tally) {
                tally.penalized += 1;
            }
        } else if (
            edge.reason !== "sequential" &&
            recentJumpBeats > minJumpDwell * 1.5
        ) {
            combined += 0.05;
            if (tally) {
                tally.boosted += 1;
            }
        }

        var spanPenalty = Math.min(
            Math.max(0, (edge.span || 0) - 128) / 512,
            0.25,
        );
        if (spanPenalty > 0) {
            combined -= spanPenalty;
            if (tally) {
                tally.penalized += 1;
            }
        }

        return Math.max(0, Math.min(1, combined));
    }
    if (tally) {
        tally.fallback += 1;
    }
    return null;
}

var BEAT_ROUND_STORAGE_KEY = "harmonizer:beatRounding";
var beatRoundingEnabled = false;
var ROUNDABLE_BEAT_FIELDS = {
    canonOverlay: ["minOffsetBeats", "maxOffsetBeats", "dwellBeats"],
    eternalOverlay: ["minOffsetBeats", "maxOffsetBeats", "dwellBeats"],
    jukeboxLoop: ["minLoopBeats", "maxSequentialBeats"],
    eternalLoop: ["minLoopBeats", "maxSequentialBeats"]
};

(function hydrateBeatRoundingPreference() {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            var stored = window.localStorage.getItem(BEAT_ROUND_STORAGE_KEY);
            if (stored === "1") {
                beatRoundingEnabled = true;
            }
        }
    } catch (err) {
        beatRoundingEnabled = false;
    }
})();

var eternalAdvancedEnabled = false;

var advancedPresets = {
    canonOverlay: [],
    eternalOverlay: [],
    jukeboxLoop: [],
    eternalLoop: []
};

var DEFAULT_CANON_PRESET_ID = "canon-legacy-default";

(function initializeDefaultCanonPreset() {
    var legacySettings = cloneSettings(ADVANCED_DEFAULTS.canonOverlay);
    if (legacySettings.musicality === undefined) {
        legacySettings.musicality = 65;
    }
    var balancedSettings = cloneSettings(ADVANCED_DEFAULTS.canonOverlay);
    balancedSettings.musicality = 72;
    balancedSettings.minOffsetBeats = 12;
    balancedSettings.maxOffsetBeats = 96;
    balancedSettings.dwellBeats = 8;
    balancedSettings.jumpBubbleBeats = 10;
    balancedSettings.variation = 6;
    balancedSettings.rlMinDwellBeats = 10;
    balancedSettings.rlRepeatPenalty = 18;

    var wildSettings = cloneSettings(ADVANCED_DEFAULTS.canonOverlay);
    wildSettings.musicality = 55;
    wildSettings.minOffsetBeats = 6;
    wildSettings.maxOffsetBeats = 72;
    wildSettings.dwellBeats = 4;
    wildSettings.density = 3;
    wildSettings.jumpBubbleBeats = 4;
    wildSettings.variation = 18;
    wildSettings.rlMinDwellBeats = 4;
    wildSettings.rlRepeatPenalty = 8;

    advancedPresets.canonOverlay = [
        {
            id: DEFAULT_CANON_PRESET_ID,
            name: "Legacy Default",
            settings: legacySettings,
            createdAt: Date.now()
        },
        {
            id: "canon-balanced-flow",
            name: "Balanced Flow",
            settings: balancedSettings,
            createdAt: Date.now()
        },
        {
            id: "canon-wild-weave",
            name: "Wild Weave",
            settings: wildSettings,
            createdAt: Date.now()
        }
    ];
})();

var DEFAULT_ETERNAL_PRESET_ID = "eternal-improved-default";

(function initializeEternalLoopPresets() {
    // New improved default (less repetitive, more musical)
    var improvedSettings = cloneSettings(ADVANCED_DEFAULTS.eternalLoop);

    // Labyrinth preset - old default (more repetitive, hypnotic)
    var labyrinthSettings = {
        musicality: 60,
        minLoopBeats: 8,
        maxSequentialBeats: 28,
        loopThreshold: 0.5,
        sectionBias: 0.55,
        jumpVariance: 0.5
    };

    advancedPresets.eternalLoop = [
        {
            id: DEFAULT_ETERNAL_PRESET_ID,
            name: "Default",
            settings: improvedSettings,
            createdAt: Date.now()
        },
        {
            id: "eternal-labyrinth",
            name: "Labyrinth",
            settings: labyrinthSettings,
            createdAt: Date.now()
        }
    ];
})();

if (typeof window !== "undefined") {
    window.CANON_DEFAULT_PRESET_ID = DEFAULT_CANON_PRESET_ID;
    window.ETERNAL_DEFAULT_PRESET_ID = DEFAULT_ETERNAL_PRESET_ID;
}

var queuedAdvancedApplyTimers = Object.create(null);

function recomputeLoopGraphForMode(modeName) {
    if (!modeName) {
        return;
    }
    var normalized = modeName === "eternal" ? "eternal" : "jukebox";
    if (mode !== normalized) {
        return;
    }
    var loopSettings = getLoopSettingsForMode(normalized);
    if (driver && typeof driver.recomputeLoopGraph === "function") {
        driver.recomputeLoopGraph(loopSettings);
    } else {
        rebuildDriverForCurrentMode(true);
    }
}

var scheduleCanonGraphRebuild = debounce(function(reason) {
    if (mode !== "canon" || !canonAdvancedEnabled || !masterQs || !masterQs.length) {
        return;
    }
    regenerateCanonMapping({ reason: reason || "live-update" });
}, 120);

var scheduleEternalOverlayRecalc = debounce(function(reason) {
    if (mode !== "eternal" || !isAdvancedGroupEnabled("eternalOverlay")) {
        return;
    }
    regenerateEternalOverlay({ reason: reason || "live-update" });
}, 150);

var scheduleJukeboxLoopRecalc = debounce(function() {
    recomputeLoopGraphForMode("jukebox");
}, 150);

var scheduleEternalLoopRecalc = debounce(function() {
    recomputeLoopGraphForMode("eternal");
}, 150);

function triggerCanonOverlayRefresh(fieldKey) {
    if (fieldKey === "minOffsetBeats" || fieldKey === "maxOffsetBeats") {
        scheduleCanonGraphRebuild("offset-change");
        return;
    }
    regenerateCanonMapping({ reason: "live-update", field: fieldKey });
}

function refreshJukeboxVisualization() {
    if (!masterQs || !masterQs.length) {
        return;
    }
    if (mode !== "jukebox" && mode !== "eternal") {
        return;
    }
    var loopEdges = collectVisualizationLoops(80);
    if (mode === "jukebox" || mode === "eternal") {
        renderJukeboxBackdrop();
        drawCircularLoopConnections(masterQs, loopEdges);
    }
}

function applyLoopFieldToDriver(fieldKey, value) {
    if (!driver) {
        return false;
    }
    var applied = false;
    if (fieldKey === "minLoopBeats" && typeof driver.setMinLoopBeats === "function") {
        driver.setMinLoopBeats(value);
        applied = true;
    } else if (fieldKey === "maxSequentialBeats" && typeof driver.setMaxSequentialBeats === "function") {
        driver.setMaxSequentialBeats(value);
        applied = true;
    } else if (fieldKey === "loopThreshold" && typeof driver.setLoopSimilarityThreshold === "function") {
        driver.setLoopSimilarityThreshold(value);
        applied = true;
    } else if (fieldKey === "sectionBias" && typeof driver.setLoopSectionBias === "function") {
        driver.setLoopSectionBias(value);
        applied = true;
    } else if (fieldKey === "jumpVariance" && typeof driver.setLoopJumpVariance === "function") {
        driver.setLoopJumpVariance(value);
        applied = true;
    }

    // Immediately refresh visualization for fields that affect the loop graph
    if (applied && (fieldKey === "minLoopBeats" || fieldKey === "loopThreshold")) {
        // These trigger rebuildLoopChoices internally, visualization update happens there
    } else if (applied) {
        // For other fields (sectionBias, jumpVariance, maxSequentialBeats), manually refresh
        refreshJukeboxVisualization();
    }
    return applied;
}

function cloneAdvancedState(group) {
    if (!advancedSettings[group]) {
        return {};
    }
    return cloneSettings(advancedSettings[group]);
}

function cloneAdvancedDefaults(group) {
    if (!ADVANCED_DEFAULTS[group]) {
        return {};
    }
    return cloneSettings(ADVANCED_DEFAULTS[group]);
}

function isAdvancedGroupEnabled(group) {
    return !!advancedEnabled[group];
}

function setAdvancedGroupEnabledFlag(group, enabled) {
    var normalized = !!enabled;
    advancedEnabled[group] = normalized;
    if (group === "canonOverlay") {
        canonAdvancedEnabled = normalized;
    } else if (group === "eternalOverlay") {
        eternalAdvancedEnabled = normalized;
    }
}

function ensureAdvancedGroupSettings(group) {
    if (!advancedSettings[group]) {
        advancedSettings[group] = cloneAdvancedDefaults(group);
    }
    return advancedSettings[group];
}

function shouldRoundGroupField(group, key) {
    var list = ROUNDABLE_BEAT_FIELDS[group];
    if (!list) {
        return false;
    }
    return list.indexOf(key) !== -1;
}

function getBeatGridSize() {
    var grid = 1;
    try {
        if (curTrack && curTrack.analysis && curTrack.analysis.audio_summary && curTrack.analysis.audio_summary.time_signature) {
            var ts = curTrack.analysis.audio_summary.time_signature;
            if (isFinite(ts)) {
                grid = Math.max(1, Math.round(ts));
            }
        }
    } catch (err) {
        grid = 1;
    }
    return grid;
}

function quantizeBeatValue(value) {
    var num = coerceNumber(value);
    if (num === null) {
        return value;
    }
    var grid = getBeatGridSize();
    if (!isFinite(grid) || grid <= 0) {
        grid = 1;
    }
    var rounded = Math.round(num / grid) * grid;
    return Math.max(1, rounded);
}

function applyBeatRoundingAcrossGroups() {
    var groups = Object.keys(ROUNDABLE_BEAT_FIELDS);
    groups.forEach(function(group) {
        var target = ensureAdvancedGroupSettings(group);
        var fields = ROUNDABLE_BEAT_FIELDS[group];
        fields.forEach(function(key) {
            if (target && target[key] !== undefined) {
                target[key] = quantizeBeatValue(target[key]);
            }
        });
    });
}

function setAdvancedGroupSettingValue(group, key, value) {
    var target = ensureAdvancedGroupSettings(group);
    if (target && key !== undefined) {
        var finalValue = value;
        if (beatRoundingEnabled && shouldRoundGroupField(group, key)) {
            finalValue = quantizeBeatValue(value);
        }
        target[key] = finalValue;
    }
}

function clampNumber(value, minValue, maxValue) {
    var min = typeof minValue === "number" ? minValue : value;
    var max = typeof maxValue === "number" ? maxValue : value;
    if (!isFinite(value)) {
        return min;
    }
    if (isFinite(min) && value < min) {
        return min;
    }
    if (isFinite(max) && value > max) {
        return max;
    }
    return value;
}

function getCanonRlTuning() {
    var settings = ensureAdvancedGroupSettings("canonOverlay") || {};
    var minDwellRaw = coerceNumber(settings.rlMinDwellBeats);
    var repeatPenaltyRaw = coerceNumber(settings.rlRepeatPenalty);
    var minDwell = minDwellRaw !== null ? minDwellRaw : DEFAULT_CANON_RL_TUNING.minDwell;
    var repeatPenalty =
        repeatPenaltyRaw !== null
            ? repeatPenaltyRaw
            : DEFAULT_CANON_RL_TUNING.repeatPenalty;
    minDwell = clampNumber(Math.round(minDwell), 2, 96);
    repeatPenalty = clampNumber(Math.round(repeatPenalty), 0, 48);
    return {
        minDwell: minDwell,
        repeatPenalty: repeatPenalty,
    };
}

function getCanonRlMinDwell() {
    return getCanonRlTuning().minDwell;
}

function getCanonRlRepeatPenalty() {
    return getCanonRlTuning().repeatPenalty;
}

function resetAdvancedGroupSettings(group) {
    var defaults = cloneAdvancedDefaults(group);
    advancedSettings[group] = cloneSettings(defaults);
    return cloneAdvancedState(group);
}

function clamp01(value) {
    var num = (typeof value === "number") ? value : parseFloat(value);
    if (!isFinite(num)) {
        return 0;
    }
    if (num < 0) {
        return 0;
    }
    if (num > 1) {
        return 1;
    }
    return num;
}

function getOverlayColor(index, total) {
    if (typeof index !== "number" || typeof total !== "number" || total <= 1) {
        return otherColor;
    }
    var palette = overlayColorPalette && overlayColorPalette.length ? overlayColorPalette : [otherColor];
    return palette[index % palette.length];
}

function clearOverlayChips() {
    if (!activeOverlayChips || !activeOverlayChips.length) return;
    activeOverlayChips.forEach(function(chip) {
        if (chip && typeof chip.remove === "function") {
            chip.remove();
        }
    });
    activeOverlayChips = [];
}

function renderOverlayChips(q) {
    clearOverlayChips();
    if (!paper || !q || !q.others || !Array.isArray(q.others) || !q.others.length) {
        return;
    }
    var TW = W - hPad;
    var baseY = H - 8;
    var size = 8;
    var total = q.others.length;
    for (var i = 0; i < total; i++) {
        var ov = q.others[i];
        if (!ov) continue;
        var x = hPad + TW * (ov.start / trackDuration);
        var c = getOverlayColor(i, total);
        var chip = paper.rect(x - size / 2, baseY - size / 2, size, size, 2);
        chip.attr({ fill: c, stroke: c, "stroke-width": 2, opacity: 0.95 });
        activeOverlayChips.push(chip);
    }
}

function coerceNumber(value) {
    var num = (typeof value === "number") ? value : parseFloat(value);
    return isFinite(num) ? num : null;
}

function dispatchBeatRoundingEvent() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
    }
    var detail = { enabled: beatRoundingEnabled };
    try {
        window.dispatchEvent(new CustomEvent("harmonizer:beatRoundingSync", { detail: detail }));
    } catch (err) {
        if (typeof document !== "undefined" && document.createEvent) {
            try {
                var fallback = document.createEvent("Event");
                fallback.initEvent("harmonizer:beatRoundingSync", true, true);
                window.dispatchEvent(fallback);
            } catch (err2) {
                // ignore
            }
        }
    }
}

function setBeatRoundingEnabledInternal(enabled, opts) {
    var normalized = !!enabled;
    var options = opts || {};
    if (!options.force && normalized === beatRoundingEnabled) {
        return;
    }
    beatRoundingEnabled = normalized;
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(BEAT_ROUND_STORAGE_KEY, beatRoundingEnabled ? "1" : "0");
        }
    } catch (err) {
        // ignore persistence errors
    }
    if (beatRoundingEnabled) {
        applyBeatRoundingAcrossGroups();
    }
    if (!options.skipSync && typeof window.syncAllGroupsFromState === "function") {
        window.syncAllGroupsFromState();
    }
    if (mode === "canon") {
        regenerateCanonMapping({ reason: "beat-rounding" });
    } else if (mode === "eternal") {
        regenerateEternalOverlay({ reason: "beat-rounding" });
        recomputeLoopGraphForMode("eternal");
    } else if (mode === "jukebox") {
        recomputeLoopGraphForMode("jukebox");
    }
    if (!options.skipDispatch) {
        dispatchBeatRoundingEvent();
    }
}

function sanitizeLoopSettings(raw, defaults) {
    var merged = cloneSettings(defaults || {});
    var source = raw || {};
    if (source.minLoopBeats !== undefined) {
        merged.minLoopBeats = source.minLoopBeats;
    }
    if (source.maxSequentialBeats !== undefined) {
        merged.maxSequentialBeats = source.maxSequentialBeats;
    }
    if (source.loopThreshold !== undefined) {
        merged.loopThreshold = source.loopThreshold;
    }
    if (source.sectionBias !== undefined) {
        merged.sectionBias = source.sectionBias;
    }
    if (source.jumpVariance !== undefined) {
        merged.jumpVariance = source.jumpVariance;
    }

    var minLoopBeats = coerceNumber(merged.minLoopBeats);
    if (minLoopBeats === null) {
        minLoopBeats = defaults && defaults.minLoopBeats !== undefined ? defaults.minLoopBeats : 8;
    }
    merged.minLoopBeats = Math.max(4, Math.round(minLoopBeats));

    var maxSequentialBeats = coerceNumber(merged.maxSequentialBeats);
    if (maxSequentialBeats === null) {
        maxSequentialBeats = Math.max(merged.minLoopBeats + 4, merged.minLoopBeats * 3);
    }
    merged.maxSequentialBeats = Math.max(merged.minLoopBeats + 2, Math.round(maxSequentialBeats));

    var loopThreshold = coerceNumber(merged.loopThreshold);
    if (loopThreshold === null) {
        loopThreshold = defaults && defaults.loopThreshold !== undefined ? defaults.loopThreshold : 0.55;
    }
    merged.loopThreshold = Math.max(0.05, Math.min(0.99, loopThreshold));

    var sectionBias = coerceNumber(merged.sectionBias);
    if (sectionBias === null) {
        sectionBias = defaults && defaults.sectionBias !== undefined ? defaults.sectionBias : 0.5;
    }
    merged.sectionBias = clamp01(sectionBias);

    var jumpVariance = coerceNumber(merged.jumpVariance);
    if (jumpVariance === null) {
        jumpVariance = defaults && defaults.jumpVariance !== undefined ? defaults.jumpVariance : 0.4;
    }
    merged.jumpVariance = clamp01(jumpVariance);

    return merged;
}

function sanitizeSculptorSettings(raw, defaults) {
    var merged = cloneSettings(defaults || ADVANCED_DEFAULTS.sculptorConfig);
    var source = raw || {};
    function clampNumber(value, min, max) {
        var num = parseFloat(value);
        if (!isFinite(num)) {
            num = min;
        }
        if (isFinite(min) && num < min) {
            num = min;
        }
        if (isFinite(max) && num > max) {
            num = max;
        }
        return num;
    }

    merged.durationScale = clampNumber(source.durationScale, 0.4, 2.5);
    merged.minSectionSeconds = clampNumber(source.minSectionSeconds, 2, 60);
    merged.maxSectionSeconds = clampNumber(source.maxSectionSeconds, 4, 120);
    if (merged.maxSectionSeconds <= merged.minSectionSeconds) {
        merged.maxSectionSeconds = Math.max(merged.minSectionSeconds + 1, merged.maxSectionSeconds);
    }
    merged.previewSeconds = clampNumber(source.previewSeconds, 1, 12);
    merged.transitionOverlapSeconds = clampNumber(source.transitionOverlapSeconds, 0, 8);
    return merged;
}

function getLoopSettingsForMode(modeName) {
    var groupKey = (modeName === "eternal") ? "eternalLoop" : "jukeboxLoop";
    var defaults = cloneAdvancedDefaults(groupKey);
    var state = cloneAdvancedState(groupKey);
    var useAdvanced = isAdvancedGroupEnabled(groupKey);
    var sanitized = sanitizeLoopSettings(useAdvanced ? state : defaults, defaults);
    sanitized.modeName = modeName;
    return sanitized;
}

function getSculptorSettings() {
    var defaults = cloneAdvancedDefaults("sculptorConfig");
    var state = cloneAdvancedState("sculptorConfig");
    var useAdvanced = isAdvancedGroupEnabled("sculptorConfig");
    return sanitizeSculptorSettings(useAdvanced ? state : defaults, defaults);
}

function generatePresetId() {
    return "preset-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function getPresetsForGroup(group) {
    if (!advancedPresets[group]) {
        advancedPresets[group] = [];
    }
    return advancedPresets[group];
}

function saveAdvancedPreset(group, name, settings) {
    var presets = getPresetsForGroup(group);
    var preset = {
        id: generatePresetId(),
        name: name || "Preset " + (presets.length + 1),
        settings: cloneSettings(settings || ensureAdvancedGroupSettings(group)),
        createdAt: Date.now()
    };
    presets.push(preset);
    return preset;
}

function findPreset(group, presetId) {
    var presets = getPresetsForGroup(group);
    for (var i = 0; i < presets.length; i++) {
        if (presets[i] && presets[i].id === presetId) {
            return presets[i];
        }
    }
    return null;
}

function deleteAdvancedPreset(group, presetId) {
    var presets = getPresetsForGroup(group);
    for (var i = presets.length - 1; i >= 0; i--) {
        if (presets[i] && presets[i].id === presetId) {
            presets.splice(i, 1);
            return true;
        }
    }
    return false;
}

function clonePresetList(group) {
    var presets = getPresetsForGroup(group);
    return JSON.parse(JSON.stringify(presets));
}

function rebuildDriverForCurrentMode(shouldResume) {
    if (!isTrackReady || !remixer || typeof remixer.getPlayer !== "function") {
        return;
    }
    var resume = !!shouldResume && driver && typeof driver.isRunning === "function" && driver.isRunning();
    if (driver && typeof driver.stop === "function") {
        try {
            driver.stop();
        } catch (e) {}
    }

    // Re-apply canon alignment if voice count changed (for multi-voice canon)
    if ((mode === "canon" || mode === "eternal") && curTrack && curTrack.analysis && curTrack.analysis.canon_alignment) {
        console.log('[Rebuild Driver] Re-applying canon alignment with', window.canonVoiceCount || 2, 'voices');
        applyCanonAlignment(masterQs, curTrack.analysis.canon_alignment);
    }

    driver = Driver(remixer.getPlayer());
    if (typeof window.refreshSculptorPalette === "function") {
        try {
            window.refreshSculptorPalette();
        } catch (refreshErr) {
            console.warn("[Sculptor] Failed to refresh palette after rebuilding driver", refreshErr);
        }
    }
    if (typeof window.updateSculptorQueueDisplay === "function") {
        try {
            window.updateSculptorQueueDisplay();
        } catch (queueErr) {
            console.warn("[Sculptor] Failed to refresh queue after rebuilding driver", queueErr);
        }
    }
    if (resume && driver && typeof driver.start === "function") {
        driver.start();
        markPlaybackStarted();
    }
}

// Expose a safe rebuild helper for UI controls (e.g., voice-count slider)
window.rebuildDriver = function() {
    var wasRunning = driver && typeof driver.isRunning === "function" && driver.isRunning();
    rebuildDriverForCurrentMode(wasRunning);
};

var canonBaseAssignments = [];

// From Crockford, Douglas (2008-12-17). JavaScript: The Good Parts (Kindle Locations 734-736). Yahoo Press.

if (typeof Object.create !== 'function') { 
    Object.create = function (o) { 
        var F = function () {};
        F.prototype = o; 
        return new F(); 
    }; 
}

function info(s) {
    $("#info").text(s);
    var shouldShowStatus = true;
    if (typeof s === "string") {
        var lower = s.toLowerCase();
        if (lower.indexOf(" - eternal ") !== -1 || lower.indexOf("autocanonizer") !== -1 || s.indexOf(" by ") !== -1) {
            shouldShowStatus = false;
        }
    }
    $("#status-panel").text(shouldShowStatus ? s : "");
}

function error(s) {
    if (s.length == 0) {
        $("#error").hide();
    } else {
        $("#error").text(s);
        $("#error").show();
    }
}

function stop() {
    // player.stop();
}

function extractTitle(url) {
    var lastSlash = url.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash < url.length - 1) {
        var res =  url.substring(lastSlash + 1, url.length - 4);
        return res;
    } else {
        return url;
    }
}

function getTitle(title, artist, url) {
    if (title == undefined || title.length == 0 || title === '(unknown title)' || title == 'undefined') {
        if (url) {
            title = extractTitle(url);
        } else {
            title = null;
        }
    } else {
        if (artist !== '(unknown artist)') {
            title = title + ' (autocanonized) by ' + artist;
        } 
    }
    return title;
}

function loadTrack(trid) {
    fetchAnalysis(trid);
}

function showTrackTitle(t) {
    info(t.title + ' by ' + t.artist);
}


function getFullTitle() {
    return curTrack.fixedTitle;
}


function trackReady(t) {
    t.fixedTitle = getTitle(t.title, t.artist, t.info.url);
    document.title = t.fixedTitle;
    // $("#song-title").text(t.fixedTitle);
}

function readyToPlay(t) {
    if (t.status === 'ok') {
        curTrack = t;
        trackDuration = curTrack.audio_summary.duration;

        // Debug: Check if autoharmonizer data exists
        if (mode === "autoharmonizer") {
            console.log("[readyToPlay] Mode is autoharmonizer");
            console.log("[readyToPlay] curTrack keys:", Object.keys(curTrack));
            console.log("[readyToPlay] curTrack.analysis keys:", curTrack.analysis ? Object.keys(curTrack.analysis) : "NO ANALYSIS");
            console.log("[readyToPlay] Has autoharmonizer?", !!(curTrack.analysis && curTrack.analysis.autoharmonizer));
        }

        trackReady(curTrack);
        allReady();
    } else {
        info(t.status);
    }
}


function euclidean_distance(v1, v2) {
    var sum = 0;

    for (var i = 0; i < v1.length; i++) {
        var delta = v2[i] - v1[i];
        sum += delta * delta;
    }
    return Math.sqrt(sum);
}

var noSims = 0;
var yesSims = 0

function calculateNearestNeighborsForQuantum(list, q1) {
    var neighbors = [];
    var maxNeighbors = canonAdvancedEnabled ? 20 : 10;
    var duration = trackDuration || (masterQs && masterQs.length ? masterQs[masterQs.length - 1].start + masterQs[masterQs.length - 1].duration : 0);
    var MIN_INDEX_SPREAD = 3;

    for (var i = 0; i < list.length; i++) {
        var q2 = list[i];
        if (q1 == q2) {
            continue;
        }

        var sum = 0;
        for (var j = 0; j < q1.overlappingSegments.length; j++) {
            var seg1 = q1.overlappingSegments[j];
            var distance = 100;
            if (j < q2.overlappingSegments.length) {
                var seg2 = q2.overlappingSegments[j];
                distance = get_seg_distances(seg1, seg2);
            }
            sum += distance;
        }
        var pdistance = q1.indexInParent == q2.indexInParent ? 0 : 120;
        var baseDistance = sum / q1.overlappingSegments.length + pdistance;
        if (!isFinite(baseDistance)) {
            baseDistance = 1000;
        }
        // Strongly prefer staying in-section for safer texture
        var sectionPenalty = (q1.section !== undefined && q2.section !== undefined && q1.section !== q2.section) ? 420 : 0;
        var timePenalty = 0;
        if (duration > 0) {
            var deltaTime = Math.abs(q1.start - q2.start);
            timePenalty = (deltaTime / duration) * 70;
        }
        var flowPenalty = Math.max(0, (MIN_INDEX_SPREAD + 2) - Math.abs(q1.which - q2.which)) * 22;
        var totalDistance = baseDistance + sectionPenalty + timePenalty + flowPenalty;
        if (totalDistance > 0) {
            neighbors.push({ beat: q2, distance: totalDistance });
        }
    }

    var serverEdges = serverLoopCandidateMap[q1.which];
    if (serverEdges && serverEdges.length) {
        _.each(serverEdges, function(edge) {
            if (!edge) {
                return;
            }
            var targetIdx = edge.target;
            if (typeof targetIdx !== "number" || targetIdx < 0 || targetIdx >= list.length) {
                return;
            }
            var targetBeat = list[targetIdx];
            if (!targetBeat) {
                return;
            }
            var similarity = (typeof edge.similarity === "number") ? edge.similarity : 0;
            var normalized = Math.max(0, Math.min(1, (similarity + 1) / 2));
            var simDistance = Math.max(4, 14 + (1 - normalized) * 140);
            var existing = _.find(neighbors, function(entry) {
                return entry.beat && entry.beat.which === targetBeat.which;
            });
            if (existing) {
                existing.distance = Math.min(existing.distance, simDistance);
            } else {
                neighbors.push({ beat: targetBeat, distance: simDistance });
            }
        });
    }

    neighbors.sort(function(a, b) {
        return a.distance - b.distance;
    });
    if (neighbors.length > maxNeighbors) {
        neighbors = neighbors.slice(0, maxNeighbors);
    }
    q1.neighbors = neighbors;
    if (neighbors.length > 0) {
        q1.sim = neighbors[0].beat;
        q1.simDistance = neighbors[0].distance;
        var bestDistance = neighbors[0].distance;
        // Keep only in-section, similarly close options; small cushion
        var qualityThreshold = bestDistance + 28;
        var filtered = _.filter(neighbors, function(n) {
            return n.distance <= qualityThreshold && n.beat && n.beat.section === q1.section;
        });
        if (filtered.length === 0) {
            filtered = neighbors.slice(0, Math.min(6, neighbors.length));
        }
        q1.goodNeighbors = _.sortBy(filtered, function(n) { return n.distance; });
    } else {
        q1.sim = null;
        q1.simDistance = 10000000;
        q1.goodNeighbors = [];
    }
}

function seg_distance(seg1, seg2, field) {
    return euclidean_distance(seg1[field], seg2[field]);
}

var timbreWeight = 1, pitchWeight = 10, 
    loudStartWeight = 1, loudMaxWeight = 1, 
    durationWeight = 100, confidenceWeight = 1;

function get_seg_distances(seg1, seg2) {
    var timbre = seg_distance(seg1, seg2, 'timbre');
    var pitch = seg_distance(seg1, seg2, 'pitches');
    var sloudStart = Math.abs(seg1.loudness_start - seg2.loudness_start);
    var sloudMax = Math.abs(seg1.loudness_max - seg2.loudness_max);
    var duration = Math.abs(seg1.duration - seg2.duration);
    var confidence = Math.abs(seg1.confidence - seg2.confidence);
    var distance = timbre * timbreWeight + pitch * pitchWeight + 
        sloudStart * loudStartWeight + sloudMax * loudMaxWeight + 
        duration * durationWeight + confidence * confidenceWeight;
    return distance;
}

function getSection(q) {
    while (q.parent) {
        q = q.parent;
    }
    var sec = q.which;
    if (sec >= curTrack.analysis.sections.length) {
        sec = curTrack.analysis.sections.length - 1;
    }
    return sec;
}

function prepareLoopCandidates(track) {
    serverLoopCandidateMap = {};
    if (!track || !track.analysis) {
        return;
    }

    // Priority 1: Use eternal_loop_candidates if available (circular, bidirectional)
    var eternalCandidates = track.analysis.eternal_loop_candidates;
    if (eternalCandidates && typeof eternalCandidates === "object") {
        console.log('[prepareLoopCandidates] Using eternal_loop_candidates (circular timeline, bidirectional)');
        _.each(eternalCandidates, function(candidates, srcKey) {
            var src = parseInt(srcKey, 10);
            if (isNaN(src) || !Array.isArray(candidates)) {
                return;
            }
            if (!serverLoopCandidateMap[src]) {
                serverLoopCandidateMap[src] = [];
            }
            _.each(candidates, function(cand) {
                if (cand && typeof cand.target === "number" && typeof cand.similarity === "number") {
                    serverLoopCandidateMap[src].push({
                        target: cand.target,
                        similarity: cand.similarity,
                        span: cand.span || 0,
                        direction: cand.direction || 'backward',
                        section_match: cand.section_match || false,
                        score: cand.score,
                        abs_span: cand.abs_span,
                        beat_in_bar: cand.beat_in_bar,
                        bar_length_beats: cand.bar_length_beats,
                        chroma_similarity: cand.chroma_similarity,
                        source_energy: cand.source_energy,
                        target_energy: cand.target_energy
                    });
                }
            });
        });
    }

    // Priority 2: Fallback to canon loop_candidates
    if (Object.keys(serverLoopCandidateMap).length === 0) {
        console.log('[prepareLoopCandidates] Falling back to canon loop_candidates');
        var edges = track.analysis.loop_candidates || [];
        if (!edges.length && track.analysis.canon_alignment && track.analysis.canon_alignment.loop_candidates) {
            edges = track.analysis.canon_alignment.loop_candidates;
        }
        _.each(edges, function(edge) {
            if (!edge) {
                return;
            }
            var src = edge.source;
            var dst = edge.target;
            if (typeof src !== "number" || typeof dst !== "number") {
                return;
            }
            if (!serverLoopCandidateMap[src]) {
                serverLoopCandidateMap[src] = [];
            }
            serverLoopCandidateMap[src].push({
                target: dst,
                similarity: (typeof edge.similarity === "number") ? edge.similarity : 0
            });
        });
    }

    // Sort and limit candidates per beat
    _.each(serverLoopCandidateMap, function(entries, key) {
        serverLoopCandidateMap[key] = _.sortBy(entries, function(entry) {
            return -entry.similarity;
        }).slice(0, 16); // Increased from 12 to 16 for more variety
    });

    var totalCandidates = _.reduce(serverLoopCandidateMap, function(sum, entries) { return sum + entries.length; }, 0);
    console.log('[prepareLoopCandidates] Prepared', totalCandidates, 'total loop candidates across', Object.keys(serverLoopCandidateMap).length, 'beats');
}

function findMax(dict) {
    var max = -1000000;
    var maxKey = null;
    _.each(dict, function(val, key) {
        if (val > max) {
            max = val;
            maxKey = key;
        }
    });
    return maxKey;
}

function clearLoopPaths() {
    _.each(loopPaths, function(path) {
        if (path && typeof path.remove === "function") {
            path.remove();
        }
    });
    loopPaths = [];
    loopPathMap = {};
}

function applyCanonAlignment(qlist, alignment) {
    canonLoopCandidates = [];
    if (!alignment || !alignment.pairs || alignment.pairs.length !== qlist.length) {
        return false;
    }
    var pairs = alignment.pairs;
    var similarity = alignment.pair_similarity || [];
    var offset = alignment.offset || 0;
    var segments = alignment.segments || [];
    var coverageInfo = alignment.coverage || {};
    var coverageRatio = (typeof coverageInfo.ratio === "number") ? coverageInfo.ratio : null;
    var similarityThreshold = (typeof alignment.similarity_threshold === "number") ? alignment.similarity_threshold : 0.5;
    var segmentMap = {};
    _.each(segments, function(seg, segIndex) {
        if (!seg || typeof seg.start !== "number" || typeof seg.end !== "number") {
            return;
        }
        var start = Math.max(0, Math.floor(seg.start));
        var end = Math.min(qlist.length, Math.ceil(seg.end));
        for (var idx = start; idx < end; idx++) {
            segmentMap[idx] = {
                index: segIndex,
                offset: seg.offset,
                label: seg.label || "primary",
                meanSimilarity: seg.mean_similarity,
                phaseAlignment: seg.phase_alignment,
                threshold: seg.threshold
            };
        }
    });
    var baseGainDefault = 0.4;
    var baseGainPrimary = 0.46;
    var baseGainFallback = 0.34;

    // Get number of voices from window setting (default 2 for backwards compatibility)
    var numVoices = Math.max(2, Math.min(8, window.canonVoiceCount || 2));
    console.log('[Canon Alignment] Generating', numVoices, 'voices');

    for (var i = 0; i < qlist.length; i++) {
        var q = qlist[i];
        var targetIdx = pairs[i];
        var sim = (i < similarity.length) ? similarity[i] : 0;
        if (typeof targetIdx !== "number" || targetIdx < 0 || targetIdx >= qlist.length) {
            targetIdx = (i + offset) % qlist.length;
            sim = 0;
        }
        var safeIdx = ((targetIdx % qlist.length) + qlist.length) % qlist.length;
        var target = qlist[safeIdx];

        // Legacy single overlay (q.other) - always set for backwards compatibility
        q.other = target;
        q.otherSimilarityRaw = sim;
        var simNorm = Math.max(0, Math.min(1, (sim + 1) / 2));
        q.otherSimilarity = simNorm;
        var segmentInfo = segmentMap[i] || null;
        q.canonSegment = segmentInfo;
        q.otherSegmentIndex = segmentInfo ? segmentInfo.index : null;
        q.otherLabel = segmentInfo ? segmentInfo.label : null;
        q.otherOffset = ((safeIdx - q.which) + qlist.length) % qlist.length;
        var gainBase = baseGainDefault;
        if (segmentInfo) {
            if (segmentInfo.label === "primary") {
                gainBase = baseGainPrimary;
            } else if (segmentInfo.label === "fallback") {
                gainBase = baseGainFallback;
            }
            if (typeof segmentInfo.phaseAlignment === "number") {
                if (segmentInfo.phaseAlignment < 0.65) {
                    gainBase *= 0.9;
                } else if (segmentInfo.phaseAlignment > 0.88) {
                    gainBase += 0.05;
                }
            }
        }
        if (coverageRatio !== null && coverageRatio < 0.75) {
            gainBase *= 0.92;
        }
        if (sim < similarityThreshold) {
            q.otherGain = 0;
        } else {
            var gain = gainBase + simNorm * 0.45;
            q.otherGain = Math.min(1, Math.max(0.25, gain));
        }

        // NEW: Generate multiple overlay voices (q.others array)
        if (numVoices > 2) {
            q.others = [];

            // Voice 0: use the canonical pair from analysis
            q.others.push(target);

            // Voice 1+: distribute evenly across the track
            // For N voices, we need N-1 overlays (since main voice is separate)
            var baseOffsetBeats = Math.floor(qlist.length / numVoices);
            for (var voiceIdx = 1; voiceIdx < numVoices - 1; voiceIdx++) {
                // Each voice gets a different offset multiplier
                var offsetMult = voiceIdx + 1;
                var voiceOffset = baseOffsetBeats * offsetMult;
                var voiceTargetIdx = (i + voiceOffset) % qlist.length;
                var voiceSafeIdx = ((voiceTargetIdx % qlist.length) + qlist.length) % qlist.length;
                var voiceTarget = qlist[voiceSafeIdx];
                q.others.push(voiceTarget);
            }

            // Debug: log first beat only to avoid spam
            if (i === 0) {
                console.log('[Canon Alignment] Beat 0 has', q.others.length, 'overlay voices at offsets:',
                    q.others.map(function(o) { return ((o.which - q.which) + qlist.length) % qlist.length; }));
                console.log('[Canon Alignment] For', numVoices, 'total voices (1 main +', q.others.length, 'overlays)');
            }
        } else {
            // For 2 voices, just wrap q.other in an array for consistency
            q.others = [target];
        }

    }

    if (alignment.loop_candidates && alignment.loop_candidates.length) {
        var loopList = [];
        _.each(alignment.loop_candidates, function(edge) {
            if (!edge) {
                return;
            }
            var src = edge.source;
            var dst = edge.target;
            if (typeof src !== "number" || typeof dst !== "number") {
                return;
            }
            var simVal = (typeof edge.similarity === "number") ? edge.similarity : 0;
            if (simVal < similarityThreshold) {
                return;
            }
            loopList.push({
                source_start: src,
                target_start: dst,
                similarity: simVal
            });
            if (dst > src) {
                loopList.push({
                    source_start: dst,
                    target_start: src,
                    similarity: simVal
                });
            }
        });
        canonLoopCandidates = loopList;
        canonLoopGraph = {};
        loopList.forEach(function(edge) {
            var src = edge.source_start;
            if (typeof src !== "number") {
                return;
            }
            canonLoopGraph[src] = canonLoopGraph[src] || [];
            canonLoopGraph[src].push(edge);
        });
    } else {
        canonLoopCandidates = [];
        canonLoopGraph = {};
    }
    return true;
}

// Enrich overlay mapping with short, safe retarget runs centered in the track
// - Only within the middle portion of the song
// - Choose neighbors within the same section and small distance
// - Maintain a constant index offset across each short run to preserve timing
function storeBaseCanonMapping(qlist) {
    canonBaseAssignments = [];
    if (!qlist) {
        return;
    }
    _.each(qlist, function(q) {
        if (!q) {
            return;
        }
        canonBaseAssignments[q.which] = {
            otherIndex: (q.other && typeof q.other.which === "number") ? q.other.which : null,
            gain: (typeof q.otherGain === "number") ? q.otherGain : 0
        };
    });
}

function restoreBaseCanonMapping(qlist) {
    if (!canonBaseAssignments || !canonBaseAssignments.length) {
        return;
    }
    _.each(qlist, function(q) {
        if (!q) {
            return;
        }
        var base = canonBaseAssignments[q.which];
        if (!base) {
            return;
        }
        if (base.otherIndex !== null && base.otherIndex >= 0 && base.otherIndex < qlist.length) {
            q.other = qlist[base.otherIndex];
        } else {
            q.other = q;
        }
        q.otherGain = base.gain;
    });
}

function refreshCanonVisualization() {
    if (!paper || !masterQs || !masterQs.length) {
        return;
    }
    _.each(masterQs, function(q) {
        if (q && q.ppath && typeof q.ppath.remove === "function") {
            q.ppath.remove();
        }
        if (q) {
            q.ppath = null;
        }
    });
    if (mode === "canon") {
        drawConnections(masterQs);
    }
}

function regenerateCanonMapping(options) {
    if (mode !== "canon" || !masterQs || !masterQs.length) {
        return;
    }
    options = options || {};
    restoreBaseCanonMapping(masterQs);

    if (!canonAdvancedEnabled) {
        assignNormalizedVolumes(masterQs);
        refreshCanonVisualization();
        if (typeof window.onCanonRegenerated === "function") {
            window.onCanonRegenerated({ mode: "legacy" });
        }
        return;
    }

    var result = regenerateOverlayFromSettings(canonSettings, { targetMode: "canon" });
    refreshCanonVisualization();
    if (typeof window.onCanonRegenerated === "function") {
        window.onCanonRegenerated(result ? Object.assign({ mode: "advanced" }, result) : { mode: "advanced" });
    }
}

function regenerateEternalOverlay(options) {
    if (mode !== "eternal" || !masterQs || !masterQs.length) {
        return;
    }
    options = options || {};
    restoreBaseCanonMapping(masterQs);
    if (!eternalAdvancedEnabled) {
        assignNormalizedVolumes(masterQs);
        drawConnections(masterQs);
        return;
    }
    regenerateOverlayFromSettings(advancedSettings.eternalOverlay, { targetMode: "eternal" });
    // Redraw canon overlay connections to show the updated mapping
    drawConnections(masterQs);
}

function regenerateOverlayFromSettings(settings, details) {
    if (!settings || !masterQs || !masterQs.length) {
        return null;
    }
    var minOffset = Math.max(1, Math.floor(settings.minOffsetBeats || 1));
    var maxOffset = Math.max(minOffset + 1, Math.floor(settings.maxOffsetBeats || (masterQs.length * 0.6)));
    maxOffset = Math.min(maxOffset, masterQs.length - 1);
    if (maxOffset <= minOffset) {
        maxOffset = Math.max(minOffset + 1, Math.min(masterQs.length - 1, minOffset + 8));
        settings.maxOffsetBeats = maxOffset;
    }
    settings.minOffsetBeats = minOffset;
    settings.maxOffsetBeats = maxOffset;
    var dwell = Math.max(1, Math.floor(settings.dwellBeats || 4));
    var density = Math.max(1, Math.floor(settings.density || 3));
    var variation = Math.max(0, Math.floor(settings.variation || 0));
    var musicality = Math.max(0, Math.min(100, Math.floor(settings.musicality || 65)));
    var spacing = Math.max(8, Math.round(36 / density) + 12);
    var runLen = Math.max(2, Math.min(8, density + 2));
    var jitter = Math.min(10, variation + 2);

    ensureMinimumOffset(masterQs, minOffset, maxOffset);
    enrichOverlayConnections(masterQs, {
        spacing: spacing,
        maxRun: runLen,
        midStartFrac: 0.22,
        midEndFrac: 0.88,
        maxDistance: 70,
        jitter: jitter,
        minAbsOffset: minOffset,
        maxAbsOffset: maxOffset
    });
    smoothCanonMapping(masterQs, {
        windowSize: Math.min(15, 7 + variation),
        minAbsOffset: minOffset,
        minDwell: dwell,
        maxAbsOffset: maxOffset,
        musicality: musicality
    });
    assignNormalizedVolumes(masterQs);
    return {
        minOffset: minOffset,
        maxOffset: maxOffset,
        dwell: dwell,
        density: density,
        variation: variation,
        targetMode: details && details.targetMode ? details.targetMode : "canon"
    };
}

function updateCanonSetting(key, value) {
    canonSettings = ensureAdvancedGroupSettings("canonOverlay");
    if (!canonSettings || key === undefined) {
        return;
    }
    if (key === "minOffsetBeats") {
        value = Math.max(1, Math.floor(value));
        canonSettings.minOffsetBeats = value;
        if (canonSettings.maxOffsetBeats <= value) {
            canonSettings.maxOffsetBeats = value + 1;
        }
    } else if (key === "maxOffsetBeats") {
        var minLimit = Math.max(2, canonSettings.minOffsetBeats + 1);
        value = Math.max(minLimit, Math.floor(value));
        if (masterQs && masterQs.length) {
            value = Math.min(value, masterQs.length - 1);
        }
        canonSettings.maxOffsetBeats = value;
    } else if (key === "dwellBeats") {
        canonSettings.dwellBeats = Math.max(1, Math.floor(value));
    } else if (key === "density") {
        canonSettings.density = Math.min(16, Math.max(1, Math.floor(value)));
    } else if (key === "variation") {
        canonSettings.variation = Math.min(50, Math.max(0, Math.floor(value)));
    } else {
        canonSettings[key] = value;
    }
    if (mode === "canon" && masterQs && masterQs.length) {
        if (key === "minOffsetBeats" || key === "maxOffsetBeats") {
            scheduleCanonGraphRebuild("setting");
        } else {
            regenerateCanonMapping({ reason: "setting", field: key });
        }
    }
}

if (typeof window !== "undefined") {
    window.updateCanonSetting = updateCanonSetting;
    window.regenerateCanonMappingManually = function() { regenerateCanonMapping(); };
    window.getCanonSettingsSnapshot = function() {
        return {
            minOffsetBeats: canonSettings.minOffsetBeats,
            maxOffsetBeats: canonSettings.maxOffsetBeats,
            dwellBeats: canonSettings.dwellBeats,
            density: canonSettings.density,
            variation: canonSettings.variation,
            jumpBubbleBeats: canonSettings.jumpBubbleBeats
        };
    };
    window.setCanonAdvancedEnabled = setCanonAdvancedEnabled;
    window.isCanonAdvancedEnabled = function() { return canonAdvancedEnabled; };
    window.setEternalAdvancedEnabled = setEternalAdvancedEnabled;
    window.isEternalAdvancedEnabled = function() { return eternalAdvancedEnabled; };
    window.getAdvancedDefaults = function(group) { return cloneAdvancedDefaults(group); };
    window.setBeatRoundingEnabled = function(enabled) {
        setBeatRoundingEnabledInternal(enabled);
    };
    window.isBeatRoundingEnabled = function() {
        return beatRoundingEnabled;
    };
    window.getSculptorSettingsSnapshot = function() {
        return getSculptorSettings();
    };
    window.applySculptorSettings = function(options) {
        if (mode === "sculptor" && window.driver && typeof window.driver.applySettings === "function") {
            window.driver.applySettings(getSculptorSettings());
            if (typeof window.refreshSculptorPalette === "function") {
                window.refreshSculptorPalette();
            }
        }
    };
    window.getAdvancedSettings = function(group) {
        // If no group specified, return all settings
        if (!group) {
            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'sculptorConfig'];
            var allSettings = {};
            allGroups.forEach(function(g) {
                allSettings[g] = {
                    enabled: isAdvancedGroupEnabled(g),
                    settings: cloneAdvancedState(g),
                    defaults: cloneAdvancedDefaults(g)
                };
            });
            return allSettings;
        }

        // Return settings for specific group
        return {
            enabled: isAdvancedGroupEnabled(group),
            settings: cloneAdvancedState(group),
            defaults: cloneAdvancedDefaults(group)
        };
    };

    window.setAdvancedSettings = function(allSettings) {
        if (!allSettings || typeof allSettings !== 'object') {
            throw new Error('Invalid settings object');
        }

        var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'sculptorConfig'];
        allGroups.forEach(function(group) {
            if (!allSettings[group]) {
                return;
            }
            var groupData = allSettings[group];

            // Apply enabled state through the public helper so canon/eternal hooks fire
            if (typeof groupData.enabled !== 'undefined') {
                setAdvancedGroupEnabled(group, !!groupData.enabled);
            }

            // Apply individual fields
            if (groupData.settings) {
                Object.keys(groupData.settings).forEach(function(key) {
                    setAdvancedGroupSettingValue(group, key, groupData.settings[key]);
                });
            }
        });

        if (typeof window.syncAllGroupsFromState === 'function') {
            window.syncAllGroupsFromState();
        }

        if (typeof window.applyAdvancedGroup === 'function') {
            if (mode === "canon" && isAdvancedGroupEnabled("canonOverlay")) {
                window.applyAdvancedGroup("canonOverlay", { source: "import" });
            }
            if (mode === "eternal") {
                if (isAdvancedGroupEnabled("eternalOverlay")) {
                    window.applyAdvancedGroup("eternalOverlay", { source: "import" });
                }
                if (isAdvancedGroupEnabled("eternalLoop")) {
                    window.applyAdvancedGroup("eternalLoop", { source: "import" });
                }
            }
            if (mode === "jukebox" && isAdvancedGroupEnabled("jukeboxLoop")) {
                window.applyAdvancedGroup("jukeboxLoop", { source: "import" });
            }
            if (mode === "sculptor" && isAdvancedGroupEnabled("sculptorConfig")) {
                window.applyAdvancedGroup("sculptorConfig", { source: "import" });
            }
        }

        console.log('[Settings] Applied imported settings to all groups');
    };

    window.syncAllGroupsFromState = function() {
        if (typeof window.syncGroupFromState === 'function') {
            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'sculptorConfig'];
            allGroups.forEach(function(group) {
                window.syncGroupFromState(group);
            });
        }
    };
    window.setAdvancedGroupEnabled = function(group, enabled) {
        if (group === "canonOverlay") {
            setCanonAdvancedEnabled(enabled);
            return;
        }
        if (group === "eternalOverlay") {
            setEternalAdvancedEnabled(enabled);
            return;
        }
        if (!enabled && queuedAdvancedApplyTimers[group]) {
            clearTimeout(queuedAdvancedApplyTimers[group]);
            queuedAdvancedApplyTimers[group] = null;
        }
        setAdvancedGroupEnabledFlag(group, enabled);
        if (group === "jukeboxLoop" && mode === "jukebox") {
            recomputeLoopGraphForMode("jukebox");
        } else if (group === "eternalLoop" && mode === "eternal") {
            // When disabling eternal loop, clear paths and redraw with defaults
            if (!enabled) {
                clearLoopPaths();
            }
            recomputeLoopGraphForMode("eternal");
            // Force a visualization refresh to apply default settings
            if (!enabled) {
                setTimeout(function() {
                    refreshJukeboxVisualization();
                }, 50);
            }
        } else if (group === "sculptorConfig" && mode === "sculptor") {
            if (typeof window.applySculptorSettings === "function") {
                window.applySculptorSettings({ reason: enabled ? "enable" : "disable" });
            }
        }
    };
    window.isAdvancedGroupEnabled = isAdvancedGroupEnabled;
    window.updateAdvancedGroupSetting = function(group, key, value) {
        setAdvancedGroupSettingValue(group, key, value);
        if (group === "canonOverlay") {
            updateCanonSetting(key, value);
            return;
        }
        if (group === "eternalOverlay") {
            if (mode === "eternal" && eternalAdvancedEnabled) {
                scheduleEternalOverlayRecalc("ui");
            }
            return;
        }
        if (group === "sculptorConfig") {
            if (typeof window.applySculptorSettings === "function") {
                window.applySculptorSettings({ reason: "setting", field: key });
            }
            return;
        }
        if (!isAdvancedGroupEnabled(group)) {
            return;
        }
        if (queuedAdvancedApplyTimers[group]) {
            clearTimeout(queuedAdvancedApplyTimers[group]);
        }
        if (typeof window.applyAdvancedGroup === "function") {
            queuedAdvancedApplyTimers[group] = setTimeout(function() {
                queuedAdvancedApplyTimers[group] = null;
                window.applyAdvancedGroup(group, { source: "ui" });
            }, 90);
        }
    };
    window.resetAdvancedGroup = function(group) {
        console.log('[resetAdvancedGroup] Resetting group:', group, 'mode:', mode);
        var snapshot = resetAdvancedGroupSettings(group);
        if (group === "canonOverlay") {
            canonSettings = ensureAdvancedGroupSettings("canonOverlay");
        }
        // Immediately apply the reset and regenerate visualization
        if (group === "canonOverlay" && mode === "canon") {
            regenerateCanonMapping({ reason: "reset" });
        } else if (group === "eternalOverlay" && mode === "eternal") {
            regenerateEternalOverlay({ reason: "reset" });
        } else if (group === "jukeboxLoop" && mode === "jukebox") {
            recomputeLoopGraphForMode("jukebox");
        } else if (group === "eternalLoop" && mode === "eternal") {
            // For eternal mode, we need to clear and redraw both overlays and loops
            clearLoopPaths();
            recomputeLoopGraphForMode("eternal");
            // Force redraw with default settings
            setTimeout(function() {
                refreshJukeboxVisualization();
            }, 50);
        } else if (group === "sculptorConfig" && mode === "sculptor") {
            if (typeof window.applySculptorSettings === "function") {
                window.applySculptorSettings({ reason: "reset" });
            }
        }
        console.log('[resetAdvancedGroup] Reset complete, new settings:', advancedSettings[group]);
        return snapshot;
    };
    window.applyAdvancedGroup = function(group, options) {
        if (group === "canonOverlay") {
            regenerateCanonMapping(Object.assign({ reason: "apply" }, options));
        } else if (group === "eternalOverlay") {
            regenerateEternalOverlay(Object.assign({ reason: "apply" }, options));
        } else if (group === "jukeboxLoop" && mode === "jukebox") {
            recomputeLoopGraphForMode("jukebox");
        } else if (group === "eternalLoop" && mode === "eternal") {
            recomputeLoopGraphForMode("eternal");
        } else if (group === "sculptorConfig" && mode === "sculptor") {
            if (typeof window.applySculptorSettings === "function") {
                window.applySculptorSettings({ source: options && options.source });
            }
        }
    };
    window.applyImmediateAdvancedSetting = function(group, key, value) {
        if (!group || key === undefined) {
            return;
        }
        var numericValue = (typeof value === "number") ? value : parseFloat(value);
        if (!isFinite(numericValue)) {
            return;
        }

        var isEnabledFn = (typeof window.isAdvancedGroupEnabled === "function") ? window.isAdvancedGroupEnabled : isAdvancedGroupEnabled;
        var setEnabledFn = (typeof window.setAdvancedGroupEnabled === "function") ? window.setAdvancedGroupEnabled : setAdvancedGroupEnabledFlag;
        if (!isEnabledFn(group)) {
            setEnabledFn(group, true);
        }

        setAdvancedGroupSettingValue(group, key, numericValue);

        var handled = false;
        if (group === "canonOverlay") {
            if (!canonAdvancedEnabled) {
                setCanonAdvancedEnabled(true);
            }
            updateCanonSetting(key, numericValue);
            triggerCanonOverlayRefresh(key);
            handled = true;
        } else if (group === "eternalOverlay") {
            if (!eternalAdvancedEnabled) {
                setEternalAdvancedEnabled(true);
            }
            scheduleEternalOverlayRecalc("slider");
            handled = true;
        } else if (group === "jukeboxLoop") {
            handled = true;
            applyLoopFieldToDriver(key, numericValue);
            scheduleJukeboxLoopRecalc();
        } else if (group === "eternalLoop") {
            handled = true;
            applyLoopFieldToDriver(key, numericValue);
            scheduleEternalLoopRecalc();
        } else if (group === "sculptorConfig" && mode === "sculptor") {
            handled = true;
            if (typeof window.applySculptorSettings === "function") {
                window.applySculptorSettings({ source: "immediate", field: key });
            }
        }

        if (!handled && typeof window.applyAdvancedGroup === "function") {
            window.applyAdvancedGroup(group, { source: "immediate" });
        }
    };
    window.getAdvancedPresets = function(group) {
        return clonePresetList(group);
    };
    window.saveAdvancedPreset = function(group, name) {
        return saveAdvancedPreset(group, name, ensureAdvancedGroupSettings(group));
    };
    window.deleteAdvancedPreset = function(group, presetId) {
        return deleteAdvancedPreset(group, presetId);
    };
    window.loadAdvancedPreset = function(group, presetId) {
        var preset = findPreset(group, presetId);
        if (!preset) {
            return null;
        }
        advancedSettings[group] = cloneSettings(preset.settings);
        if (group === "canonOverlay") {
            canonSettings = ensureAdvancedGroupSettings("canonOverlay");
        }
        if (group === "canonOverlay" && mode === "canon") {
            regenerateCanonMapping({ reason: "preset" });
        } else if (group === "eternalOverlay" && mode === "eternal") {
            regenerateEternalOverlay({ reason: "preset" });
        } else if (group === "jukeboxLoop" && mode === "jukebox") {
            recomputeLoopGraphForMode("jukebox");
        } else if (group === "eternalLoop" && mode === "eternal") {
            recomputeLoopGraphForMode("eternal");
        }
        return cloneSettings(preset.settings);
    };
    window.exportAdvancedPreset = function(group, presetId) {
        var preset = findPreset(group, presetId);
        if (!preset) {
            return null;
        }
        var payload = {
            version: 1,
            group: group,
            name: preset.name,
            settings: preset.settings
        };
        return JSON.stringify(payload, null, 2);
    };
    window.importAdvancedPreset = function(group, payload) {
        if (!payload || typeof payload !== "object") {
            return null;
        }
        var targetGroup = group || payload.group || "canonOverlay";
        if (!advancedSettings[targetGroup]) {
            return null;
        }
        var imported = saveAdvancedPreset(targetGroup, payload.name, payload.settings);
        return imported;
    };
}

function enrichOverlayConnections(qlist, options) {
    options = options || {};
    if (!qlist || !qlist.length) {
        return;
    }
    var n = qlist.length;
    var startIdx = Math.floor(n * (options.midStartFrac || 0.25));
    var endIdx = Math.floor(n * (options.midEndFrac || 0.85));
    if (endIdx <= startIdx + 4) {
        return;
    }
    var baseSpacing = Math.max(10, options.spacing || 16);
    var maxRun = Math.max(2, options.maxRun || 4);
    var maxJitter = Math.max(0, options.jitter || 3);
    var maxDistance = Math.max(40, options.maxDistance || 60);
    var minAbsOffset = Math.max(1, options.minAbsOffset || 5);
    var maxAbsOffset = options.maxAbsOffset && options.maxAbsOffset > minAbsOffset ? options.maxAbsOffset : null;
    for (var i = startIdx; i < endIdx; ) {
        var q = qlist[i];
        if (!q) { i += 1; continue; }
        var chosen = null;
        var baseNeighbors = (q.goodNeighbors && q.goodNeighbors.length) ? q.goodNeighbors : q.neighbors;
        if (baseNeighbors && baseNeighbors.length) {
            for (var k = 0; k < baseNeighbors.length; k++) {
                var entry = baseNeighbors[k];
                if (!entry || !entry.beat) { continue; }
                if (entry.distance > maxDistance) { continue; }
                // stay within section
                if (q.section !== undefined && entry.beat.section !== undefined && q.section !== entry.beat.section) {
                    continue;
                }
                var delta = entry.beat.which - q.which;
                if (Math.abs(delta) < minAbsOffset) { continue; }
                if (maxAbsOffset !== null && Math.abs(delta) > maxAbsOffset) { continue; }
                // ensure target index is valid for a short run
                var runLen = Math.min(maxRun, endIdx - i);
                if (i + runLen + delta < 0 || i + runLen + delta >= n) {
                    continue;
                }
                chosen = { offset: delta, length: runLen };
                break;
            }
        }
        if (chosen) {
            var offset = chosen.offset;
            var run = chosen.length;
            for (var r = 0; r < run; r++) {
                var qi = qlist[i + r];
                if (!qi) { break; }
                var ti = i + r + offset;
                if (ti < 0 || ti >= n) { break; }
                qi.other = qlist[ti];
                // Keep overlay moderate; analyzer may raise gains later
                if (typeof qi.otherGain !== 'number' || qi.otherGain === 0) {
                    qi.otherGain = 0.35;
                } else {
                    qi.otherGain = Math.min(0.9, Math.max(0.25, qi.otherGain));
                }
            }
        }
        var step = baseSpacing + Math.floor(Math.random() * (maxJitter + 1));
        i += step;
    }
}

// Smooths per-beat canon target to reduce rapid back-and-forth and encourage
// piecewise-constant offsets, while only selecting musically valid candidates.
function smoothCanonMapping(qlist, options) {
    options = options || {};
    if (!qlist || !qlist.length) { return; }
    var windowSize = Math.max(3, options.windowSize || 7);
    var minAbsOffset = Math.max(1, options.minAbsOffset || 5);
    var minDwell = Math.max(2, options.minDwell || 4);
    var preferSameSection = true;
    var maxAbsOffset = options.maxAbsOffset && options.maxAbsOffset > minAbsOffset ? options.maxAbsOffset : null;
    var musicality = Math.max(0, Math.min(100, options.musicality !== undefined ? options.musicality : 65));

    function runningMedian(arr, idx, w) {
        var half = Math.floor(w / 2);
        var start = Math.max(0, idx - half);
        var end = Math.min(arr.length - 1, idx + half);
        var vals = [];
        for (var i = start; i <= end; i++) { if (typeof arr[i] === 'number' && isFinite(arr[i])) vals.push(arr[i]); }
        if (!vals.length) { return null; }
        vals.sort(function(a,b){ return a-b; });
        return vals[Math.floor(vals.length / 2)];
    }

    var deltas = [];
    for (var i = 0; i < qlist.length; i++) {
        var q = qlist[i];
        deltas[i] = (q && q.other) ? (q.other.which - q.which) : null;
    }

    var lastDelta = null;
    var runLen = 0;
    for (var i = 0; i < qlist.length; i++) {
        var q = qlist[i];
        if (!q) continue;
        var pref = runningMedian(deltas, i, windowSize);
        if (pref === null) { continue; }
        var preferred = Math.round(pref);

        // STRUCTURED OFFSET: Snap to musical intervals for more coherent sound
        // Prefer multiples of 4, 8, 12, 16 (measures and phrases)
        // Musicality controls snap strength: 0% = no snap, 100% = aggressive snap
        var musicalIntervals = [4, 8, 12, 16, 20, 24, 32, 48, 64];
        var closestMusical = musicalIntervals[0];
        var minDist = Math.abs(Math.abs(preferred) - musicalIntervals[0]);
        for (var mi = 1; mi < musicalIntervals.length; mi++) {
            var dist = Math.abs(Math.abs(preferred) - musicalIntervals[mi]);
            if (dist < minDist) {
                minDist = dist;
                closestMusical = musicalIntervals[mi];
            }
        }
        // Snap threshold scales with musicality: at 0% never snap, at 100% snap within 10 beats
        var snapThreshold = Math.floor((musicality / 100) * 10);
        if (minDist <= snapThreshold) {
            // Blend between original and snapped based on musicality
            var snapStrength = musicality / 100;
            var snapped = preferred >= 0 ? closestMusical : -closestMusical;
            preferred = Math.round(preferred * (1 - snapStrength) + snapped * snapStrength);
        }

        if (Math.abs(preferred) < minAbsOffset) {
            preferred = preferred >= 0 ? minAbsOffset : -minAbsOffset;
        }
        if (maxAbsOffset !== null && Math.abs(preferred) > maxAbsOffset) {
            preferred = preferred >= 0 ? maxAbsOffset : -maxAbsOffset;
        }
        // Assemble candidates: current, goodNeighbors, plus neighbors list
        var cands = [];
        if (q.other) cands.push({ b: q.other, dist: 0 });
        if (q.goodNeighbors && q.goodNeighbors.length) {
            for (var k = 0; k < Math.min(6, q.goodNeighbors.length); k++) {
                var ge = q.goodNeighbors[k];
                if (ge && ge.beat) { cands.push({ b: ge.beat, dist: ge.distance }); }
            }
        }
        if (q.neighbors && q.neighbors.length) {
            for (var k2 = 0; k2 < Math.min(6, q.neighbors.length); k2++) {
                var ne = q.neighbors[k2];
                if (ne && ne.beat) { cands.push({ b: ne.beat, dist: ne.distance }); }
            }
        }
        var best = null;
        for (var c = 0; c < cands.length; c++) {
            var b = cands[c].b; var d = cands[c].dist;
            var delta = b.which - q.which;
            if (Math.abs(delta) < minAbsOffset) continue;
            if (maxAbsOffset !== null && Math.abs(delta) > maxAbsOffset) continue;
            if (preferSameSection && q.section !== undefined && b.section !== undefined && q.section !== b.section) continue;

            var deltaCost = Math.abs(delta - preferred);
            var simCost = (typeof d === 'number') ? (d / 200.0) : 1.0;

            // BONUS: Prefer offsets that are exact musical intervals (4, 8, 16, etc.)
            var musicalBonus = 0;
            var absDelta = Math.abs(delta);
            if (absDelta % 4 === 0) musicalBonus = 0.15; // Reward measure-aligned offsets
            if (absDelta % 8 === 0) musicalBonus = 0.25; // Extra reward for phrase-aligned
            if (absDelta % 16 === 0) musicalBonus = 0.35; // Maximum reward for section-aligned

            var sizeReward = 0;
            if (maxAbsOffset !== null && maxAbsOffset > 0) {
                sizeReward = Math.min(0.35, absDelta / maxAbsOffset * 0.3);
            } else {
                sizeReward = Math.min(0.25, absDelta / Math.max(8, minAbsOffset * 2) * 0.25);
            }

            var cost = deltaCost + simCost - sizeReward - musicalBonus;
            if (!best || cost < best.cost) { best = { beat: b, cost: cost, delta: delta }; }
        }
        // ENHANCED Dwell/hysteresis: resist changing offset AND align to phrase boundaries
        if (best) {
            if (lastDelta === null || best.delta === lastDelta) {
                runLen += 1;
            } else {
                // Check if we're at a natural transition point (section boundary or phrase multiple)
                var atSectionBoundary = false;
                if (q.section !== undefined) {
                    // Check if next beat is in a different section (natural transition point)
                    var nextQ = qlist[Math.min(i + 1, qlist.length - 1)];
                    if (nextQ && nextQ.section !== undefined && nextQ.section !== q.section) {
                        atSectionBoundary = true;
                    }
                }

                // Check if we're at a phrase boundary (multiples of 4, 8, 16 beats)
                var atPhraseBoundary = (i % 8 === 0) || (i % 16 === 0);

                // Allow shorter dwell at natural boundaries, require longer dwell mid-phrase
                var effectiveMinDwell = minDwell;
                if (atSectionBoundary || atPhraseBoundary) {
                    effectiveMinDwell = Math.max(2, Math.floor(minDwell * 0.6)); // 60% of normal dwell at boundaries
                } else {
                    effectiveMinDwell = Math.ceil(minDwell * 1.2); // 120% mid-phrase to let lyrics ring
                }

                if (runLen < effectiveMinDwell) {
                    // force continuity by projecting previous delta if valid
                    var ti = i + lastDelta;
                    if (lastDelta !== null && ti >= 0 && ti < qlist.length) {
                        q.other = qlist[ti];
                        deltas[i] = lastDelta;
                        runLen += 1;
                        continue;
                    }
                }
                lastDelta = best.delta;
                runLen = 1;
            }
            q.other = best.beat;
            deltas[i] = best.delta;
            lastDelta = best.delta;
        }
    }
}

function ensureMinimumOffset(qlist, minAbsOffset, maxAbsOffset) {
    if (!qlist || !qlist.length) {
        return;
    }
    var n = qlist.length;
    minAbsOffset = Math.max(1, minAbsOffset || 1);
    maxAbsOffset = Math.max(minAbsOffset + 1, maxAbsOffset || Math.max(2, Math.floor(n * 0.6)));
    _.each(qlist, function(q) {
        if (!q) { return; }
        var currentIdx = q.other && typeof q.other.which === "number" ? q.other.which : null;
        var currentDelta = currentIdx !== null ? currentIdx - q.which : 0;
        if (currentDelta < 0) {
            currentDelta += n;
        }
        var absDelta = Math.abs(currentDelta);
        if (absDelta >= minAbsOffset && absDelta <= maxAbsOffset) {
            return;
        }
        var candidate = null;
        var bestScore = Infinity;
        function consider(entry, weightPenalty) {
            if (!entry || !entry.beat) { return; }
            var idx = entry.beat.which;
            var delta = idx - q.which;
            if (delta < 0) { delta += n; }
            if (delta === 0) { return; }
            var abs = Math.abs(delta);
            if (abs < minAbsOffset || abs > maxAbsOffset) { return; }
            var penalty = weightPenalty || 0;
            if (typeof entry.distance === 'number') {
                penalty += entry.distance / 220;
            }
            if (q.section !== undefined && entry.beat.section !== undefined && q.section !== entry.beat.section) {
                penalty += 0.6;
            }
            if (penalty < bestScore) {
                bestScore = penalty;
                candidate = entry.beat;
            }
        }
        if (q.goodNeighbors) {
            _.each(q.goodNeighbors, function(entry) { consider(entry, 0); });
        }
        if (!candidate && q.neighbors) {
            _.each(q.neighbors, function(entry) { consider(entry, 0.25); });
        }
        if (!candidate) {
            for (var offset = minAbsOffset; offset <= maxAbsOffset; offset += Math.max(1, Math.round(minAbsOffset / 2))) {
                var forward = (q.which + offset) % n;
                var alt = qlist[forward];
                if (alt) {
                    consider({ beat: alt, distance: 180 }, 1.0 + offset / 64);
                }
                var backward = (q.which - offset);
                while (backward < 0) {
                    backward += n;
                }
                var altBack = qlist[backward % n];
                if (altBack) {
                    consider({ beat: altBack, distance: 180 }, 1.0 + offset / 64);
                }
                if (candidate) {
                    break;
                }
            }
        }
        if (candidate) {
            q.other = candidate;
            q.otherGain = Math.max(0.35, Math.min(0.9, q.otherGain || 0.45));
        }
    });
}

function setCanonAdvancedEnabled(enabled) {
    var normalized = !!enabled;
    if (normalized === canonAdvancedEnabled) {
        return;
    }
    canonAdvancedEnabled = normalized;
    setAdvancedGroupEnabledFlag("canonOverlay", normalized);
    if (canonAdvancedEnabled && masterQs && masterQs.length) {
        _.each(masterQs, function(q) {
            calculateNearestNeighborsForQuantum(masterQs, q);
        });
    }
    if (mode === "canon" && masterQs && masterQs.length) {
        regenerateCanonMapping({ reason: "toggle" });
    }
    if (typeof window.onCanonModeChanged === "function") {
        window.onCanonModeChanged(canonAdvancedEnabled);
    }
}

function setEternalAdvancedEnabled(enabled) {
    var normalized = !!enabled;
    if (normalized === eternalAdvancedEnabled) {
        return;
    }
    eternalAdvancedEnabled = normalized;
    setAdvancedGroupEnabledFlag("eternalOverlay", normalized);
    if (mode === "eternal" && masterQs && masterQs.length) {
        // When disabling, clear the overlay paths before regenerating
        if (!normalized && paper && masterQs) {
            _.each(masterQs, function(q) {
                if (q && q.ppath && typeof q.ppath.remove === "function") {
                    q.ppath.remove();
                }
                if (q) {
                    q.ppath = null;
                }
            });
        }
        regenerateEternalOverlay({ reason: "toggle" });
    }
}

function augmentCanonNeighbors(qlist, alignment) {
    if (!alignment || !alignment.transitions || !alignment.transitions.length) {
        return;
    }
    var transitions = alignment.transitions;
    var loopEdges = alignment.loop_candidates || [];
    var similarityThreshold = (typeof alignment.similarity_threshold === "number") ? alignment.similarity_threshold : 0.5;
    _.each(loopEdges, function(edge) {
        if (!edge) {
            return;
        }
        var srcIdx = edge.source;
        var dstIdx = edge.target;
        if (typeof srcIdx !== "number" || typeof dstIdx !== "number") {
            return;
        }
        if (srcIdx < 0 || srcIdx >= qlist.length || dstIdx < 0 || dstIdx >= qlist.length) {
            return;
        }
        var srcBeat = qlist[srcIdx];
        var dstBeat = qlist[dstIdx];
        if (!srcBeat || !dstBeat) {
            return;
        }
        var simVal = (typeof edge.similarity === "number") ? edge.similarity : 0;
        if (simVal < similarityThreshold * 0.9) {
            return;
        }
        var simNorm = Math.max(0, Math.min(1, (simVal + 1) / 2));
        var distance = Math.max(4, 12 + (1 - simNorm) * 120);
        if (!srcBeat.neighbors) {
            srcBeat.neighbors = [];
        }
        srcBeat.neighbors.push({ beat: dstBeat, distance: distance });
        if (!srcBeat.goodNeighbors) {
            srcBeat.goodNeighbors = [];
        }
        srcBeat.goodNeighbors.push({ beat: dstBeat, distance: distance });
    });

    _.each(transitions, function(tr) {
        if (typeof tr.source !== "number" || typeof tr.target !== "number") {
            return;
        }
        var srcIdx = tr.source;
        var dstIdx = tr.target;
        if (srcIdx < 0 || srcIdx >= qlist.length || dstIdx < 0 || dstIdx >= qlist.length) {
            return;
        }
        var src = qlist[srcIdx];
        var dst = qlist[dstIdx];
        if (!src || !dst || src === dst) {
            return;
        }
        var sim = (typeof tr.similarity === "number") ? tr.similarity : 0;
        var simNorm = Math.max(0, Math.min(1, (sim + 1) / 2));
        var distance = Math.max(4, 12 + (1 - simNorm) * 120);
        if (!src.neighbors) {
            src.neighbors = [];
        }
        src.neighbors.push({ beat: dst, distance: distance });
        if (!src.goodNeighbors) {
            src.goodNeighbors = [];
        }
        var duplicate = _.find(src.goodNeighbors, function(entry) {
            return entry.beat && entry.beat.which === dst.which;
        });
        if (!duplicate) {
            src.goodNeighbors.push({ beat: dst, distance: distance });
        }
    });

    _.each(qlist, function(q) {
        if (q.neighbors && q.neighbors.length) {
            var neighborSeen = {};
            var sortedNeighbors = _.sortBy(q.neighbors, function(entry) { return entry.distance; });
            var filteredNeighbors = [];
            for (var i = 0; i < sortedNeighbors.length && filteredNeighbors.length < 12; i++) {
                var entry = sortedNeighbors[i];
                if (!entry.beat) {
                    continue;
                }
                var key = entry.beat.which;
                if (neighborSeen[key]) {
                    continue;
                }
                neighborSeen[key] = true;
                filteredNeighbors.push(entry);
            }
            q.neighbors = filteredNeighbors;
        }
        if (q.goodNeighbors && q.goodNeighbors.length) {
            var goodSeen = {};
            var sortedGood = _.sortBy(q.goodNeighbors, function(entry) { return entry.distance; });
            var filteredGood = [];
            for (var j = 0; j < sortedGood.length && filteredGood.length < 8; j++) {
                var gentry = sortedGood[j];
                if (!gentry.beat) {
                    continue;
                }
                var gkey = gentry.beat.which;
                if (goodSeen[gkey]) {
                    continue;
                }
                goodSeen[gkey] = true;
                filteredGood.push(gentry);
            }
            q.goodNeighbors = filteredGood;
        }
    });
}

function foldBySection(qlist) {
    var nSections = curTrack.analysis.sections.length;
    for (var section = 0; section < nSections; section++) {
        var counter = {};
        _.each(qlist, function(q) {
            if (q.section == section && q.sim && q.sim.section === section) {
                var delta = q.which - q.sim.which;
                if (!(delta in counter)) {
                    counter[delta] = 0;
                }
                counter[delta] += 1;
            }
        });
        var bestDelta = findMax(counter);

        _.each(qlist, function(q) {
            if (q.section == section) {
                var fallback = q.next ? q.next : q;
                if (bestDelta === null || q.sim == null || q.sim.section !== section) {
                    q.other = fallback;
                    // conservative overlay in fallback mode to avoid harshness
                    q.otherGain = (fallback === q) ? 0 : 0.15;
                } else {
                    var next = q.which - bestDelta;
                    if (next >= 0 && next < qlist.length) {
                        q.other = qlist[next];
                    } else {
                        q.other = fallback;
                    }
                    q.otherGain = (q.other === fallback) ? 0.15 : 0.9;
                }
            }
        });

    }

    _.each(qlist, function(q) {
        if (q.prev && q.prev.other && q.prev.other.which + 1 != q.other.which) {
            q.prev.otherGain = .5;
            q.otherGain = .5;
        }

        if (q.next && q.next.other && q.next.other.which - 1 != q.other.which) {
            q.next.otherGain = .5;
            q.otherGain = .5;
        }
    });
}

function allReady() {
    var autohData = curTrack && curTrack.analysis && curTrack.analysis.autoharmonizer;
    var usingAutoharmonizer = (mode === "autoharmonizer");
    if (usingAutoharmonizer &&
        autohData &&
        autohData.track1 &&
        autohData.track1.beats &&
        autohData.track1.beats.length) {
        masterQs = autohData.track1.beats.slice();
    } else {
        masterQs = curTrack.analysis.beats || [];
    }
    if (!masterQs.length) {
        console.warn("[allReady] No beats available for mode:", mode, "Ã¢â‚¬â€œ falling back to track analysis beats");
        masterQs = curTrack.analysis.beats || [];
    }
    if (!masterQs.length) {
        error("Unable to load beat data for this track");
        return;
    }
    masterGain = (mode === "canon") ? 0.55 : (mode === "eternal" ? 0.7 : 1.0);
    if (usingAutoharmonizer) {
        masterGain = 0.7;
    }
    _.each(masterQs, function(q1) {
        q1.section = getSection(q1);
    });
    canonLoopCandidates = [];
    canonBaseAssignments = [];
    if (!usingAutoharmonizer) {
        prepareLoopCandidates(curTrack);
    }

    if (!usingAutoharmonizer) {
        var lastBeat = masterQs[masterQs.length - 1];
        if (lastBeat) {
            var remaining = Math.max(trackDuration - lastBeat.start, 0.1);
            var durationSamples = _.map(masterQs.slice(0, -1), function(b) { return b.duration; });
            var medianDuration = durationSamples.length ? _.sortBy(durationSamples)[Math.floor(durationSamples.length / 2)] : remaining;
            var cap = medianDuration ? medianDuration * 1.6 : remaining;
            lastBeat.duration = Math.min(remaining, cap);
        }

        _.each(masterQs, function(q1) {
            calculateNearestNeighborsForQuantum(masterQs, q1);
        });
    }

    var canonApplied = false;
    if (!usingAutoharmonizer && (mode === "canon" || mode === "eternal")) {
        canonApplied = applyCanonAlignment(masterQs, curTrack.analysis.canon_alignment);
        if (!canonApplied) {
            foldBySection(masterQs);
        } else {
            augmentCanonNeighbors(masterQs, curTrack.analysis.canon_alignment);
        }
        storeBaseCanonMapping(masterQs);
        var maxPossible = masterQs && masterQs.length ? Math.max(1, masterQs.length - 1) : 1;
        if (canonSettings.minOffsetBeats >= maxPossible) {
            canonSettings.minOffsetBeats = Math.max(1, Math.min(maxPossible - 1, canonSettings.minOffsetBeats));
        }
        var autoMaxOffset;
        if (masterQs && masterQs.length) {
            var desired = Math.max(2, Math.round(masterQs.length * 0.6));
            autoMaxOffset = Math.min(maxPossible, Math.max(desired, canonSettings.minOffsetBeats + 1));
        } else {
            autoMaxOffset = 32;
        }
        canonSettings.maxOffsetBeats = autoMaxOffset;
        if (canonSettings.minOffsetBeats >= canonSettings.maxOffsetBeats) {
            canonSettings.minOffsetBeats = Math.max(1, Math.min(canonSettings.maxOffsetBeats - 1, Math.floor(canonSettings.maxOffsetBeats / 2)));
        }
        if (mode === "canon") {
            regenerateCanonMapping({ initial: true });
            if (typeof window.onCanonTrackReady === "function") {
                window.onCanonTrackReady({
                    beats: masterQs.length,
                    minOffsetBeats: canonSettings.minOffsetBeats,
                    maxOffsetBeats: canonSettings.maxOffsetBeats
                });
            }
        } else {
            if (eternalAdvancedEnabled) {
                regenerateEternalOverlay({ initial: true });
            } else {
                assignNormalizedVolumes(masterQs);
                drawConnections(masterQs);
            }
            if (typeof window.onCanonTrackReady === "function") {
                window.onCanonTrackReady(null);
            }
        }
    } else {
        _.each(masterQs, function(q) {
            q.other = q;
            q.otherGain = 0;
        });
        assignNormalizedVolumes(masterQs);
        if (typeof window.onCanonTrackReady === "function") {
            window.onCanonTrackReady(null);
        }
    }
    if (typeof window.onCanonModeChanged === "function") {
        window.onCanonModeChanged(canonAdvancedEnabled);
    }

    isTrackReady = true;
    $("#play").prop("disabled", false).text("Play");
    error("");
    setPlayingClass(mode);
    // Rebuild driver now that the full analysis is ready (needed for autoharmonizer/sculptor)
    rebuildDriverForCurrentMode(false);
    pulseNotes(baseNoteStrength);
    var modePillText = "Autocanonizer";
    if (mode === "jukebox") {
        modePillText = "Eternal Jukebox";
    } else if (mode === "eternal") {
        modePillText = "Eternal Canonizer";
    } else if (mode === "autoharmonizer") {
        modePillText = "Autoharmonizer";
    } else if (mode === "sculptor") {
        modePillText = "Section Sculptor";
    }
    $("#mode-pill").text(modePillText);

    // Show/hide eternal stats based on initial mode
    var eternalStatsContainer = $("#eternal-stats");
    if (eternalStatsContainer && eternalStatsContainer.length) {
        if (mode === "jukebox" || mode === "eternal") {
            eternalStatsContainer.show();
        } else {
            eternalStatsContainer.hide();
        }
    }

    info("ready!");
    if (mode === "jukebox") {
        info(getFullTitle() + " - Eternal Jukebox");
    } else if (mode === "eternal") {
        info(getFullTitle() + " - Eternal Canonizer");
    } else if (mode === "autoharmonizer") {
        info(getFullTitle() + " - Autoharmonizer");
    } else if (mode === "sculptor") {
        info(getFullTitle() + " - Section Sculptor");
    } else {
        info(getFullTitle() + " - Autocanonizer");
    }
    createTiles(masterQs);
}


function gotTheAnalysis(profile) {
    var status = get_status(profile);
    if (status == 'complete') {
        info("Loading track ...");
        var track = profile.response && profile.response.track;
        if (track && track.info && track.info.url) {
            track.info.url = resolveApiUrl(track.info.url);
        }
        remixer.remixTrack(profile.response.track, function(state, t, percent) {
            if (state == 1) {
                info("Here we go ...");
                setTimeout( function() { readyToPlay(t); }, 10);
            } else if (state == 0) {
                if (percent >= 99) {
                    info("Here we go ...");
                } else {
                    if (!isNaN(percent)) {
                        info( percent  + "% of track loaded ");
                    }
                }
            } else {
                info('Trouble  ' + t.status);
            }
        });
    } else if (status == 'error') {
        info("Sorry, couldn't analyze that track");
    }
}


function fetchAnalysis(trid) {
    isTrackReady = false;
    if (driver && driver.isRunning && driver.isRunning()) {
        driver.stop();
    }
    $("#play").prop("disabled", true).text("Loading...");
    var localUrl = resolveApiUrl('data/' + trid + '.json');
    var remoteUrl = 'http://static.echonest.com/infinite_jukebox_data/' + encodeURIComponent(trid) + '.json';
    info('Fetching the analysis');
    $.getJSON(localUrl, function(data) { gotTheAnalysis(data); })
        .fail(function() {
            $.getJSON(remoteUrl, function(data) { gotTheAnalysis(data); })
                .fail(function() {
                    var missingCombo = (mode === "autoharmonizer" && trid.indexOf('+') !== -1);
                    if (missingCombo) {
                        info("Combined autoharmonizer analysis not found. Please run the backend autoharmonizer build for " + trid + " first.");
                    } else {
                        info("Sorry, can't find info for that track");
                    }
                });
        });
}

function get_status(data) {
    if (data.response.status.code == 0) {
        return data.response.track.status;
    } else {
        return 'error';
    }
}


function isSegment(q) {
    return 'timbre' in q;
}


async function keydown(evt) {
    if (evt.which === 32) {
        evt.preventDefault();
        await togglePlayback();
    }
}

function urldecode(str) {
   return decodeURIComponent((str+'').replace(/\+/g, '%20'));
}

function getAudioContext() {
    if (window.webkitAudioContext) {
        return new webkitAudioContext();
    } else {
        return new AudioContext();
    }
}

function setDisplayMode() {
}

function setPlayingClass(modeName) {
    document.body.classList.remove("playing-canon", "playing-jukebox", "playing-eternal", "playing-autoharmonizer", "playing-sculptor");
    if (modeName === "canon") {
        document.body.classList.add("playing-canon");
        baseNoteStrength = 0.05;
    } else if (modeName === "jukebox") {
        document.body.classList.add("playing-jukebox");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "eternal") {
        document.body.classList.add("playing-jukebox");
        document.body.classList.add("playing-eternal");
        baseNoteStrength = 0.1;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "autoharmonizer") {
        document.body.classList.add("playing-autoharmonizer");
        baseNoteStrength = 0.12;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "sculptor") {
        document.body.classList.add("playing-sculptor");
        baseNoteStrength = 0.06;
    } else {
        baseNoteStrength = 0;
    }
    if (typeof window.setAdvancedPanelMode === "function") {
        window.setAdvancedPanelMode((modeName || "").toLowerCase());
    }
    if (typeof window.setCanonUiVisibility === "function") {
        window.setCanonUiVisibility(modeName === "canon");
    }
    rootStyle.setProperty("--note-strength", baseNoteStrength.toFixed(3));
    var baseAlpha = 0.12 + 0.35 * baseNoteStrength;
    rootStyle.setProperty("--note-alpha", baseAlpha.toFixed(3));
    if (modeName !== "jukebox" && modeName !== "eternal") {
        clearJukeboxBackdrop();
    }
}

function pulseNotes(strength) {
    var intensity = (typeof strength === "number") ? strength : baseNoteStrength;
    if (isNaN(intensity)) {
        intensity = baseNoteStrength;
    }
    intensity = Math.max(baseNoteStrength, Math.min(1, intensity));
    rootStyle.setProperty("--note-strength", intensity.toFixed(3));
    var alpha = 0.12 + 0.5 * intensity;
    rootStyle.setProperty("--note-alpha", alpha.toFixed(3));
    if (notePulseTimer) {
        clearTimeout(notePulseTimer);
    }
    var decayDelay = (mode === "jukebox" || mode === "eternal") ? 180 : 280;
    notePulseTimer = setTimeout(function() {
        rootStyle.setProperty("--note-strength", baseNoteStrength.toFixed(3));
        var baseAlpha = 0.12 + 0.35 * baseNoteStrength;
        rootStyle.setProperty("--note-alpha", baseAlpha.toFixed(3));
    }, decayDelay);
}

async function togglePlayback() {
    if (!driver || !isTrackReady) {
        return;
    }
    try {
        if (remixer && typeof remixer.ensureContext === "function") {
            await remixer.ensureContext();
        }
    } catch (ctxError) {
        console.error("Failed to resume audio context", ctxError);
        error("Unable to start audio playback. Check console for details.");
        return;
    }
    if (driver.isRunning()) {
        if (typeof driver.pause === "function") {
            driver.pause();
            markPlaybackPaused();
        } else {
            driver.stop();
            resetPlaybackState();
        }
        return;
    }
    if (canResumePlayback() && typeof driver.resume === "function") {
        driver.resume();
    } else {
        driver.start();
    }
    if (driver && typeof driver.isRunning === "function") {
        if (driver.isRunning()) {
            markPlaybackStarted();
        }
    } else {
        markPlaybackStarted();
    }
}

function init() {
    jQuery.ajaxSettings.traditional = true;  
    setDisplayMode(false);
    setPlayingClass(null);
    pulseNotes(baseNoteStrength);
    if (document.body && document.body.dataset && document.body.dataset.mode) {
        var bodyMode = document.body.dataset.mode.toLowerCase();
        if (bodyMode === "jukebox" || bodyMode === "canon" || bodyMode === "eternal" || bodyMode === "autoharmonizer" || bodyMode === "sculptor") {
            mode = bodyMode;
        }
    }

    window.oncontextmenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    };

    document.ondblclick = function DoubleClick(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    $("#error").hide();

    var playButton = $("#play");
    playButton.prop("disabled", true);
    playButton.on("click", async function(event) {
        event.preventDefault();
        await togglePlayback();
    });

    var usingOrbit = configureCanvasForMode();
    paper = Raphael("tiles", W, TH);
    syncOrbitContainerSize();
    if (usingOrbit) {
        renderOrbitBase();
    }
    $(document).keydown(keydown);


    if (window.webkitAudioContext === undefined && window.AudioContext === undefined) {
        error("Sorry, this app needs advanced web audio. Your browser doesn't"
            + " support it. Try the latest version of Chrome, Firefox (nightly)  or Safari");

        hideAll();

    } else {
        var context = getAudioContext();
        var initialTrid = processParams();
        applyModeLayout();
        remixer = createJRemixer(context, $);
        driver = Driver(remixer.getPlayer());

        // Load playlist queue from sessionStorage if available
        loadPlaylistQueue();

        if (initialTrid) {
            fetchAnalysis(initialTrid);
        } else {
            info("Load a track to begin.");
        }
    }

    window.addEventListener("resize", debounce(function() {
        if (mode === "jukebox" || mode === "eternal") {
            applyModeLayout();
        }
    }, 160));

    // Initialize Section Sculptor UI controls
    initSculptorControls();
}

function initSculptorControls() {
    var sculptorControls = $("#sculptor-controls");
    var sculptorTimeline = $("#sculptor-timeline-content");
    var sculptorTimelineEmpty = $("#sculptor-timeline-empty");
    var sculptorTimelineRoot = $("#sculptor-timeline");
    var sculptorPalette = $("#sculptor-palette");
    var sculptorQueueInfo = $("#sculptor-queue-info");
    var draggedElement = null;

    function computeDropIndexFromEvent(event) {
        var nativeEvent = event.originalEvent || event;
        if (!nativeEvent) {
            return 0;
        }
        var clientX = nativeEvent.clientX || 0;
        var clientY = nativeEvent.clientY || 0;
        var chips = sculptorTimeline.find(".sculptor-timeline-chip");
        if (!chips.length) {
            return 0;
        }
        var targetIndex = chips.length;
        var bestDistance = Infinity;
        chips.each(function(index, el) {
            var rect = el.getBoundingClientRect();
            var withinRow = clientY >= rect.top && clientY <= rect.bottom;
            var midpoint = rect.left + rect.width / 2;
            if (withinRow) {
                targetIndex = clientX < midpoint ? index : index + 1;
                bestDistance = 0;
                return false;
            }
            var dx = 0;
            if (clientX < rect.left) {
                dx = rect.left - clientX;
            } else if (clientX > rect.right) {
                dx = clientX - rect.right;
            }
            var dy = 0;
            if (clientY < rect.top) {
                dy = rect.top - clientY;
            } else if (clientY > rect.bottom) {
                dy = clientY - rect.bottom;
            }
            var distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                targetIndex = clientX < rect.left ? index : index + 1;
            }
        });
        return Math.max(0, Math.min(targetIndex, chips.length));
    }

    function handleTimelineDrop(event) {
        event.preventDefault();
        sculptorTimelineRoot.removeClass("is-drop-target");
        if (!draggedElement || !driver) {
            return;
        }
        var dropIndex = computeDropIndexFromEvent(event);
        if (draggedElement.fromTimeline && driver.moveSection) {
            if (dropIndex > draggedElement.queuePos) {
                dropIndex = Math.max(0, dropIndex - 1);
            }
            driver.moveSection(draggedElement.queuePos, dropIndex);
        } else if (!draggedElement.fromTimeline && driver.addSection) {
            driver.addSection(draggedElement.sectionIdx, dropIndex);
        }
        draggedElement = null;
        updateTimelineDisplay();
    }

    // Show/hide sculptor controls based on mode
    function updateSculptorVisibility() {
        if (mode === "sculptor") {
            sculptorControls.show().css("display", "flex").addClass("is-visible");
            initializeSculptorUI();
        } else {
            sculptorControls.removeClass("is-visible").hide();
        }
    }

    // Initialize the sculptor UI with sections palette
    function initializeSculptorUI() {
        if (!driver || !driver.getState || mode !== "sculptor") {
            return;
        }

        var state = driver.getState();
        if (!state || !state.sectionData) {
            sculptorPalette.html('<span style="color: #888; font-style: italic;">Load a track to see sections...</span>');
            return;
        }

        if (!state.sectionData.length) {
            sculptorPalette.html('<span style="color: #888; font-style: italic;">Load a track to see sections...</span>');
            sculptorTimelineEmpty.show();
            sculptorTimeline.empty();
            sculptorQueueInfo.text("0 sections in timeline");
            return;
        }

        // Build sections palette
        var paletteHTML = "";
        state.sectionData.forEach(function(section) {
            var color = getSectionColor(section.label);
            var displayLabel = getSectionDisplayName(section, { includeIndex: true });
            var meta = formatSectionMeta(section);
            paletteHTML += createSectionChip(section.index, displayLabel, color, false, { meta: meta });
        });

        sculptorPalette.html(paletteHTML);

        // Make palette sections draggable and clickable
        $(".sculptor-section-chip").each(function() {
            var chip = $(this);
            var sectionIdx = parseInt(chip.data("section-idx"));
            var section = state.sectionData[sectionIdx];

            // Click to preview
            chip.on("click", function() {
                previewSection(sectionIdx);
            });

            // Make draggable
            this.draggable = true;
            chip.on("dragstart", function(e) {
                draggedElement = {
                    sectionIdx: sectionIdx,
                    fromTimeline: false
                };
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.setData("text/plain", sectionIdx);
                    e.originalEvent.dataTransfer.effectAllowed = "copy";
                }
                chip.addClass("is-dragging");
            });

            chip.on("dragend", function() {
                chip.removeClass("is-dragging");
                draggedElement = null;
            });
        });

        // Update timeline display
        updateTimelineDisplay();
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Create a section chip HTML
    function createSectionChip(sectionIdx, label, color, isTimeline, options) {
        options = options || {};
        var classes = ["sculptor-chip", isTimeline ? "sculptor-timeline-chip" : "sculptor-section-chip"];
        if (options.isPlaying) {
            classes.push("playing");
        }
        if (options.isNext) {
            classes.push("up-next");
        }
        var removeBtn = "";
        if (isTimeline) {
            var removeLabel = "Remove " + label + " from timeline";
            removeBtn =
                '<button type="button" class="sculptor-chip-remove" data-queue-pos="' +
                options.queuePos +
                '" aria-label="' +
                escapeHtml(removeLabel) +
                '">&times;</button>';
        }
        var metaMarkup = options.meta
            ? '<span class="sculptor-chip-meta">' + escapeHtml(options.meta) + "</span>"
            : "";

        var styleAttr = color ? ' style="--chip-accent:' + color + ';"' : "";
        var attrs =
            ' data-section-idx="' +
            sectionIdx +
            '"' +
            (isTimeline ? ' data-queue-pos="' + options.queuePos + '"' : "");
        return (
            '<div class="' +
            classes.join(" ") +
            '"' +
            attrs +
            styleAttr +
            ' draggable="true">' +
            '<span class="sculptor-chip-marker"></span>' +
            '<div class="sculptor-chip-body">' +
            '<span class="sculptor-chip-label">' +
            escapeHtml(label) +
            "</span>" +
            metaMarkup +
            "</div>" +
            removeBtn +
            "</div>"
        );
    }

    // Preview a section (play it once)
    function previewSection(sectionIdx) {
        if (driver && typeof driver.previewSection === "function") {
            driver.previewSection(sectionIdx);
            return;
        }
        console.warn("[Section Sculptor] Driver preview unavailable");
    }

    // Update timeline display
    function updateTimelineDisplay() {
        if (!driver || !driver.getState) return;

        var state = driver.getState();
        if (!state || !state.sectionQueue || !state.sectionData) return;

        // Update info text
        var queueLabel = state.sectionQueue.length === 1 ? "section" : "sections";
        var infoParts = [state.sectionQueue.length + " " + queueLabel + " queued"];
        if (state.running && typeof state.currentSection === "number") {
            var playingIndex = state.sectionQueue[state.currentSection];
            var playingSection = typeof playingIndex === "number" ? state.sectionData[playingIndex] : null;
            if (playingSection) {
                infoParts.push("Playing: " + getSectionDisplayName(playingSection, { includeIndex: true }));
            }
        }
        if (typeof state.nextSection === "number") {
            var nextIndex = state.sectionQueue[state.nextSection];
            var nextSection = typeof nextIndex === "number" ? state.sectionData[nextIndex] : null;
            if (nextSection) {
                infoParts.push("Next: " + getSectionDisplayName(nextSection, { includeIndex: true }));
            }
        }
        sculptorQueueInfo.text(infoParts.join(" \u00B7 "));

        // Show/hide empty message
        if (state.sectionQueue.length === 0) {
            sculptorTimelineEmpty.show();
            sculptorTimeline.empty();
            return;
        }

        sculptorTimelineEmpty.hide();

        // Build timeline display
        var html = "";
        var nextQueuePos = (typeof state.nextSection === "number") ? state.nextSection : null;
        state.sectionQueue.forEach(function(sectionIdx, queuePos) {
            var section = state.sectionData[sectionIdx];
            if (!section) {
                return;
            }
            var isPlaying = state.running && queuePos === state.currentSection;
            var isNext = state.running && queuePos === nextQueuePos;
            var color = getSectionColor(section.label);
            var displayLabel = getSectionDisplayName(section, { includeIndex: true });
            var meta = formatSectionMeta(section, { includeQueueSlot: true, queuePos: queuePos });

            html += createSectionChip(sectionIdx, displayLabel, color, true, {
                queuePos: queuePos,
                meta: meta,
                isPlaying: isPlaying,
                isNext: isNext
            });
        });

        sculptorTimeline.html(html);

        // Bind remove handlers
        $(".sculptor-chip-remove").on("click", function(e) {
            e.stopPropagation();
            var queuePos = parseInt($(this).data("queue-pos"));
            if (driver && driver.removeSection) {
                driver.removeSection(queuePos);
                updateTimelineDisplay();
            }
        });

        // Make timeline chips draggable (for reordering)
        $(".sculptor-timeline-chip").each(function() {
            var chip = $(this);
            var queuePos = parseInt(chip.data("queue-pos"));
            var sectionIdx = parseInt(chip.data("section-idx"));

            chip.on("dragstart", function(e) {
                draggedElement = {
                    sectionIdx: sectionIdx,
                    queuePos: queuePos,
                    fromTimeline: true
                };
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.setData("text/plain", sectionIdx);
                    e.originalEvent.dataTransfer.effectAllowed = "move";
                }
                chip.addClass("is-dragging");
            });

            chip.on("dragend", function() {
                chip.removeClass("is-dragging");
                draggedElement = null;
            });

            // Click to jump during playback
            chip.on("click", function(e) {
                if ($(e.target).hasClass("sculptor-chip-remove")) {
                    return;
                }
                if (driver && driver.jumpToQueuePosition) {
                    driver.jumpToQueuePosition(queuePos);
                }
            });
        });
    }

    function getSectionColor(label) {
        var colors = {
            "Intro": "#4A90E2",
            "Verse": "#50C878",
            "Pre-Chorus": "#FFA500",
            "Chorus": "#E74C3C",
            "Bridge": "#9B59B6",
            "Outro": "#95A5A6"
        };
        return colors[label] || "#7F8C8D";
    }

    function getSectionDisplayName(section, options) {
        options = options || {};
        if (!section) {
            return "Section";
        }
        var parts = [];
        parts.push(section.label || "Section");
        if (options.includeIndex && typeof section.index === "number") {
            parts.push("#" + (section.index + 1));
        }
        return parts.join(" ");
    }

    function formatSectionMeta(section, metaOptions) {
        metaOptions = metaOptions || {};
        if (!section) {
            return "";
        }
        var parts = [];
        if (metaOptions.includeQueueSlot && typeof metaOptions.queuePos === "number") {
            parts.push("Slot " + (metaOptions.queuePos + 1));
        }
        if (typeof section.start === "number") {
            parts.push(fmtTime(section.start));
        }
        if (typeof section.duration === "number") {
            parts.push(section.duration.toFixed(1) + "s");
        }
        return parts.join(" \u00B7 ");
    }

    // Setup drop zone for timeline
    sculptorTimelineRoot.on("dragover", function(e) {
        if (!draggedElement) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.originalEvent && e.originalEvent.dataTransfer) {
            e.originalEvent.dataTransfer.dropEffect = draggedElement.fromTimeline ? "move" : "copy";
        }
        $(this).addClass("is-drop-target");
    });

    sculptorTimelineRoot.on("dragleave", function(e) {
        if (e.target === this) {
            $(this).removeClass("is-drop-target");
        }
    });

    sculptorTimelineRoot.on("drop", function(e) {
        handleTimelineDrop(e);
        $(this).removeClass("is-drop-target");
    });

    // Button handlers
    $("#sculptor-reset-btn").on("click", function() {
        if (driver && driver.resetQueue) {
            driver.resetQueue();
            updateTimelineDisplay();
        }
    });

    $("#sculptor-clear-btn").on("click", function() {
        if (driver && driver.clearQueue) {
            driver.clearQueue();
            updateTimelineDisplay();
        }
    });

    $("#sculptor-shuffle-btn").on("click", function() {
        if (driver && driver.shuffleQueue) {
            driver.shuffleQueue();
            updateTimelineDisplay();
        }
    });

    // Mode change listener
    $("#viz-mode-select").on("change", function() {
        updateSculptorVisibility();
    });

    // Update display periodically when sculptor mode is active
    setInterval(function() {
        if (mode === "sculptor") {
            updateTimelineDisplay();
        }
    }, 1000);

    // Initial visibility
    updateSculptorVisibility();

    // Expose update function globally so tiles can call it
    window.updateSculptorQueueDisplay = updateTimelineDisplay;
    window.refreshSculptorPalette = initializeSculptorUI;
}

function loadPlaylistQueue() {
    try {
        var queueData = sessionStorage.getItem('playlistQueue');
        if (queueData) {
            var tracks = JSON.parse(queueData);
            console.log('[Queue] Loading playlist from sessionStorage:', tracks.length, 'tracks');

            tracks.forEach(function(track) {
                addToQueue(track.id, track.title, track.artist);
            });

            // Find current track and set queue index
            if (curTrack && curTrack.id) {
                for (var i = 0; i < trackQueue.length; i++) {
                    if (trackQueue[i].id === curTrack.id) {
                        currentQueueIndex = i;
                        break;
                    }
                }
            } else if (trackQueue.length > 0) {
                currentQueueIndex = 0;
            }

            if (currentQueueIndex >= 0) {
                selectedQueueIndex = currentQueueIndex;
            } else if (trackQueue.length > 0) {
                selectedQueueIndex = 0;
            }

            // Enable auto-play for playlists
            autoPlayNext = true;
            updateQueueUI();

            // Clear from sessionStorage after loading
            sessionStorage.removeItem('playlistQueue');
        }
    } catch (e) {
        console.error('[Queue] Failed to load playlist:', e);
    }
}


function showPlotPage(trid) {
    var url = location.protocol + "//" +
                location.host + location.pathname + "?trid=" + trid;
    location.href = url;
}


// Queue Management Functions
function addToQueue(trackId, title, artist) {
    var wasEmpty = trackQueue.length === 0;
    trackQueue.push({
        id: trackId,
        title: title || "Unknown Track",
        artist: artist || "Unknown Artist"
    });

    if (trackQueue.length === 1) {
        selectedQueueIndex = 0;
    } else if (currentQueueIndex === -1 && wasEmpty) {
        selectedQueueIndex = trackQueue.length - 1;
    }

    updateQueueUI();
    console.log('[Queue] Added track:', title, '| Queue length:', trackQueue.length);
}

function selectQueueIndex(index) {
    if (index < 0 || index >= trackQueue.length) {
        return;
    }
    selectedQueueIndex = index;
    updateQueueUI();
}

function selectQueueOffset(delta) {
    if (!trackQueue.length) {
        return;
    }
    if (selectedQueueIndex === -1) {
        selectedQueueIndex = delta > 0 ? 0 : trackQueue.length - 1;
    } else {
        selectedQueueIndex = Math.min(
            trackQueue.length - 1,
            Math.max(0, selectedQueueIndex + delta)
        );
    }
    updateQueueUI();
}

function playQueueIndex(index) {
    if (index < 0 || index >= trackQueue.length) {
        return false;
    }
    var target = trackQueue[index];
    selectedQueueIndex = index;
    currentQueueIndex = index;
    autoPlayNext = true;
    loadTrack(target.id);
    updateQueueUI();
    return true;
}

function playNextInQueue() {
    if (!trackQueue.length) {
        return false;
    }
    var nextIndex = currentQueueIndex === -1 ? 0 : currentQueueIndex + 1;
    if (nextIndex >= trackQueue.length) {
        console.log('[Queue] No more tracks in queue');
        return false;
    }
    return playQueueIndex(nextIndex);
}

function playPreviousInQueue() {
    if (!trackQueue.length) {
        return false;
    }
    var prevIndex = currentQueueIndex === -1 ? -1 : currentQueueIndex - 1;
    if (prevIndex < 0) {
        return false;
    }
    return playQueueIndex(prevIndex);
}

function removeFromQueue(index) {
    if (index < 0 || index >= trackQueue.length) {
        return;
    }
    var removed = trackQueue.splice(index, 1)[0];

    if (index < currentQueueIndex) {
        currentQueueIndex--;
    } else if (index === currentQueueIndex) {
        currentQueueIndex = -1;
    }

    if (index < selectedQueueIndex) {
        selectedQueueIndex--;
    } else if (index === selectedQueueIndex) {
        selectedQueueIndex = -1;
    }

    if (!trackQueue.length) {
        currentQueueIndex = -1;
        selectedQueueIndex = -1;
        autoPlayNext = false;
    } else if (selectedQueueIndex === -1) {
        selectedQueueIndex = Math.min(
            currentQueueIndex !== -1 ? currentQueueIndex : trackQueue.length - 1,
            trackQueue.length - 1
        );
    }

    updateQueueUI();
    console.log('[Queue] Removed track:', removed.title);
}

function clearQueue() {
    trackQueue = [];
    currentQueueIndex = -1;
    selectedQueueIndex = -1;
    autoPlayNext = false;
    updateQueueUI();
    console.log('[Queue] Cleared');
}

function updateQueueControls() {
    var prevBtn = $("#queue-prev-btn");
    var playBtn = $("#queue-play-btn");
    var nextBtn = $("#queue-next-btn");

    var hasQueue = trackQueue.length > 0;
    var hasSelection = hasQueue && selectedQueueIndex >= 0 && selectedQueueIndex < trackQueue.length;

    prevBtn.prop("disabled", !hasSelection || selectedQueueIndex <= 0);
    nextBtn.prop("disabled", !hasSelection || selectedQueueIndex >= trackQueue.length - 1);
    playBtn.prop("disabled", !hasSelection || selectedQueueIndex === currentQueueIndex);
}

function updateQueueUI() {
    var queueContainer = $("#queue-container");
    var queueList = $("#queue-list");
    var playbackShell = $("#playback-shell");

    if (!queueContainer.length || !queueList.length) {
        return;
    }

    if (trackQueue.length === 0) {
        queueContainer.hide();
        playbackShell.removeClass("has-queue");
        queueList.empty();
        updateQueueControls();
        return;
    }

    if (selectedQueueIndex < 0 || selectedQueueIndex >= trackQueue.length) {
        if (currentQueueIndex >= 0 && currentQueueIndex < trackQueue.length) {
            selectedQueueIndex = currentQueueIndex;
        } else {
            selectedQueueIndex = 0;
        }
    }

    playbackShell.addClass("has-queue");
    queueContainer.css("display", "flex");
    queueList.empty();

    var selectedElement = null;

    trackQueue.forEach(function(track, index) {
        var item = $("<div>").addClass("queue-item");
        var isPlaying = index === currentQueueIndex;
        var isSelected = index === selectedQueueIndex;

        if (isPlaying) {
            item.addClass("playing");
        }
        if (isSelected) {
            item.addClass("selected");
            selectedElement = item;
        }

        item.on("click", function() {
            selectQueueIndex(index);
        });

        var info = $("<div>").addClass("queue-item-info");
        info.append($("<div>").addClass("queue-item-title").text(track.title));
        info.append($("<div>").addClass("queue-item-artist").text(track.artist));

        var actions = $("<div>").addClass("queue-item-actions");
        var playBtn = $("<button>")
            .addClass("queue-btn queue-btn-play")
            .text(isPlaying ? "Playing" : "Play")
            .prop("disabled", isPlaying)
            .on("click", function(e) {
                e.stopPropagation();
                playQueueIndex(index);
            });

        var removeBtn = $("<button>")
            .addClass("queue-btn queue-btn-remove")
            .text("Remove")
            .on("click", function(e) {
                e.stopPropagation();
                removeFromQueue(index);
            });

        actions.append(playBtn, removeBtn);

        item.append(info, actions);
        queueList.append(item);
    });

    if (selectedElement && selectedElement[0]) {
        requestAnimationFrame(function() {
            selectedElement[0].scrollIntoView({ block: "nearest" });
        });
    }

    updateQueueControls();
}
window.addToQueue = addToQueue;
window.playNextInQueue = playNextInQueue;
window.playPreviousInQueue = playPreviousInQueue;
window.clearQueue = clearQueue;

// Queue modal handling
$(document).ready(function() {
    var queueModal = $("#queue-modal");
    var queueModalStatus = $("#queue-modal-status");
    var queueSourceToggle = $("#queue-source-toggle");
    var currentQueueSource = "youtube";
    var queueModalShouldPersist = false;

    function resetQueueModalForm() {
        $("#queue-youtube-url-input").val("");
        $("#queue-drive-url-input").val("");
        $("#queue-spotify-url-input").val("");
        $("#queue-soundcloud-url-input").val("");

        var fileInput = document.getElementById('queue-audio-file-input');
        if (fileInput) {
            fileInput.value = "";
        }
        $("#queue-file-upload-name").text("No file chosen");

        queueSourceToggle.find("button").removeClass("active");
        queueSourceToggle.find('[data-source="youtube"]').addClass("active");
        $(".queue-source-pane").hide();
        $("#queue-youtube-pane").show();
        currentQueueSource = "youtube";

        queueModalStatus.removeClass("visible error success info").text("");
        queueModalShouldPersist = false;
    }

    function markQueueModalDirty() {
        queueModalShouldPersist = true;
    }

    // Initialize modal state
    resetQueueModalForm();

    // Source toggle buttons
    queueSourceToggle.find("button").click(function() {
        var source = $(this).data("source");
        queueSourceToggle.find("button").removeClass("active");
        $(this).addClass("active");
        currentQueueSource = source;

        $(".queue-source-pane").hide();
        $("#queue-" + source + "-pane").show();
        markQueueModalDirty();
    });

    // File upload button for queue
    $("#queue-file-upload-button").click(function() {
        $("#queue-audio-file-input").click();
    });

    $("#queue-audio-file-input").change(function() {
        if (this.files.length > 0) {
            $("#queue-file-upload-name").text(this.files[0].name);
        } else {
            $("#queue-file-upload-name").text("No file chosen");
        }
        markQueueModalDirty();
    });

    $("#queue-youtube-url-input, #queue-drive-url-input, #queue-spotify-url-input, #queue-soundcloud-url-input").on("input", markQueueModalDirty);

    // Add to queue button handler
    $("#add-to-queue-btn").click(function() {
        if (!queueModalShouldPersist) {
            resetQueueModalForm();
        }
        queueModal.show();
    });

    // Close modal handlers
    $("#queue-modal-close, #queue-modal-cancel").click(function() {
        queueModal.hide();
    });

    // Click outside modal to close
    queueModal.click(function(e) {
        if (e.target === queueModal[0]) {
            queueModal.hide();
        }
    });

    $("#queue-modal-reset").click(function() {
        resetQueueModalForm();
        queueModalStatus.removeClass("visible");
    });

    // Submit handler
    $("#queue-modal-submit").click(async function() {
        queueModalShouldPersist = true;
        queueModalStatus.addClass("visible info").removeClass("error success").text("Processing...");

        try {
            var formData = new FormData();
            formData.append('source', currentQueueSource);
            formData.append('algorithm', mode);

            var url = null;
            var fileInput = document.getElementById('queue-audio-file-input');

            if (currentQueueSource === 'upload') {
                if (!fileInput.files || fileInput.files.length === 0) {
                    queueModalStatus.addClass("visible error").removeClass("info").text("Please choose a file");
                    return;
                }
                formData.append('audio', fileInput.files[0]);
            } else if (currentQueueSource === 'youtube') {
                url = $("#queue-youtube-url-input").val().trim();
                if (!url) {
                    queueModalStatus.addClass("visible error").removeClass("info").text("Please enter a URL");
                    return;
                }
                formData.append('youtube_url', url);
            } else if (currentQueueSource === 'drive') {
                url = $("#queue-drive-url-input").val().trim();
                if (!url) {
                    queueModalStatus.addClass("visible error").removeClass("info").text("Please enter a URL");
                    return;
                }
                formData.append('drive_url', url);
            } else if (currentQueueSource === 'spotify') {
                url = $("#queue-spotify-url-input").val().trim();
                if (!url) {
                    queueModalStatus.addClass("visible error").removeClass("info").text("Please enter a URL");
                    return;
                }
                formData.append('spotify_url', url);
            } else if (currentQueueSource === 'soundcloud') {
                url = $("#queue-soundcloud-url-input").val().trim();
                if (!url) {
                    queueModalStatus.addClass("visible error").removeClass("info").text("Please enter a URL");
                    return;
                }
                formData.append('soundcloud_url', url);
            }

            if (currentQueueSource !== 'upload') {
                markQueueModalDirty();
            }

            // Check if YouTube URL is a playlist
            if (currentQueueSource === 'youtube' && url) {
                if (url.includes('list=') || url.includes('playlist')) {
                    var playlistResponse = await fetch('/api/playlist-info', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: url })
                    });

                    var playlistData = await playlistResponse.json();

                    if (playlistData.is_playlist && playlistData.entries && playlistData.entries.length > 0) {
                        queueModalStatus.text(`Found playlist with ${playlistData.entries.length} tracks. Processing...`);

                        for (var i = 0; i < playlistData.entries.length; i++) {
                            var entry = playlistData.entries[i];
                            queueModalStatus.text(`Processing ${i + 1}/${playlistData.entries.length}: ${entry.title}`);

                            var entryFormData = new FormData();
                            entryFormData.append('source', 'youtube');
                            entryFormData.append('youtube_url', entry.url);
                            entryFormData.append('algorithm', mode);

                            var response = await fetch('/api/process', {
                                method: 'POST',
                                body: entryFormData
                            });

                            var data = await response.json();
                            if (data.trackId) {
                                addToQueue(data.trackId, entry.title, 'YouTube');
                            }
                        }

                        queueModalStatus.addClass("success").removeClass("info").text(`Added ${playlistData.entries.length} tracks to queue!`);
                        setTimeout(function() {
                            queueModal.hide();
                            resetQueueModalForm();
                        }, 1500);
                        return;
                    }
                }
            }

            // Process single track
            queueModalStatus.text("Processing track...");

            var response = await fetch('/api/process', {
                method: 'POST',
                body: formData
            });

            var data = await response.json();
            if (response.ok && data.trackId) {
                var trackTitle = data.title || (currentQueueSource === 'upload' && fileInput && fileInput.files.length ? fileInput.files[0].name : 'Track');
                var trackArtist = data.artist || currentQueueSource.charAt(0).toUpperCase() + currentQueueSource.slice(1);
                addToQueue(data.trackId, trackTitle, trackArtist);
                queueModalStatus.addClass("success").removeClass("info").text("Track added to queue!");
                setTimeout(function() {
                    queueModal.hide();
                    resetQueueModalForm();
                }, 1500);
            } else {
                queueModalStatus.addClass("error").removeClass("info").text(data.error || "Failed to process track");
            }
        } catch (error) {
            console.error('Queue modal error:', error);
            queueModalStatus.addClass("error").removeClass("info success").text("Error: " + error.message);
        }
    });

    $("#queue-prev-btn").click(function() {
        selectQueueOffset(-1);
    });

    $("#queue-next-btn").click(function() {
        selectQueueOffset(1);
    });

    $("#queue-play-btn").click(function() {
        if (selectedQueueIndex >= 0) {
            playQueueIndex(selectedQueueIndex);
        }
    });

    // Clear queue button handler
    $("#clear-queue-btn").click(function() {
        clearQueue();
    });

    // Minimize queue button handler
    $("#queue-minimize-btn").click(function() {
        $("#queue-container").toggleClass("minimized");
        var minimizeBtn = $("#queue-minimize-btn");
        if ($("#queue-container").hasClass("minimized")) {
            minimizeBtn.html("Ã¢â€“Â¡");
        } else {
            minimizeBtn.html("Ã¢Ë†â€™");
        }
    });

    // Visualization maximize toggle
    var vizMaxButton = $("#viz-minimize-btn");
    vizMaxButton.on("click", function() {
        var body = $("body");
        var maximized = !body.hasClass("viz-maximized");
        body.toggleClass("viz-maximized", maximized);
        vizMaxButton
            .text(maximized ? "Exit Fullscreen" : "Maximize Player")
            .attr("aria-pressed", maximized ? "true" : "false");
    });

    // Close queue button handler
    $("#queue-close-btn").click(function() {
        $("#queue-container").hide();
        // Remove minimized class when closing
        $("#queue-container").removeClass("minimized");
        $("#queue-minimize-btn").html("Ã¢Ë†â€™");
    });

    // Make queue window draggable
    (function initQueueDrag() {
        var queueContainer = document.getElementById('queue-container');
        var dragHandle = queueContainer.querySelector('.queue-drag-handle');
        var isDragging = false;
        var currentX, currentY, initialX, initialY;
        var xOffset = 0, yOffset = 0;

        dragHandle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            setTranslate(currentX, currentY, queueContainer);
        }

        function dragEnd() {
            isDragging = false;
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
        }
    })();

    // Enter key to submit for URL inputs
    $("#queue-youtube-url-input, #queue-drive-url-input, #queue-spotify-url-input, #queue-soundcloud-url-input").keypress(function(e) {
        if (e.which === 13) {
            $("#queue-modal-submit").click();
        }
    });

    updateQueueControls();
});

function setURL() {
    if (curTrack) {
        var params = new URLSearchParams();
        if (curTrack.id) {
            params.set("trid", curTrack.id);
        }
        params.set("mode", mode);
        history.replaceState({}, document.title, "?" + params.toString());
    }
    tweetSetup(curTrack);
}

function tweetSetup(t) {
    return;

}

function setSpeedFactor(factor) {
    if (driver && driver.player && typeof driver.player.setSpeedFactor === "function") {
        driver.player.setSpeedFactor(factor);
    }
    var speedDisplay = $("#speed");
    if (speedDisplay.length) {
        speedDisplay.text(Math.round(factor * 100));
    }
}

function processParams() {
    var params = new URLSearchParams(window.location.search);
    var requestedMode = params.get("mode");
    if (requestedMode) {
        requestedMode = requestedMode.toLowerCase();
    }
    if (requestedMode === "jukebox" || requestedMode === "canon" || requestedMode === "eternal" || requestedMode === "autoharmonizer" || requestedMode === "sculptor") {
        mode = requestedMode;
    }
    var trid = params.get("trid");
    if (trid) {
        trid = trid.trim();
        trid = trid.replace(/\s+/g, "+");
    }
    return trid || null;
}

var tilePrototype = {
    normalColor:"#5f9",

    move: function(x,y)  {
        this.rect.attr( { x:x, y:y});
        this.x = x;
        this.y = y;
    },

    play:function(force) {
        var engine = driver && driver.player ? driver.player : null;
        if (force || shifted) {
            this.playStyle();
            if (engine && typeof engine.playQ === "function") {
                engine.playQ(this.q);
            }
        } else if (controlled) {
            this.queueStyle();
            if (driver && typeof driver.setNextQ === "function") {
                driver.setNextQ(this.q);
            }
        } else {
            this.selectStyle();
        }
        if (force) {
            info("Selected tile " + this.q.which);
            selectedTile = this;
        }
    },


    pos: function() {
        return {
            x: this.x,
            y: this.y
        }
    },

    selectStyle: function() {
        this.rect.attr("fill", "#C9a");
    },

    queueStyle: function() {
        this.rect.attr("fill", "#aFF");
    },

    playStyle: function() {
        this.rect.attr("fill", "#FF9");
    },

    normal: function() {
        this.rect.attr("fill", this.normalColor);
        this.rect.attr("stroke", this.normalColor);
    },

    highlight: function() {
        this.rect.attr("fill", masterColor);
        this.rect.attr("stroke", masterColor);
    },

    highlight2: function(color) {
        var fill = color || otherColor;
        this.rect.attr("fill", fill);
        this.rect.attr("stroke", fill);
    },

    unplay: function() {
        this.normal();
        if (shifted) {
            var engine = driver && driver.player ? driver.player : null;
            if (engine && typeof engine.stop === "function") {
                engine.stop();
            }
        }
    },

    init:function() {
        var that = this;
        this.rect.mousedown(async function(event) {
            event.preventDefault();
            if (driver && typeof driver.setNextQ === "function") {
                driver.setNextQ(that.q);
            }
            if (!driver.isRunning()) {
                try {
                    if (remixer && typeof remixer.ensureContext === "function") {
                        await remixer.ensureContext();
                    }
                    driver.resume();
                    markPlaybackStarted();
                } catch (ctxError) {
                    console.error("Failed to resume audio context", ctxError);
                    error("Unable to start audio playback. Check console for details.");
                }
            } 
        });
    }
}


function normalizeColor() {

    var qlist = curTrack.analysis.segments;
    for (var i = 0; i < qlist.length; i++) {
        for (var j = 0; j < 3; j++) {
            var t = qlist[i].timbre[j];

            if (t < cmin[j]) {
                cmin[j] = t;
            }
            if (t > cmax[j]) {
                cmax[j] = t;
            }
        }
    }
}

function getColor(seg) {
    var results = []
    for (var i = 0; i < 3; i++) {
        var t = seg.timbre[i];
        var norm = (t - cmin[i]) / (cmax[i] - cmin[i]);
        results[i] = norm * 255;
    }
    return to_rgb(results[2], results[1], results[0]);
}

function convert(value) { 
    var integer = Math.round(value);
    var str = Number(integer).toString(16); 
    return str.length == 1 ? "0" + str : str; 
};

function to_rgb(r, g, b) { 
    return "#" + convert(r) + convert(g) + convert(b); 
}

function getQuantumColor(q) {
    if (isSegment(q)) {
        return getSegmentColor(q);
    } else {
        q = getQuantumSegment(q);
        if (q != null) {
            return getSegmentColor(q);
        } else {
            return "#333";
        }
    }
}

function getQuantumSegment(q) {
    if (q.oseg) {
        return q.oseg;
    } else {
        return getQuantumSegmentOld(q);
    }
}

function getQuantumSegmentOld(q) {
    while (! isSegment(q) ) {
        if ('children' in q && q.children.length > 0) {
            q = q.children[0]
        } else {
            break;
        }
    }

    if (isSegment(q)) {
        return q;
    } else {
        return null;
    }
}


function isSegment(q) {
    return 'timbre' in q;
}

function getSegmentColor(seg) {
    return getColor(seg);
}

function resetTileColors(qlist) {
    _.each(qlist, function(q) {
        q.tile.normal();
    });
}

function createTile(which, q, x, y, width, height) {
    var tile = Object.create(tilePrototype);
    tile.which = which;
    tile.width = width;
    tile.height = height;
    tile.normalColor = getQuantumColor(q);
    tile.rect = paper.rect(x, y, tile.width, tile.height);
    tile.rect.tile = tile;
    tile.normal();
    tile.q = q;
    tile.init();
    q.tile = tile
    return tile;
}

function collectVisualizationLoops(limit) {
    var edges = [];
    if (canonLoopCandidates && canonLoopCandidates.length) {
        _.each(canonLoopCandidates, function(loop) {
            if (!loop) {
                return;
            }
            var src = loop.source_start;
            var dst = loop.target_start;
            var sim = (typeof loop.similarity === "number") ? loop.similarity : 0;
            if (typeof src === "number" && typeof dst === "number" && src !== dst) {
                edges.push({ source: src, target: dst, similarity: sim });
            }
        });
    } else {
        _.each(serverLoopCandidateMap, function(entries, key) {
            var src = parseInt(key, 10);
            if (isNaN(src)) {
                return;
            }
            _.each(entries, function(entry) {
                if (!entry) {
                    return;
                }
                var dst = entry.target;
                var sim = (typeof entry.similarity === "number") ? entry.similarity : 0;
                if (typeof dst === "number" && src !== dst) {
                    edges.push({ source: src, target: dst, similarity: sim });
                }
            });
        });
    }
    edges = _.filter(edges, function(edge) {
        return edge.source >= 0 && edge.target >= 0;
    });
    edges = _.sortBy(edges, function(edge) { return -edge.similarity; });
    if (limit && edges.length > limit) {
        edges = edges.slice(0, limit);
    }
    return edges;
}

function drawLoopConnections(qlist, edges, isEternalMode) {
    clearLoopPaths();
    if (!edges || !edges.length) {
        return;
    }
    var TW = W - hPad;
    var baseY = H + 30;
    var maxSpan = 1;
    var normalized = [];
    _.each(edges, function(edge) {
        if (edge.source >= qlist.length || edge.target >= qlist.length) {
            return;
        }
        var qSrc = qlist[edge.source];
        var qDst = qlist[edge.target];
        if (!qSrc || !qDst) {
            return;
        }
        var span = Math.abs(edge.target - edge.source);
        if (span > maxSpan) {
            maxSpan = span;
        }
        normalized.push({
            sourceBeat: qSrc,
            targetBeat: qDst,
            similarity: (typeof edge.similarity === "number") ? edge.similarity : 0,
            span: span
        });
    });
    if (!normalized.length) {
        return;
    }
    maxSpan = Math.max(1, maxSpan);

    // Use different colors for eternal mode vs jukebox mode
    var loopColor = isEternalMode ? "#F0A86B" : "#6B8AF0"; // Orange for eternal, blue for jukebox

    _.each(normalized, function(info, idx) {
        var qSrc = info.sourceBeat;
        var qDst = info.targetBeat;
        var x1 = hPad + TW * qSrc.start / trackDuration;
        var x2 = hPad + TW * qDst.start / trackDuration;
        var y = H - 6;
        var spanRatio = info.span / maxSpan;
        var arcHeight = baseY + 40 + spanRatio * 140 + (idx % 6) * 14;
        var cx = (x1 + x2) / 2;
        var pathString = "M" + x1 + " " + y + " S " + cx + " " + arcHeight + " " + x2 + " " + y;
        var path = paper.path(pathString);
        var simNorm = Math.max(0, Math.min(1, (info.similarity + 1) / 2));
        var strokeWidth = 1.4 + simNorm * 2.6;
        var opacity = 0.18 + simNorm * 0.55;
        path.attr({
            stroke: loopColor,
            "stroke-width": strokeWidth,
            "stroke-opacity": opacity
        });
        loopPaths.push(path);
    });
}

function drawCircularLoopConnections(qlist, edges) {
    clearLoopPaths();
    if (!edges || !edges.length) {
        return;
    }
    var radius = getCircularRadius();
    var centerPoint = getCircularCenter();
    var isEternalMode = mode === "eternal";
    var loopColor = isEternalMode ? "#F0A86B" : "#6B8AF0";

    // Calculate control point offset - arcs should curve inward but not cut through circle
    var controlRadiusRatio = 0.3; // Control point at 30% of radius from center

    _.each(edges, function(edge) {
        if (edge.source >= qlist.length || edge.target >= qlist.length) {
            return;
        }
        var qSrc = qlist[edge.source];
        var qDst = qlist[edge.target];
        if (!qSrc || !qDst) {
            return;
        }
        var srcPoint = getCircularPoint(qSrc, radius);
        var dstPoint = getCircularPoint(qDst, radius);

        // Calculate midpoint angle between source and destination
        var srcAngle = srcPoint.angle || getCircularAngle(qSrc);
        var dstAngle = dstPoint.angle || getCircularAngle(qDst);

        // Find shortest path between angles
        var angleDiff = dstAngle - srcAngle;
        if (angleDiff > Math.PI) {
            angleDiff -= 2 * Math.PI;
        } else if (angleDiff < -Math.PI) {
            angleDiff += 2 * Math.PI;
        }
        var midAngle = srcAngle + angleDiff / 2;

        // Place control point at reduced radius to curve inside but not cut through
        var controlRadius = radius * controlRadiusRatio;
        var controlPoint = {
            x: centerPoint.x + Math.cos(midAngle) * controlRadius,
            y: centerPoint.y + Math.sin(midAngle) * controlRadius
        };

        var pathString = [
            "M", srcPoint.x, srcPoint.y,
            "Q", controlPoint.x, controlPoint.y,
            dstPoint.x, dstPoint.y
        ].join(" ");
        var path = paper.path(pathString);
        var simNorm = Math.max(0, Math.min(1, (edge.similarity + 1) / 2));
        var strokeWidth = 1.2 + simNorm * 2.4;
        var opacity = 0.16 + simNorm * 0.5;
        path.attr({
            stroke: loopColor,
            "stroke-width": strokeWidth,
            "stroke-opacity": opacity
        });
        path.data("edgeSource", edge.source);
        path.data("edgeTarget", edge.target);
        path.data("defaultStroke", loopColor);
        path.data("defaultOpacity", opacity);
        path.data("defaultWidth", strokeWidth);
        loopPaths.push(path);
        var key = edge.source + "-" + edge.target;
        loopPathMap[key] = path;
    });
}

function highlightJumpArc(fromIdx, toIdx) {
    if (!loopPathMap) return;

    // Reset all arcs to default
    _.each(loopPaths, function(path) {
        if (path && path.data) {
            path.attr({
                stroke: path.data("defaultStroke") || "#6B8AF0",
                "stroke-opacity": path.data("defaultOpacity") || 0.3,
                "stroke-width": path.data("defaultWidth") || 2
            });
        }
    });

    // Highlight the active jump arc
    var key = fromIdx + "-" + toIdx;
    var activePath = loopPathMap[key];
    if (activePath && activePath.attr) {
        activePath.attr({
            stroke: "#00FFFF",
            "stroke-opacity": 1,
            "stroke-width": 4
        });
        activePath.toFront();
    }
}

// Expose to window for external calls
if (typeof window !== 'undefined') {
    window.highlightJumpArc = highlightJumpArc;
}

function removeJukeboxBackdrop() {
    ["wave", "wave2", "ring", "glow"].forEach(function(key) {
        if (jukeboxBackdrop[key]) {
            jukeboxBackdrop[key].remove();
            jukeboxBackdrop[key] = null;
        }
    });
}

function clearJukeboxBackdrop() {
    removeJukeboxBackdrop();
    if (mode !== "jukebox") {
        clearOrbitBase();
    }
}

function renderJukeboxBackdrop(targetMode) {
    removeJukeboxBackdrop();
    var currentMode = targetMode || mode;
    if (currentMode !== "jukebox" && currentMode !== "eternal") {
        return;
    }
    var layout = orbitLayout;
    var center = layout.center;
    var radius = layout.baseRadius;
    var outerRadius = layout.outerRadius + layout.size * 0.02;
    var steps = 240;
    var amplitude = Math.min(radius * 0.2, layout.size * 0.08);
    var colors = ["rgba(107,138,240,0.25)", "rgba(240,168,107,0.22)"];

    function buildWave(phase, scale, color) {
        var waveParts = [];
        for (var i = 0; i <= steps; i++) {
            var theta = (i / steps) * Math.PI * 2;
            var modulation =
                Math.sin(theta * 2.5 + phase) * amplitude * scale +
                Math.sin(theta * 0.35 - phase) * amplitude * 0.5 * scale;
            var r = outerRadius + modulation;
            var x = center.x + Math.cos(theta) * r;
            var y = center.y + Math.sin(theta) * r;
            waveParts.push((i === 0 ? "M" : "L") + x + " " + y);
        }
        waveParts.push("Z");
        var path = paper.path(waveParts.join(" "));
        path.attr({
            stroke: color,
            "stroke-width": 2,
            "stroke-linecap": "round",
            fill: "none",
        });
        path.toBack();
        return path;
    }

    jukeboxBackdrop.wave = buildWave(0, 1, colors[0]);
    jukeboxBackdrop.wave2 = buildWave(Math.PI / 3, 0.6, colors[1]);

    jukeboxBackdrop.ring = paper.circle(center.x, center.y, radius + 6);
    jukeboxBackdrop.ring.attr({
        stroke: "rgba(255, 255, 255, 0.08)",
        "stroke-width": 10,
        fill: "none",
    });
    jukeboxBackdrop.ring.toBack();

    jukeboxBackdrop.glow = paper.circle(center.x, center.y, radius + 40);
    jukeboxBackdrop.glow.attr({
        stroke: "none",
        fill: "r(0.5,0.5)#37111e-#0b0207",
        opacity: 0.35,
    });
    jukeboxBackdrop.glow.toBack();
}

var vPad = 20;
var hPad = 20;

function getCircularCenter() {
    if (mode === "jukebox" || mode === "eternal") {
        return orbitLayout.center;
    }
    var topOffset = Math.min(H * 0.45, 160);
    return {
        x: W / 2,
        y: topOffset
    };
}

function getCircularRadius() {
    if (mode === "jukebox" || mode === "eternal") {
        return orbitLayout.baseRadius;
    }
    var base = Math.min(W, H * 1.2) / 2;
    return Math.max(70, base - 60);
}

function getCircularAngle(q) {
    var total = Math.max(trackDuration || 0, (q.start || 0) + (q.duration || 0));
    if (!total) {
        total = 1;
    }
    var mid = (q.start || 0) + ((q.duration || 0) / 2);
    var ratio = (mid % total) / total;
    return (ratio * Math.PI * 2) - (Math.PI / 2);
}

function getCircularPoint(q, radius) {
    var center = getCircularCenter();
    var angle = getCircularAngle(q);
    return {
        angle: angle,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
    };
}

function shortestAngleBetween(a, b) {
    var diff = (b - a) % (Math.PI * 2);
    if (diff > Math.PI) {
        diff -= Math.PI * 2;
    }
    if (diff < -Math.PI) {
        diff += Math.PI * 2;
    }
    return diff;
}

function createTiles(qlist) {
    if (mode === "jukebox" || mode === "eternal") {
        return createCircularTiles(qlist);
    }
    if (mode === "autoharmonizer") {
        return createAutoharmonizerTiles(qlist);
    }
    if (mode === "sculptor") {
        return createSculptorTiles(qlist);
    }
    clearJukeboxBackdrop();
    tiles = [];
    normalizeColor();
    var GH = H - vPad * 2;
    var HB = H - vPad;
    var TW = W - hPad;
    clearLoopPaths();

    for (var i = 0; i < qlist.length; i++) {
        var q = qlist[i];
        var tileWidth = TW * q.duration / trackDuration;
        var x = hPad + TW * q.start / trackDuration;
        var height = (H - vPad) * Math.pow(q.median_volume, 4);
        createTile(i, q, x, HB - height, tileWidth, height);
    }
    if (mode === "canon") {
        drawConnections(qlist);
    }
    updateCursors(qlist[0]);
    return tiles;
}

function createCircularTiles(qlist) {
    tiles = [];
    normalizeColor();
    clearLoopPaths();
    renderOrbitBase();
    renderJukeboxBackdrop();
    var radius = getCircularRadius();
    var sizeScale = Math.min(radius * 0.12, 18);

    _.each(qlist, function(q, idx) {
        var volume = typeof q.median_volume === "number" ? q.median_volume : 0.5;
        var durationRatio = trackDuration ? (q.duration / trackDuration) : 0;
        var size = Math.max(3, Math.min(10, volume * sizeScale + durationRatio * sizeScale * 0.6));
        var point = getCircularPoint(q, radius);
        var tile = Object.create(tilePrototype);
        tile.which = idx;
        tile.width = size * 2;
        tile.height = size * 2;
        tile.normalColor = getQuantumColor(q);
        tile.rect = paper.circle(point.x, point.y, size);
        tile.rect.tile = tile;
        tile.normal();
        tile.q = q;
        tile.init();
        q.tile = tile;
        tiles.push(tile);
    });

    var loopEdges = collectVisualizationLoops(80);
    drawCircularLoopConnections(qlist, loopEdges);
    if (qlist.length) {
        updateCursors(qlist[0]);
    }
    return tiles;
}

function createAutoharmonizerTiles(qlist) {
    // Create dual-loop visualization: two interlocking circles for autoharmonizer mode
    tiles = [];
    normalizeColor();
    clearLoopPaths();
    renderOrbitBase();
    renderJukeboxBackdrop();

    // Get autoharmonizer data from analysis
    var autoharmonizerData = curTrack && curTrack.analysis && curTrack.analysis.autoharmonizer;
    if (!autoharmonizerData) {
        console.error("[Viz] No autoharmonizer data, falling back to circular");
        return createCircularTiles(qlist);
    }

    var track1Beats = autoharmonizerData.track1 && autoharmonizerData.track1.beats ? autoharmonizerData.track1.beats : [];
    var track2Beats = autoharmonizerData.track2 && autoharmonizerData.track2.beats ? autoharmonizerData.track2.beats : [];
    if (!track1Beats.length || !track2Beats.length) {
        console.warn("[Viz] Autoharmonizer beats missing Ã¢â‚¬â€œ reverting to circular view", {
            track1Beats: track1Beats.length,
            track2Beats: track2Beats.length
        });
        return createCircularTiles(qlist || []);
    }

    // Calculate positions for two circles side-by-side
    var baseRadius = getCircularRadius() * 0.55; // Slightly smaller for dual view
    var sizeScale = Math.min(baseRadius * 0.12, 16);
    var centerY = H / 2;
    var spacing = baseRadius * 0.4; // Gap between circles

    // Left circle center (Track 1)
    var center1X = W / 2 - baseRadius - spacing / 2;
    var center1Y = centerY;

    // Right circle center (Track 2)
    var center2X = W / 2 + baseRadius + spacing / 2;
    var center2Y = centerY;

    // Draw track 1 beats (left circle) in blue
    _.each(track1Beats, function(beat, idx) {
        var angle = (idx / track1Beats.length) * Math.PI * 2 - Math.PI / 2;
        var x = center1X + Math.cos(angle) * baseRadius;
        var y = center1Y + Math.sin(angle) * baseRadius;

        var volume = beat.confidence || 0.5;
        var durationRatio = beat.duration / 0.5; // Normalize
        var size = Math.max(3, Math.min(10, volume * sizeScale + durationRatio * sizeScale * 0.4));

        var tile = Object.create(tilePrototype);
        tile.which = idx;
        tile.track = 1;
        tile.width = size * 2;
        tile.height = size * 2;
        tile.normalColor = "#4A90E2"; // Blue for track 1
        tile.rect = paper.circle(x, y, size);
        tile.rect.tile = tile;
        tile.normal();
        tile.q = beat;
        tile.init();
        beat.tile = tile;
        tiles.push(tile);
    });

    // Draw track 2 beats (right circle) in purple
    _.each(track2Beats, function(beat, idx) {
        var angle = (idx / track2Beats.length) * Math.PI * 2 - Math.PI / 2;
        var x = center2X + Math.cos(angle) * baseRadius;
        var y = center2Y + Math.sin(angle) * baseRadius;

        var volume = beat.confidence || 0.5;
        var durationRatio = beat.duration / 0.5;
        var size = Math.max(3, Math.min(10, volume * sizeScale + durationRatio * sizeScale * 0.4));

        var tile = Object.create(tilePrototype);
        tile.which = idx + track1Beats.length; // Offset index for track 2
        tile.track = 2;
        tile.width = size * 2;
        tile.height = size * 2;
        tile.normalColor = "#9B59B6"; // Purple for track 2
        tile.rect = paper.circle(x, y, size);
        tile.rect.tile = tile;
        tile.normal();
        tile.q = beat;
        tile.init();
        beat.tile = tile;
        tiles.push(tile);
    });

    // Draw cross-track connections (the "fusion" effect)
    var crossSim = autoharmonizerData.cross_similarity;
    if (crossSim && crossSim.track1_to_track2) {
        var connectionCount = 0;
        var maxConnections = 30; // Limit visual clutter

        _.each(crossSim.track1_to_track2, function(candidates, beatIdx) {
            if (connectionCount >= maxConnections) return;

            var idx = parseInt(beatIdx);
            if (!candidates || !candidates.length || idx >= track1Beats.length) return;

            // Draw connection to best match
            var bestMatch = candidates[0];
            if (bestMatch.similarity > 0.65 && bestMatch.target_index < track2Beats.length) {
                var angle1 = (idx / track1Beats.length) * Math.PI * 2 - Math.PI / 2;
                var x1 = center1X + Math.cos(angle1) * baseRadius;
                var y1 = center1Y + Math.sin(angle1) * baseRadius;

                var angle2 = (bestMatch.target_index / track2Beats.length) * Math.PI * 2 - Math.PI / 2;
                var x2 = center2X + Math.cos(angle2) * baseRadius;
                var y2 = center2Y + Math.sin(angle2) * baseRadius;

                var opacity = Math.min(0.4, bestMatch.similarity * 0.5);
                var path = paper.path("M" + x1 + "," + y1 + "L" + x2 + "," + y2);
                path.attr({
                    "stroke": "#E74C3C",
                    "stroke-width": 1,
                    "opacity": opacity,
                    "stroke-dasharray": "3,3"
                });
                connectionCount++;
            }
        });
    }

    // Add labels
    var label1 = paper.text(center1X, centerY, "Track 1");
    label1.attr({
        "font-size": 14,
        "fill": "#4A90E2",
        "opacity": 0.6,
        "font-weight": "bold"
    });

    var label2 = paper.text(center2X, centerY, "Track 2");
    label2.attr({
        "font-size": 14,
        "fill": "#9B59B6",
        "opacity": 0.6,
        "font-weight": "bold"
    });

    if (track1Beats.length) {
        updateCursors(track1Beats[0]);
    }

    return tiles;
}

function createSculptorTiles(qlist) {
    // Section Sculptor: visualize sections as horizontal timeline blocks
    tiles = [];
    normalizeColor();
    clearJukeboxBackdrop();
    clearLoopPaths();

    var sections = (curTrack && curTrack.analysis && curTrack.analysis.sections) || [];
    if (sections.length === 0) {
        console.warn("[Sculptor] No sections found, using default tiles");
        return createCircularTiles(qlist);
    }

    var GH = H - vPad * 2;
    var HB = H - vPad;
    var TW = W - hPad * 2;
    var sectionHeight = GH / Math.min(sections.length, 8); // Max 8 rows

    // Color palette for different section types
    var sectionColors = {
        "Intro": "#4A90E2",
        "Verse": "#50C878",
        "Pre-Chorus": "#FFA500",
        "Chorus": "#E74C3C",
        "Bridge": "#9B59B6",
        "Outro": "#95A5A6"
    };

    // Store section rectangles for later updates
    var sectionRects = [];

    // Draw each section as a horizontal bar
    _.each(sections, function(section, idx) {
        var position = idx / sections.length;
        var label = "";

        // Label section based on position
        if (idx === 0) {
            label = "Intro";
        } else if (idx === sections.length - 1) {
            label = "Outro";
        } else if (position < 0.25) {
            label = "Verse";
        } else if (position >= 0.25 && position < 0.5) {
            label = "Pre-Chorus";
        } else if (position >= 0.5 && position < 0.75) {
            label = "Chorus";
        } else {
            label = "Bridge";
        }

        var x = hPad + TW * (section.start / trackDuration);
        var width = TW * (section.duration / trackDuration);
        var y = vPad + (idx % 8) * sectionHeight;
        var height = sectionHeight - 5; // Small gap between sections

        // Create section rectangle
        var color = sectionColors[label] || "#7F8C8D";
        var rect = paper.rect(x, y, width, height);
        rect.attr({
            "fill": color,
            "stroke": "#2C3E50",
            "stroke-width": 2,
            "opacity": 0.7,
            "cursor": "pointer"
        });

        // Store section index on the rect
        rect.sectionIndex = idx;
        rect.sectionLabel = label;
        rect.baseColor = color;
        sectionRects.push(rect);

        // Make section clickable to add to queue or jump to it
        rect.click(function() {
            if (driver && driver.getState) {
                var state = driver.getState();

                // Check if this section is in the queue
                var inQueue = state.sectionQueue.indexOf(this.sectionIndex) !== -1;

                if (inQueue) {
                    // If in queue, jump to it
                    var queuePos = state.sectionQueue.indexOf(this.sectionIndex);
                    if (driver.jumpToQueuePosition) {
                        driver.jumpToQueuePosition(queuePos);
                        console.log("[Sculptor] Jumped to section", this.sectionLabel);
                    }
                } else {
                    // If not in queue, add it
                    if (driver.addSection) {
                        driver.addSection(this.sectionIndex);
                        console.log("[Sculptor] Added section", this.sectionLabel, "to queue");
                    }
                }

                // Update UI if available
                if (window.updateSculptorQueueDisplay) {
                    window.updateSculptorQueueDisplay();
                }

                // Visual feedback
                this.attr({"stroke-width": 4, "stroke": "#fff"});
                var self = this;
                setTimeout(function() {
                    self.attr({"stroke-width": 2, "stroke": "#2C3E50"});
                }, 200);
            }
        });

        // Hover effect
        rect.hover(
            function() {
                this.attr({"opacity": 0.9, "stroke-width": 3});
            },
            function() {
                this.attr({"opacity": 0.7, "stroke-width": 2});
            }
        );

        // Add section label
        var labelX = x + width / 2;
        var labelY = y + height / 2;
        var text = paper.text(labelX, labelY, label + " " + (idx + 1));
        text.attr({
            "font-size": Math.min(12, height / 3),
            "fill": "#FFFFFF",
            "font-weight": "bold",
            "cursor": "pointer"
        });

        // Make text clickable too
        text.sectionIndex = idx;
        text.sectionLabel = label;
        text.click(function() {
            rect.click();
        });

        // Create tiles for beats in this section
        var sectionStart = section.start;
        var sectionEnd = section.start + section.duration;

        _.each(qlist, function(beat, beatIdx) {
            if (beat.start >= sectionStart && beat.start < sectionEnd) {
                var tile = Object.create(tilePrototype);
                tile.which = beatIdx;
                tile.section = idx;
                tile.width = width / 20; // Approximate width
                tile.height = height;
                tile.normalColor = color;
                tile.rect = rect; // Share the section rectangle
                tile.q = beat;
                beat.tile = tile;
                tiles.push(tile);
            }
        });
    });

    // Add timeline labels
    var timeLabels = [0, trackDuration / 4, trackDuration / 2, (3 * trackDuration) / 4, trackDuration];
    _.each(timeLabels, function(time) {
        var x = hPad + TW * (time / trackDuration);
        var timeText = paper.text(x, H - vPad / 2, formatTime(time));
        timeText.attr({
            "font-size": 10,
            "fill": "#7F8C8D"
        });
    });

    if (qlist.length) {
        updateCursors(qlist[0]);
    }

    return tiles;
}

function formatTime(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
}


function drawConnections(qlist) {
    var maxDelta = 0;
    _.each(qlist, function(q, i) {
        if (q.next) {
            var delta = Math.abs(q.other.which - q.next.other.which);
            if (delta > maxDelta) {
                maxDelta = delta;
            }
        }
    });

    _.each(qlist, function(q, i) {
        if (q.next) {
            var delta = q.next.other.which - q.other.which;
            if (q.which != 0 && delta != 1) {
                drawConnection(q,  q.next, maxDelta);
                // drawConnection(q.other, q.next.other, maxDelta);
            }
        }
    });
}

function drawConnection(q1, q2, maxDelta) {
    var TW = W - hPad;
    var delta = Math.abs(q1.other.which - q2.other.which);
    var cy = delta/maxDelta * CH * 2.0;

    if (cy < 20) {
        cy = 30;
    }

    cy = H + cy;

    // the paths are between the 'others', but we store it
    // in the master since there may be multiple paths for any other
    // but always at most one for the master.

    var x1 = hPad + TW * q1.other.start / trackDuration;
    var y = H -4;
    var x2 = hPad + TW * q2.other.start / trackDuration;
    var cx = (x2 - x1) / 2 + x1;
    if (q1.ppath && typeof q1.ppath.remove === "function") {
        q1.ppath.remove();
    }
    var path = 'M' + x1 + ' ' + y + ' S ' + cx + ' ' + cy  + ' ' + x2 + ' ' + y;
    q1.ppath = paper.path(path)
    q1.ppath.attr('stroke', getQuantumColor(q1.other));
    q1.ppath.attr('stroke-width', 4);
}

function drawSections() {
    var sectionBase =  H - 20;
    var tw = W - hPad;
    _.each(curTrack.analysis.sections, function(section, i) {
        var width = tw * section.duration / trackDuration; 
        var x = hPad + tw * section.start / trackDuration;
        var srect = paper.rect(x, sectionBase, width, 20);
        srect.attr('fill', Raphael.getColor());
    });
}

function updateCursors(q) {
    if (!q) {
        return;
    }
    if (mode === "jukebox" || mode === "eternal") {
        updateCircularCursors(q);
        return;
    }
    removeCircularCursors();
    var cursorWidth = 8;
    if (masterCursor == null) {
        masterCursor = paper.rect(0, H - vPad, cursorWidth, vPad / 2);
        masterCursor.attr("fill", masterColor);

        otherCursor = paper.rect(0, H - vPad / 2 - 1, cursorWidth, vPad / 2);
        otherCursor.attr("fill", otherColor);
    }
    var TW = W - hPad;
    var x = hPad + TW * q.start / trackDuration - cursorWidth / 2;
    masterCursor.attr( {x:x} );
    if (q.other && typeof q.other.start === "number") {
        var ox = hPad + TW * q.other.start / trackDuration - cursorWidth / 2;
        if (q.ppath && typeof q.other.duration === "number") {
            moveAlong(otherCursor, q.ppath, q.other.duration * .75);
        } else {
            otherCursor.attr( {x:ox} );
        }
    } else {
        otherCursor.attr({ x });
    }
}

function removeLinearCursors() {
    if (masterCursor) {
        masterCursor.remove();
        masterCursor = null;
    }
    if (otherCursor) {
        otherCursor.remove();
        otherCursor = null;
    }
}

function removeCircularCursors() {
    if (masterCursorCircle) {
        masterCursorCircle.remove();
        masterCursorCircle = null;
    }
    if (otherCursorCircle) {
        otherCursorCircle.remove();
        otherCursorCircle = null;
    }
}

function updateCircularCursors(q) {
    removeLinearCursors();
    var radius = getCircularRadius();
    var masterPoint = getCircularPoint(q, radius);
    if (!masterCursorCircle) {
        masterCursorCircle = paper.circle(masterPoint.x, masterPoint.y, 7);
        masterCursorCircle.attr({ fill: masterColor, stroke: "rgba(255, 255, 255, 0.6)", "stroke-width": 2 });
    } else {
        masterCursorCircle.attr({ cx: masterPoint.x, cy: masterPoint.y });
    }
    if (q.other) {
        var otherPoint = getCircularPoint(q.other, radius - 12);
        if (!otherCursorCircle) {
            otherCursorCircle = paper.circle(otherPoint.x, otherPoint.y, 5);
            otherCursorCircle.attr({ fill: otherColor, stroke: otherColor });
        } else {
            otherCursorCircle.attr({ cx: otherPoint.x, cy: otherPoint.y });
        }
    } else if (otherCursorCircle) {
        otherCursorCircle.remove();
        otherCursorCircle = null;
    }
}

function moveAlong(rect, path, time) {
    var frame = 1 / 60.;
    var steps = Math.round(time/frame);
    var curStep = 0;
    var plength = path.getTotalLength();
    var oy = rect.attr('y');

    function animate() {
        var coords = path.getPointAtLength(curStep / steps * plength);
        if (curStep++ < steps) {
            rect.attr( {x:coords.x, y:coords.y});
            setTimeout(function() {
                animate();
            }, frame * 1000);
        } else {
            rect.attr({y:oy});
        }
    }
    animate();
}

var minDistanceThreshold = 80;

function pad(num, length) {
    var s = num.toString()
    while (s.length < length) {
        s = '0' + s
    }
    return s
}

function calcWindowMedian(qlist, field, name, windowSize) {
    _.each(qlist, function(q) {
        var vals = [];
        for (var i = 0; i < windowSize; i++) {
            var offset = i - Math.floor(windowSize / 2);
            var idx = q.which - offset;
            if (idx >= 0 && idx < qlist.length) {
                var val = qlist[idx][field]
                vals.push(val);
            }
        }
        vals.sort();
        var median =  vals[Math.floor(vals.length / 2)];
        q[name] = median;
    });
}

function average_volume(q) {
    var sum = 0;
    if (q.loudness_max !== undefined) {
        return q.loudness_max;
    } else if (q.overlappingSegments && q.overlappingSegments.length > 0) {
        _.each(q.overlappingSegments, function(seg, i) {
                sum += seg.loudness_max;
            }
        );
        return sum / q.overlappingSegments.length;
    } else {
        return -60;
    }
}

function interp(val, min, max) {
    if (min == max) {
        return min;
    } else {
        return (val - min) / (max - min);
    }
}
    
function assignNormalizedVolumes(qlist) {
    var minV = 0;
    var maxV = -60;

    _.each(qlist, function(q, j) {
            var vol = average_volume(q);
            q.raw_volume = vol;
            if (vol > maxV) {
                maxV = vol;
            }
            if (vol < minV) {
                minV = vol;
            }
        }
    );

    _.each(qlist, function(q, j) {
            q.volume = interp(q.raw_volume, minV, maxV);
        }
    );
    calcWindowMedian(qlist, 'volume', 'median_volume', 20);
}


function fmtTime(time) {
    if (isNaN(time)) {
        return '';
    } else {
        time = Math.round(time)
        var hours = Math.floor(time / 3600)
        time = time - hours * 3600
        var mins =  Math.floor(time / 60)
        var secs = time - mins * 60
        return pad(hours, 2) + ':' + pad(mins, 2) + ':' + pad(secs, 2);
    }
}

function createCanonDriver(player) {
    var rlConfig = getCanonRlTuning();
    var rlMinDwell = rlConfig.minDwell;
    var rlRepeatPenalty = rlConfig.repeatPenalty;

    var curQ = 0;
    var running = false;
    var mtime = $("#mtime");
    var lastLoggedIndex = null;
    var lastCanonHop = { source: null, target: null };
    var recentCanonTargets = [];
    var canonJumpHistory = [];
    var CANON_RECENT_LIMIT = 20;
    var CANON_JUMP_HISTORY_LIMIT = 8;
    var beatsSinceLastCanonJump = rlMinDwell;
    var maxBeatReached = 0;

    function clearLastCanonHop() {
        lastCanonHop.source = null;
        lastCanonHop.target = null;
    }

    function clearRecentCanonTargets() {
        recentCanonTargets = [];
        canonJumpHistory = [];
        beatsSinceLastCanonJump = rlMinDwell;
    }

    function markRecentCanonTarget(index) {
        if (typeof index !== "number" || index < 0) {
            return;
        }
        recentCanonTargets.push(index);
        if (recentCanonTargets.length > CANON_RECENT_LIMIT) {
            recentCanonTargets.shift();
        }
    }

    function markCanonJumpTarget(index) {
        if (typeof index !== "number" || index < 0) {
            return;
        }
        markRecentCanonTarget(index);
        canonJumpHistory.push(index);
        if (canonJumpHistory.length > CANON_JUMP_HISTORY_LIMIT) {
            canonJumpHistory.shift();
        }
    }

    function getCanonJumpRepeatCount(index) {
        if (!canonJumpHistory || !canonJumpHistory.length) {
            return 0;
        }
        var count = 0;
        for (var i = 0; i < canonJumpHistory.length; i++) {
            if (canonJumpHistory[i] === index) {
                count++;
            }
        }
        return count;
    }

    function registerCanonDecision(reason) {
        if (reason === "sequential") {
            beatsSinceLastCanonJump = Math.min(
                beatsSinceLastCanonJump + 1,
                Math.max(rlMinDwell * 4, 16),
            );
        } else {
            beatsSinceLastCanonJump = 0;
        }
    }

    function getBeatsSinceLastCanonJump() {
        return beatsSinceLastCanonJump;
    }

    function isRecentlyVisitedCanonTarget(index) {
        if (!recentCanonTargets || !recentCanonTargets.length) {
            return false;
        }
        for (var i = recentCanonTargets.length - 1; i >= 0; i--) {
            if (recentCanonTargets[i] === index) {
                return true;
            }
        }
        return false;
    }

    function resolveCanonLogger() {
        if (typeof window === "undefined") {
            return null;
        }
        if (typeof window.harmonizerLogJumpDecision === "function") {
            return window.harmonizerLogJumpDecision;
        }
        return null;
    }

    function emitCanonJumpLog(meta) {
        var logger = resolveCanonLogger();
        if (typeof logger !== "function") {
            return;
        }
        var modelVersion =
            window.harmonizerRLModel &&
            (window.harmonizerRLModel.trained_at ||
                window.harmonizerRLModel.version);
        logger(
            Object.assign(
                {
                    mode: "canon",
                    model_version: modelVersion || null,
                    policy_mode:
                        (window.harmonizerPolicyMode || "canon").toLowerCase(),
                },
                meta || {},
            ),
        );
    }

    function logCanonTransition(targetIdx, reason) {
        if (!masterQs || !masterQs.length) {
            lastLoggedIndex = targetIdx;
            return;
        }
        if (
            typeof targetIdx !== "number" ||
            targetIdx < 0 ||
            targetIdx >= masterQs.length
        ) {
            lastLoggedIndex = targetIdx;
            return;
        }
        if (lastLoggedIndex === null || lastLoggedIndex === targetIdx) {
            lastLoggedIndex = targetIdx;
            return;
        }
        var sourceIdx = lastLoggedIndex;
        var sourceBeat = masterQs[sourceIdx];
        var targetBeat = masterQs[targetIdx];
        emitCanonJumpLog({
            reason: reason || "sequential",
            source: sourceIdx,
            target: targetIdx,
            span: Math.abs(targetIdx - sourceIdx),
            sameSection:
                sourceBeat && targetBeat
                    ? sourceBeat.section === targetBeat.section
                    : null,
            source_time: sourceBeat ? sourceBeat.start : null,
            target_time: targetBeat ? targetBeat.start : null,
        });
        lastLoggedIndex = targetIdx;
    }

    function clampCanonIndex(idx) {
        if (!masterQs || !masterQs.length) {
            return 0;
        }
        if (idx < 0) {
            return 0;
        }
        if (idx > masterQs.length) {
            return masterQs.length;
        }
        return idx;
    }

    function beatsInSameSection(a, b) {
        if (!masterQs || !masterQs[a] || !masterQs[b]) {
            return false;
        }
        return masterQs[a].section === masterQs[b].section;
    }

    function buildCanonEdge(sourceIndex, targetIndex, similarity, reason) {
        var target = clampCanonIndex(targetIndex);
        return {
            source: sourceIndex,
            target: target,
            similarity:
                typeof similarity === "number" ? similarity : 0,
            span: Math.abs(target - sourceIndex),
            sameSection: beatsInSameSection(sourceIndex, target),
            reason: reason || "sequential",
        };
    }

    function chooseCanonNextIndex(sourceIndex) {
        if (!masterQs || !masterQs.length) {
            return { index: 0, reason: "sequential" };
        }
        var policyMode = getGlobalPolicyMode("canon");
        var allowLooping = policyMode === "rl";
        if (!allowLooping && sourceIndex >= masterQs.length - 1) {
            return { index: masterQs.length, reason: "end" };
        }
        var totalBeats = masterQs.length;
        var beatsSinceLastJump = getBeatsSinceLastCanonJump();
        var sequentialTarget = allowLooping
            ? (sourceIndex + 1) % totalBeats
            : sourceIndex + 1;
        var candidates = [
            buildCanonEdge(sourceIndex, sequentialTarget, 1, "sequential"),
        ];
        var q = masterQs[sourceIndex];
        if (q && q.other && typeof q.other.which === "number") {
            var simVal =
                typeof q.otherSimilarity === "number"
                    ? q.otherSimilarity
                    : typeof q.otherSimilarityRaw === "number"
                    ? q.otherSimilarityRaw
                    : 0;
            if (q.other.which !== sourceIndex) {
                candidates.push(
                    buildCanonEdge(
                        sourceIndex,
                        q.other.which,
                        simVal,
                        "canon_pair",
                    ),
                );
            }
        }
        var loopEdges = canonLoopGraph[sourceIndex] || [];
        loopEdges.forEach(function(edge) {
            if (edge && typeof edge.target_start === "number") {
                candidates.push(
                    buildCanonEdge(
                        sourceIndex,
                        edge.target_start,
                        edge.similarity,
                        "canon_loop",
                    ),
                );
            }
        });
        var bestCandidate = candidates[0];
        var bestScore = null;
        var dwellBeats =
            (canonSettings && canonSettings.dwellBeats) || 6;
        candidates.forEach(function(candidate) {
            if (candidate.target >= masterQs.length) {
                return;
            }
            if (candidate.target === sourceIndex) {
                return;
            }
            var isImmediateBacktrack =
                allowLooping &&
                candidate.reason !== "sequential" &&
                lastCanonHop.source !== null &&
                lastCanonHop.target !== null &&
                lastCanonHop.target === sourceIndex &&
                lastCanonHop.source === candidate.target;
            if (isImmediateBacktrack) {
                return;
            }
            if (
                allowLooping &&
                candidate.reason !== "sequential" &&
                isRecentlyVisitedCanonTarget(candidate.target)
            ) {
                return;
            }
            // Prevent backward jumps that would create tight loops
            if (
                allowLooping &&
                candidate.reason !== "sequential" &&
                candidate.target < sourceIndex &&
                sourceIndex > maxBeatReached - 20
            ) {
                // Only allow backward jumps if we're not near our max progress
                // This prevents loops where we keep jumping back from the same region
                return;
            }
            var score = scoreJumpQuality(candidate, {
                modeName: "canon",
                currentIndex: sourceIndex,
                totalBeats: totalBeats,
                dwellBeats: dwellBeats,
                recentJumpBeats: beatsSinceLastJump,
                minJumpDwell: rlMinDwell,
            });
            if (
                typeof score === "number" &&
                candidate.reason !== "sequential"
            ) {
                var repeatCount = getCanonJumpRepeatCount(
                    candidate.target,
                );
                if (repeatCount > 0) {
                    score -= repeatCount * rlRepeatPenalty;
                }
            }
            candidate.score = score;
            if (
                typeof score === "number" &&
                (bestScore === null || score > bestScore)
            ) {
                bestScore = score;
                bestCandidate = candidate;
            }
        });
        var targetIdx = clampCanonIndex(bestCandidate.target);
        if (allowLooping && totalBeats > 0) {
            if (targetIdx >= totalBeats) {
                targetIdx = targetIdx % totalBeats;
            }
            if (targetIdx === sourceIndex) {
                targetIdx = (sourceIndex + 1) % totalBeats;
            }
        } else if (targetIdx <= sourceIndex) {
            targetIdx = clampCanonIndex(sourceIndex + 1);
        }
        return { index: targetIdx, reason: bestCandidate.reason };
    }

    function pausePlayback() {
        if (!running) {
            return;
        }
        running = false;
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        lastLoggedIndex = null;
        clearLastCanonHop();
        clearRecentCanonTargets();
        resetPlaybackState();
    }

    function process() {
        if (curQ >= masterQs.length) {
            // Check if loop is enabled - restart from beginning
            console.log('[Canon Driver] End reached. window.harmonizerLoopEnabled =', window.harmonizerLoopEnabled, 'audio.loop =', (player.audio ? player.audio.loop : 'no audio'));
            if (window.harmonizerLoopEnabled) {
                console.log('[Canon Driver] Loop enabled, restarting from beginning');
                curQ = 0;
                maxBeatReached = 0;
                // Seek to start - handle different player types
                if (player.audio && player.audio.currentTime !== undefined) {
                    player.audio.currentTime = 0;
                } else if (typeof player.seek === 'function') {
                    player.seek(0);
                } else if (player.playFrom) {
                    player.playFrom(0);
                }
                // Continue processing from the beginning
                setTimeout(function() {
                    process();
                }, 50);
                return;
            }
            // Check if we should auto-play the next track in queue
            if (autoPlayNext && playNextInQueue()) {
                console.log('[Canon Driver] Auto-playing next track in queue');
                return;
            }
            stop();
        } else if (running) {
            var currentIndex = curQ;
            // Track maximum beat reached to prevent tight loops
            if (currentIndex > maxBeatReached) {
                maxBeatReached = currentIndex;
            }
            var nextQ = masterQs[currentIndex];
            nextQ.tile.highlight();

            // Highlight all overlay voices
            if (nextQ.others && Array.isArray(nextQ.others)) {
                // New multi-voice format - highlight all overlay tiles
                for (var voiceIdx = 0; voiceIdx < nextQ.others.length; voiceIdx++) {
                    var overlayBeat = nextQ.others[voiceIdx];
                    if (overlayBeat && overlayBeat.tile) {
                        var overlayFill = getOverlayColor(voiceIdx, nextQ.others.length);
                        overlayBeat.tile.highlight2(overlayFill);
                    }
                }
            } else if (nextQ.other && nextQ.other.tile) {
                // Legacy 2-voice format
                nextQ.other.tile.highlight2();
            }

            updateCursors(nextQ);
            mtime.text(fmtTime(nextQ.start));
            pulseNotes(nextQ.median_volume || nextQ.volume || baseNoteStrength);
            var delay = player.playQ(nextQ);
            renderOverlayChips(nextQ);
            var choice = chooseCanonNextIndex(currentIndex);
            if (choice.index < masterQs.length) {
                var reason =
                    choice.reason === "sequential"
                        ? "sequential"
                        : "canon_jump";
                logCanonTransition(choice.index, reason);
                lastCanonHop.source = currentIndex;
                lastCanonHop.target = choice.index;
                registerCanonDecision(reason);
                if (reason !== "sequential") {
                    markCanonJumpTarget(choice.index);
                }
            } else {
                clearLastCanonHop();
                clearRecentCanonTargets();
            }
            curQ = choice.index;
            setTimeout(function() {
                process();
            }, 1000 * delay);
        }
    }

    return {
        start: function() {
            resetTileColors(masterQs);
            // Prefer server-recommended start_index; otherwise start of section 0 on a bar boundary
            var startIdx = 0;
            try {
                if (curTrack && curTrack.analysis && curTrack.analysis.canon_alignment) {
                    var align = curTrack.analysis.canon_alignment;
                    var si = align.start_index;
                    var duration = trackDuration || (masterQs && masterQs.length ? masterQs[masterQs.length - 1].start + masterQs[masterQs.length - 1].duration : 0);
                    var beats = masterQs || [];
                    // clamp recommended start if itÃŽâ€œÃƒâ€¡Ãƒâ€“s too deep into the song
                    var maxStartTime = Math.min(45, duration * 0.25);
                    if (typeof si === "number" && si >= 0 && si < beats.length) {
                        var siTime = beats[si].start || 0;
                        if (siTime <= maxStartTime) {
                            startIdx = si;
                        }
                    }
                    if (startIdx === 0 && align && align.pair_similarity && align.similarity_threshold !== undefined) {
                        var thr = align.similarity_threshold;
                        for (var i = 0; i < beats.length; i++) {
                            if (beats[i].section === 0 && beats[i].indexInParent === 0) {
                                var ok = (i < align.pair_similarity.length) ? (align.pair_similarity[i] >= thr) : true;
                                if (ok && beats[i].start <= maxStartTime) { startIdx = i; break; }
                            }
                        }
                    }
                }
            } catch (e) {}
            if (startIdx === 0 && masterQs && masterQs.length) {
                // find first beat in section 0 that aligns like a downbeat (indexInParent==0) if available
                for (var i = 0; i < masterQs.length; i++) {
                    var q = masterQs[i];
                    if (q && q.section === 0 && q.indexInParent === 0) {
                        startIdx = i;
                        break;
                    }
                }
            }
            curQ = startIdx;
            lastLoggedIndex = startIdx;
            maxBeatReached = startIdx;
            clearLastCanonHop();
            clearRecentCanonTargets();
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass("canon");
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            resetTileColors(masterQs);
            clearLastCanonHop();
            clearRecentCanonTargets();
            clearOverlayChips();
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass("canon");
            pulseNotes(baseNoteStrength);
            lastLoggedIndex = curQ;
        },

        stop: stop,
        pause: pausePlayback,

        isRunning: function() {
            return running;
        },

        process: function() {
            process();
        },
        player: player,

        setNextQ: function(q) {
            if (
                running &&
                lastLoggedIndex !== null &&
                lastLoggedIndex !== q.which
            ) {
                logCanonTransition(q.which, "manual");
            }
            curQ = q.which;
            lastLoggedIndex = q.which;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(baseNoteStrength);
            }
            clearLastCanonHop();
            clearRecentCanonTargets();
            registerCanonDecision("manual");
            markCanonJumpTarget(q.which);
        },

        // Expose curQ and running as properties for debugging/testing
        get curQ() {
            return curQ;
        },
        get running() {
            return running;
        }
    };
}

function createJukeboxDriver(player, options) {
    options = options || {};
    var currentIndex = 0;
    var running = false;
    var mtime = $("#mtime");
    var modeName = options.modeName || "jukebox";
    function resolveJumpLogger() {
        if (typeof window === "undefined") {
            return null;
        }
        if (typeof window.harmonizerLogJumpDecision === "function") {
            return window.harmonizerLogJumpDecision;
        }
        return null;
    }
    // Stats tracking for eternal modes
    var totalBeatsPlayed = 0;
    var sessionStartTime = null;
    var listenTimeSeconds = 0;
    var statsUpdateInterval = null;
    var listenTimeDisplay = $("#listen-time");
    var beatsPlayedDisplay = $("#beats-played");
    var eternalStatsContainer = $("#eternal-stats");
    var visitedBars = {};
    var minScore = 0.7;
    var minDwellBeats = 6;
    var beatsSinceJump = 0;
    var maxBackward = Math.max(24, Math.floor((masterQs && masterQs.length ? masterQs.length : 0) * 0.1));
    var modeState = "explore"; // explore vs looping bias

    var minLoopBeats = coerceNumber(options.minLoopBeats);
    if (minLoopBeats === null) {
        minLoopBeats = 12;
    }
    minLoopBeats = Math.max(4, Math.round(minLoopBeats));

    var maxSequentialBeats = coerceNumber(options.maxSequentialBeats);
    if (maxSequentialBeats === null) {
        maxSequentialBeats = minLoopBeats * 3;
    }
    maxSequentialBeats = Math.max(minLoopBeats + 2, Math.round(maxSequentialBeats));

    var loopThreshold = coerceNumber(options.loopThreshold);
    if (loopThreshold === null) {
        loopThreshold = 0.55;
    }
    loopThreshold = Math.max(0.05, Math.min(0.99, loopThreshold));

    var sectionBias = clamp01(options.sectionBias !== undefined ? options.sectionBias : 0.6);
    var jumpVariance = clamp01(options.jumpVariance !== undefined ? options.jumpVariance : 0.4);
    var sameSectionBonusBase;
    var crossSectionBonusBase;
    var recentPenaltyScale;
    var weightJitterStrength;
    var spanScaleBase;

    function recalcLoopWeightParams() {
        sameSectionBonusBase = 0.08 + sectionBias * 0.42;
        crossSectionBonusBase = 0.08 + (1 - sectionBias) * 0.28;
        recentPenaltyScale = (1 - sectionBias) * 0.18;
        weightJitterStrength = jumpVariance * 0.3;
        spanScaleBase = 1.0 + (1 - jumpVariance) * 0.8;
    }

    recalcLoopWeightParams();

    function emitJumpLog(meta) {
        var logger = resolveJumpLogger();
        if (typeof logger !== "function") {
            return;
        }
        var model = getGlobalRLModel();
        var modelVersion = model ? model.trained_at || model.version : null;
        var policyMode = getGlobalPolicyMode(modeName);
        var trackTempo =
            (curTrack &&
                curTrack.analysis &&
                curTrack.analysis.audio_summary &&
                curTrack.analysis.audio_summary.tempo) ||
            null;
        var totalDuration = trackDuration;
        if (
            (!totalDuration || !isFinite(totalDuration)) &&
            masterQs &&
            masterQs.length
        ) {
            var lastBeat = masterQs[masterQs.length - 1];
            totalDuration =
                lastBeat && lastBeat.start
                    ? lastBeat.start + (lastBeat.duration || 0)
                    : null;
        }
        var sourceBeat =
            masterQs &&
            typeof meta.source === "number" &&
            masterQs[meta.source]
                ? masterQs[meta.source]
                : null;
        var targetBeat =
            masterQs &&
            typeof meta.target === "number" &&
            masterQs[meta.target]
                ? masterQs[meta.target]
                : null;
        var contextExtras = {
            track_tempo: trackTempo,
            track_duration: totalDuration,
            source_confidence: sourceBeat ? sourceBeat.confidence : null,
            target_confidence: targetBeat ? targetBeat.confidence : null,
            source_duration: sourceBeat ? sourceBeat.duration : null,
            target_duration: targetBeat ? targetBeat.duration : null,
            source_time:
                sourceBeat && typeof sourceBeat.start === "number"
                    ? sourceBeat.start
                    : meta.source_time !== undefined
                    ? meta.source_time
                    : null,
            target_time:
                targetBeat && typeof targetBeat.start === "number"
                    ? targetBeat.start
                    : meta.target_time !== undefined
                    ? meta.target_time
                    : null,
            time_from_end:
                totalDuration && targetBeat && typeof targetBeat.start === "number"
                    ? Math.max(0, totalDuration - targetBeat.start)
                    : null,
        };
        var mergedContext = Object.assign(
            {},
            meta.context || {},
            contextExtras,
        );
        var payload = Object.assign({}, meta, {
            context: mergedContext,
        });
        logger(
            Object.assign(
                {
                    mode: modeName,
                    model_version: modelVersion || null,
                    policy_mode: policyMode || "rl",
                },
                payload || {},
            ),
        );
    }

    function updateStatsDisplay() {
        if (beatsPlayedDisplay && beatsPlayedDisplay.length) {
            beatsPlayedDisplay.text(totalBeatsPlayed.toLocaleString());
        }
        if (listenTimeDisplay && listenTimeDisplay.length) {
            var minutes = Math.floor(listenTimeSeconds / 60);
            var seconds = Math.floor(listenTimeSeconds % 60);
            listenTimeDisplay.text(
                String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
            );
        }
    }

    function startStatsTracking() {
        if (!sessionStartTime) {
            sessionStartTime = Date.now();
        }
        if (eternalStatsContainer && eternalStatsContainer.length) {
            eternalStatsContainer.show();
        }
        if (!statsUpdateInterval) {
            statsUpdateInterval = setInterval(function() {
                if (running && sessionStartTime) {
                    listenTimeSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
                    updateStatsDisplay();
                }
            }, 1000);
        }
    }

    function stopStatsTracking() {
        if (statsUpdateInterval) {
            clearInterval(statsUpdateInterval);
            statsUpdateInterval = null;
        }
    }

    function resetStats() {
        totalBeatsPlayed = 0;
        sessionStartTime = null;
        listenTimeSeconds = 0;
        stopStatsTracking();
        updateStatsDisplay();
    }

    function incrementBeatCount() {
        totalBeatsPlayed++;
        updateStatsDisplay();
    }

    function updateMinLoopBeats(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = Math.max(4, Math.round(num));
        if (num === minLoopBeats) {
            return false;
        }
        minLoopBeats = num;
        if (maxSequentialBeats <= minLoopBeats) {
            maxSequentialBeats = minLoopBeats + 2;
        }
        if (!opts || opts.skipRebuild !== true) {
            rebuildLoopChoices();
        }
        return true;
    }

    function updateMaxSequentialBeats(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = Math.max(minLoopBeats + 2, Math.round(num));
        if (num === maxSequentialBeats) {
            return false;
        }
        maxSequentialBeats = num;
        if (!opts || opts.skipReschedule !== true) {
            scheduleNextJump(true);
        }
        return true;
    }

    function updateLoopThreshold(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = Math.max(0.05, Math.min(0.99, num));
        if (num === loopThreshold) {
            return false;
        }
        loopThreshold = num;
        if (!opts || opts.skipRebuild !== true) {
            rebuildLoopChoices();
        }
        return true;
    }

    function updateSectionBias(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = clamp01(num);
        if (num === sectionBias) {
            return false;
        }
        sectionBias = num;
        recalcLoopWeightParams();
        console.log('[updateSectionBias]', num, 'Ã¢â€ â€™ sameSectionBonus:', sameSectionBonusBase.toFixed(3), 'crossSectionBonus:', crossSectionBonusBase.toFixed(3));
        if (!opts || opts.skipReschedule !== true) {
            scheduleNextJump(true);
        }
        return true;
    }

    function updateJumpVariance(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = clamp01(num);
        if (num === jumpVariance) {
            return false;
        }
        jumpVariance = num;
        recalcLoopWeightParams();
        console.log('[updateJumpVariance]', num, 'Ã¢â€ â€™ weightJitter:', weightJitterStrength.toFixed(3), 'spanScale:', spanScaleBase.toFixed(3));
        if (!opts || opts.skipReschedule !== true) {
            scheduleNextJump(true);
        }
        return true;
    }

    var loopChoices = [];
    var loopGraph = {};
    var loopHistory = [];
    var LOOP_HISTORY_LIMIT = 8;
    var jumpBubbleHistory = [];
    var JUMP_BUBBLE_HISTORY_LIMIT = 24;
    var beatsUntilJump = 0;
    var recentSections = [];
    var sectionAnchors = [];
    var orderedSectionAnchors = [];
    var retreatPoint = null; // Fallback jump from end back to beginning

    (function initializeSectionAnchors() {
        if (!masterQs || !masterQs.length) {
            return;
        }
        for (var i = 0; i < masterQs.length; i++) {
            var beat = masterQs[i];
            if (!beat) {
                continue;
            }
            var sec = (typeof beat.section === "number") ? beat.section : null;
            if (sec === null || sec === undefined) {
                continue;
            }
            if (sectionAnchors[sec] === undefined) {
                sectionAnchors[sec] = beat.which;
            }
        }
        for (var s = 0; s < sectionAnchors.length; s++) {
            if (typeof sectionAnchors[s] === "number") {
                orderedSectionAnchors.push(sectionAnchors[s]);
            }
        }
        orderedSectionAnchors.sort(function(a, b) { return a - b; });
    })();

    function clearJumpBubbleHistory() {
        jumpBubbleHistory = [];
    }

    function getCurrentJumpBubbleRadius() {
        var radius = 0;
        var sourceSettings = null;
        if (mode === "eternal") {
            sourceSettings = (advancedSettings && advancedSettings.eternalOverlay) || null;
        } else {
            sourceSettings = canonSettings;
        }
        if (sourceSettings && sourceSettings.jumpBubbleBeats !== undefined) {
            radius = sourceSettings.jumpBubbleBeats;
        }
        var num = coerceNumber(radius);
        if (num === null) {
            return 0;
        }
        return Math.max(0, Math.round(num));
    }

    function circularBeatDistance(a, b) {
        if (!masterQs || !masterQs.length) {
            return Math.abs(a - b);
        }
        var total = masterQs.length;
        var diff = Math.abs(a - b);
        return Math.min(diff, total - diff);
    }

    function registerJumpBubble(targetIndex) {
        var radius = getCurrentJumpBubbleRadius();
        if (!radius || radius <= 0) {
            return;
        }
        jumpBubbleHistory.push({
            center: targetIndex,
            radius: radius
        });
        if (jumpBubbleHistory.length > JUMP_BUBBLE_HISTORY_LIMIT) {
            jumpBubbleHistory.shift();
        }
    }

    function isWithinJumpBubble(targetIndex, activeRadius) {
        if (!jumpBubbleHistory.length) {
            return false;
        }
        var radiusOverride = Math.max(0, activeRadius || 0);
        for (var i = jumpBubbleHistory.length - 1; i >= 0; i--) {
            var entry = jumpBubbleHistory[i];
            if (!entry) {
                continue;
            }
            var finalRadius = Math.max(radiusOverride, entry.radius || 0);
            if (finalRadius <= 0) {
                continue;
            }
            var dist = circularBeatDistance(entry.center, targetIndex);
            if (dist <= finalRadius) {
                return true;
            }
        }
        return false;
    }

    function pausePlayback() {
        if (!running) {
            return;
        }
        running = false;
        player.stop();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        stopStatsTracking();
    }

    function stop() {
        running = false;
        player.stop();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        clearJumpBubbleHistory();
        stopStatsTracking();
        resetPlaybackState();
    }

    function randomBetween(min, max) {
        if (max <= min) {
            return min;
        }
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    function normalizeLoop(loop) {
        if (!loop) {
            return null;
        }
        var src = Math.max(0, Math.floor(loop.source_start));
        var dst = Math.max(0, Math.floor(loop.target_start));
        if (src === dst || src >= masterQs.length || dst >= masterQs.length) {
            return null;
        }
        var span = Math.abs(src - dst);
        if (span < minLoopBeats) {
            return null;
        }
        var sim = (typeof loop.similarity === "number") ? loop.similarity : 0;
        return {
            source_start: src,
            target_start: dst,
            similarity: sim,
            span: span,
            abs_span: typeof loop.abs_span === "number" ? loop.abs_span : span,
            direction: loop.direction || (dst < src ? "backward" : "forward"),
            section_match: !!loop.section_match,
            score: (typeof loop.score === "number") ? loop.score : null,
            beat_in_bar: (typeof loop.beat_in_bar === "number") ? loop.beat_in_bar : null,
            bar_length_beats: (typeof loop.bar_length_beats === "number") ? loop.bar_length_beats : null,
            chroma_similarity: (typeof loop.chroma_similarity === "number") ? loop.chroma_similarity : null,
            source_energy: (typeof loop.source_energy === "number") ? loop.source_energy : null,
            target_energy: (typeof loop.target_energy === "number") ? loop.target_energy : null
        };
    }

    function beatPhase(beat, fallbackMod) {
        if (!beat) return 0;
        if (typeof beat.beat_in_bar === "number") return beat.beat_in_bar;
        if (typeof beat.indexInParent === "number") return beat.indexInParent;
        return beat.which % (fallbackMod || 4);
    }

    function beatEnergy(beat) {
        if (!beat) return 0;
        if (typeof beat.median_volume === "number") return beat.median_volume;
        if (typeof beat.volume === "number") return beat.volume;
        if (typeof beat.loudness === "number") return beat.loudness;
        return 0;
    }

    function markBarVisit(beat) {
        if (!beat || typeof beat.bar_index !== "number") return;
        var idx = beat.bar_index;
        visitedBars[idx] = (visitedBars[idx] || 0) + 1;
    }

    function registerEdge(src, dst, similarity, span, direction, sectionMatch) {
        var meta = null;
        if (typeof src === "object" && src !== null && typeof dst === "undefined") {
            meta = src;
            src = meta.source_start;
            dst = meta.target_start;
            similarity = meta.similarity;
            span = meta.span;
            direction = meta.direction;
            sectionMatch = meta.section_match;
        }
        if (src < 0 || dst < 0 || src >= masterQs.length || dst >= masterQs.length || src === dst) {
            return;
        }
        if (!loopGraph[src]) {
            loopGraph[src] = [];
        }

        // Determine section match if not provided
        var sameSection = sectionMatch;
        if (sameSection === undefined || sameSection === null) {
            try {
                var s1 = masterQs[src] ? masterQs[src].section : null;
                var s2 = masterQs[dst] ? masterQs[dst].section : null;
                sameSection = (s1 !== null && s2 !== null && s1 === s2);
            } catch (e) {
                sameSection = false;
            }
        }

        var edge = {
            target: dst,
            similarity: similarity,
            span: span,
            direction: direction || (dst < src ? 'backward' : 'forward'),
            sameSection: sameSection
        };
        if (meta) {
            if (meta.score !== undefined) edge.score = meta.score;
            if (meta.abs_span !== undefined) edge.abs_span = meta.abs_span;
            if (meta.beat_in_bar !== undefined) edge.beat_in_bar = meta.beat_in_bar;
            if (meta.bar_length_beats !== undefined) edge.bar_length_beats = meta.bar_length_beats;
            if (meta.chroma_similarity !== undefined) edge.chroma_similarity = meta.chroma_similarity;
            if (meta.source_energy !== undefined) edge.source_energy = meta.source_energy;
            if (meta.target_energy !== undefined) edge.target_energy = meta.target_energy;
        }
        loopGraph[src].push(edge);
    }

    function collectLoopEdgesFromServer(threshold, minBeats) {
        var edges = [];
        _.each(serverLoopCandidateMap, function(entries, key) {
            var src = parseInt(key, 10);
            if (isNaN(src)) {
                return;
            }
            _.each(entries, function(entry) {
                if (!entry) {
                    return;
                }
                var dst = entry.target;
                if (typeof dst !== "number" || dst < 0 || dst >= masterQs.length) {
                    return;
                }
                // CIRCULAR TIMELINE: Accept both forward and backward jumps
                // No longer require dst < src

                var sim = (typeof entry.similarity === "number") ? entry.similarity : 0;
                if (sim < threshold) {
                    return;
                }

                // Use provided span if available, otherwise compute
                var span = entry.span || (dst - src);
                var absSpan = Math.abs(span);
                if (absSpan < minBeats) {
                    return;
                }

                edges.push({
                    source_start: src,
                    target_start: dst,
                    similarity: sim,
                    span: span,
                    direction: entry.direction || (dst < src ? 'backward' : 'forward'),
                    section_match: entry.section_match || false,
                    score: entry.score,
                    abs_span: entry.abs_span,
                    beat_in_bar: entry.beat_in_bar,
                    bar_length_beats: entry.bar_length_beats,
                    chroma_similarity: entry.chroma_similarity,
                    source_energy: entry.source_energy,
                    target_energy: entry.target_energy
                });
            });
        });
        var dedup = {};
        var results = [];
        _.each(edges, function(edge) {
            var key = edge.source_start + ":" + edge.target_start;
            if (!dedup[key]) {
                dedup[key] = true;
                results.push(edge);
            }
        });
        return results;
    }

    function collectFallbackLoops(qlist, minBeats) {
        var loops = [];
        var seen = {};
        _.each(qlist, function(q) {
            if (!q.goodNeighbors || !q.goodNeighbors.length) {
                return;
            }
            _.each(q.goodNeighbors, function(entry) {
                if (!entry || !entry.beat) {
                    return;
                }
                var src = q.which;
                var dst = entry.beat.which;
                if (typeof src !== "number" || typeof dst !== "number") {
                    return;
                }
                if (dst >= src) {
                    return;
                }
                var span = src - dst;
                if (span < minBeats) {
                    return;
                }
                var key = src + ":" + dst;
                if (seen[key]) {
                    return;
                }
                seen[key] = true;
                var distance = (typeof entry.distance === "number") ? entry.distance : 180;
                var sim = 1 - Math.min(1, distance / 240);
                loops.push({
                    source_start: src,
                    target_start: dst,
                    similarity: sim,
                    span: span
                });
            });
        });
        loops.sort(function(a, b) {
            return b.similarity - a.similarity;
        });
        return loops;
    }

    function rebuildLoopChoices() {
        console.log('[rebuildLoopChoices] minLoopBeats:', minLoopBeats, 'loopThreshold:', loopThreshold);
        loopGraph = {};
        visitedBars = {};
        var loops = [];

        // Always try to use server loop data first (it has the most comprehensive data)
        var serverEdges = collectLoopEdgesFromServer(loopThreshold, minLoopBeats);
        if (serverEdges && serverEdges.length) {
            var totalServerEdges = serverEdges.length;
            var sampleSims = [];
            _.each(serverEdges, function(loop) {
                var normalized = normalizeLoop(loop);
                if (normalized) {
                    if (sampleSims.length < 10) {
                        sampleSims.push(normalized.similarity.toFixed(3));
                    }
                    loops.push(normalized);
                    registerEdge(normalized);
                }
            });
            console.log('[rebuildLoopChoices] Using server edges (circular, bidirectional). Total:', totalServerEdges, 'Normalized:', loops.length, 'Sample sims:', sampleSims.join(', '));
        }

        // Fallback to canonLoopCandidates only if server data is missing
        if (!loops.length && canonLoopCandidates && canonLoopCandidates.length) {
            var totalCandidates = canonLoopCandidates.length;
            var passedCount = 0;
            var sampleSims = [];
            _.each(canonLoopCandidates, function(loop) {
                var normalized = normalizeLoop(loop);
                if (normalized) {
                    if (sampleSims.length < 10) {
                        sampleSims.push(normalized.similarity.toFixed(3));
                    }
                    if (normalized.similarity >= loopThreshold) {
                        loops.push(normalized);
                        registerEdge(normalized);
                        passedCount++;
                    }
                }
            });
            console.log('[rebuildLoopChoices] Using canonLoopCandidates. Total:', totalCandidates, 'Passed threshold:', passedCount, 'Sample sims:', sampleSims.join(', '));
        }
        if (!loops.length) {
            _.each(collectFallbackLoops(masterQs, minLoopBeats), function(loop) {
                var normalized = normalizeLoop(loop);
                if (normalized) {
                    loops.push(normalized);
                    registerEdge(normalized);
                }
            });
        }
        if (orderedSectionAnchors.length > 1) {
            for (var idx = 1; idx < orderedSectionAnchors.length; idx++) {
                var anchorSrc = orderedSectionAnchors[idx];
                var anchorDst = orderedSectionAnchors[idx - 1];
                if (typeof anchorSrc !== "number" || typeof anchorDst !== "number") {
                    continue;
                }
                var span = anchorSrc - anchorDst;
                if (span < minLoopBeats) {
                    continue;
                }
                var bridge = {
                    source_start: anchorSrc,
                    target_start: anchorDst,
                    similarity: 0.25 + (idx % 4) * 0.05,
                    span: span
                };
                loops.push(bridge);
                registerEdge(bridge);
            }
        }
        loopChoices = loops;
        loopHistory = [];
        clearJumpBubbleHistory();
        recentSections = [];
        scheduleNextJump(true);

        // Update global canonLoopCandidates so visualization can see the filtered loops
        if (typeof canonLoopCandidates !== "undefined") {
            canonLoopCandidates = loops.slice(0);
        }

        // Refresh visualization to show updated loop connections
        if (masterQs && masterQs.length && (mode === "jukebox" || mode === "eternal")) {
            var loopEdges = collectVisualizationLoops(80);
            drawCircularLoopConnections(masterQs, loopEdges);
        }
    }

    function findRetreatPoint() {
        retreatPoint = null;
        if (!masterQs || masterQs.length < 40) {
            return;
        }

        // Define "end zone" as last 15% of track and "start zone" as first 30%
        // Using a smaller end zone to catch earlier and avoid getting stuck
        var endZoneStart = Math.floor(masterQs.length * 0.85);
        var startZoneEnd = Math.floor(masterQs.length * 0.3);

        var bestRetreat = null;
        var bestSimilarity = -1;

        // Search for the best jump from end zone to start zone
        // Look for high-similarity anchor that makes seamless wraparound
        for (var srcIdx = endZoneStart; srcIdx < masterQs.length; srcIdx++) {
            var edges = loopGraph[srcIdx];
            if (!edges || !edges.length) {
                continue;
            }
            _.each(edges, function(edge) {
                // Prefer targets very early in the song (first 20%) for clean wraparound
                var earlyBonus = edge.target < Math.floor(masterQs.length * 0.2) ? 0.1 : 0;
                var adjustedSimilarity = edge.similarity + earlyBonus;

                if (edge.target < startZoneEnd && adjustedSimilarity > bestSimilarity) {
                    bestSimilarity = adjustedSimilarity;
                    bestRetreat = {
                        source: srcIdx,
                        target: edge.target,
                        similarity: edge.similarity
                    };
                }
            });
        }

        // If no good retreat found in loop graph, create multiple fallback anchors
        if (!bestRetreat) {
            // Try to find ANY edge from last 10% to first 30%
            var veryEndStart = Math.floor(masterQs.length * 0.9);
            for (var srcIdx = veryEndStart; srcIdx < masterQs.length; srcIdx++) {
                var edges = loopGraph[srcIdx];
                if (edges && edges.length) {
                    _.each(edges, function(edge) {
                        if (edge.target < startZoneEnd) {
                            if (!bestRetreat || edge.similarity > bestRetreat.similarity) {
                                bestRetreat = {
                                    source: srcIdx,
                                    target: edge.target,
                                    similarity: edge.similarity
                                };
                            }
                        }
                    });
                }
            }
        }

        // Last resort: use section anchors
        if (!bestRetreat && orderedSectionAnchors.length > 2) {
            var lastSection = orderedSectionAnchors[orderedSectionAnchors.length - 1];
            var firstSection = orderedSectionAnchors[0];
            if (lastSection && firstSection && lastSection > endZoneStart && firstSection < startZoneEnd) {
                bestRetreat = {
                    source: lastSection,
                    target: firstSection,
                    similarity: 0.45 // Moderate similarity fallback
                };
            }
        }

        retreatPoint = bestRetreat;
        if (retreatPoint) {
            console.log('[findRetreatPoint] Found retreat anchor:', retreatPoint.source, 'Ã¢â€ â€™', retreatPoint.target,
                        'similarity:', retreatPoint.similarity.toFixed(3), '| This prevents end-zone loops');
        } else {
            console.log('[findRetreatPoint] No suitable retreat point found - may loop at end');
        }
    }

    function scheduleNextJump(force) {
        var minB = minLoopBeats;
        var maxB = Math.max(minB + 1, maxSequentialBeats);
        var span = Math.max(2, maxB - minB);
        var bias = jumpVariance;
        var upperFrac = force ? (0.3 + bias * 0.3) : (0.55 + bias * 0.4);
        var lowerFrac = force ? Math.max(0, bias * 0.1) : Math.max(0, bias * 0.3);
        var upper = Math.max(minB + 1, Math.min(maxB, minB + Math.round(span * upperFrac)));
        var lower = Math.max(minB, Math.min(upper - 1, minB + Math.round(span * lowerFrac)));
        if (lower >= upper) {
            lower = Math.max(minB, upper - 1);
        }
        if (lower >= upper) {
            lower = minB;
        }
        beatsUntilJump = randomBetween(lower, upper);
    }

    function recordSectionVisit(sectionIdx) {
        if (sectionIdx === undefined || sectionIdx === null) {
            return;
        }
        recentSections.push(sectionIdx);
        if (recentSections.length > 12) {
            recentSections.shift();
        }
    }

    function fallbackReentryTarget() {
        if (!masterQs || !masterQs.length) {
            return 0;
        }
        for (var probe = Math.min(masterQs.length - 1, currentIndex); probe >= 0; probe--) {
            var edges = loopGraph[probe];
            if (edges && edges.length) {
                var candidate = selectJumpCandidate(probe);
                if (candidate) {
                    return candidate.target;
                }
            }
        }
        if (orderedSectionAnchors.length) {
            return orderedSectionAnchors[Math.floor(Math.random() * orderedSectionAnchors.length)];
        }
        return Math.max(0, Math.floor(masterQs.length / 3));
    }

    function selectJumpCandidate(src) {
        if (!masterQs || !masterQs.length) {
            return null;
        }

        // Collect candidates from current beat and nearby beats
        var searchRadius = Math.min(8, Math.floor(minLoopBeats / 2));
        var candidates = [];
        for (var offset = 0; offset <= searchRadius; offset++) {
            var searchIdx = src + offset;
            if (searchIdx >= 0 && searchIdx < masterQs.length && loopGraph[searchIdx]) {
                _.each(loopGraph[searchIdx], function(edge) {
                    candidates.push({ source: searchIdx, edge: edge, distance: offset });
                });
            }
            if (offset > 0) {
                searchIdx = src - offset;
                if (searchIdx >= 0 && searchIdx < masterQs.length && loopGraph[searchIdx]) {
                    _.each(loopGraph[searchIdx], function(edge) {
                        candidates.push({ source: searchIdx, edge: edge, distance: offset });
                    });
                }
            }
        }
        if (!candidates.length) {
            return null;
        }

        // Recency filter on last few jumps
        var filtered = _.filter(candidates, function(item) {
            for (var i = loopHistory.length - 1; i >= Math.max(0, loopHistory.length - 4); i--) {
                var hist = loopHistory[i];
                if (!hist) {
                    continue;
                }
                if ((hist.source === item.source && hist.target === item.edge.target) ||
                    (hist.source === item.edge.target && hist.target === item.source)) {
                    return false;
                }
            }
            return true;
        });
        if (!filtered.length) {
            filtered = candidates.slice(0);
        }

        // Jump bubble (stay out of recently visited region)
        var currentBubbleRadius = getCurrentJumpBubbleRadius();
        if (currentBubbleRadius > 0 && jumpBubbleHistory.length) {
            var bubbleFiltered = _.filter(filtered, function(item) {
                return item && !isWithinJumpBubble(item.edge.target, currentBubbleRadius);
            });
            if (bubbleFiltered.length) {
                filtered = bubbleFiltered;
            }
        }

        var scored = [];
        var srcBeat = masterQs[src];
        var srcPhase = beatPhase(srcBeat, 4);
        var srcEnergy = beatEnergy(srcBeat);
        var endZoneStart = Math.floor(masterQs.length * 0.8);
        var startZoneEnd = Math.floor(masterQs.length * 0.3);
        var inEndZone = src >= endZoneStart;

        _.each(filtered, function(item) {
            var edge = item.edge;
            var targetIdx = edge.target;
            var targetBeat = masterQs[targetIdx];
            if (!targetBeat) {
                return;
            }

            // Phase lock (bar-aware)
            var targetPhase = edge.beat_in_bar !== undefined && edge.beat_in_bar !== null
                ? edge.beat_in_bar
                : beatPhase(targetBeat, 4);
            if (srcPhase !== null && targetPhase !== null && srcPhase !== targetPhase) {
                return;
            }

            var spanVal = (typeof edge.span === "number") ? edge.span : (targetIdx - item.source);
            var absSpan = Math.abs(spanVal);
            var direction = edge.direction || (spanVal < 0 ? "backward" : "forward");

            // Backward safety
            if (direction === "backward") {
                if (!edge.sameSection || absSpan > maxBackward) {
                    return;
                }
                if (modeState === "explore") {
                    return;
                }
                if (beatsSinceJump < (minDwellBeats + 2)) {
                    return;
                }
            }

            // Energy guard
            var targetEnergy = (typeof edge.target_energy === "number") ? edge.target_energy : beatEnergy(targetBeat);
            var sourceEnergy = (typeof edge.source_energy === "number") ? edge.source_energy : srcEnergy;
            if (typeof targetEnergy === "number" && typeof sourceEnergy === "number") {
                if (targetEnergy < -50) {
                    return;
                }
                if (sourceEnergy > 0 && targetEnergy < sourceEnergy * 0.6) {
                    return;
                }
            }

            // Visited bar penalty
            var barIdx = (typeof targetBeat.bar_index === "number") ? targetBeat.bar_index : null;
            var barVisits = barIdx !== null ? (visitedBars[barIdx] || 0) : 0;
            if (barVisits >= 4) {
                return;
            }
            var visitPenalty = barVisits * 0.08;

            // Similarity + musical bonuses
            var baseScore;
            if (typeof edge.score === "number") {
                baseScore = edge.score;
            } else {
                baseScore = clamp01((edge.similarity + 1) / 2);
            }
            var chromaBonus = (typeof edge.chroma_similarity === "number") ? Math.max(0, edge.chroma_similarity) * 0.15 : 0;
            var sectionBonus = edge.sameSection ? sameSectionBonusBase : crossSectionBonusBase * 0.5;
            var directionBias = direction === "forward" ? 0.05 : -0.05;
            var energyBonus = 0;
            if (typeof targetEnergy === "number" && typeof sourceEnergy === "number" && sourceEnergy !== 0) {
                var ratio = targetEnergy / sourceEnergy;
                energyBonus = Math.min(0.12, Math.max(-0.2, (ratio - 0.8) * 0.3));
            }

            // End-zone guard: prefer to escape
            var endZoneBonus = 0;
            if (inEndZone && targetIdx < startZoneEnd) {
                endZoneBonus += 0.2;
            } else if (inEndZone && targetIdx >= endZoneStart) {
                endZoneBonus -= 0.2;
            }

            var score = baseScore + chromaBonus + sectionBonus + directionBias + energyBonus + endZoneBonus - visitPenalty;
            var qualityScore = scoreJumpQuality(edge, {
                modeName: modeName,
                currentIndex: src,
                totalBeats: masterQs.length,
                dwellBeats: minDwellBeats,
                minLoopBeats: minLoopBeats,
            });
            if (qualityScore !== null) {
                score += (qualityScore - 0.5) * 0.2;
            }

            scored.push({
                source: item.source,
                edge: edge,
                target: targetIdx,
                span: spanVal,
                score: score,
                qualityScore: qualityScore,
                barVisits: barVisits,
                direction: direction
            });
        });

        if (!scored.length) {
            return null;
        }
        scored.sort(function(a, b) {
            return b.score - a.score;
        });
        var best = scored[0];
        var dynamicMin = minScore;
        if (beatsSinceJump > minDwellBeats * 2) {
            dynamicMin -= 0.05;
        }
        if (best.direction === "backward") {
            dynamicMin += 0.05;
        }
        if (best.score < dynamicMin) {
            return null;
        }

        // Small wiggle room: choose among top 3 if very close
        var top = [best];
        for (var iTop = 1; iTop < Math.min(3, scored.length); iTop++) {
            if (scored[iTop].score >= best.score * 0.95) {
                top.push(scored[iTop]);
            }
        }
        var chosen = top.length > 1 ? top[Math.floor(Math.random() * top.length)] : best;
        if (typeof window !== "undefined" && window.__eternalLog) {
            try {
                window.__eternalLog.push({
                    type: "jump_candidates",
                    src: src,
                    best: best,
                    chosen: chosen,
                    total: scored.length,
                    dwell: beatsSinceJump,
                    minScore: dynamicMin
                });
            } catch (e) {
                // ignore
            }
        }
        return {
            source: src,
            target: chosen.target,
            similarity: chosen.edge.similarity,
            span: chosen.span,
            sameSection: chosen.edge.sameSection,
            qualityScore: chosen.score,
            direction: chosen.direction
        };
    }

    function advanceSequential() {
        currentIndex += 1;
        if (currentIndex >= masterQs.length) {
            var reentry = fallbackReentryTarget();
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, reentry));
            scheduleNextJump(true);
        }
    }

    function advanceIndex() {
        if (!masterQs || !masterQs.length) {
            return;
        }

        beatsSinceJump += 1;
        if (beatsUntilJump > 0) {
            beatsUntilJump -= 1;
        }

        // Check if we're in the end zone and should use retreat point
        var endZoneStart = Math.floor(masterQs.length * 0.8);
        var inEndZone = currentIndex >= endZoneStart;

        // If in end zone and have a retreat point, consider using it
        if (inEndZone && retreatPoint && currentIndex >= retreatPoint.source - 4) {
            // Force a retreat when we're very close to or past the retreat source point
            if (currentIndex >= retreatPoint.source || beatsUntilJump <= 2) {
                console.log('[advanceIndex] Using retreat point:', currentIndex, 'Ã¢â€ â€™', retreatPoint.target);
                var retreatSourceIndex = currentIndex;
                loopHistory.push({ source: currentIndex, target: retreatPoint.target });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = retreatPoint.target;
                registerJumpBubble(retreatPoint.target);
                var sourceBeat = masterQs[retreatSourceIndex];
                var targetBeat = masterQs[retreatPoint.target];
                beatsSinceJump = 0;
                emitJumpLog({
                    reason: "retreat",
                    source: retreatSourceIndex,
                    target: retreatPoint.target,
                    similarity: retreatPoint.similarity,
                    beatsUntilJump: beatsUntilJump,
                    bubbleRadius: getCurrentJumpBubbleRadius(),
                    context: { retreatSource: retreatPoint.source },
                    source_time: sourceBeat ? sourceBeat.start : null,
                    target_time: targetBeat ? targetBeat.start : null,
                    quality_score: null,
                });
                scheduleNextJump(false);
                return;
            }
        }

        if (beatsSinceJump >= minDwellBeats && beatsUntilJump <= 0) {
            var jump = selectJumpCandidate(currentIndex);
            if (jump) {
                var jumpSourceIndex = currentIndex;
                loopHistory.push({ source: currentIndex, target: jump.target });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = jump.target;
                registerJumpBubble(jump.target);
                var sourceBeat = masterQs[jumpSourceIndex];
                var targetBeat = masterQs[jump.target];
                beatsSinceJump = 0;
                modeState = jump.direction === "backward" ? "looping" : "explore";
                emitJumpLog({
                    reason: "scheduled",
                    source: jumpSourceIndex,
                    target: jump.target,
                    similarity: jump.similarity,
                    span: jump.span,
                    sameSection: jump.sameSection,
                    beatsUntilJump: beatsUntilJump,
                    bubbleRadius: getCurrentJumpBubbleRadius(),
                    source_time: sourceBeat ? sourceBeat.start : null,
                    target_time: targetBeat ? targetBeat.start : null,
                    quality_score: jump.qualityScore,
                });
                scheduleNextJump(false);
                return;
            }
            scheduleNextJump(true);
        }
        advanceSequential();
    }

    function process() {
        if (!running) {
            return;
        }
        var q = masterQs[currentIndex];
        recordSectionVisit(q.section);
        markBarVisit(q);
        incrementBeatCount();
        var delay = player.playQ(q);
        q.tile.highlight();
        // Highlight overlays for multi-voice canon
        if (q.others && Array.isArray(q.others)) {
            for (var v = 0; v < q.others.length; v++) {
                var ob = q.others[v];
                if (ob && ob.tile) {
                    ob.tile.highlight2(getOverlayColor(v, q.others.length));
                }
            }
        } else if (q.other && q.other.tile) {
            q.other.tile.highlight2();
        }
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);
        if (delay <= 0 || isNaN(delay)) {
            delay = q.duration;
        }
        advanceIndex();
        setTimeout(function() { process(); }, 1000 * delay);
    }

    return {
        start: function() {
            resetTileColors(masterQs);
            currentIndex = 0;
            beatsSinceJump = minDwellBeats;
            modeState = "explore";
            rebuildLoopChoices();
            resetStats();
            running = true;
            startStatsTracking();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            resetTileColors(masterQs);
            rebuildLoopChoices();
            beatsSinceJump = minDwellBeats;
            modeState = "explore";
            running = true;
            startStatsTracking();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,

        isRunning: function() {
            return running;
        },

        process: function() {
            process();
        },
        player: player,

        setMinLoopBeats: function(value) {
            updateMinLoopBeats(value);
        },

        setMaxSequentialBeats: function(value) {
            updateMaxSequentialBeats(value);
        },

        setLoopSimilarityThreshold: function(value) {
            updateLoopThreshold(value);
        },

        setLoopSectionBias: function(value) {
            updateSectionBias(value);
        },

        setLoopJumpVariance: function(value) {
            updateJumpVariance(value);
        },

        recomputeLoopGraph: function(newSettings) {
            if (!newSettings || typeof newSettings !== "object") {
                rebuildLoopChoices();
                return;
            }
            var needsRebuild = false;
            var needsReschedule = false;
            if (Object.prototype.hasOwnProperty.call(newSettings, "minLoopBeats")) {
                if (updateMinLoopBeats(newSettings.minLoopBeats, { skipRebuild: true })) {
                    needsRebuild = true;
                }
            }
            if (Object.prototype.hasOwnProperty.call(newSettings, "maxSequentialBeats")) {
                if (updateMaxSequentialBeats(newSettings.maxSequentialBeats, { skipReschedule: true })) {
                    needsReschedule = true;
                }
            }
            if (Object.prototype.hasOwnProperty.call(newSettings, "loopThreshold")) {
                if (updateLoopThreshold(newSettings.loopThreshold, { skipRebuild: true })) {
                    needsRebuild = true;
                }
            }
            if (Object.prototype.hasOwnProperty.call(newSettings, "sectionBias")) {
                if (updateSectionBias(newSettings.sectionBias, { skipReschedule: true })) {
                    needsReschedule = true;
                }
            }
            if (Object.prototype.hasOwnProperty.call(newSettings, "jumpVariance")) {
                if (updateJumpVariance(newSettings.jumpVariance, { skipReschedule: true })) {
                    needsReschedule = true;
                }
            }
            if (needsRebuild) {
                rebuildLoopChoices();
            } else if (needsReschedule) {
                scheduleNextJump(true);
            } else {
                rebuildLoopChoices();
            }
        },

        setNextQ: function(q) {
            currentIndex = q.which;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            } else {
                scheduleNextJump(true);
            }
        },

        // Expose currentIndex and running as properties for debugging/testing
        get curQ() {
            return currentIndex;
        },
        get running() {
            return running;
        }
    };
}

function createAutoharmonizerDriver(player) {
    // Autoharmonizer: dual-track fusion with cross-track jumping and sculpted transitions
    var curQ = 0;
    var currentTrack = 1;
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var beatsSinceCross = 0;
    var beatsSinceJump = 0;
    var rlConfig = getCanonRlTuning();
    var rlMinDwell = Math.max(2, rlConfig.minDwell);
    var rlRepeatPenalty = rlConfig.repeatPenalty;
    var MIN_BEATS_BEFORE_CROSS = Math.max(2, Math.round(rlMinDwell / 2));
    var FORCE_CROSS_AFTER = Math.max(MIN_BEATS_BEFORE_CROSS + 2, rlMinDwell + 2);
    var crossRecentTargets = [];
    var CROSS_TARGET_LIMIT = 16;
    var CROSS_RECENT_LIMIT = Math.max(4, Math.round(rlRepeatPenalty / 2) + 4);
    var CROSS_REPEAT_FACTOR = Math.max(0.2, 1 - rlRepeatPenalty / 32);
    // Let phrases breathe: push cross boredom out
    var BORING_CROSS_AFTER = 96; // ~24 bars
    var FORCE_CROSS_ONLY_AFTER = 104;

    var autoharmonizerData = curTrack && curTrack.analysis && curTrack.analysis.autoharmonizer;
    if (!autoharmonizerData) {
        console.warn("[Autoharmonizer] Autoharmonizer data missing — deferring driver init");
        return null;
    }

    var track1Data = autoharmonizerData.track1 || {};
    var track2Data = autoharmonizerData.track2 || {};
    var crossSimilarity = autoharmonizerData.cross_similarity || {};

    if (!track1Data.beats || !track1Data.beats.length || !track2Data.beats || !track2Data.beats.length) {
        console.error("[Autoharmonizer] Missing beat data for one or both tracks");
        error("trouble loading audio");
        return createCanonDriver(player);
    }

    var track1Source =
        track1Data.audio_url ||
        (track1Data.info && track1Data.info.url) ||
        (curTrack && curTrack.info && curTrack.info.url) ||
        curTrack.audio_url ||
        "";
    var track2Source =
        track2Data.audio_url ||
        (track2Data.info && track2Data.info.url) ||
        "";

    if (!track1Source || !track2Source) {
        console.error("[Autoharmonizer] Unable to resolve audio sources", {
            track1Source: track1Source,
            track2Source: track2Source,
            track1Data: track1Data,
            track2Data: track2Data
        });
        error("trouble loading audio");
        return createCanonDriver(player);
    }

    console.log("[Autoharmonizer] Initializing dual-track playback", {
        track1Source: track1Source,
        track2Source: track2Source,
        track1Beats: track1Data.beats.length,
        track2Beats: track2Data.beats.length
    });

    var track1Controller = createHtmlAudioController(track1Source, { volume: 0.0 });
    var track2Controller = createHtmlAudioController(track2Source, { volume: 0.0 });
    if (!track1Controller || !track2Controller) {
        console.error("[Autoharmonizer] Failed to initialize HTML audio controllers");
        error("trouble loading audio");
        return createCanonDriver(player);
    }
    if (track1Controller.ensureLoaded) {
        track1Controller.ensureLoaded();
    }
    if (track2Controller.ensureLoaded) {
        track2Controller.ensureLoaded();
    }

    console.log("[Autoharmonizer] Controllers initialized successfully");
    if (typeof window !== "undefined") {
        window.__autohLog = [];
    }

    // Build joint edge map (intra + cross) with scoring
    var jointEdges = (autoharmonizerData && autoharmonizerData.joint_edges) || [];
    var params = (autoharmonizerData && autoharmonizerData.params) || {};
    var silenceThreshold = typeof params.silence_threshold === "number" ? params.silence_threshold : -45;
    var minDwellBeats = typeof params.min_dwell_beats === "number" ? params.min_dwell_beats : 6;
    var crossMinBeats = typeof params.cross_min_beats === "number" ? params.cross_min_beats : 8;
    var minEdgeScore = typeof params.min_edge_score === "number" ? params.min_edge_score : 0.7;
    var maxBackwardBeats = typeof params.max_backward_beats === "number" ? params.max_backward_beats : 12;
    var energies1 = track1Data.energies || [];
    var energies2 = track2Data.energies || [];
    var tempo1 = typeof track1Data.tempo === "number" ? track1Data.tempo : 120;
    var tempo2 = typeof track2Data.tempo === "number" ? track2Data.tempo : 120;
    var recentScores = [];
    var vocal1 = track1Data.vocality || [];
    var vocal2 = track2Data.vocality || [];
    var visitedBars = { 1: {}, 2: {} };

    var edgesByTrack = { 1: {}, 2: {} };
    jointEdges.forEach(function(edge) {
        var t = edge.source_track || 1;
        var idx = edge.source_index || 0;
        if (!edgesByTrack[t][idx]) {
            edgesByTrack[t][idx] = [];
        }
        edgesByTrack[t][idx].push(edge);
    });
    Object.keys(edgesByTrack).forEach(function(trackKey) {
        var t = parseInt(trackKey, 10);
        Object.keys(edgesByTrack[t]).forEach(function(idxKey) {
            edgesByTrack[t][idxKey].sort(function(a, b) {
                var sa = (typeof a.score === "number") ? a.score : (a.similarity || 0);
                var sb = (typeof b.score === "number") ? b.score : (b.similarity || 0);
                return sb - sa;
            });
        });
    });

    function getBeatsForTrack(trackNum) {
        return trackNum === 1 ? track1Data.beats : track2Data.beats;
    }

    function getControllerForTrack(trackNum) {
        return trackNum === 1 ? track1Controller : track2Controller;
    }

    function energyFor(trackNum, idx) {
        if (trackNum === 1 && typeof energies1[idx] === "number") return energies1[idx];
        if (trackNum === 2 && typeof energies2[idx] === "number") return energies2[idx];
        return silenceThreshold;
    }
    function tempoFor(trackNum) {
        return trackNum === 1 ? tempo1 : tempo2;
    }
    function vocalFor(trackNum, idx) {
        if (trackNum === 1 && typeof vocal1[idx] === "number") return vocal1[idx];
        if (trackNum === 2 && typeof vocal2[idx] === "number") return vocal2[idx];
        return 0;
    }

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNextProcess(durationSeconds) {
        clearProcessTimer();
        var delayMs = Math.max(60, (durationSeconds || 0.1) * 1000);
        processTimer = setTimeout(function() {
            processTimer = null;
            process();
        }, delayMs);
    }

    function syncControllerToBeat(controller, beat, options) {
        if (!controller || !beat) {
            return;
        }
        var baseStart = beat.start || 0;
        var desiredStart = (options && typeof options.desiredStart === "number")
            ? options.desiredStart
            : baseStart + currentSyncOffset;
        var tolerance = (options && typeof options.tolerance === "number") ? options.tolerance : 0.12;
        var forceSeek = !!(options && options.forceSeek);
        var currentTime = controller.audio.currentTime || 0;
        if (forceSeek || !isFinite(currentTime) || Math.abs(currentTime - desiredStart) > tolerance) {
            controller.playFrom(desiredStart);
        } else {
            controller.ensurePlaying();
        }
    }

    function crossTargetId(trackNum, beatIndex) {
        return trackNum + ":" + beatIndex;
    }

    function markCrossTarget(trackNum, beatIndex) {
        if (typeof beatIndex !== "number" || beatIndex < 0) {
            return;
        }
        var id = crossTargetId(trackNum, beatIndex);
        crossRecentTargets.push(id);
        if (crossRecentTargets.length > CROSS_TARGET_LIMIT) {
            crossRecentTargets.shift();
        }
    }

    function isRecentCrossTarget(trackNum, beatIndex) {
        if (!crossRecentTargets || !crossRecentTargets.length) {
            return false;
        }
        var id = crossTargetId(trackNum, beatIndex);
        return crossRecentTargets.indexOf(id) !== -1;
    }

    function resetCrossHistory() {
        crossRecentTargets = [];
    }

    function crossfadeToTrack(targetTrack, beatIndex, crossfadeMs) {
        var targetBeats = getBeatsForTrack(targetTrack);
        var targetController = getControllerForTrack(targetTrack);
        var sourceTrack = targetTrack === 1 ? 2 : 1;
        var sourceController = getControllerForTrack(sourceTrack);
        var targetIdx = Math.max(0, Math.min(targetBeats.length - 1, beatIndex));
        if (targetIdx !== beatIndex) {
            console.warn("[Autoharmonizer] Clamping target beat index", beatIndex, "->", targetIdx, "for track", targetTrack);
        }
        var beat = targetBeats[targetIdx];

        if (!beat || !targetController) {
            console.warn("[Autoharmonizer] crossfadeToTrack failed - missing beat or controller", {
                targetTrack: targetTrack,
                beatIndex: targetIdx,
                hasBeat: !!beat,
                hasController: !!targetController
            });
            return;
        }

        var targetTempo = targetTrack === 1 ? tempo1 : tempo2;
        var quarterMs = 60000 / Math.max(40, Math.min(200, targetTempo));
        var fadeWindow = crossfadeMs || Math.max(320, Math.min(720, quarterMs * 0.5));
        // Pre-roll set to half the fade window (convert ms -> s) to land the transient near -3dB point
        var preRollSec = (fadeWindow * 0.5) / 1000.0;
        var targetStart = Math.max(0, (beat.start || 0) - preRollSec);

        console.log("[Autoharmonizer] Crossfading from Track", sourceTrack, "to Track", targetTrack, {
            beatIndex: targetIdx,
            beatTime: beat.start,
            targetStart: targetStart,
            duration: fadeWindow
        });

        // Start target track slightly before the beat
        // To avoid "blip then fade", set volume to 0 before seek and keep it until fade ramps
        targetController.setVolume(0);
        targetController.playFrom(targetStart);
        targetController.ensurePlaying();
        targetController.fadeTo(0.72, fadeWindow);

        // Fade out and pause source track after crossfade completes
        if (sourceController) {
            sourceController.ensurePlaying();
            sourceController.fadeTo(0, fadeWindow);
            setTimeout(function() {
                if (sourceController.audio && !sourceController.audio.paused) {
                    sourceController.audio.pause();
                }
            }, fadeWindow + 60);
        }

        currentTrack = targetTrack;
        curQ = targetIdx;
        beatsSinceCross = 0;
        currentSyncOffset = -preRollSec; // remember offset so sync accepts pre-roll timing
        lastCrossMeta = {
            track: targetTrack,
            beat: targetIdx,
            startedAt: Date.now(),
            targetStart: targetStart,
            fadeMs: fadeWindow,
            preRollSec: preRollSec
        };
        freezeSyncUntil = Date.now() + fadeWindow + 400; // hold sync through fade window + safety
        markCrossTarget(targetTrack, targetIdx);
        scheduleNextProcess(Math.max(beat.duration, 0.2));
    }

    var recentTargets = { 1: [], 2: [] };
    var RECENT_LIMIT = Math.max(10, rlRepeatPenalty + 6);
    var lastCrossMeta = null;
    var freezeSyncUntil = 0;
    var currentSyncOffset = 0; // seconds offset to honor pre-roll during sync

    function markRecent(trackNum, idx) {
        var key = trackNum + ":" + idx;
        recentTargets[trackNum].push(key);
        if (recentTargets[trackNum].length > RECENT_LIMIT) {
            recentTargets[trackNum].shift();
        }
        // Track bar visits to reduce repetition
        var beats = getBeatsForTrack(trackNum);
        var beat = beats && beats[idx];
        var barIndex = beat && typeof beat.bar_index === "number" ? beat.bar_index : null;
        if (barIndex !== null) {
            var map = visitedBars[trackNum];
            map[barIndex] = (map[barIndex] || 0) + 1;
        }
    }

    function decayVisitedBars() {
        // Gradually reduce bar-visit counts so we eventually revisit old areas
        [1, 2].forEach(function(trackNum) {
            var map = visitedBars[trackNum];
            Object.keys(map).forEach(function(k) {
                map[k] *= 0.92;
                if (map[k] < 0.1) {
                    delete map[k];
                }
            });
        });
    }

    function isRecent(trackNum, idx) {
        var key = trackNum + ":" + idx;
        return recentTargets[trackNum].indexOf(key) !== -1;
    }

    function selectBestEdge(currentBeatIdx, trackNum, options) {
        options = options || {};
        var edges = edgesByTrack[trackNum] && edgesByTrack[trackNum][currentBeatIdx] ? edgesByTrack[trackNum][currentBeatIdx].slice(0) : [];
        if (!edges.length) {
            return null;
        }
        var srcBeats = getBeatsForTrack(trackNum) || [];
        var best = null;
        var bestScore = -Infinity;
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            var tgtTrack = e.target_track || trackNum;
            var tgtIdx = typeof e.target_index === "number" ? e.target_index : parseInt(e.target_index, 10);
            if (!isFinite(tgtIdx)) {
                continue;
            }
            if (tgtTrack !== trackNum && options.allowCross === false) {
                continue;
            }
            if (options.forceCrossOnly && tgtTrack === trackNum) {
                continue;
            }
            var tgtEnergy = (typeof e.target_energy === "number") ? e.target_energy : energyFor(tgtTrack, tgtIdx);
            if (tgtEnergy <= silenceThreshold) {
                continue;
            }
            var candidateBeatList = getBeatsForTrack(tgtTrack);
            if (!candidateBeatList || tgtIdx >= candidateBeatList.length) {
                continue;
            }
            if (tgtTrack !== trackNum && isRecentCrossTarget(tgtTrack, tgtIdx)) {
                continue;
            }
            var score = (typeof e.score === "number") ? e.score : (e.similarity || 0);
            // Phase locking: penalize if beat positions in bar are misaligned
            var cb = srcBeats[currentBeatIdx];
            var tb = candidateBeatList[tgtIdx];
            var modSrc = cb && typeof cb.bar_length_beats === "number" ? cb.bar_length_beats : 4;
            var modTgt = tb && typeof tb.bar_length_beats === "number" ? tb.bar_length_beats : 4;
            var bSrc = cb && typeof cb.beat_in_bar === "number" ? cb.beat_in_bar : (currentBeatIdx % modSrc);
            var bTgt = tb && typeof tb.beat_in_bar === "number" ? tb.beat_in_bar : (tgtIdx % modTgt);
            var mod = Math.max(1, Math.min(modSrc, modTgt));
            var phaseDelta = Math.abs((bSrc % mod) - (bTgt % mod));
            if (phaseDelta !== 0) {
                score -= Math.min(0.4, phaseDelta / mod);
            } else {
                score += 0.08;
            }
            // Bar visit decay: discourage overused bars
            var barIndex = tb && typeof tb.bar_index === "number" ? tb.bar_index : null;
            if (barIndex !== null && visitedBars[tgtTrack]) {
                var visits = visitedBars[tgtTrack][barIndex] || 0;
                if (visits > 0) {
                    score -= Math.min(5.0, visits * 1.0); // strong burnout to avoid ping-pong
                }
            }
            // Vocal penalty: avoid jumping into very vocal targets unless score is strong
            var tgtVocal = vocalFor(tgtTrack, tgtIdx);
            if (tgtVocal > 4) {
                score -= 0.08;
            }
            // Prefer forward motion; penalize large backward hops
            if (tgtTrack === trackNum) {
                var span = tgtIdx - currentBeatIdx;
                if (span < 0) {
                    score -= Math.min(0.4, Math.abs(span) / (maxBackwardBeats * 2));
                } else {
                    var lenForBias = candidateBeatList.length || srcBeats.length || 512;
                    score += Math.min(0.12, span / lenForBias);
                }
            }
            // Section awareness
            if (e.same_section === false) {
                score -= 0.08;
            } else if (e.same_section === true) {
                score += 0.04;
            }
            if (tgtTrack === trackNum) {
                if (curQ > tgtIdx && (curQ - tgtIdx) > maxBackwardBeats && score < 0.85) {
                    continue;
                }
                if (beatsSinceCross < minDwellBeats) {
                    score -= 0.1;
                }
            } else {
                if (beatsSinceCross < crossMinBeats) {
                    score -= 0.25;
                }
            }
            if (isRecent(tgtTrack, tgtIdx)) {
                score -= 0.25;
            }
            if (options.preferCross && tgtTrack !== trackNum) {
                score += 0.12;
            }
            if (options.forceCross && tgtTrack !== trackNum) {
                score += 0.35;
            } else if (options.forceCross && tgtTrack === trackNum) {
                score -= 0.25;
            }
            if (tgtTrack === trackNum && beatsSinceCross >= BORING_CROSS_AFTER) {
                score -= 0.2;
            } else if (tgtTrack !== trackNum && beatsSinceCross >= BORING_CROSS_AFTER) {
                score += 0.2;
            }
            // tempo soft penalty instead of hard wall
            var tempoSrc = tempoFor(trackNum);
            var tempoTgt = tempoFor(tgtTrack);
            if (tempoSrc && tempoTgt) {
                var tempoDiff = Math.abs(tempoSrc - tempoTgt) / Math.max(tempoSrc, tempoTgt);
                score -= Math.min(0.2, tempoDiff * 0.8);
            }
            var minScore = (tgtTrack === trackNum) ? 0.60 : 0.60;
            // Adaptive hysteresis: tighten threshold when content is novel, relax when repetitive
            if (recentScores && recentScores.length >= 6) {
                var mean = recentScores.reduce(function(a, b) { return a + b; }, 0) / recentScores.length;
                var variance = recentScores.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / recentScores.length;
                var std = Math.sqrt(variance);
                if (std < 0.05) {
                    minScore -= 0.05; // boring → encourage jumps
                } else if (std > 0.15) {
                    minScore += 0.05; // novel → hold off
                }
            }
            // If current beat is very vocal, require a higher bar to avoid chopping words
            var currentVocal = vocalFor(currentTrack, currentBeatIdx);
            if (currentVocal > 4) {
                minScore += 0.05;
            }
            // dwell-aware threshold: early stricter, later looser
            if (beatsSinceJump < minDwellBeats + 2) {
                minScore += 0.05;
            } else if (beatsSinceJump > 16) {
                minScore -= 0.15;
            } else if (beatsSinceJump > 12) {
                minScore -= 0.08;
            }
            if (beatsSinceJump > 24) {
                minScore = Math.min(minScore, 0.35);
            }
            if (score < minScore) {
                continue;
            }
            if (score > bestScore) {
                bestScore = score;
                best = {
                    track: tgtTrack,
                    index: tgtIdx,
                    reason: e.reason || (tgtTrack === trackNum ? "intra-track" : "cross-track"),
                    similarity: e.similarity,
                    score: score
                };
            }
        }
        return best;
    }

function updateHudForBeat(beat) {
    if (!beat) {
        return;
    }
    if (beat.tile) {
        beat.tile.highlight();
        updateCursors(beat);
    }
    var beatTime = (typeof beat.start === "number") ? beat.start : 0;
    mtime.text(fmtTime(beatTime));
    pulseNotes(beat.median_volume || beat.volume || baseNoteStrength);
}

    function stopPlayback(options) {
        options = options || {};
        clearProcessTimer();
        running = false;
        beatsSinceCross = 0;
        resetCrossHistory();
        if (track1Controller) {
            track1Controller.fadeTo(0, 200);
            track1Controller.stop();
        }
        if (track2Controller) {
            track2Controller.fadeTo(0, 200);
            track2Controller.stop();
        }
        if (player && typeof player.stop === "function") {
            try {
                player.stop();
            } catch (err) {}
        }
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        if (options.resetPosition) {
            curQ = 0;
            currentTrack = 1;
        }
        resetPlaybackState();
    }

    function process() {
        if (!running) {
            return;
        }
        var beats = getBeatsForTrack(currentTrack);
        if (!beats || !beats.length) {
            stopPlayback({ resetPosition: true });
            return;
        }
        if (curQ >= beats.length) {
            curQ = 0;
        }
        var currentBeat = beats[curQ];
        if (!currentBeat) {
            stopPlayback({ resetPosition: true });
            return;
        }

        // Avoid any resync during the crossfade freeze window
        if (Date.now() > freezeSyncUntil) {
            var desired;
            var tol = 0.12;
            if (lastCrossMeta && lastCrossMeta.track === currentTrack && lastCrossMeta.beat === curQ) {
                var elapsedSec = Math.max(0, (Date.now() - lastCrossMeta.startedAt) / 1000);
                desired = (lastCrossMeta.targetStart || currentBeat.start || 0) + elapsedSec;
                tol = Math.max(0.2, (lastCrossMeta.preRollSec || 0.05) + 0.15);
            } else {
                desired = (currentBeat.start || 0) + currentSyncOffset;
            }
            var controller = getControllerForTrack(currentTrack);
            var actual = controller && controller.audio ? (controller.audio.currentTime || 0) : 0;
            var drift = Math.abs(actual - desired);
            if (drift > tol) {
                // Trust audio: move grid offset instead of seeking audio
                currentSyncOffset += (actual - desired);
            } else {
                syncControllerToBeat(controller, currentBeat, {
                    desiredStart: desired,
                    tolerance: tol
                });
            }
        }
        updateHudForBeat(currentBeat);
        decayVisitedBars();

        var beatDuration = Math.max(currentBeat.duration || 0.25, 0.15);
        var bored = beatsSinceCross >= BORING_CROSS_AFTER;
        var forceCrossOnly = beatsSinceCross >= FORCE_CROSS_ONLY_AFTER;
        var forceCross = beatsSinceCross >= FORCE_CROSS_AFTER || bored;
        var preferCross = forceCross || bored;
        // Enforce longer dwell before any jump
        var hardDwell = Math.max(minDwellBeats, 16);
        var allowJump = beatsSinceJump >= hardDwell;
        var allowCross = forceCross || bored;
        var choice = allowJump ? selectBestEdge(curQ, currentTrack, {
            preferCross: preferCross,
            forceCross: forceCross || bored,
            forceCrossOnly: forceCrossOnly,
            minScore: minEdgeScore,
            allowCross: allowCross
        }) : null;

        // End-of-track cliff guard: if near end, force a cross or wrap
        var beatsRemaining = (beats && beats.length) ? (beats.length - curQ - 1) : 0;
        if (!choice && beatsRemaining <= 2) {
            var otherTrack = currentTrack === 1 ? 2 : 1;
            var otherBeats = getBeatsForTrack(otherTrack);
            if (otherBeats && otherBeats.length) {
                choice = {
                    track: otherTrack,
                    index: 0, // restart other track to avoid end-to-end ping-pong
                    reason: "end-zone-cross",
                    similarity: 0,
                    score: 0.3
                };
            } else {
                choice = {
                    track: currentTrack,
                    index: 0, // wrap current track to start
                    reason: "end-zone-wrap",
                    similarity: 0,
                    score: 0.3
                };
            }
        }

        if (choice) {
            var beatsForTrack = getBeatsForTrack(choice.track);
            var isSameTrack = choice.track === currentTrack;
            if (isSameTrack) {
                curQ = choice.index % beatsForTrack.length;
                syncControllerToBeat(getControllerForTrack(currentTrack), beatsForTrack[curQ], { forceSeek: true });
                markRecent(choice.track, curQ);
                markCrossTarget(choice.track, curQ);
                beatsSinceCross++;
                beatsSinceJump = 0;
                if (window.__autohLog) {
                    window.__autohLog.push({ type: "jump", track: currentTrack, target: curQ, reason: choice.reason, score: choice.score, t: Date.now() });
                }
                scheduleNextProcess(Math.max(beatsForTrack[curQ].duration || beatDuration, 0.2));
                return;
            } else {
                if (window.__autohLog) {
                    window.__autohLog.push({ type: "cross", from: currentTrack, to: choice.track, target: choice.index, score: choice.score, t: Date.now() });
                }
                crossfadeToTrack(choice.track, choice.index, 480);
                beatsSinceCross = 0;
                beatsSinceJump = 0;
                return;
            }
        }

        // Sequential playback - continue to next beat
        curQ = (curQ + 1) % beats.length;
        beatsSinceCross++;
        beatsSinceJump++;

        if (window.__autohLog) {
            window.__autohLog.push({ type: "sequential", track: currentTrack, target: curQ, t: Date.now() });
        }

        if (recentScores) {
            var scoreSample = choice && choice.score ? choice.score : (currentBeat && currentBeat.otherSimilarity ? currentBeat.otherSimilarity : 0);
            recentScores.push(scoreSample);
            if (recentScores.length > 32) {
                recentScores.shift();
            }
        }

        scheduleNextProcess(beatDuration);
    }

    return {
        start: function() {
            if (running) {
                return;
            }
            console.log("[Autoharmonizer] Starting playback");
            running = true;
            curQ = 0;
            currentTrack = 1;
            beatsSinceCross = 0;
            visitedBars = { 1: {}, 2: {} };
            recentTargets = { 1: [], 2: [] };
            resetCrossHistory();
            currentSyncOffset = 0;

            // reset controllers to start
            if (track1Controller) {
                track1Controller.stop();
                track1Controller.seek(0);
                track1Controller.setVolume(0.0);
            }
            if (track2Controller) {
                track2Controller.stop();
                track2Controller.seek(0);
                track2Controller.setVolume(0.0);
            }

            // Start track1 audibly
            track1Controller.setVolume(0.72);
            track1Controller.playFrom(track1Data.beats[0] ? track1Data.beats[0].start : 0);

            // Keep track2 paused and ready for crossfading
            track2Controller.setVolume(0);
            if (track2Controller.audio) {
                track2Controller.audio.pause();
            }

            console.log("[Autoharmonizer] Track 1 started audibly, Track 2 ready for crossfade");

            $("#play").text("Pause");
            setPlayingClass(mode);
            pulseNotes(baseNoteStrength);
            markPlaybackStarted();
            process();
        },
        stop: function() {
            stopPlayback({ resetPosition: true });
        },
        pause: function() {
            if (!running) {
                return;
            }
            running = false;
            clearProcessTimer();
            track1Controller.pause();
            track2Controller.pause();
            $("#play").text("Play");
            setPlayingClass(null);
            pulseNotes(baseNoteStrength);
        },
        resume: function() {
            if (running) {
                return;
            }
            running = true;
            if (typeof beatsSinceCross !== "number") {
                beatsSinceCross = 0;
            }
            visitedBars = { 1: {}, 2: {} };
            recentTargets = { 1: [], 2: [] };
            resetCrossHistory();
            currentSyncOffset = 0;
            if (track1Controller) {
                track1Controller.ensurePlaying();
                track1Controller.setVolume(0.0);
            }
            if (track2Controller) {
                track2Controller.ensurePlaying();
                track2Controller.setVolume(0.0);
            }
            $("#play").text("Pause");
            setPlayingClass(mode);
            pulseNotes(baseNoteStrength);
            var beats = getBeatsForTrack(currentTrack);
            if (beats && beats.length) {
                var resumeBeat = beats[Math.min(curQ, beats.length - 1)];
                syncControllerToBeat(getControllerForTrack(currentTrack), resumeBeat, { forceSeek: true });
                // bring current track up after sync
                getControllerForTrack(currentTrack).setVolume(0.72);
            }
            process();
        },
        toggle: function() {
            if (running) {
                this.pause();
            } else {
                this.start();
            }
        },
        isRunning: function() {
            return running;
        },
        getState: function() {
            return {
                mode: "autoharmonizer",
                running: running,
                currentBeat: curQ,
                currentTrack: currentTrack
            };
        },

        // Expose curQ and running as properties for debugging/testing
        get curQ() {
            return curQ;
        },
        get running() {
            return running;
        }
    };
}

function createSectionSculptorDriver(player) {
    // Section Sculptor: arrange and queue sections/bars like a mini DAW
    var running = false;
    var mtime = $("#mtime");
    var sectionQueue = [];
    var currentQueueIndex = 0; // Points to the next section that will be scheduled
    var activeQueueIndex = null; // The section that is currently sounding
    var processTimer = null;

    var trackAnalysis = (curTrack && curTrack.analysis) || null;
    var sections = (trackAnalysis && trackAnalysis.sections) || [];
    var beats = (trackAnalysis && trackAnalysis.beats) || [];
    var baseTempo = (trackAnalysis &&
        trackAnalysis.audio_summary &&
        trackAnalysis.audio_summary.tempo) || null;

    // Label sections intelligently based on their position and characteristics
    function labelSection(section, index, allSections) {
        var labels = [];
        var position = index / Math.max(1, allSections.length);

        if (index === 0) {
            labels.push("Intro");
        } else if (index === allSections.length - 1) {
            labels.push("Outro");
        }

        if (position < 0.25) {
            labels.push("Verse");
        } else if (position >= 0.25 && position < 0.5) {
            labels.push("Pre-Chorus");
        } else if (position >= 0.5 && position < 0.75) {
            labels.push("Chorus");
        } else {
            labels.push("Bridge");
        }

        return labels.length > 0 ? labels[0] : "Section";
    }

    // Build section metadata
    var sculptorSettings = getSculptorSettings();
    var sectionData = [];
    rebuildSectionMeta();

    console.log("[Section Sculptor] Loaded", sectionData.length, "sections - queue starts empty");

    function rebuildSectionMeta(customSettings) {
        if (customSettings) {
            sculptorSettings = sanitizeSculptorSettings(customSettings, ADVANCED_DEFAULTS.sculptorConfig);
        } else {
            sculptorSettings = getSculptorSettings();
        }
        sectionData = sections.map(function(section, idx) {
            var baseDuration = Math.max(0.25, section.duration || 0.25);
            var scaledDuration = Math.max(0.1, baseDuration * sculptorSettings.durationScale);
            var clampedByScale = Math.min(baseDuration, scaledDuration);
            var trimmedToMax = Math.min(sculptorSettings.maxSectionSeconds, clampedByScale);
            var duration = Math.max(sculptorSettings.minSectionSeconds, trimmedToMax);
            duration = Math.min(duration, baseDuration);
            return {
                index: idx,
                label: labelSection(section, idx, sections),
                start: section.start,
                duration: duration,
                rawDuration: baseDuration,
                tempo: section.tempo || baseTempo,
                loudness: section.loudness_start || 0,
                confidence: section.confidence || 0.5
            };
        });
    }

    var queuePlayer = null;
    var previewPlayer = null;
    var previewTimer = null;

    function resolvePrimaryAudioSource() {
        var analysisTrack = trackAnalysis && trackAnalysis.track ? trackAnalysis.track : null;
        return (
            (analysisTrack && analysisTrack.audio_url) ||
            (analysisTrack && analysisTrack.info && analysisTrack.info.url) ||
            (curTrack && curTrack.audio_url) ||
            (curTrack && curTrack.info && curTrack.info.url) ||
            ""
        );
    }

    function initializeAudioControllers() {
        var audioSource = resolvePrimaryAudioSource();
        if (!audioSource) {
            console.warn("[Section Sculptor] Unable to resolve audio source for direct playback");
            return;
        }
        queuePlayer = createHtmlAudioController(audioSource, { volume: 0.92 });
        previewPlayer = createHtmlAudioController(audioSource, { volume: 0.95 });
        if (!queuePlayer || !previewPlayer) {
            console.warn("[Section Sculptor] Failed to initialize HTML audio controllers");
            queuePlayer = null;
            previewPlayer = null;
            return;
        }
        if (queuePlayer.ensureLoaded) {
            queuePlayer.ensureLoaded();
        }
        if (previewPlayer.ensureLoaded) {
            previewPlayer.ensureLoaded();
        }
        // Expose players globally for loop control
        window.queuePlayer = queuePlayer;
        window.previewPlayer = previewPlayer;
    }

    initializeAudioControllers();

    function notifyQueueChanged() {
        if (typeof window.updateSculptorQueueDisplay === "function") {
            try {
                window.updateSculptorQueueDisplay();
            } catch (err) {
                console.warn("[Section Sculptor] Failed to refresh timeline", err);
            }
        }
    }

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function normalizeQueuePointers() {
        if (!sectionQueue.length) {
            currentQueueIndex = 0;
            activeQueueIndex = null;
            return;
        }
        if (currentQueueIndex >= sectionQueue.length || currentQueueIndex < 0) {
            currentQueueIndex = 0;
        }
        if (activeQueueIndex !== null) {
            if (activeQueueIndex >= sectionQueue.length) {
                activeQueueIndex = sectionQueue.length - 1;
            } else if (activeQueueIndex < 0) {
                activeQueueIndex = 0;
            }
        }
    }

    function scheduleNextSection(durationSeconds) {
        clearProcessTimer();
        var duration = Math.max(0.1, durationSeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (!running) {
                return;
            }
            process();
        }, duration);
    }

    function playSectionAt(queueIndex) {
        if (!sectionQueue.length) {
            console.warn("[Section Sculptor] Queue is empty, stopping");
            haltPlayback({ hardStop: true, resetIndex: true, resetPlaybackState: true });
            return;
        }

        var normalizedIndex = Math.max(0, Math.min(queueIndex, sectionQueue.length - 1));
        currentQueueIndex = normalizedIndex;
        activeQueueIndex = normalizedIndex;

        var sectionIdx = sectionQueue[normalizedIndex];
        var section = sections[sectionIdx];
        var sectionMeta = sectionData[sectionIdx] || {
            label: "Section " + (sectionIdx + 1),
            duration: section ? section.duration : 0
        };
        if (!section) {
            console.warn("[Section Sculptor] Missing section data for index", sectionIdx);
            return;
        }

        console.log("[Section Sculptor] Playing:", sectionMeta.label,
            "(queue pos " + (normalizedIndex + 1) + "/" + sectionQueue.length + ")");

        var sectionEnd = section.start + ((sectionMeta && sectionMeta.duration) || section.duration);
        var sectionBeats = [];
        for (var i = 0; i < beats.length; i++) {
            var beat = beats[i];
            if (beat.start >= section.start && beat.start < sectionEnd) {
                sectionBeats.push(beat);
            }
        }

        if (sectionBeats.length > 0 && sectionBeats[0].tile) {
            updateCursors(sectionBeats[0]);
        }

        mtime.text(fmtTime(section.start));
        pulseNotes(section.loudness_start || baseNoteStrength);

        if (previewPlayer) {
            previewPlayer.pause();
        }
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        if (queuePlayer) {
            queuePlayer.playFrom(section.start);
        } else {
            console.warn("[Section Sculptor] No audio controller available for playback");
            haltPlayback({ hardStop: true, resetIndex: false });
            return;
        }

        var sectionDuration = (sectionMeta && sectionMeta.duration) || section.duration || 0.1;
        var overlapSeconds = Math.min(Math.max(0, sculptorSettings.transitionOverlapSeconds || 0), Math.max(0, sectionDuration - 0.25));
        var scheduleDuration = Math.max(0.25, sectionDuration - overlapSeconds);
        currentQueueIndex = (normalizedIndex + 1) % sectionQueue.length;
        scheduleNextSection(scheduleDuration);
        notifyQueueChanged();
    }

    function process() {
        if (!running) {
            return;
        }
        playSectionAt(currentQueueIndex);
    }

    function previewSection(sectionIndex) {
        var section = sectionData[sectionIndex];
        if (!section) {
            return;
        }
        if (running) {
            console.warn("[Section Sculptor] Cannot preview while queue is playing");
            return;
        }
        if (previewPlayer) {
            previewPlayer.playFrom(section.start);
        } else {
            console.warn("[Section Sculptor] Preview unavailable - no audio controller");
            return;
        }
        if (previewTimer) {
            clearTimeout(previewTimer);
        }
        var sectionMeta = sectionData[sectionIndex];
        var previewTarget = (sectionMeta && sectionMeta.duration) || section.duration || 0.1;
        var previewDuration = Math.min(sculptorSettings.previewSeconds || 3, Math.max(previewTarget, 0.1));
        previewTimer = setTimeout(function() {
            if (running) {
                return;
            }
            if (previewPlayer) {
                previewPlayer.pause();
            }
        }, previewDuration * 1000);
    }

    function haltPlayback(options) {
        options = options || {};
        clearProcessTimer();
        running = false;
        if (queuePlayer) {
            if (options.hardStop && typeof queuePlayer.stop === "function") {
                queuePlayer.stop();
            } else if (typeof queuePlayer.pause === "function") {
                queuePlayer.pause();
            }
        } else if (player) {
            if (options.hardStop && typeof player.stop === "function") {
                player.stop();
            } else if (typeof player.pause === "function") {
                player.pause();
            }
        }
        if (previewPlayer) {
            previewPlayer.pause();
        }
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        if (options.resetIndex) {
            currentQueueIndex = 0;
            activeQueueIndex = null;
        }
        if (options.resetPlaybackState) {
            resetPlaybackState();
        }
    }

    function beginPlaybackAt(queueIndex) {
        if (!sectionQueue.length) {
            console.warn("[Section Sculptor] Nothing to play - add sections to the queue first");
            return false;
        }
        if (!queuePlayer) {
            console.warn("[Section Sculptor] Audio controller missing - cannot start playback");
            error("Unable to load audio for Section Sculptor mode");
            return false;
        }

        running = true;
        $("#play").text("Pause");
        setPlayingClass(mode);
        pulseNotes(baseNoteStrength);
        markPlaybackStarted();

        var startIndex = typeof queueIndex === "number"
            ? Math.max(0, Math.min(queueIndex, sectionQueue.length - 1))
            : 0;

        playSectionAt(startIndex);
        return true;
    }

    function pausePlayback() {
        haltPlayback({ resetIndex: false });
        if (activeQueueIndex !== null) {
            currentQueueIndex = activeQueueIndex;
        }
    }

    function stopPlayback() {
        haltPlayback({ hardStop: true, resetIndex: true, resetPlaybackState: true });
    }

    return {
        start: function() {
            currentQueueIndex = 0;
            beginPlaybackAt(0);
        },

        resume: function() {
            if (!running) {
                beginPlaybackAt(currentQueueIndex);
            }
        },

        pause: function() {
            pausePlayback();
        },

        stop: function() {
            stopPlayback();
        },

        toggle: function() {
            if (running) {
                this.pause();
            } else {
                this.start();
            }
        },

        isRunning: function() {
            return running;
        },

        getState: function() {
            var normalizedNext = null;
            if (sectionQueue.length) {
                normalizedNext = Math.max(0, Math.min(currentQueueIndex, sectionQueue.length - 1));
            }
            return {
                mode: "sculptor",
                running: running,
                currentSection: activeQueueIndex,
                nextSection: normalizedNext,
                sectionQueue: sectionQueue.slice(),
                sectionData: sectionData
            };
        },

        addSection: function(sectionIndex, targetIndex) {
            if (sectionIndex < 0 || sectionIndex >= sectionData.length) {
                return;
            }
            var insertPos = typeof targetIndex === "number"
                ? Math.max(0, Math.min(targetIndex, sectionQueue.length))
                : sectionQueue.length;
            sectionQueue.splice(insertPos, 0, sectionIndex);
            normalizeQueuePointers();
            console.log("[Section Sculptor] Added section:", sectionData[sectionIndex].label,
                "at position", insertPos + 1);
            notifyQueueChanged();
        },

        removeSection: function(queueIndex) {
            if (queueIndex >= 0 && queueIndex < sectionQueue.length) {
                var removed = sectionQueue.splice(queueIndex, 1);
                normalizeQueuePointers();
                console.log("[Section Sculptor] Removed section at queue position", queueIndex);
                if (!sectionQueue.length) {
                    stopPlayback();
                } else {
                    notifyQueueChanged();
                }
                return removed.length ? removed[0] : null;
            }
            return null;
        },

        moveSection: function(fromIndex, toIndex) {
            if (fromIndex === toIndex ||
                fromIndex < 0 || fromIndex >= sectionQueue.length) {
                return;
            }
            var section = sectionQueue.splice(fromIndex, 1)[0];
            var clampedTarget = Math.max(0, Math.min(toIndex, sectionQueue.length));
            sectionQueue.splice(clampedTarget, 0, section);
            normalizeQueuePointers();
            console.log("[Section Sculptor] Moved section from", fromIndex, "to", clampedTarget);
            notifyQueueChanged();
        },

        clearQueue: function() {
            sectionQueue = [];
            normalizeQueuePointers();
            stopPlayback();
            console.log("[Section Sculptor] Cleared queue");
            notifyQueueChanged();
        },

        resetQueue: function() {
            sectionQueue = sectionData.map(function(s) { return s.index; });
            currentQueueIndex = 0;
            activeQueueIndex = null;
            console.log("[Section Sculptor] Reset to original order");
            if (running) {
                clearProcessTimer();
                playSectionAt(0);
            } else {
                notifyQueueChanged();
            }
        },

        shuffleQueue: function() {
            if (!sectionQueue.length && sectionData.length) {
                sectionQueue = sectionData.map(function(s) { return s.index; });
            }
            for (var i = sectionQueue.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = sectionQueue[i];
                sectionQueue[i] = sectionQueue[j];
                sectionQueue[j] = temp;
            }
            currentQueueIndex = 0;
            activeQueueIndex = null;
            console.log("[Section Sculptor] Shuffled queue");
            if (running) {
                clearProcessTimer();
                playSectionAt(0);
            } else {
                notifyQueueChanged();
            }
        },

        jumpToQueuePosition: function(queuePos) {
            if (queuePos < 0 || queuePos >= sectionQueue.length) {
                return;
            }
            if (!running) {
                beginPlaybackAt(queuePos);
            } else {
                clearProcessTimer();
                playSectionAt(queuePos);
            }
            console.log("[Section Sculptor] Jumped to queue position", queuePos);
        },

        previewSection: function(sectionIndex) {
            previewSection(sectionIndex);
        },

        applySettings: function(settings) {
            rebuildSectionMeta(settings);
            notifyQueueChanged();
        }
    };
}

function Driver(player) {
    if (mode === "jukebox") {
        var jukeboxSettings = getLoopSettingsForMode("jukebox");
        return createJukeboxDriver(player, jukeboxSettings);
    } else if (mode === "eternal") {
        var eternalSettings = getLoopSettingsForMode("eternal");
        return createJukeboxDriver(player, eternalSettings);
    } else if (mode === "autoharmonizer") {
        return createAutoharmonizerDriver(player);
    } else if (mode === "sculptor") {
        return createSectionSculptorDriver(player);
    }
    return createCanonDriver(player);
}

    window.onload = init;


function ga_track(page, action, id) {
    _gaq.push(['_trackEvent', page, action, id]);
}










window.onload = init;








    function evaluateGbrtScore(model, featureMap) {
        var names = model.feature_names || [];
        var vector = new Array(names.length).fill(0);
        for (var i = 0; i < names.length; i++) {
            var key = names[i];
            vector[i] = featureMap[key] !== undefined ? featureMap[key] : 0;
        }
        var sum = typeof model.base_score === "number" ? model.base_score : 0;
        var lr = typeof model.learning_rate === "number" ? model.learning_rate : 0.1;
        if (!model.trees || !model.trees.length) {
            return null;
        }
        for (var t = 0; t < model.trees.length; t++) {
            var nodes = model.trees[t];
            if (!nodes || !nodes.length) {
                continue;
            }
            var idx = 0;
            var guard = 0;
            while (guard < nodes.length) {
                var node = nodes[idx];
                if (!node || node.leaf) {
                    sum += lr * (node && typeof node.value === "number" ? node.value : 0);
                    break;
                }
                var featureIdx = node.feature;
                var value = vector[featureIdx] || 0;
                if (value <= node.threshold) {
                    idx = node.left;
                } else {
                    idx = node.right;
                }
                guard++;
            }
        }
        return 1 / (1 + Math.exp(-sum));
    }
