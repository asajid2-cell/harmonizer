"use strict";

var HARMONIZER_CONFIG = window.HARMONIZER_CONFIG || {};
var API_BASE_URL = (HARMONIZER_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
// Cache buster timestamp - update this when deploying new analysis/data changes
var CACHE_BUSTER = "v=2025112411";

function resolveApiUrl(path, addCacheBuster) {
    if (!path) {
        return API_BASE_URL || "";
    }
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    if (path.charAt(0) !== "/") {
        path = "/" + path;
    }
    var resolved = API_BASE_URL ? API_BASE_URL + path : path;
    // Add cache buster for data/analysis files to ensure fresh loads
    if (addCacheBuster !== false && (path.indexOf('/data/') !== -1 || path.endsWith('.json'))) {
        resolved += (resolved.indexOf('?') === -1 ? '?' : '&') + CACHE_BUSTER;
    }
    return resolved;
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
    if (!isOrbitMode(mode) || !paper) {
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

function isOrbitMode(modeName) {
    var m = (modeName || "").toLowerCase();
    return m === "jukebox" || m === "eternal" || m === "dopamine" || m === "stalker" || m === "timbresurf" || m === "barberpole" || m === "palindrome" || m === "spectralgravity" || m === "callresponse" || m === "orbitweaver";
}

function configureCanvasForMode() {
    var usingOrbit = isOrbitMode(mode);
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
    if (!isOrbitMode(mode)) {
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
    if (isOrbitMode(mode)) {
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

// Clear any leftover voice state from previous sessions
window.currentVoiceStates = [];
window.lastVoiceJump = null;
window.currentMainBeatIdx = null;
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
var otherCursorCircles = []; // Array for multiple overlay cursors in circular mode
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
var canonVoiceOffsetsForDriver = [];
var loopPaths = [];
var loopPathMap = {}; // Map of "source-target" to path object
var loopMaxSpan = 1; // Max span used for arc height calculation
var canonMaxDelta = 1; // Max delta used for canon arc height calculation

// Queue management
var trackQueue = [];
var currentQueueIndex = -1;
var selectedQueueIndex = -1;
var autoPlayNext = false;
var queueAutoPlayPending = false;
var QUEUE_STORAGE_KEY = "harmonizerTrackQueue";
var playbackState = {
    hasStarted: false,
    isPaused: false
};

function persistTrackQueue() {
    try {
        if (!window.localStorage) {
            return;
        }
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(trackQueue));
    } catch (e) {
        // Ignore storage failures (quota/private mode)
    }
}

function loadPersistedTrackQueue() {
    try {
        if (!window.localStorage) {
            return false;
        }
        var raw = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (!raw) {
            return false;
        }
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return false;
        }
        trackQueue = parsed
            .filter(function(t) { return t && t.id; })
            .map(function(t) {
                return {
                    id: t.id,
                    title: t.title || "Unknown Track",
                    artist: t.artist || "Unknown Artist"
                };
            });
        currentQueueIndex = -1;
        selectedQueueIndex = trackQueue.length ? 0 : -1;
        updateQueueUI();
        return trackQueue.length > 0;
    } catch (e) {
        return false;
    }
}

window.getTrackQueue = function() {
    return trackQueue.slice();
};

window.setTrackQueueOrder = function(newOrder) {
    if (!Array.isArray(newOrder)) {
        return;
    }
    trackQueue = newOrder
        .filter(function(t) { return t && t.id; })
        .map(function(t) {
            return {
                id: t.id,
                title: t.title || "Unknown Track",
                artist: t.artist || "Unknown Artist"
            };
        });
    if (currentQueueIndex >= trackQueue.length) {
        currentQueueIndex = trackQueue.length - 1;
    }
    if (selectedQueueIndex >= trackQueue.length) {
        selectedQueueIndex = trackQueue.length - 1;
    }
    persistTrackQueue();
    updateQueueUI();
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
        jumpVariance: 0.4,
        routeLength: 8,
        jumpTemperature: 0.25
    },
    eternalLoop: {
        musicality: 100,
        minLoopBeats: 12,
        maxSequentialBeats: 90,
        loopThreshold: 0.76,
        sectionBias: 0.20,
        jumpVariance: 0.65
    },
	    dopamineMiner: {
	        peakFraction: 0.15,
	        minClusterBeats: 8,
	        clusterGapBeats: 2,
	        largestClusterOnly: 0,
	        minDwellBeats: 4,
	        maxSequentialBeats: 32,
	        minJumpSpanBeats: 4,
	        minJumpSimilarity: 0.60,
	        crossClusterBias: 0.5,
	        jumpTemperature: 0.2,
	        escapeProb: 0.03,
	        burnoutWindowBeats: 48,
	        burnoutUniqueRatio: 0.35,
	        burnoutCooldownBeats: 32
	    },
	    harmonicTrap: {
	        autoTarget: 1,
	        targetPitchClass: 0,
	        similarityThreshold: 0.78,
	        graceBeats: 1,
	        cooldownBeats: 8,
	        searchTopK: 6,
	        minJumpSpanBeats: 8,
	        escapeProb: 0.0
	    },
	    phaseShifter: {
	        rateDelta: 0.001,
	        overlayGain: 0.65,
	        resyncOnJump: 1,
	        resyncThresholdBeats: 8,
	        overlayLoop: 0
	    },
	    granularFreeze: {
	        freezeChance: 0.22,
	        minVolume: 0.12,
	        sustainAttackMin: 0.35,
	        sustainSegDurMin: 0.18,
	        percussiveRatioMax: 0.55,
	        cooldownBeats: 8,
	        repeatMode: 1,
	        repeatLongBias: 0.5
	    },
        elasticVelocity: {
            minRate: 0.6,
            maxRate: 1.5,
            curve: 1.25,
            smoothingBeats: 3,
            maxDeltaPerBeat: 0.18
        },
        mathRocker: {
            cycleBeats: 8,
            dropBeats: 1,
            resetOnJump: 1
        },
        stalker: {
            similarityThreshold: 0.85,
            cooldownBeats: 8,
            armBeats: 2,
            symmetricLookup: 1
        },
	    timbreSurfing: {
            topK: 8,
            minSimilarity: 0.60,
            minJumpSpanBeats: 4,
            excludeNeighborBeats: 1,
            temperature: 0.25,
            recentWindowBeats: 24,
            repeatPenalty: 0.25,
            applyChance: 1.0,
            overrideJumps: 0
        },
        chromaStacking: {
            overlayGain: 0.7,
            minChromaSimilarity: 0.86,
            minTimbreDistance: 40,
            excludeNeighborBeats: 2,
            minJumpSpanBeats: 8,
            searchTopK: 10,
            randomSample: 48,
            temperature: 0.2,
            resampleBeats: 1
        },
        beatSorting: {
            feature: 0,
            direction: 1,
            minVolume: 0.0,
            repeatEach: 1,
            overrideJumps: 0
        },
        reverseBloom: {
            triggerThreshold: 0.75,
            rewindBeats: 8,
            rewindChance: 0.6,
            cooldownBeats: 24,
            resumeMode: 1, // 0=linear, 1=similarity hop
            minSimilarity: 0.72,
            bloomMinSpanBeats: 16,
            bloomTopK: 10,
            bloomTemperature: 0.25,
            overrideJumps: 0
        },
        barberPole: {
            feature: 0, // 0=loudness, 1=brightness, 2=pitch
            direction: 1, // 0=down, 1=up
            stepRanks: 6,
            minSimilarity: 0.72,
            minVolume: 0.0,
            minSpanBeats: 8,
            excludeNeighborBeats: 2,
            topK: 12,
            temperature: 0.25,
            recentWindowBeats: 32,
            repeatPenalty: 0.25,
            applyChance: 1.0,
            overrideJumps: 0
        },
        palindromeEngine: {
            phraseBeats: 16,
            turnMinSimilarity: 0.78,
            turnTopK: 10,
            turnTemperature: 0.25,
            minTurnSpanBeats: 8,
            excludeNeighborBeats: 2,
            flipCooldownBeats: 8,
            applyChance: 1.0,
            overrideJumps: 0
        },
        spectralGravity: {
            axis: 0, // 0=brightness, 1=loudness, 2=pitch
            target: 0.5,
            bandWidth: 0.12,
            triggerThreshold: 0.16,
            minSimilarity: 0.72,
            cooldownBeats: 8,
            minSpanBeats: 8,
            excludeNeighborBeats: 2,
            topK: 12,
            temperature: 0.25,
            recentWindowBeats: 24,
            repeatPenalty: 0.25,
            applyChance: 1.0,
            overrideJumps: 0
        },
        callResponse: {
            callQuantileMax: 0.35,
            responseQuantileMin: 0.65,
            barsPerCall: 1,
            barsPerResponse: 1,
            minSimilarity: 0.72,
            topK: 12,
            temperature: 0.25,
            minSpanBeats: 8,
            excludeNeighborBeats: 2,
            recentWindowBars: 16,
            repeatPenalty: 0.25,
            energyBias: 0.65,
            sameSectionBias: 0.35,
            applyChance: 1.0,
            overrideJumps: 0
        },
        orbitWeaver: {
            anchorCount: 6,
            spinAxis: 2, // 0=energy, 1=brightness, 2=pitch
            barsPerAnchor: 2,
            jumpAtBarStart: 1,
            minSimilarity: 0.72,
            topK: 12,
            temperature: 0.25,
            minSpanBeats: 8,
            excludeNeighborBeats: 2,
            recentWindowBeats: 32,
            repeatPenalty: 0.25,
            sameSectionBias: 0.25,
            anchorPull: 0.55,
            applyChance: 1.0,
            overrideJumps: 0
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

// Global helper: some mode/layer code needs beat energy but other helpers define it in nested scopes.
function beatEnergy(beat) {
    if (!beat) return 0;
    if (typeof beat.median_volume === "number") return beat.median_volume;
    if (typeof beat.volume === "number") return beat.volume;
    if (typeof beat.loudness === "number") return beat.loudness;
    return 0;
}

var advancedSettings = {
    canonOverlay: cloneSettings(ADVANCED_DEFAULTS.canonOverlay),
    eternalOverlay: cloneSettings(ADVANCED_DEFAULTS.eternalOverlay),
    jukeboxLoop: cloneSettings(ADVANCED_DEFAULTS.jukeboxLoop),
    eternalLoop: cloneSettings(ADVANCED_DEFAULTS.eternalLoop),
    dopamineMiner: cloneSettings(ADVANCED_DEFAULTS.dopamineMiner),
    harmonicTrap: cloneSettings(ADVANCED_DEFAULTS.harmonicTrap),
    phaseShifter: cloneSettings(ADVANCED_DEFAULTS.phaseShifter),
    granularFreeze: cloneSettings(ADVANCED_DEFAULTS.granularFreeze),
    elasticVelocity: cloneSettings(ADVANCED_DEFAULTS.elasticVelocity),
    mathRocker: cloneSettings(ADVANCED_DEFAULTS.mathRocker),
    stalker: cloneSettings(ADVANCED_DEFAULTS.stalker),
    timbreSurfing: cloneSettings(ADVANCED_DEFAULTS.timbreSurfing),
    chromaStacking: cloneSettings(ADVANCED_DEFAULTS.chromaStacking),
    beatSorting: cloneSettings(ADVANCED_DEFAULTS.beatSorting),
    reverseBloom: cloneSettings(ADVANCED_DEFAULTS.reverseBloom),
    barberPole: cloneSettings(ADVANCED_DEFAULTS.barberPole),
    palindromeEngine: cloneSettings(ADVANCED_DEFAULTS.palindromeEngine),
    spectralGravity: cloneSettings(ADVANCED_DEFAULTS.spectralGravity),
    callResponse: cloneSettings(ADVANCED_DEFAULTS.callResponse),
    orbitWeaver: cloneSettings(ADVANCED_DEFAULTS.orbitWeaver),
    sculptorConfig: cloneSettings(ADVANCED_DEFAULTS.sculptorConfig)
};

var canonAdvancedEnabled = false;
var canonSettings = advancedSettings.canonOverlay;

var advancedEnabled = {
    canonOverlay: false,
    eternalOverlay: false,
    jukeboxLoop: false,
    eternalLoop: false,
    dopamineMiner: false,
    harmonicTrap: false,
    phaseShifter: false,
    granularFreeze: false,
    elasticVelocity: false,
    mathRocker: false,
    stalker: false,
    timbreSurfing: false,
    chromaStacking: false,
    beatSorting: false,
    reverseBloom: false,
    barberPole: false,
    palindromeEngine: false,
    spectralGravity: false,
    callResponse: false,
    orbitWeaver: false,
    sculptorConfig: false
};

// ===== Stackable modes (layers) =====
var stackedLayerIds = [];
var activeStackLayers = [];
var stackRegistry = Object.create(null);

function registerStackLayer(def) {
    if (!def || !def.id || typeof def.factory !== "function") {
        return;
    }
    stackRegistry[def.id] = {
        id: def.id,
        label: def.label || def.id,
        description: def.description || "",
        factory: def.factory
    };
}

function listStackLayers() {
    return Object.keys(stackRegistry).map(function(key) {
        return stackRegistry[key];
    });
}

function updateStackButtonLabel() {
    try {
        var btn = document.getElementById("stack-toggle");
        if (!btn) return;
        var enabled = stackedLayerIds.length > 0;
        btn.textContent = enabled ? "Stack: On" : "Stack: Off";
        btn.setAttribute("aria-pressed", enabled ? "true" : "false");
        btn.classList.toggle("active", enabled);
    } catch (e) {}
}

function rebuildActiveStackLayers() {
    if (activeStackLayers && activeStackLayers.length) {
        activeStackLayers.forEach(function(layer) {
            if (layer && typeof layer.dispose === "function") {
                try { layer.dispose(); } catch (e) {}
            }
        });
    }
    activeStackLayers = [];
    if (!stackedLayerIds.length) {
        updateStackButtonLabel();
        return;
    }
    var ctx = { track: curTrack, beats: masterQs, mode: mode };
    stackedLayerIds.forEach(function(id) {
        var def = stackRegistry[id];
        if (!def) return;
        try {
            var inst = def.factory(ctx);
            if (inst) {
                inst.id = id;
                activeStackLayers.push(inst);
            }
        } catch (err) {
            console.warn("[Stack] Failed to build layer", id, err);
        }
    });
    updateStackButtonLabel();
}

function notifyStackOnBeat(meta) {
    if (!activeStackLayers.length) return;
    activeStackLayers.forEach(function(layer) {
        if (layer && typeof layer.onBeat === "function") {
            try { layer.onBeat(meta); } catch (e) {}
        }
    });
}

function notifyStackPlaybackStateChange(meta) {
    if (!activeStackLayers.length) return;
    activeStackLayers.forEach(function(layer) {
        if (layer && typeof layer.onPlaybackStateChange === "function") {
            try { layer.onPlaybackStateChange(meta); } catch (e) {}
        }
    });
}

var harmonizerAntiLoop = {
    tick: 0,
    byMode: Object.create(null),
    cache: {
        trackKey: null,
        totalSections: null
    }
};

function harmonizerAntiLoopEnabled() {
    if (typeof window === "undefined") return true;
    // Allow users to disable via console: `window.harmonizerAntiLoopEnabled = false`.
    return window.harmonizerAntiLoopEnabled !== false;
}

function harmonizerGetTotalSections() {
    if (!masterQs || !masterQs.length) return 0;
    var key = masterQs.length + ":" + (curTrack && curTrack.id ? curTrack.id : "");
    if (harmonizerAntiLoop.cache.trackKey === key && typeof harmonizerAntiLoop.cache.totalSections === "number") {
        return harmonizerAntiLoop.cache.totalSections;
    }
    var maxSec = -1;
    for (var i = 0; i < masterQs.length; i++) {
        var q = masterQs[i];
        if (!q) continue;
        var s = q.section;
        if (typeof s === "number" && isFinite(s) && s > maxSec) maxSec = s;
    }
    var total = Math.max(0, maxSec + 1);
    harmonizerAntiLoop.cache.trackKey = key;
    harmonizerAntiLoop.cache.totalSections = total;
    return total;
}

function harmonizerGetAntiLoopState(modeName) {
    var mode = (modeName || "unknown").toLowerCase();
    if (!harmonizerAntiLoop.byMode[mode]) {
        harmonizerAntiLoop.byMode[mode] = {
            visits: [],
            edges: [],
            cooldownUntilTick: 0,
            tabooTargets: Object.create(null),
            tabooEdges: Object.create(null),
            tabooRanges: [],
            sectionHistory: [],
            seenSections: Object.create(null),
            lastNewSectionTick: 0
        };
    }
    return harmonizerAntiLoop.byMode[mode];
}

function harmonizerBeatSectionIndex(idx) {
    if (!masterQs || idx === null || idx === undefined) return null;
    var q = masterQs[idx];
    if (!q) return null;
    return (typeof q.section === "number" && isFinite(q.section)) ? q.section : null;
}

function harmonizerIsAlternating2Cycle(seq, windowLen) {
    if (!Array.isArray(seq)) return false;
    windowLen = Math.max(6, Math.round(windowLen || 0));
    if (seq.length < windowLen) return false;
    var slice = seq.slice(seq.length - windowLen);
    var a = slice[0];
    var b = slice[1];
    if (a === b) return false;
    var okAB = true;
    var okBA = true;
    for (var i = 0; i < slice.length; i++) {
        if (slice[i] !== (i % 2 === 0 ? a : b)) okAB = false;
        if (slice[i] !== (i % 2 === 0 ? b : a)) okBA = false;
        if (!okAB && !okBA) return false;
    }
    return okAB || okBA;
}

function harmonizerRecentUniqueCount(seq, windowLen) {
    if (!Array.isArray(seq) || !seq.length) return 0;
    windowLen = Math.max(1, Math.round(windowLen || 0));
    var k = Math.min(windowLen, seq.length);
    var uniq = Object.create(null);
    for (var i = seq.length - k; i < seq.length; i++) {
        uniq[seq[i]] = true;
    }
    return Object.keys(uniq).length;
}

function harmonizerLooksStuck(state, currentIndex, proposedIndex) {
    var WINDOW = 64;
    var MIN_LEN = 20;
    var UNIQUE_RATIO_MIN = 0.35;
    var EDGE_UNIQUE_MAX = 3;
    var EDGE_WINDOW = 14;

    if (!state || !Array.isArray(state.visits)) return false;
    if (typeof currentIndex !== "number" || typeof proposedIndex !== "number") return false;
    var k = Math.min(WINDOW - 1, state.visits.length);
    var recent = state.visits.slice(state.visits.length - k);
    recent.push(proposedIndex);
    if (recent.length < MIN_LEN) return false;

    var uniq = Object.create(null);
    for (var i = 0; i < recent.length; i++) {
        var v = recent[i];
        uniq[v] = true;
    }
    var uniqueRatio = Object.keys(uniq).length / Math.max(1, recent.length);
    if (uniqueRatio < UNIQUE_RATIO_MIN) return true;
    if (harmonizerIsAlternating2Cycle(recent, 12) || harmonizerIsAlternating2Cycle(recent, 16)) return true;

    if (Array.isArray(state.edges) && state.edges.length) {
        var eK = Math.min(EDGE_WINDOW, state.edges.length);
        var eSlice = state.edges.slice(state.edges.length - eK);
        eSlice.push(currentIndex + ":" + proposedIndex);
        var uniqE = Object.create(null);
        for (var e = 0; e < eSlice.length; e++) uniqE[eSlice[e]] = true;
        if (eSlice.length >= 12 && Object.keys(uniqE).length <= EDGE_UNIQUE_MAX) return true;
    }

    // Whole-song exploration guard: if we're stuck in 1–2 sections for a long time, force a cross-section escape.
    var totalSections = harmonizerGetTotalSections();
    if (totalSections >= 3 && state && Array.isArray(state.sectionHistory) && state.sectionHistory.length >= 24) {
        var recentUniqueSections = harmonizerRecentUniqueCount(state.sectionHistory, 96);
        if (recentUniqueSections <= 1) return true;
        if (recentUniqueSections <= 2 && state.sectionHistory.length >= 96) return true;
        var seenCount = Object.keys(state.seenSections || {}).length;
        var ticksSinceNewSection = harmonizerAntiLoop.tick - (state.lastNewSectionTick || 0);
        if (seenCount > 0 && seenCount < totalSections && ticksSinceNewSection >= 160) return true;
    }

    return false;
}

function harmonizerPickAntiLoopEscape(meta, state) {
    if (!meta || typeof meta.currentIndex !== "number") return null;
    if (!masterQs || !masterQs.length) return null;
    var n = masterQs.length;
    var cur = meta.currentIndex;

    var WINDOW = 64;
    var recentIdx = state && Array.isArray(state.visits) ? state.visits.slice(Math.max(0, state.visits.length - WINDOW)) : [];
    var recentSet = Object.create(null);
    var recentSections = Object.create(null);
    for (var i = 0; i < recentIdx.length; i++) {
        var v = recentIdx[i];
        recentSet[v] = true;
        var sec = harmonizerBeatSectionIndex(v);
        if (sec !== null) recentSections[sec] = true;
    }
    recentSet[cur] = true;

    function isRecent(idx) { return !!recentSet[idx]; }
    function isTabooTarget(idx) {
        if (!state || !state.tabooTargets) return false;
        var exp = state.tabooTargets[idx];
        if (!exp) return false;
        if (harmonizerAntiLoop.tick > exp) {
            delete state.tabooTargets[idx];
            return false;
        }
        return true;
    }
    function isTabooRange(idx) {
        if (!state || !Array.isArray(state.tabooRanges) || !state.tabooRanges.length) return false;
        var keep = [];
        var hit = false;
        for (var ri = 0; ri < state.tabooRanges.length; ri++) {
            var r = state.tabooRanges[ri];
            if (!r) continue;
            if (harmonizerAntiLoop.tick > (r.until || 0)) continue;
            keep.push(r);
            if (idx >= r.min && idx <= r.max) hit = true;
        }
        state.tabooRanges = keep;
        return hit;
    }
    function isTabooEdge(edgeKey) {
        if (!state || !state.tabooEdges) return false;
        var exp = state.tabooEdges[edgeKey];
        if (!exp) return false;
        if (harmonizerAntiLoop.tick > exp) {
            delete state.tabooEdges[edgeKey];
            return false;
        }
        return true;
    }

    var totalSections = harmonizerGetTotalSections();
    var seenSections = (state && state.seenSections) ? state.seenSections : Object.create(null);
    var sectionCountsRecent = Object.create(null);
    var sectionWindow = (state && Array.isArray(state.sectionHistory)) ? state.sectionHistory.slice(Math.max(0, state.sectionHistory.length - 96)) : [];
    for (var si = 0; si < sectionWindow.length; si++) {
        var sKey = sectionWindow[si];
        sectionCountsRecent[sKey] = (sectionCountsRecent[sKey] || 0) + 1;
    }
    function sectionExploreBonusForIdx(idx) {
        if (totalSections < 3) return 0;
        var sec = harmonizerBeatSectionIndex(idx);
        if (sec === null) return 0;
        var unseen = seenSections[sec] ? 0 : 1;
        var recentCount = sectionCountsRecent[sec] || 0;
        var rarity = 1 - (recentCount / Math.max(1, sectionWindow.length));
        return 0.18 * unseen + 0.06 * clamp01(rarity);
    }

    function pickFromEdges(edges, sourceBias, sourceIdx) {
        if (!edges || !edges.length) return null;
        var scored = [];
        for (var ei = 0; ei < edges.length; ei++) {
            var e = edges[ei];
            if (!e || typeof e.target !== "number") continue;
            var t = e.target;
            if (t < 0 || t >= n) continue;
            if (isRecent(t)) continue;
            if (isTabooTarget(t)) continue;
            if (isTabooRange(t)) continue;
            var span = Math.abs(t - cur);
            if (span < 12) continue;
            var sim = (typeof e.similarity === "number" && isFinite(e.similarity)) ? e.similarity : 0;
            var sameSection = !!(e.section_match || e.sectionMatch || e.sameSection);
            var secBonus = sameSection ? 0.0 : 0.08;
            var spanBonus = Math.min(0.18, span / Math.max(32, n));
            var edgeKey = (typeof sourceIdx === "number" ? sourceIdx : cur) + ":" + t;
            if (isTabooEdge(edgeKey)) continue;
            var exploreBonus = sectionExploreBonusForIdx(t);
            var s = 0.65 * sim + secBonus + spanBonus + exploreBonus + (sourceBias || 0);
            scored.push({ target: t, score: s });
        }
        if (!scored.length) return null;
        scored.sort(function(a, b) { return b.score - a.score; });
        var pool = scored.slice(0, Math.min(10, scored.length));
        if (pool.length === 1) return pool[0].target;
        var maxScore = pool[0].score;
        var total = 0;
        var weights = [];
        for (var wi = 0; wi < pool.length; wi++) {
            var w = Math.exp((pool[wi].score - maxScore) / 0.25);
            weights[wi] = w;
            total += w;
        }
        var r = Math.random() * total;
        for (var pi = 0; pi < pool.length; pi++) {
            r -= weights[pi];
            if (r <= 0) return pool[pi].target;
        }
        return pool[0].target;
    }

    // Prefer a "plausible" escape that still follows the server loop graph when possible.
    if (serverLoopCandidateMap && serverLoopCandidateMap[cur]) {
        var fromCur = pickFromEdges(serverLoopCandidateMap[cur], 0.03, cur);
        if (fromCur !== null) return fromCur;
    }

    // If the current source is saturated, "regenerate" by sampling edges from nearby sources (still excluding taboo/recent).
    if (serverLoopCandidateMap) {
        var R = 8;
        for (var r = 1; r <= R; r++) {
            var left = cur - r;
            var right = cur + r;
            if (left >= 0 && serverLoopCandidateMap[left] && serverLoopCandidateMap[left].length) {
                var fromLeft = pickFromEdges(serverLoopCandidateMap[left], -0.01 * r, left);
                if (fromLeft !== null) return fromLeft;
            }
            if (right < n && serverLoopCandidateMap[right] && serverLoopCandidateMap[right].length) {
                var fromRight = pickFromEdges(serverLoopCandidateMap[right], -0.01 * r, right);
                if (fromRight !== null) return fromRight;
            }
        }
    }

    // Otherwise, pick a far beat that hasn't been visited recently, preferring unseen sections.
    var energyRaw = new Array(n);
    var minE = Infinity;
    var maxE = -Infinity;
    for (var j = 0; j < n; j++) {
        var e = beatEnergy(masterQs[j]);
        if (typeof e !== "number" || !isFinite(e)) e = 0;
        energyRaw[j] = e;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
    }
    var range = Math.max(1e-9, maxE - minE);
    var candidates = [];
    for (var k = 0; k < n; k++) {
        if (isRecent(k)) continue;
        if (isTabooTarget(k)) continue;
        if (isTabooRange(k)) continue;
        var dist01 = Math.abs(k - cur) / Math.max(1, n - 1);
        var e01 = clamp01((energyRaw[k] - minE) / range);
        var secK = harmonizerBeatSectionIndex(k);
        var unseenSection = (secK !== null && !recentSections[secK]) ? 1 : 0;
        var exploreBonus = sectionExploreBonusForIdx(k);
        var score = 0.50 * dist01 + 0.22 * e01 + 0.10 * unseenSection + exploreBonus;
        candidates.push({ idx: k, score: score });
    }
    if (!candidates.length) return null;
    candidates.sort(function(a, b) { return b.score - a.score; });
    var pickPool = candidates.slice(0, Math.min(20, candidates.length));
    return pickPool[Math.floor(Math.random() * pickPool.length)].idx;
}

function harmonizerApplyAntiLoop(meta, idx) {
    if (!harmonizerAntiLoopEnabled()) return idx;
    if (!meta || typeof meta.currentIndex !== "number" || typeof idx !== "number") return idx;
    if (!masterQs || !masterQs.length) return idx;

    var mode = (meta.mode || "unknown").toLowerCase();
    // Only force anti-loop escapes in orbit/eternal-style looping modes.
    // Canon-canvas modes are meant to play sequentially.
    try {
        if (typeof isOrbitMode === "function" && !isOrbitMode(mode)) {
            return idx;
        }
    } catch (e) {}
    var state = harmonizerGetAntiLoopState(mode);
    harmonizerAntiLoop.tick += 1;
    var tick = harmonizerAntiLoop.tick;

    state.visits.push(meta.currentIndex);
    if (state.visits.length > 256) state.visits.shift();
    var secNow = harmonizerBeatSectionIndex(meta.currentIndex);
    if (secNow !== null) {
        state.sectionHistory.push(secNow);
        if (state.sectionHistory.length > 256) state.sectionHistory.shift();
        if (!state.seenSections[secNow]) {
            state.seenSections[secNow] = true;
            state.lastNewSectionTick = tick;
        }
    }

    function isTabooTarget(target) {
        if (!state || !state.tabooTargets) return false;
        var exp = state.tabooTargets[target];
        if (!exp) return false;
        if (tick > exp) {
            delete state.tabooTargets[target];
            return false;
        }
        return true;
    }
    function isTabooEdge(edgeKey) {
        if (!state || !state.tabooEdges) return false;
        var exp = state.tabooEdges[edgeKey];
        if (!exp) return false;
        if (tick > exp) {
            delete state.tabooEdges[edgeKey];
            return false;
        }
        return true;
    }
    function isTabooRange(target) {
        if (!state || !Array.isArray(state.tabooRanges) || !state.tabooRanges.length) return false;
        var keep = [];
        var hit = false;
        for (var ri = 0; ri < state.tabooRanges.length; ri++) {
            var r = state.tabooRanges[ri];
            if (!r) continue;
            if (tick > (r.until || 0)) continue;
            keep.push(r);
            if (target >= r.min && target <= r.max) hit = true;
        }
        state.tabooRanges = keep;
        return hit;
    }

    var out = idx;
    if (tick >= (state.cooldownUntilTick || 0) && harmonizerLooksStuck(state, meta.currentIndex, idx)) {
        // Mark the recent loop neighborhood as taboo so the reroll doesn't pick the same tiny set again.
        var tabooUntil = tick + 160;
        var tabooSlice = state.visits.slice(Math.max(0, state.visits.length - 40));
        for (var ti = 0; ti < tabooSlice.length; ti++) {
            var tIdx = tabooSlice[ti];
            if (typeof tIdx === "number" && isFinite(tIdx)) state.tabooTargets[tIdx] = tabooUntil;
        }
        var tabooEdgesSlice = state.edges.slice(Math.max(0, state.edges.length - 40));
        for (var te = 0; te < tabooEdgesSlice.length; te++) {
            var ek = tabooEdgesSlice[te];
            if (ek) state.tabooEdges[ek] = tabooUntil;
        }
        // Add buffered "regions" so we also avoid nearby beats that weren't explicitly visited yet.
        // This approximates "skip that loop region and take the next best thing".
        if (!state.tabooRanges) state.tabooRanges = [];
        var uniq = Array.from(new Set(tabooSlice.filter(function(v) { return typeof v === "number" && isFinite(v); })));
        uniq.sort(function(a, b) { return a - b; });
        if (uniq.length) {
            var gap = 6;
            var pad = 4;
            var start = uniq[0];
            var last = uniq[0];
            for (var ui = 1; ui < uniq.length; ui++) {
                var v = uniq[ui];
                if (v - last <= gap) {
                    last = v;
                    continue;
                }
                state.tabooRanges.push({
                    min: Math.max(0, start - pad),
                    max: Math.min(masterQs.length - 1, last + pad),
                    until: tabooUntil
                });
                start = v;
                last = v;
            }
            state.tabooRanges.push({
                min: Math.max(0, start - pad),
                max: Math.min(masterQs.length - 1, last + pad),
                until: tabooUntil
            });
            if (state.tabooRanges.length > 12) {
                state.tabooRanges = state.tabooRanges.slice(state.tabooRanges.length - 12);
            }
        }

        var escape = harmonizerPickAntiLoopEscape(meta, state);
        if (typeof escape === "number" && isFinite(escape) && escape !== idx && escape !== meta.currentIndex) {
            out = Math.max(0, Math.min(masterQs.length - 1, Math.round(escape)));
            state.cooldownUntilTick = tick + 64;
            try {
                console.log("[AntiLoop] forced escape", {
                    mode: mode,
                    from: meta.currentIndex,
                    proposed: idx,
                    to: out
                });
            } catch (e) {}
        }
    }

    // If we're about to jump into a known taboo zone, reroll an escape.
    if (isTabooTarget(out) || isTabooRange(out) || isTabooEdge(meta.currentIndex + ":" + out)) {
        var reroll = harmonizerPickAntiLoopEscape(meta, state);
        if (typeof reroll === "number" && isFinite(reroll) && reroll !== out && reroll !== meta.currentIndex) {
            out = Math.max(0, Math.min(masterQs.length - 1, Math.round(reroll)));
            state.cooldownUntilTick = Math.max(state.cooldownUntilTick || 0, tick + 24);
        }
    }

    state.edges.push(meta.currentIndex + ":" + out);
    if (state.edges.length > 256) state.edges.shift();
    return out;
}

function applyStackedNextIndex(meta) {
    if (!meta || typeof meta.proposedIndex !== "number" || !isFinite(meta.proposedIndex)) {
        return (meta && typeof meta.proposedIndex === "number") ? meta.proposedIndex : 0;
    }
    var idx = meta.proposedIndex;
    if (activeStackLayers.length) {
        var guard = 0;
        activeStackLayers.forEach(function(layer) {
            if (!layer || typeof layer.transformNextIndex !== "function") return;
            if (guard++ > 6) return;
            try {
                var out = layer.transformNextIndex(Object.assign({}, meta, { proposedIndex: idx }));
                if (out && typeof out.index === "number" && isFinite(out.index)) {
                    var clamped = Math.max(0, Math.min(masterQs.length - 1, Math.round(out.index)));
                    idx = clamped;
                }
            } catch (e) {}
        });
    }
    idx = harmonizerApplyAntiLoop(meta, idx);
    return idx;
}

window.getAvailableStackLayers = function() {
    return listStackLayers().map(function(def) {
        return { id: def.id, label: def.label, description: def.description };
    });
};
window.getStackedLayers = function() {
    return stackedLayerIds.slice();
};
window.setStackedLayers = function(ids) {
    if (!Array.isArray(ids)) {
        ids = [];
    }
    var next = ids
        .map(function(v) { return (v || "") + ""; })
        .map(function(v) { return v.toLowerCase(); })
        .filter(function(v) { return !!stackRegistry[v]; });
    stackedLayerIds = Array.from(new Set(next));
    rebuildActiveStackLayers();
    if (driver && typeof driver.onStackChange === "function") {
        try { driver.onStackChange(activeStackLayers.slice(), stackedLayerIds.slice()); } catch (e) {}
    }
};
window.clearStackedLayers = function() {
    window.setStackedLayers([]);
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
    eternalLoop: ["minLoopBeats", "maxSequentialBeats"],
    dopamineMiner: ["minClusterBeats", "clusterGapBeats", "minDwellBeats", "maxSequentialBeats", "minJumpSpanBeats", "burnoutWindowBeats", "burnoutCooldownBeats"],
    harmonicTrap: ["graceBeats", "cooldownBeats", "minJumpSpanBeats"],
    phaseShifter: ["resyncThresholdBeats"],
    granularFreeze: ["cooldownBeats"],
    elasticVelocity: ["smoothingBeats"],
    mathRocker: ["cycleBeats", "dropBeats"],
    stalker: ["cooldownBeats", "armBeats"],
    timbreSurfing: ["minJumpSpanBeats", "excludeNeighborBeats", "recentWindowBeats"],
    chromaStacking: ["excludeNeighborBeats", "minJumpSpanBeats", "searchTopK", "randomSample", "resampleBeats"],
    beatSorting: ["repeatEach"],
    reverseBloom: ["rewindBeats", "cooldownBeats", "bloomMinSpanBeats"],
    barberPole: ["stepRanks", "minSpanBeats", "excludeNeighborBeats", "topK", "recentWindowBeats"],
    palindromeEngine: ["phraseBeats", "minTurnSpanBeats", "excludeNeighborBeats", "flipCooldownBeats", "turnTopK"],
    spectralGravity: ["cooldownBeats", "minSpanBeats", "excludeNeighborBeats", "topK", "recentWindowBeats"],
    callResponse: ["barsPerCall", "barsPerResponse", "minSpanBeats", "excludeNeighborBeats", "topK", "recentWindowBars"],
    orbitWeaver: ["anchorCount", "spinAxis", "barsPerAnchor", "minSpanBeats", "excludeNeighborBeats", "topK", "recentWindowBeats"]
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
    if (!isOrbitMode(mode)) {
        return;
    }
    renderJukeboxBackdrop();
    drawAllCircularLoops(masterQs);
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
    } else if (fieldKey === "routeLength" && typeof driver.setRouteLength === "function") {
        driver.setRouteLength(value);
        applied = true;
    } else if (fieldKey === "jumpTemperature" && typeof driver.setJumpTemperature === "function") {
        driver.setJumpTemperature(value);
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
    if (!paper || !q) {
        return;
    }

    // Skip linear overlay chips for circular modes - they use updateCircularCursors instead
    if (isOrbitMode(mode)) {
        return;
    }

    var TW = W - hPad;
    var baseY = H - 8;
    var size = 8;

    // Use dynamic voice states from jremix if available
    var voiceStates = window.currentVoiceStates || [];
    if (voiceStates.length > 0 && masterQs && masterQs.length > 0) {
        for (var i = 0; i < voiceStates.length; i++) {
            var vs = voiceStates[i];
            var ov = masterQs[vs.beatIdx];
            if (!ov) continue;
            var x = hPad + TW * (ov.start / trackDuration);
            var c = getOverlayColor(i, voiceStates.length);

            // Draw chip - larger if voice just jumped
            var chipSize = (vs.beatsSinceJump < 4) ? size * 1.5 : size;
            var chip = paper.rect(x - chipSize / 2, baseY - chipSize / 2, chipSize, chipSize, 2);
            chip.attr({ fill: c, stroke: c, "stroke-width": 2, opacity: 0.95 });
            activeOverlayChips.push(chip);
        }
        return;
    }

    // Fallback to pre-computed q.others
    if (!q.others || !Array.isArray(q.others) || !q.others.length) {
        return;
    }
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
    if (source.routeLength !== undefined) {
        merged.routeLength = source.routeLength;
    }
    if (source.jumpTemperature !== undefined) {
        merged.jumpTemperature = source.jumpTemperature;
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

    var routeLength = coerceNumber(merged.routeLength);
    if (routeLength === null) {
        routeLength = defaults && defaults.routeLength !== undefined ? defaults.routeLength : 8;
    }
    merged.routeLength = Math.max(4, Math.min(32, Math.round(routeLength)));

    var jumpTemperature = coerceNumber(merged.jumpTemperature);
    if (jumpTemperature === null) {
        jumpTemperature = defaults && defaults.jumpTemperature !== undefined ? defaults.jumpTemperature : 0.25;
    }
    merged.jumpTemperature = Math.max(0.05, Math.min(0.8, jumpTemperature));

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

    // Clear voice states from previous player
    window.currentVoiceStates = [];
    window.lastVoiceJump = null;

    // Re-apply canon alignment if voice count changed (for multi-voice canon)
    if ((mode === "canon" || mode === "eternal") && curTrack && curTrack.analysis && curTrack.analysis.canon_alignment) {
        console.log('[Rebuild Driver] Re-applying canon alignment with', window.canonVoiceCount || 2, 'voices');
        applyCanonAlignment(masterQs, curTrack.analysis.canon_alignment);
    }

    var initialPlayer = remixer.getPlayer();
    window.harmonizerActivePlayer = initialPlayer;
    driver = Driver(initialPlayer);
    rebuildActiveStackLayers();
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
    }

    // Append artist if we have a real one (not the placeholder)
    if (artist && artist !== '(unknown artist)') {
        title = title ? (title + ' by ' + artist) : artist;
    }

    // Append current mode name (canon / jukebox / eternal / autoharmonizer / sculptor)
    var modeName = (typeof mode === "string" ? mode.toLowerCase() : "canon");
    var modeLabel = null;
    if (modeName === "jukebox") {
        modeLabel = "Jukebox";
    } else if (modeName === "eternal") {
        modeLabel = "Eternal";
    } else if (modeName === "autoharmonizer") {
        modeLabel = "Autoharmonizer";
    } else if (modeName === "sculptor") {
        modeLabel = "Sculptor";
    } else {
        modeLabel = "Canon";
    }

    if (title && modeLabel) {
        return title + " - " + modeLabel;
    } else if (title) {
        return title;
    } else if (modeLabel) {
        return modeLabel;
    }
    return null;
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

function clearTiles() {
    if (!tiles || !tiles.length) {
        tiles = [];
        return;
    }
    for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (!t) {
            continue;
        }
        if (t.rect && typeof t.rect.remove === "function") {
            t.rect.remove();
        }
        if (t.cursor && typeof t.cursor.remove === "function") {
            t.cursor.remove();
        }
        if (t.q && t.q.tile === t) {
            t.q.tile = null;
        }
    }
    tiles = [];
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
    // For non-canon modes, always use 2 voices (1 main + 1 overlay)
    var currentMode = document.body ? document.body.getAttribute('data-mode') : 'canon';
    var requestedVoices = window.canonVoiceCount || 2;
    var numVoices = (currentMode === 'canon')
        ? Math.max(2, Math.min(8, requestedVoices))
        : 2;
    console.log('[Canon Alignment] Generating', numVoices, 'voices (mode:', currentMode, ')');
    var canonAnalysis = (curTrack && curTrack.analysis) ? curTrack.analysis : {};
    var globalVoiceOffsets = Array.isArray(canonAnalysis.global_voice_offsets) ? canonAnalysis.global_voice_offsets.slice(0) : [];
    var canonCandidatesMap = (canonAnalysis.canon_candidates && typeof canonAnalysis.canon_candidates === "object") ? canonAnalysis.canon_candidates : null;
    canonVoiceOffsetsForDriver = globalVoiceOffsets.slice(0);

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

        // Generate multiple overlay voices (q.others array) for all voice counts
        q.others = [];

        // Voice 0: use the canonical pair from analysis
        q.others.push(target);

        // For voices 2+, use global offsets from backend or synthesize fallback offsets
        if (numVoices > 2) {
            var neededOffsets = numVoices - 2; // Already have 1 overlay, need (numVoices - 1) - 1 more
            var availableOffsets = globalVoiceOffsets.slice(0, neededOffsets);

            // Synthesize fallback offsets if backend didn't provide enough
            var beatsPerBar = (q && q.bar_length_beats) ? q.bar_length_beats : 4;
            var fallbackBarOffsets = [4, 8, 16, 32, -4, -8, -16]; // Common musical offsets
            while (availableOffsets.length < neededOffsets) {
                var fallbackIdx = availableOffsets.length;
                if (fallbackIdx < fallbackBarOffsets.length) {
                    availableOffsets.push(fallbackBarOffsets[fallbackIdx]);
                } else {
                    // Ultimate fallback: evenly distribute across track
                    var evenOffset = Math.floor(qlist.length / numVoices) * (availableOffsets.length + 2);
                    availableOffsets.push(evenOffset);
                }
            }

            for (var oi = 0; oi < availableOffsets.length; oi++) {
                var off = availableOffsets[oi];
                var chosen = null;

                // Try to find a scored candidate from backend analysis
                if (canonCandidatesMap && canonCandidatesMap[i]) {
                    var cands = canonCandidatesMap[i];
                    for (var ci = 0; ci < cands.length; ci++) {
                        var cc = cands[ci];
                        if (cc && cc.bar_offset === off && typeof cc.target === "number") {
                            chosen = qlist[cc.target];
                            break;
                        }
                    }
                }

                // Fallback: calculate offset directly
                if (!chosen) {
                    var idx = (i + off * beatsPerBar) % qlist.length;
                    idx = ((idx % qlist.length) + qlist.length) % qlist.length;
                    chosen = qlist[idx];
                }

                if (chosen && chosen !== target) {
                    q.others.push(chosen);
                }
            }
        }

        // Debug: log first beat only to avoid spam
        if (i === 0) {
            console.log('[Canon Alignment] Beat 0 has', q.others.length, 'overlay voices at offsets:',
                q.others.map(function(o) { return ((o.which - q.which) + qlist.length) % qlist.length; }));
            console.log('[Canon Alignment] For', numVoices, 'total voices (1 main +', q.others.length, 'overlays)');
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

// Fallback: if alignment fails or is missing, synthesize overlays so multi-voice UI still works
function synthesizeCanonOverlays(qlist, numVoices) {
    if (!qlist || !qlist.length || numVoices < 2) {
        return;
    }
    var total = qlist.length;
    for (var i = 0; i < total; i++) {
        var q = qlist[i];
        // Simple evenly spaced offsets
        var others = [];
        for (var v = 1; v < numVoices; v++) {
            var step = Math.max(1, Math.floor(total / numVoices) * v);
            var idx = (i + step) % total;
            var target = qlist[idx];
            if (target) {
                others.push(target);
            }
        }
        // Always keep legacy fields too
        q.other = others[0] || q.next || q;
        q.others = others;
        q.otherGain = 0.6;
    }
    console.warn("[Canon Alignment] Using synthesized overlays (no alignment data). Voices:", numVoices);
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
        // Draw all loops (eternal jukebox + canon overlay) on the circle
        drawAllCircularLoops(masterQs);
        return;
    }
    regenerateOverlayFromSettings(advancedSettings.eternalOverlay, { targetMode: "eternal" });
    // Redraw all loops (eternal jukebox + canon overlay) on the circle
    drawAllCircularLoops(masterQs);
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
	            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'dopamineMiner', 'harmonicTrap', 'phaseShifter', 'granularFreeze', 'elasticVelocity', 'mathRocker', 'stalker', 'timbreSurfing', 'chromaStacking', 'beatSorting', 'reverseBloom', 'barberPole', 'palindromeEngine', 'spectralGravity', 'callResponse', 'orbitWeaver', 'sculptorConfig'];
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

	        var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'dopamineMiner', 'harmonicTrap', 'phaseShifter', 'granularFreeze', 'elasticVelocity', 'mathRocker', 'stalker', 'timbreSurfing', 'chromaStacking', 'beatSorting', 'reverseBloom', 'barberPole', 'palindromeEngine', 'spectralGravity', 'callResponse', 'orbitWeaver', 'sculptorConfig'];
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
	            if (mode === "dopamine" && isAdvancedGroupEnabled("dopamineMiner")) {
	                window.applyAdvancedGroup("dopamineMiner", { source: "import" });
	            }
	            if (mode === "harmonictrap" && isAdvancedGroupEnabled("harmonicTrap")) {
	                window.applyAdvancedGroup("harmonicTrap", { source: "import" });
	            }
	            if (mode === "phaseshifter" && isAdvancedGroupEnabled("phaseShifter")) {
	                window.applyAdvancedGroup("phaseShifter", { source: "import" });
	            }
	            if (mode === "granularfreeze" && isAdvancedGroupEnabled("granularFreeze")) {
	                window.applyAdvancedGroup("granularFreeze", { source: "import" });
	            }
	            if (mode === "elasticvelo" && isAdvancedGroupEnabled("elasticVelocity")) {
	                window.applyAdvancedGroup("elasticVelocity", { source: "import" });
	            }
	            if (mode === "mathrocker" && isAdvancedGroupEnabled("mathRocker")) {
	                window.applyAdvancedGroup("mathRocker", { source: "import" });
	            }
	            if (mode === "stalker" && isAdvancedGroupEnabled("stalker")) {
	                window.applyAdvancedGroup("stalker", { source: "import" });
	            }
	            if (mode === "timbresurf" && isAdvancedGroupEnabled("timbreSurfing")) {
	                window.applyAdvancedGroup("timbreSurfing", { source: "import" });
	            }
	            if (mode === "chromastack" && isAdvancedGroupEnabled("chromaStacking")) {
	                window.applyAdvancedGroup("chromaStacking", { source: "import" });
	            }
	            if (mode === "beatsort" && isAdvancedGroupEnabled("beatSorting")) {
	                window.applyAdvancedGroup("beatSorting", { source: "import" });
	            }
	            if (mode === "reversebloom" && isAdvancedGroupEnabled("reverseBloom")) {
	                window.applyAdvancedGroup("reverseBloom", { source: "import" });
	            }
	            if (mode === "barberpole" && isAdvancedGroupEnabled("barberPole")) {
	                window.applyAdvancedGroup("barberPole", { source: "import" });
	            }
            if (mode === "palindrome" && isAdvancedGroupEnabled("palindromeEngine")) {
                window.applyAdvancedGroup("palindromeEngine", { source: "import" });
            }
            if (mode === "spectralgravity" && isAdvancedGroupEnabled("spectralGravity")) {
                window.applyAdvancedGroup("spectralGravity", { source: "import" });
            }
            if (mode === "callresponse" && isAdvancedGroupEnabled("callResponse")) {
                window.applyAdvancedGroup("callResponse", { source: "import" });
            }
            if (mode === "orbitweaver" && isAdvancedGroupEnabled("orbitWeaver")) {
                window.applyAdvancedGroup("orbitWeaver", { source: "import" });
            }
            if (mode === "sculptor" && isAdvancedGroupEnabled("sculptorConfig")) {
                window.applyAdvancedGroup("sculptorConfig", { source: "import" });
            }
	        }

        console.log('[Settings] Applied imported settings to all groups');
    };

	    window.syncAllGroupsFromState = function() {
	        if (typeof window.syncGroupFromState === 'function') {
	            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop', 'dopamineMiner', 'harmonicTrap', 'phaseShifter', 'granularFreeze', 'elasticVelocity', 'mathRocker', 'stalker', 'timbreSurfing', 'chromaStacking', 'beatSorting', 'reverseBloom', 'barberPole', 'palindromeEngine', 'spectralGravity', 'callResponse', 'orbitWeaver', 'sculptorConfig'];
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
        } else if (group === "dopamineMiner") {
            if (mode === "dopamine" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getDopamineMinerSettings());
            }
            rebuildActiveStackLayers();
	        } else if (group === "harmonicTrap") {
	            if (mode === "harmonictrap" && driver && typeof driver.applySettings === "function") {
	                driver.applySettings(getHarmonicTrapSettings());
	            }
	            rebuildActiveStackLayers();
	        } else if (group === "phaseShifter") {
	            if (mode === "phaseshifter" && driver && typeof driver.applySettings === "function") {
	                driver.applySettings(getPhaseShifterSettings());
	            }
	            rebuildActiveStackLayers();
          } else if (group === "granularFreeze") {
              if (mode === "granularfreeze" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getGranularFreezeSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "elasticVelocity") {
              if (mode === "elasticvelo" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getElasticVelocitySettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "mathRocker") {
              if (mode === "mathrocker" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getMathRockerSettings());
              }
              rebuildActiveStackLayers();
        } else if (group === "stalker") {
            if (mode === "stalker" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getStalkerSettings());
            }
            rebuildActiveStackLayers();
          } else if (group === "timbreSurfing") {
              if (mode === "timbresurf" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getTimbreSurfingSettings());
              }
              rebuildActiveStackLayers();
            } else if (group === "chromaStacking") {
                if (mode === "chromastack" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getChromaStackingSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "beatSorting") {
                if (mode === "beatsort" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getBeatSortingSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "reverseBloom") {
                if (mode === "reversebloom" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getReverseBloomSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "barberPole") {
                if (mode === "barberpole" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getBarberPoleSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "palindromeEngine") {
                if (mode === "palindrome" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getPalindromeEngineSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "spectralGravity") {
                if (mode === "spectralgravity" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getSpectralGravitySettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "callResponse") {
                if (mode === "callresponse" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getCallResponseSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "orbitWeaver") {
                if (mode === "orbitweaver" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getOrbitWeaverSettings());
                }
                rebuildActiveStackLayers();
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
	        if (group === "phaseShifter") {
	            if (mode === "phaseshifter" && driver && typeof driver.applySettings === "function") {
	                driver.applySettings(getPhaseShifterSettings());
	            }
	            rebuildActiveStackLayers();
	            return;
	        }
	        if (group === "granularFreeze") {
	            if (mode === "granularfreeze" && driver && typeof driver.applySettings === "function") {
	                driver.applySettings(getGranularFreezeSettings());
	            }
	            rebuildActiveStackLayers();
	            return;
	        }
            if (group === "elasticVelocity") {
                if (mode === "elasticvelo" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getElasticVelocitySettings());
                }
                rebuildActiveStackLayers();
                return;
            }
            if (group === "mathRocker") {
                if (mode === "mathrocker" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getMathRockerSettings());
                }
                rebuildActiveStackLayers();
                return;
            }
            if (group === "stalker") {
                if (mode === "stalker" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getStalkerSettings());
                }
                rebuildActiveStackLayers();
                return;
            }
            if (group === "timbreSurfing") {
                if (mode === "timbresurf" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getTimbreSurfingSettings());
                }
                rebuildActiveStackLayers();
                return;
            }
              if (group === "chromaStacking") {
                  if (mode === "chromastack" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getChromaStackingSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "beatSorting") {
                  if (mode === "beatsort" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getBeatSortingSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "reverseBloom") {
                  if (mode === "reversebloom" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getReverseBloomSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "barberPole") {
                  if (mode === "barberpole" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getBarberPoleSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "palindromeEngine") {
                  if (mode === "palindrome" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getPalindromeEngineSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "spectralGravity") {
                  if (mode === "spectralgravity" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getSpectralGravitySettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "callResponse") {
                  if (mode === "callresponse" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getCallResponseSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
              if (group === "orbitWeaver") {
                  if (mode === "orbitweaver" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getOrbitWeaverSettings());
                  }
                  rebuildActiveStackLayers();
                  return;
              }
            if (group === "sculptorConfig") {
                if (typeof window.applySculptorSettings === "function") {
                    window.applySculptorSettings({ reason: "setting", field: key });
                }
                return;
            }
        if (group === "dopamineMiner") {
            if (mode === "dopamine" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getDopamineMinerSettings());
            }
            rebuildActiveStackLayers();
            return;
        }
        if (group === "harmonicTrap") {
            if (mode === "harmonictrap" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getHarmonicTrapSettings());
            }
            rebuildActiveStackLayers();
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
        } else if (group === "dopamineMiner") {
            if (mode === "dopamine" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getDopamineMinerSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "harmonicTrap") {
            if (mode === "harmonictrap" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getHarmonicTrapSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "palindromeEngine") {
            if (mode === "palindrome" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getPalindromeEngineSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "spectralGravity") {
            if (mode === "spectralgravity" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getSpectralGravitySettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "callResponse") {
            if (mode === "callresponse" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getCallResponseSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "orbitWeaver") {
            if (mode === "orbitweaver" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getOrbitWeaverSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "reverseBloom") {
            if (mode === "reversebloom" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getReverseBloomSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "barberPole") {
            if (mode === "barberpole" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getBarberPoleSettings());
            }
            rebuildActiveStackLayers();
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
          } else if (group === "dopamineMiner") {
              if (mode === "dopamine" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getDopamineMinerSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "harmonicTrap") {
              if (mode === "harmonictrap" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getHarmonicTrapSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "phaseShifter") {
              if (mode === "phaseshifter" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getPhaseShifterSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "granularFreeze") {
              if (mode === "granularfreeze" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getGranularFreezeSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "elasticVelocity") {
              if (mode === "elasticvelo" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getElasticVelocitySettings());
              }
              rebuildActiveStackLayers();
            } else if (group === "mathRocker") {
                if (mode === "mathrocker" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getMathRockerSettings());
                }
                rebuildActiveStackLayers();
            } else if (group === "stalker") {
                if (mode === "stalker" && driver && typeof driver.applySettings === "function") {
                    driver.applySettings(getStalkerSettings());
                }
                rebuildActiveStackLayers();
              } else if (group === "timbreSurfing") {
                  if (mode === "timbresurf" && driver && typeof driver.applySettings === "function") {
                      driver.applySettings(getTimbreSurfingSettings());
                  }
                  rebuildActiveStackLayers();
                } else if (group === "chromaStacking") {
                    if (mode === "chromastack" && driver && typeof driver.applySettings === "function") {
                        driver.applySettings(getChromaStackingSettings());
                    }
                    rebuildActiveStackLayers();
          } else if (group === "beatSorting") {
              if (mode === "beatsort" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getBeatSortingSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "reverseBloom") {
              if (mode === "reversebloom" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getReverseBloomSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "barberPole") {
              if (mode === "barberpole" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getBarberPoleSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "palindromeEngine") {
              if (mode === "palindrome" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getPalindromeEngineSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "spectralGravity") {
              if (mode === "spectralgravity" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getSpectralGravitySettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "callResponse") {
              if (mode === "callresponse" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getCallResponseSettings());
              }
              rebuildActiveStackLayers();
          } else if (group === "orbitWeaver") {
              if (mode === "orbitweaver" && driver && typeof driver.applySettings === "function") {
                  driver.applySettings(getOrbitWeaverSettings());
              }
              rebuildActiveStackLayers();
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
        } else if (group === "dopamineMiner") {
            handled = true;
            if (mode === "dopamine" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getDopamineMinerSettings());
            }
            rebuildActiveStackLayers();
        } else if (group === "harmonicTrap") {
            handled = true;
            if (mode === "harmonictrap" && driver && typeof driver.applySettings === "function") {
                driver.applySettings(getHarmonicTrapSettings());
            }
            rebuildActiveStackLayers();
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
        console.warn("[allReady] No beats available for mode:", mode, "– falling back to track analysis beats");
        masterQs = curTrack.analysis.beats || [];
    }
    if (!masterQs.length) {
        error("Unable to load beat data for this track");
        return;
    }
    // Expose masterQs to window for jremix independent voice paths
    window.masterQs = masterQs;
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
            var fallbackVoices = Math.max(2, Math.min(8, window.canonVoiceCount || 2));
            synthesizeCanonOverlays(masterQs, fallbackVoices);
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
            // Eternal mode - use circular visualization
            if (eternalAdvancedEnabled) {
                regenerateEternalOverlay({ initial: true });
            } else {
                assignNormalizedVolumes(masterQs);
                // Draw all loops (eternal jukebox + canon overlay) on the circle
                drawAllCircularLoops(masterQs);
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
	    } else if (mode === "dopamine") {
	        modePillText = "Dopamine Miner";
	    } else if (mode === "phaseshifter") {
	        modePillText = "Phase Shifter";
	    } else if (mode === "granularfreeze") {
	        modePillText = "Granular Freeze";
	    } else if (mode === "harmonictrap") {
	        modePillText = "Harmonic Trap";
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

    info(getFullTitle() || "ready!");
    createTiles(masterQs);

    if (queueAutoPlayPending) {
        var runningNow = false;
        if (driver && typeof driver.isRunning === "function") {
            runningNow = driver.isRunning();
        }
        queueAutoPlayPending = false;
        if (!runningNow) {
            togglePlayback().catch(function(err) {
                console.error("[Queue] Auto-play failed:", err);
            });
        }
    }
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
    document.body.classList.remove("playing-canon", "playing-jukebox", "playing-eternal", "playing-autocrooner", "playing-autoharmonizer", "playing-sculptor", "playing-phaseshifter", "playing-granularfreeze", "playing-elasticvelo", "playing-mathrocker", "playing-stalker", "playing-timbresurf", "playing-chromastack", "playing-beatsort", "playing-reversebloom", "playing-barberpole", "playing-palindrome", "playing-spectralgravity", "playing-callresponse", "playing-orbitweaver");
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
    } else if (modeName === "autocrooner") {
        document.body.classList.add("playing-autocrooner");
        baseNoteStrength = 0.06;
    } else if (modeName === "phaseshifter") {
        document.body.classList.add("playing-phaseshifter");
        baseNoteStrength = 0.07;
    } else if (modeName === "granularfreeze") {
        document.body.classList.add("playing-granularfreeze");
        baseNoteStrength = 0.07;
    } else if (modeName === "elasticvelo") {
        document.body.classList.add("playing-elasticvelo");
        baseNoteStrength = 0.07;
    } else if (modeName === "mathrocker") {
        document.body.classList.add("playing-mathrocker");
        baseNoteStrength = 0.07;
    } else if (modeName === "stalker") {
        document.body.classList.add("playing-stalker");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "timbresurf") {
        document.body.classList.add("playing-timbresurf");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "chromastack") {
        document.body.classList.add("playing-chromastack");
        baseNoteStrength = 0.08;
    } else if (modeName === "beatsort") {
        document.body.classList.add("playing-beatsort");
        baseNoteStrength = 0.06;
    } else if (modeName === "reversebloom") {
        document.body.classList.add("playing-reversebloom");
        baseNoteStrength = 0.07;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "barberpole") {
        document.body.classList.add("playing-barberpole");
        baseNoteStrength = 0.07;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "palindrome") {
        document.body.classList.add("playing-jukebox");
        document.body.classList.add("playing-palindrome");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "spectralgravity") {
        document.body.classList.add("playing-jukebox");
        document.body.classList.add("playing-spectralgravity");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "callresponse") {
        document.body.classList.add("playing-jukebox");
        document.body.classList.add("playing-callresponse");
        baseNoteStrength = 0.08;
        renderJukeboxBackdrop(modeName);
    } else if (modeName === "orbitweaver") {
        document.body.classList.add("playing-jukebox");
        document.body.classList.add("playing-orbitweaver");
        baseNoteStrength = 0.08;
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
    if (!modeName) {
        notifyStackPlaybackStateChange({
            playing: false,
            mode: (mode || "canon").toLowerCase()
        });
    }
    // Only clear backdrop when explicitly switching away from jukebox/eternal modes
    // Don't clear when just stopping playback (modeName=null but still in those modes)
    var effectiveMode = modeName || mode;
    if (!isOrbitMode(effectiveMode)) {
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
    var decayDelay = isOrbitMode(mode) ? 180 : 280;
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
        if (bodyMode === "jukebox" || bodyMode === "canon" || bodyMode === "eternal" || bodyMode === "autocrooner" || bodyMode === "autoharmonizer" || bodyMode === "sculptor") {
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
        var playerForDriver = remixer.getPlayer();
        window.harmonizerActivePlayer = playerForDriver;
        driver = Driver(playerForDriver);

	        // Load playlist queue from sessionStorage if available
	        loadPlaylistQueue();
	        if (!trackQueue.length) {
	            loadPersistedTrackQueue();
	        }

	        if (initialTrid) {
	            fetchAnalysis(initialTrid);
        } else {
            info("Load a track to begin.");
        }
    }

    window.addEventListener("resize", debounce(function() {
        // Opening/closing DevTools or small window resizes should not
        // regenerate the orbit or tiles; just keep the existing canvas
        // and adjust the container shell if needed.
        syncOrbitContainerSize();
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
            persistTrackQueue();

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
    persistTrackQueue();
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

function resetCanvasForTrackSwitch() {
    curTrack = null;
    masterQs = null;
    pendingOrbitRedraw = false;
    window.currentVoiceStates = [];
    window.lastVoiceJump = null;
    window.currentMainBeatIdx = null;
    resetPlaybackState();
    try {
        if (driver && driver.isRunning && driver.isRunning()) {
            driver.stop();
        }
    } catch (e) {
        // Ignore stop errors during hard reset.
    }
    clearTiles();
    clearLoopPaths();
    clearOrbitBase();
    clearJukeboxBackdrop();
    if (paper && typeof paper.clear === "function") {
        paper.clear();
    }
    applyModeLayout();
}

function playQueueIndex(index) {
    if (index < 0 || index >= trackQueue.length) {
        return false;
    }
    var target = trackQueue[index];
    resetCanvasForTrackSwitch();
    queueAutoPlayPending = true;
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
    persistTrackQueue();
    console.log('[Queue] Removed track:', removed.title);
}

function clearQueue() {
    trackQueue = [];
    currentQueueIndex = -1;
    selectedQueueIndex = -1;
    autoPlayNext = false;
    updateQueueUI();
    persistTrackQueue();
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
	    var queueUploadCancelled = false;

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
	        var defaultSourceBtn = queueSourceToggle.find('[data-source="youtube"]');
	        if (!defaultSourceBtn.length) {
	            defaultSourceBtn = queueSourceToggle.find("button").first();
	        }
	        if (defaultSourceBtn.length) {
	            defaultSourceBtn.addClass("active");
	            currentQueueSource = (defaultSourceBtn.data("source") || "upload") + "";
	            currentQueueSource = currentQueueSource.toLowerCase();
	            $(".queue-source-pane").hide();
	            $("#queue-" + currentQueueSource + "-pane").show();
	        } else {
	            currentQueueSource = "upload";
	        }

	        queueModalStatus.removeClass("visible error success info").text("");
	        queueModalShouldPersist = false;
	        queueUploadCancelled = false;
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
	        if (this.files.length === 1) {
	            $("#queue-file-upload-name").text(this.files[0].name);
	        } else if (this.files.length > 1) {
	            $("#queue-file-upload-name").text(this.files.length + " files selected");
	        } else {
	            $("#queue-file-upload-name").text("No file chosen");
	        }
	        markQueueModalDirty();
	    });

    $("#queue-youtube-url-input, #queue-drive-url-input, #queue-spotify-url-input, #queue-soundcloud-url-input").on("input", markQueueModalDirty);

		    // Add Songs button handler: open uploaded songs list
		    $("#add-to-queue-btn").click(function() {
		        var viewCachedSongsButton = document.getElementById("view-cached-songs");
		        if (viewCachedSongsButton) {
		            viewCachedSongsButton.click();
		        } else {
		            console.warn("[Queue] Uploaded songs view not available on this page.");
		        }
		    });

		    // Visualize This button handler: launch Sonic Architect as its own player (settings carried over).
		    $("#visualize-this-btn").click(function() {
		        var trackId = (window.curTrack && window.curTrack.id) ? window.curTrack.id : null;
		        if (!trackId) {
		            alert("No track loaded yet.");
		            return;
		        }
		        // Persist Harmonizer settings so Sonic Architect can mirror them on load.
		        try {
		            var startTimeSeconds = null;
		            var wasPlaying = null;
		            if (typeof remixer !== "undefined" && remixer && typeof remixer.getPlayer === "function") {
		                var pl = remixer.getPlayer();
		                if (pl && pl.audio) {
		                    startTimeSeconds = (typeof pl.audio.currentTime === "number" && isFinite(pl.audio.currentTime)) ? pl.audio.currentTime : 0;
		                    wasPlaying = !pl.audio.paused;
		                }
		            }
		            var stackedLayers = [];
		            if (window.getStackedLayers) {
		                stackedLayers = window.getStackedLayers() || [];
		            }
		            var rlModelVariant = null;
		            try {
		                rlModelVariant = (localStorage.getItem("RL_MODEL_VARIANT") || null);
		            } catch (e) {}
		            localStorage.setItem(
		                "harmonizerVisualizerLaunchHarmonizerV1",
		                JSON.stringify({
		                    trackId: trackId,
		                    mode: mode,
		                    stackedLayers: stackedLayers,
		                    loopEnabled: !!window.harmonizerLoopEnabled,
		                    baseAudioOnly: !!window.harmonizerBaseAudioOnly,
		                    canonVoiceCount: (typeof window.canonVoiceCount === "number" ? window.canonVoiceCount : null),
		                    startTimeSeconds: startTimeSeconds,
		                    wasPlaying: wasPlaying,
		                    policyMode: (typeof window.harmonizerPolicyMode === "string" ? window.harmonizerPolicyMode : null),
		                    rlModelVariant: rlModelVariant,
		                    savedAt: Date.now()
		                })
		            );
		        } catch (e) {}
		        var sid = "viz-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
		        var baseVizUrl;
		        try {
		            baseVizUrl = new URL("sonic-architect.html", window.location.href).toString();
		        } catch (e) {
		            baseVizUrl = "sonic-architect.html";
		        }
		        var targetUrl =
		            baseVizUrl +
		            (baseVizUrl.indexOf("?") === -1 ? "?" : "&") +
		            "trid=" + encodeURIComponent(trackId) +
		            (mode ? ("&mode=" + encodeURIComponent(mode || "")) : "") +
		            "&v=2025121331";
		        var vizWindow = window.open(targetUrl, "_blank");
		        if (!vizWindow) {
		            alert("Popup blocked — allow popups for this site to open the visualizer.");
		            return;
		        }

		        if (window.__harmonizerVizPump && typeof window.__harmonizerVizPump.stop === "function") {
		            try { window.__harmonizerVizPump.stop(); } catch (e) {}
		        }

		        // Sonic Architect is now standalone; stop using the cross-tab audio pump.
		        return;

		        window.__harmonizerVizPump = (function createVizPump(winRef) {
		            var audioCtx = null;
		            var analyser = null;
		            var outputGain = null;
		            var intervalId = null;
		            var boundTimeUpdate = null;
		            var currentAudioEl = null;
		            var currentSource = null;
		            var currentSourceKind = null; // "capture" | "element"
		            var elementSourceMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
		            var elementStreamMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
		            var elementReroutedSet = typeof WeakSet !== "undefined" ? new WeakSet() : null;
		            // Use wildcard origin to avoid mismatches across dev/prod (and file:// origins).
		            var targetOrigin = "*";
		            var receiverReady = false;
		            var onMessage = null;
		            var channels = [];
		            try {
		                if (typeof BroadcastChannel !== "undefined") {
		                    channels.push(new BroadcastChannel("harmonizer-viz-" + sid));
		                    channels.push(new BroadcastChannel("harmonizer-viz-default"));
		                }
		            } catch (e) {
		                channels = [];
		            }

		            function getPrimaryAnalyser() {
		                try {
		                    var pl = window.harmonizerActivePlayer || null;
		                    if (pl && typeof pl.getVizAnalyser === "function") {
		                        return pl.getVizAnalyser();
		                    }
		                } catch (e) {}
		                return null;
		            }

		            function getPrimaryAudio() {
		                try {
		                    var pl = window.harmonizerActivePlayer || null;
		                    if (pl && pl.audio) {
		                        return pl.audio;
		                    }
		                } catch (e) {}
		                return null;
		            }

		            function ensureAudioContext() {
		                if (audioCtx) return;
		                var AC = window.AudioContext || window.webkitAudioContext;
		                if (!AC) return;
		                audioCtx = new AC();
		                analyser = audioCtx.createAnalyser();
		                analyser.fftSize = 512;
		                analyser.smoothingTimeConstant = 0.85;
		                outputGain = audioCtx.createGain();
		                outputGain.gain.value = 1;
		                outputGain.connect(audioCtx.destination);
		            }

		            function detachSource(keepOutputIfElementSource) {
		                if (!currentSource) {
		                    currentSource = null;
		                    currentSourceKind = null;
		                    return;
		                }
		                var keepOutput = !!keepOutputIfElementSource;
		                if (currentSourceKind === "element" && keepOutput) {
		                    // MediaElementSource reroutes audio through the AudioContext, so do NOT fully disconnect it,
		                    // otherwise it will mute the main playback. Only detach the analyser tap.
		                    if (analyser) {
		                        try { currentSource.disconnect(analyser); } catch (e) {}
		                    }
		                } else {
		                    if (typeof currentSource.disconnect === "function") {
		                        try { currentSource.disconnect(); } catch (e) {}
		                    }
		                }
		                currentSource = null;
		                currentSourceKind = null;
		            }

		            function getOrCreateElementSource(el) {
		                if (!elementSourceMap) {
		                    return audioCtx.createMediaElementSource(el);
		                }
		                var existing = elementSourceMap.get(el);
		                if (existing) return existing;
		                var created = audioCtx.createMediaElementSource(el);
		                elementSourceMap.set(el, created);
		                return created;
		            }

		            function getOrCreateCaptureSource(el) {
		                if (typeof el.captureStream !== "function") return null;
		                var stream = null;
		                if (elementStreamMap) {
		                    stream = elementStreamMap.get(el) || null;
		                }
		                if (!stream) {
		                    try {
		                        stream = el.captureStream();
		                    } catch (e) {
		                        stream = null;
		                    }
		                    if (stream && elementStreamMap) {
		                        elementStreamMap.set(el, stream);
		                    }
		                }
		                if (!stream) return null;
		                try {
		                    return audioCtx.createMediaStreamSource(stream);
		                } catch (e) {
		                    return null;
		                }
		            }

		            function ensureGraphForAudioEl(audioEl) {
		                if (!audioEl) return false;
		                ensureAudioContext();
		                if (!audioCtx || !analyser) return false;
		                if (audioCtx.state === "suspended") {
		                    try { audioCtx.resume(); } catch (e) {}
		                }
		                if (audioEl === currentAudioEl && currentSource) return true;

		                // Switching audio elements: safe to fully detach old routing.
		                detachSource(false);
		                currentAudioEl = audioEl;

		                // Prefer captureStream so we don't reroute the element audio.
		                var shouldTryCapture = !elementReroutedSet || !elementReroutedSet.has(audioEl);
		                var captureSource = shouldTryCapture ? getOrCreateCaptureSource(audioEl) : null;
		                if (captureSource) {
		                    currentSource = captureSource;
		                    currentSourceKind = "capture";
		                    try { currentSource.connect(analyser); } catch (e) {}
		                    return true;
		                }

		                // Fallback: media element source (must route audio to destination).
		                var elementSource = null;
		                try {
		                    elementSource = getOrCreateElementSource(audioEl);
		                } catch (e) {
		                    console.warn("[VizPump] Unable to attach media element source", e);
		                    return false;
		                }
		                currentSource = elementSource;
		                currentSourceKind = "element";
		                if (elementReroutedSet) {
		                    try { elementReroutedSet.add(audioEl); } catch (e) {}
		                }
		                // Avoid duplicate connections when reusing a cached MediaElementSource node.
		                try { currentSource.disconnect(analyser); } catch (e) {}
		                try { currentSource.disconnect(outputGain); } catch (e) {}
		                try { currentSource.connect(analyser); } catch (e) {}
		                try { currentSource.connect(outputGain); } catch (e) {}
		                return true;
		            }

		            function sendFrame() {
		                if (!winRef || winRef.closed) {
		                    stop();
		                    return;
		                }
		                var primaryAnalyser = getPrimaryAnalyser();
		                if (primaryAnalyser && typeof primaryAnalyser.getByteFrequencyData === "function") {
		                    var freqA = new Uint8Array(primaryAnalyser.frequencyBinCount || 256);
		                    primaryAnalyser.getByteFrequencyData(freqA);
		                    var curIdA = (window.curTrack && window.curTrack.id) ? window.curTrack.id : null;
		                    var pausedA = false;
		                    try {
		                        pausedA = !(driver && typeof driver.isRunning === "function" && driver.isRunning());
		                    } catch (e) {
		                        pausedA = false;
		                    }
		                    try {
		                        if (channels && channels.length) {
		                            channels.forEach(function(ch) {
		                                try {
		                                    ch.postMessage({
		                                        type: "frame",
		                                        freq: Array.from(freqA),
		                                        currentTime: 0,
		                                        paused: pausedA,
		                                        trackId: curIdA,
		                                        mode: mode || null,
		                                        canonVoices: (typeof window.canonVoiceCount === "number" ? window.canonVoiceCount : null)
		                                    });
		                                } catch (e) {}
		                            });
		                        }
		                        winRef.postMessage(
		                            {
		                                type: "HARMONIZER_VIZ_FRAME",
		                                freq: Array.from(freqA),
		                                currentTime: 0,
		                                paused: pausedA,
		                                trackId: curIdA,
		                                mode: mode || null,
		                                canonVoices: (typeof window.canonVoiceCount === "number" ? window.canonVoiceCount : null)
		                            },
		                            targetOrigin
		                        );
		                    } catch (e) {}
		                    return;
		                }
		                var audioEl = getPrimaryAudio();
		                var ok = ensureGraphForAudioEl(audioEl);
		                if (!ok || !analyser) {
		                    return;
		                }
		                var freq = new Uint8Array(analyser.frequencyBinCount);
		                analyser.getByteFrequencyData(freq);
		                var curId = (window.curTrack && window.curTrack.id) ? window.curTrack.id : null;
		                var nowTime = 0;
		                var paused = true;
		                try {
		                    if (audioEl) {
		                        nowTime = audioEl.currentTime || 0;
		                        paused = !!audioEl.paused;
		                    }
		                } catch (e) {}
		                try {
		                    // Send as a plain array to avoid cross-origin transfer-list quirks.
		                    if (channels && channels.length) {
		                        channels.forEach(function(ch) {
		                            try {
		                                ch.postMessage({
		                                    type: "frame",
		                                    freq: Array.from(freq),
		                                    currentTime: nowTime,
		                                    paused: paused,
		                                    trackId: curId,
		                                    mode: mode || null,
		                                    canonVoices: (typeof window.canonVoiceCount === "number" ? window.canonVoiceCount : null)
		                                });
		                            } catch (e) {}
		                        });
		                    }
		                    winRef.postMessage(
		                        {
		                            type: "HARMONIZER_VIZ_FRAME",
		                            freq: Array.from(freq),
		                            currentTime: nowTime,
		                            paused: paused,
		                            trackId: curId,
		                            mode: mode || null,
		                            canonVoices: (typeof window.canonVoiceCount === "number" ? window.canonVoiceCount : null)
		                        },
		                        targetOrigin
		                    );
		                } catch (e) {
		                    // Ignore postMessage failures (e.g., navigation).
		                }
		            }

		            function start() {
		                // Only create a new AudioContext if we need the HTMLAudioElement fallback path.
		                try {
		                    var a = getPrimaryAnalyser();
		                    if (!a) {
		                        ensureAudioContext();
		                        if (audioCtx && audioCtx.state === "suspended") {
		                            audioCtx.resume();
		                        }
		                    }
		                } catch (e) {}
		                // Wait for the visualizer window to confirm it is listening (avoids dropped messages).
		                onMessage = function(e) {
		                    try {
		                        if (!e || e.source !== winRef) return;
		                        var msg = e.data;
		                        if (msg && typeof msg === "object" && msg.type === "HARMONIZER_VIZ_READY") {
		                            receiverReady = true;
		                        }
		                    } catch (err) {}
		                };
		                try { window.addEventListener("message", onMessage); } catch (e) {}
		                // Fallback: if READY never arrives (e.g. opener is null), start sending anyway.
		                setTimeout(function() {
		                    receiverReady = true;
		                }, 800);
		                // Send INIT immediately and periodically until we hear READY.
		                try {
		                    if (channels && channels.length) {
		                        channels.forEach(function(ch) {
		                            try { ch.postMessage({ type: "init" }); } catch (e) {}
		                        });
		                    }
		                } catch (e) {}
		                try { winRef.postMessage({ type: "HARMONIZER_VIZ_INIT" }, targetOrigin); } catch (e) {}
		                if (intervalId) clearInterval(intervalId);
		                intervalId = setInterval(function() {
		                    if (!receiverReady) {
		                        try {
		                            if (channels && channels.length) {
		                                channels.forEach(function(ch) {
		                                    try { ch.postMessage({ type: "init" }); } catch (e) {}
		                                });
		                            }
		                        } catch (e) {}
		                        try { winRef.postMessage({ type: "HARMONIZER_VIZ_INIT" }, targetOrigin); } catch (e) {}
		                        return;
		                    }
		                    sendFrame();
		                }, 50);
		                // Also hook timeupdate so we still tick when this tab is backgrounded (rAF pauses in bg tabs).
		                try {
		                    var el = getPrimaryAudio();
		                    if (el) {
		                        boundTimeUpdate = function() { sendFrame(); };
		                        el.addEventListener("timeupdate", boundTimeUpdate);
		                    }
		                } catch (e) {}
		                // Prime once.
		                setTimeout(function() {
		                    if (receiverReady) sendFrame();
		                }, 0);
		            }

		            function stop() {
		                if (intervalId) {
		                    clearInterval(intervalId);
		                    intervalId = null;
		                }
		                try {
		                    if (boundTimeUpdate && currentAudioEl) {
		                        currentAudioEl.removeEventListener("timeupdate", boundTimeUpdate);
		                    }
		                } catch (e) {}
		                try {
		                    if (onMessage) window.removeEventListener("message", onMessage);
		                } catch (e) {}
		                onMessage = null;
		                try {
		                    if (channels && channels.length) {
		                        channels.forEach(function(ch) {
		                            try { ch.close(); } catch (e) {}
		                        });
		                    }
		                } catch (e) {}
		                channels = [];
		                boundTimeUpdate = null;
		                // Do not mute main playback if we had to reroute via MediaElementSource.
		                detachSource(true);
		                currentAudioEl = null;
		            }

		            start();
		            return { stop: stop };
		        })(vizWindow);
		    });

		    function openQueueUploadModal() {
		        if (!queueModalShouldPersist) {
		            resetQueueModalForm();
		        }
		        // Default to upload pane
		        queueSourceToggle.find("button").removeClass("active");
		        queueSourceToggle.find('[data-source="upload"]').addClass("active");
		        $(".queue-source-pane").hide();
		        $("#queue-upload-pane").show();
		        currentQueueSource = "upload";
		        // Avoid stacking modals
		        $("#cached-songs-modal").hide();
		        queueModal.show();
		    }

		    // Upload button inside Uploaded Songs modal
		    $("#cached-songs-upload-btn").click(function() {
		        openQueueUploadModal();
		    });

		    // Next song button inside Uploaded Songs modal
		    $("#cached-songs-next-btn").click(function() {
		        var advanced = (mode || "").toLowerCase();
		        var played = playNextInQueue();
		        if (played) {
		            $("#cached-songs-modal").hide();
		            info("Loading next queued song...");
		        } else {
		            info("Queue is empty.");
		        }
		    });

	    // Close modal handlers
	    $("#queue-modal-close, #queue-modal-cancel").click(function() {
	        queueUploadCancelled = true;
	        queueModal.hide();
	    });

	    // Click outside modal to close
	    queueModal.click(function(e) {
	        if (e.target === queueModal[0]) {
	            queueUploadCancelled = true;
	            queueModal.hide();
	        }
	    });

	    $("#queue-modal-reset").click(function() {
	        resetQueueModalForm();
	        queueModalStatus.removeClass("visible");
	    });

		    function delay(ms) {
		        return new Promise(function(resolve) {
		            setTimeout(resolve, ms);
		        });
		    }

		    async function pollProcessJob(jobId, fallbackTitle, fallbackArtist) {
		        var pollAttempt = 0;
		        var maxAttempts = 900; // ~15 minutes with backoff
		        while (pollAttempt < maxAttempts) {
		            if (queueUploadCancelled) {
		                throw new Error("Upload cancelled");
		            }
		            pollAttempt++;
		            var statusRes;
		            try {
		                statusRes = await fetch(resolveApiUrl('api/process/status/' + encodeURIComponent(jobId)), {
		                    method: 'GET'
		                });
		            } catch (e) {
		                await delay(Math.min(5000, 400 * pollAttempt));
		                continue;
		            }
		            var statusData = {};
		            try {
		                statusData = await statusRes.json();
		            } catch (e) {
		                statusData = {};
		            }

		            if (statusRes.ok && statusData) {
		                if (statusData.status === 'completed' && statusData.result && statusData.result.trackId) {
		                    return {
		                        ok: true,
		                        trackId: statusData.result.trackId,
		                        title: statusData.result.title || fallbackTitle,
		                        artist: statusData.result.artist || fallbackArtist
		                    };
		                }
		                if (statusData.status === 'failed') {
		                    return {
		                        ok: false,
		                        shouldRetry: true,
		                        error: statusData.error || "Processing failed"
		                    };
		                }
		            }

		            await delay(Math.min(5000, 600 + 250 * pollAttempt));
		        }
		        return {
		            ok: false,
		            shouldRetry: true,
		            error: "Processing timeout - server is busy or track is too long"
		        };
		    }

		    async function processUploadFile(file) {
		        var entryFormData = new FormData();
		        entryFormData.append('source', 'upload');
		        entryFormData.append('algorithm', mode);
		        entryFormData.append('audio', file);

		        var response;
		        try {
		            response = await fetch(resolveApiUrl('api/process'), {
		                method: 'POST',
		                body: entryFormData
		            });
		        } catch (e) {
	            return { ok: false, shouldRetry: true, error: e.message || "Network error" };
	        }

	        var data = {};
	        try {
	            data = await response.json();
	        } catch (e) {
	            data = {};
	        }

		        if (response.ok) {
		            // Cached uploads return a completed job immediately.
		            if (data && data.jobId && data.status === "processing") {
		                return await pollProcessJob(data.jobId, data.title || file.name, data.artist || "Upload");
		            }
		            if (data && data.trackId) {
		                return {
		                    ok: true,
		                    trackId: data.trackId,
		                    title: data.title || file.name,
		                    artist: data.artist || "Upload"
		                };
		            }
		        }

	        var errorMessage = data.error || "Failed to process track";
	        var shouldRetry = !(response.status >= 400 && response.status < 500 && response.status !== 429);
	        return { ok: false, shouldRetry: shouldRetry, error: errorMessage };
	    }

		    async function processUploadQueue(files) {
		        for (var i = 0; i < files.length; i++) {
		            var file = files[i];
		            var attempt = 0;
	            while (true) {
	                if (queueUploadCancelled) {
	                    throw new Error("Upload cancelled");
	                }
	                attempt++;
	                queueModalStatus
	                    .addClass("visible info")
	                    .removeClass("error success")
	                    .text("Processing " + (i + 1) + "/" + files.length + ": " + file.name + " (attempt " + attempt + ")");

	                var result = await processUploadFile(file);
	                if (result.ok) {
	                    addToQueue(result.trackId, result.title, result.artist);
	                    break;
	                }

	                if (!result.shouldRetry) {
	                    throw new Error(result.error);
	                }

	                queueModalStatus.text("Retrying " + file.name + "... " + result.error);
	                await delay(Math.min(10000, 1000 * attempt));
	            }
	        }
	    }

	    // Submit handler
		    $("#queue-modal-submit").click(async function() {
	        queueModalShouldPersist = true;
	        queueUploadCancelled = false;
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
	                var files = Array.from(fileInput.files);
		                if (files.length > 40) {
		                    queueModalStatus.addClass("visible error").removeClass("info").text("Please select 40 files or fewer");
		                    return;
		                }
	                if (files.length > 1) {
	                    await processUploadQueue(files);
	                    queueModalStatus.addClass("success").removeClass("info").text("Added " + files.length + " tracks to queue!");
	                    setTimeout(function() {
	                        queueModal.hide();
	                        resetQueueModalForm();
	                    }, 1500);
	                    return;
	                }
	                formData.append('audio', files[0]);
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
	                    var playlistResponse = await fetch(resolveApiUrl('api/playlist-info'), {
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

	                            var response = await fetch(resolveApiUrl('api/process'), {
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

	            var response = await fetch(resolveApiUrl('api/process'), {
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
	        if (!queueContainer) {
	            return;
	        }
	        var dragHandle = queueContainer.querySelector('.queue-drag-handle');
	        if (!dragHandle) {
	            return;
	        }
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
    if (requestedMode === "jukebox" || requestedMode === "canon" || requestedMode === "eternal" || requestedMode === "autocrooner" || requestedMode === "dopamine" || requestedMode === "harmonictrap" || requestedMode === "phaseshifter" || requestedMode === "granularfreeze" || requestedMode === "elasticvelo" || requestedMode === "mathrocker" || requestedMode === "stalker" || requestedMode === "timbresurf" || requestedMode === "chromastack" || requestedMode === "beatsort" || requestedMode === "reversebloom" || requestedMode === "barberpole" || requestedMode === "palindrome" || requestedMode === "spectralgravity" || requestedMode === "callresponse" || requestedMode === "orbitweaver" || requestedMode === "autoharmonizer" || requestedMode === "sculptor") {
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
          if (this._stalkerTarget) {
              this.rect.attr("stroke", "rgba(255,255,255,0.92)");
              this.rect.attr("stroke-width", 4);
          } else {
              this.rect.attr("stroke-width", 1);
          }
      },

      highlight: function() {
          this.rect.attr("fill", masterColor);
          this.rect.attr("stroke", masterColor);
          if (this._stalkerTarget) {
              this.rect.attr("stroke", "rgba(255,255,255,0.92)");
              this.rect.attr("stroke-width", 4);
          }
      },

      highlight2: function(color) {
          var fill = color || otherColor;
          this.rect.attr("fill", fill);
          this.rect.attr("stroke", fill);
          if (this._stalkerTarget) {
              this.rect.attr("stroke", "rgba(255,255,255,0.92)");
              this.rect.attr("stroke-width", 4);
          }
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
            try {
                var stacked = (typeof window.getStackedLayers === "function") ? window.getStackedLayers() : [];
                var hasStalkerLayer = Array.isArray(stacked) && stacked.indexOf("stalker") !== -1;
                if (mode === "stalker" || hasStalkerLayer) {
                    if (typeof window.setStalkerTargetIndex === "function") {
                        window.setStalkerTargetIndex(that.q.which, { source: "click" });
                    }
                }
            } catch (e) {}
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

// ===== Stalker target selection (shared by base + stack) =====
var stalkerTargetIndex = null;
var stalkerTargetTile = null;
var stalkerChromaVectors = null;
var stalkerChromaSignature = null;

function getStalkerChromaVectors() {
    if (!masterQs || !masterQs.length) return null;
    var trackSig = "";
    try {
        trackSig =
            (curTrack && (curTrack.id || (curTrack.info && curTrack.info.url))) ||
            (masterQs[0] && masterQs[0].track && (masterQs[0].track.id || (masterQs[0].track.info && masterQs[0].track.info.url))) ||
            "";
    } catch (e) {
        trackSig = "";
    }
    var sig = masterQs.length + ":" + trackSig;
    if (stalkerChromaVectors && stalkerChromaSignature === sig) {
        return stalkerChromaVectors;
    }
    stalkerChromaVectors = computeBeatChromaVectors(masterQs);
    stalkerChromaSignature = sig;
    return stalkerChromaVectors;
}

function clearStalkerTargetMarker() {
    if (stalkerTargetTile && stalkerTargetTile.rect) {
        try {
            stalkerTargetTile._stalkerTarget = false;
            stalkerTargetTile.rect.attr("stroke-width", 1);
            stalkerTargetTile.rect.attr("stroke", stalkerTargetTile.normalColor || stalkerTargetTile.rect.attr("fill"));
        } catch (e) {}
    }
    stalkerTargetTile = null;
}

function applyStalkerTargetMarker(idx) {
    if (!masterQs || !masterQs.length) return;
    if (typeof idx !== "number" || !isFinite(idx)) return;
    idx = Math.max(0, Math.min(masterQs.length - 1, Math.round(idx)));
    var q = masterQs[idx];
    var tile = q && q.tile ? q.tile : null;
    if (!tile || !tile.rect) return;

    clearStalkerTargetMarker();
    stalkerTargetTile = tile;
    tile._stalkerTarget = true;
    try {
        tile.rect.attr({
            stroke: "rgba(255,255,255,0.92)",
            "stroke-width": 4
        });
    } catch (e) {}
}

function setStalkerTargetIndexInternal(idx, options) {
    if (!masterQs || !masterQs.length) return null;
    if (typeof idx !== "number" || !isFinite(idx)) return stalkerTargetIndex;
    idx = Math.max(0, Math.min(masterQs.length - 1, Math.round(idx)));
    stalkerTargetIndex = idx;
    applyStalkerTargetMarker(idx);
    // Keep chroma cache in sync with new tracks/tiles.
    if (stalkerChromaVectors && stalkerChromaVectors.length !== masterQs.length) {
        stalkerChromaVectors = null;
        stalkerChromaSignature = null;
    }
    if (options && options.source) {
        try { console.log("[Stalker] Target set to beat", idx, "source:", options.source); } catch (e) {}
    }
    return stalkerTargetIndex;
}

window.getStalkerTargetIndex = function() {
    return stalkerTargetIndex;
};
window.setStalkerTargetIndex = function(idx, options) {
    return setStalkerTargetIndexInternal(idx, options);
};


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
        if (q && q.tile && typeof q.tile.normal === "function") {
            q.tile.normal();
        }
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

    // Prefer the actual loopGraph used by the driver - this ensures all jumpable edges are shown
    if (window._jukeboxLoopGraph && Object.keys(window._jukeboxLoopGraph).length > 0) {
        _.each(window._jukeboxLoopGraph, function(targets, srcKey) {
            var src = parseInt(srcKey, 10);
            if (isNaN(src)) return;
            _.each(targets, function(edge) {
                if (!edge) return;
                var dst = edge.target;
                var sim = (typeof edge.similarity === "number") ? edge.similarity : 0;
                if (typeof dst === "number" && src !== dst) {
                    edges.push({ source: src, target: dst, similarity: sim });
                }
            });
        });
    } else if (canonLoopCandidates && canonLoopCandidates.length) {
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

// Collect canon overlay loops (the q.other relationships) for visualization
function collectCanonOverlayLoops(qlist, limit) {
    var edges = [];
    if (!qlist || !qlist.length) {
        return edges;
    }
    _.each(qlist, function(q, idx) {
        if (q.other && q.other.which !== idx) {
            var targetIdx = q.other.which;
            if (typeof targetIdx === "number" && targetIdx >= 0 && targetIdx < qlist.length) {
                edges.push({
                    source: idx,
                    target: targetIdx,
                    similarity: q.otherGain || 0.5
                });
            }
        }
    });
    // Dedupe and limit
    var seen = {};
    edges = _.filter(edges, function(e) {
        var key = Math.min(e.source, e.target) + "-" + Math.max(e.source, e.target);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
    edges = _.sortBy(edges, function(e) { return -e.similarity; });
    if (limit && edges.length > limit) {
        edges = edges.slice(0, limit);
    }
    return edges;
}

// Draw both eternal jukebox loops AND canon overlay loops for eternal canonizer mode
function drawAllCircularLoops(qlist) {
    if (!qlist || !qlist.length) return;

    // Draw loop edges - limit to top 150 for visual clarity
    // More than 80 to catch more possible jumps, but not all 600+
    var jukeboxEdges = collectVisualizationLoops(150);
    console.log('[drawAllCircularLoops] Drawing', jukeboxEdges.length, 'jukebox edges');
    drawCircularLoopConnections(qlist, jukeboxEdges);

    // Then draw canon overlay loops (cyan) in append mode - only for eternal mode
    if (mode === "eternal") {
        var canonEdges = collectCanonOverlayLoops(qlist, 100);
        console.log('[drawAllCircularLoops] Canon overlay edges:', canonEdges.length);
        if (canonEdges.length > 0) {
            console.log('[drawAllCircularLoops] Sample canon edges:', canonEdges.slice(0, 5).map(function(e) { return e.source + '->' + e.target; }));
            drawCircularLoopConnections(qlist, canonEdges, { isCanonOverlay: true, appendMode: true });
        }
    }
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
    loopMaxSpan = maxSpan; // Store for highlight arc calculations

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

function drawCircularLoopConnections(qlist, edges, options) {
    options = options || {};
    // Don't clear paths if we're appending canon overlay loops
    if (!options.appendMode) {
        clearLoopPaths();
    }
    if (!edges || !edges.length) {
        return;
    }
    var radius = getCircularRadius();
    var centerPoint = getCircularCenter();
    // Default colors: orange for eternal jukebox, blue for regular jukebox
    // Canon overlay loops use green/cyan to distinguish from eternal loops
    var loopColor;
    if (options.isCanonOverlay) {
        loopColor = "#4ECDC4"; // Cyan/teal for canon overlay loops
    } else if (mode === "eternal") {
        loopColor = "#F0A86B"; // Orange for eternal jukebox loops
    } else {
        loopColor = "#6B8AF0"; // Blue for regular jukebox loops
    }

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
    // Highlight the main voice jump
    drawJumpArcHighlight(fromIdx, toIdx, false);

    // Also highlight overlay voice jumps
    if (masterQs && masterQs.length) {
        var qSrc = masterQs[fromIdx];
        var qDst = masterQs[toIdx];

        // Check all overlay voices (q.others array)
        if (qSrc && qSrc.others && Array.isArray(qSrc.others)) {
            for (var i = 0; i < qSrc.others.length; i++) {
                var srcOverlay = qSrc.others[i];
                var dstOverlay = qDst && qDst.others && qDst.others[i];
                if (srcOverlay && dstOverlay && srcOverlay.which !== dstOverlay.which) {
                    drawJumpArcHighlight(srcOverlay.which, dstOverlay.which, true);
                }
            }
        }
        // Fallback to single overlay (q.other)
        else if (qSrc && qSrc.other && qDst && qDst.other) {
            if (qSrc.other.which !== qDst.other.which) {
                drawJumpArcHighlight(qSrc.other.which, qDst.other.which, true);
            }
        }
    }
}

function drawJumpArcHighlight(fromIdx, toIdx, isOverlay) {
    console.log('[drawJumpArcHighlight] Drawing arc from', fromIdx, 'to', toIdx, isOverlay ? '(overlay)' : '(main)');
    if (!paper || !masterQs || !masterQs.length) {
        return;
    }
    if (fromIdx < 0 || fromIdx >= masterQs.length || toIdx < 0 || toIdx >= masterQs.length) {
        return;
    }

    var qSrc = masterQs[fromIdx];
    var qDst = masterQs[toIdx];
    if (!qSrc || !qDst) {
        return;
    }

    // Overlay jumps are always canon loops (pink), main jumps check q.other relationship
    var isCanonLoop = isOverlay;
    if (!isCanonLoop) {
        if (qSrc.other && qSrc.other.which === toIdx) {
            isCanonLoop = true;
        } else if (qDst.other && qDst.other.which === fromIdx) {
            isCanonLoop = true;
        }
    }

    var pathString;

    // Use circular visualizer for jukebox/eternal, linear for canon
    if (isOrbitMode(mode)) {
        // Circular arc
        var radius = getCircularRadius();
        var centerPoint = getCircularCenter();
        var srcPoint = getCircularPoint(qSrc, radius);
        var dstPoint = getCircularPoint(qDst, radius);

        var srcAngle = getCircularAngle(qSrc);
        var dstAngle = getCircularAngle(qDst);
        var angleDiff = dstAngle - srcAngle;
        if (angleDiff > Math.PI) {
            angleDiff -= 2 * Math.PI;
        } else if (angleDiff < -Math.PI) {
            angleDiff += 2 * Math.PI;
        }
        var midAngle = srcAngle + angleDiff / 2;
        var controlRadius = radius * 0.3;
        var controlPoint = {
            x: centerPoint.x + Math.cos(midAngle) * controlRadius,
            y: centerPoint.y + Math.sin(midAngle) * controlRadius
        };

        pathString = [
            "M", srcPoint.x, srcPoint.y,
            "Q", controlPoint.x, controlPoint.y,
            dstPoint.x, dstPoint.y
        ].join(" ");
    } else {
        // Linear arc for canon mode - use exact same formula as drawConnection
        var TW = W - hPad;
        var x1 = hPad + TW * qSrc.start / trackDuration;
        var x2 = hPad + TW * qDst.start / trackDuration;
        var y = H - 4;
        var delta = Math.abs(toIdx - fromIdx);
        var maxDelta = Math.max(1, canonMaxDelta);
        var cy = delta / maxDelta * CH * 2.0;
        if (cy < 20) {
            cy = 30;
        }
        cy = H + cy;
        var cx = (x2 - x1) / 2 + x1;

        pathString = "M" + x1 + " " + y + " S " + cx + " " + cy + " " + x2 + " " + y;
    }

    // Choose colors based on loop type
    var flashColor = isCanonLoop ? "#FF69B4" : "#FFFFFF"; // Pink for canon, white for jukebox
    var accentColor = "#00FFFF";
    try {
        accentColor = (getComputedStyle(document.documentElement).getPropertyValue("--color-cyan") || "").trim() || accentColor;
    } catch (e) {}
    var settleColor = isCanonLoop ? "#FF1493" : accentColor; // Deep pink for canon, accent for jukebox

    // Create bright highlight arc - each jump gets its own path
    var jumpPath = paper.path(pathString);
    jumpPath.attr({
        stroke: flashColor,
        "stroke-width": 6,
        "stroke-opacity": 1,
        "stroke-linecap": "round"
    });
    jumpPath.toFront();

    // Animate: flash then settle to final color
    setTimeout(function() {
        if (jumpPath && jumpPath.animate) {
            jumpPath.animate({
                stroke: settleColor,
                "stroke-width": 4,
                "stroke-opacity": 0.9
            }, 200);
        }
    }, 100);

    // Fade out after a moment
    setTimeout(function() {
        if (jumpPath && jumpPath.animate) {
            jumpPath.animate({
                "stroke-opacity": 0
            }, 500, "ease-out", function() {
                if (jumpPath) {
                    jumpPath.remove();
                }
            });
        }
    }, 800);
}

// Expose to window for external calls
if (typeof window !== 'undefined') {
    window.highlightJumpArc = highlightJumpArc;
    window.drawJumpArcHighlight = drawJumpArcHighlight;
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
    if (!isOrbitMode(mode)) {
        clearOrbitBase();
    }
}

function renderJukeboxBackdrop(targetMode) {
    removeJukeboxBackdrop();
    var currentMode = targetMode || mode;
    if (!isOrbitMode(currentMode)) {
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
    if (isOrbitMode(mode)) {
        return orbitLayout.center;
    }
    var topOffset = Math.min(H * 0.45, 160);
    return {
        x: W / 2,
        y: topOffset
    };
}

function getCircularRadius() {
    if (isOrbitMode(mode)) {
        return orbitLayout.baseRadius;
    }
    var base = Math.min(W, H * 1.2) / 2;
    return Math.max(70, base - 60);
}

function getCircularAngle(q) {
    // Use the actual beat range to fill the full circle
    // This ensures no gap at the end of the timeline
    var firstBeatStart = 0;
    var lastBeatEnd = trackDuration || 1;

    if (masterQs && masterQs.length > 0) {
        firstBeatStart = masterQs[0].start || 0;
        var lastBeat = masterQs[masterQs.length - 1];
        lastBeatEnd = (lastBeat.start || 0) + (lastBeat.duration || 0);
    }

    var total = lastBeatEnd - firstBeatStart;
    if (total <= 0) {
        total = 1;
    }

    var mid = (q.start || 0) + ((q.duration || 0) / 2);
    var ratio = (mid - firstBeatStart) / total;
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
    if (isOrbitMode(mode)) {
        return createCircularTiles(qlist);
    }
    if (mode === "autoharmonizer") {
        return createAutoharmonizerTiles(qlist);
    }
    if (mode === "sculptor") {
        return createSculptorTiles(qlist);
    }
    clearJukeboxBackdrop();
    clearTiles();
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
    clearTiles();
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

    // Draw all circular loops (eternal jukebox + canon overlay for eternal mode)
    drawAllCircularLoops(qlist);
    if (qlist.length) {
        updateCursors(qlist[0]);
    }
    return tiles;
}

function createAutoharmonizerTiles(qlist) {
    // Create dual-loop visualization: two interlocking circles for autoharmonizer mode
    clearTiles();
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
    clearTiles();
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
    canonMaxDelta = Math.max(1, maxDelta); // Store for highlight arc calculations

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
    if (isOrbitMode(mode)) {
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
    // Clear all multi-voice overlay cursors
    for (var i = 0; i < otherCursorCircles.length; i++) {
        if (otherCursorCircles[i]) {
            otherCursorCircles[i].remove();
        }
    }
    otherCursorCircles = [];
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

    // Handle multiple canon overlay voices (for eternal canonizer mode)
    // Use dynamic voice states from jremix if available, otherwise fall back to q.others
    var voiceStates = window.currentVoiceStates || [];
    var overlays = [];

    if (voiceStates.length > 0 && masterQs && masterQs.length > 0) {
        // Use dynamic voice states from jremix
        for (var i = 0; i < voiceStates.length; i++) {
            var vs = voiceStates[i];
            var ov = masterQs[vs.beatIdx];
            if (ov) {
                overlays.push({ beat: ov, index: i, recentJump: vs.beatsSinceJump < 4 });
            }
        }
    } else if (q.others && Array.isArray(q.others) && q.others.length > 0) {
        // Use pre-computed q.others from canon alignment
        for (var i = 0; i < q.others.length; i++) {
            if (q.others[i]) {
                overlays.push({ beat: q.others[i], index: i, recentJump: false });
            }
        }
    } else if (q.other) {
        // Legacy single overlay fallback
        overlays.push({ beat: q.other, index: 0, recentJump: false });
    }

    // Clear old legacy single cursor
    if (otherCursorCircle) {
        otherCursorCircle.remove();
        otherCursorCircle = null;
    }

    // Update or create cursor circles for each overlay voice
    var numOverlays = overlays.length;
    for (var i = 0; i < numOverlays; i++) {
        var ov = overlays[i];
        // Place overlay cursors on the same radius as beat tiles, slightly offset inward per voice
        var overlayRadius = radius - (i * 8);
        var point = getCircularPoint(ov.beat, overlayRadius);
        var color = getOverlayColor(ov.index, numOverlays);
        // Make cursors larger and more visible
        var cursorSize = ov.recentJump ? 10 : 8;

        if (otherCursorCircles[i]) {
            // Update existing cursor
            otherCursorCircles[i].attr({
                cx: point.x,
                cy: point.y,
                r: cursorSize,
                fill: color,
                stroke: "rgba(255, 255, 255, 0.8)"
            });
        } else {
            // Create new cursor with prominent styling
            var cursor = paper.circle(point.x, point.y, cursorSize);
            cursor.attr({
                fill: color,
                stroke: "rgba(255, 255, 255, 0.8)",
                "stroke-width": 2,
                opacity: 1.0
            });
            otherCursorCircles[i] = cursor;
        }
    }

    // Remove excess cursors if we have fewer overlays than before
    while (otherCursorCircles.length > numOverlays) {
        var excess = otherCursorCircles.pop();
        if (excess) {
            excess.remove();
        }
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
    var CANON_PHRASE_DWELL = 16;
    var CANON_MIN_SCORE = 0.65;

    var curQ = 0;
    var running = false;
    var mtime = $("#mtime");
    var lastLoggedIndex = null;
    var lastCanonHop = { source: null, target: null };
    var recentCanonTargets = [];
    var canonJumpHistory = [];
    var canonVisitedBars = {};
    var canonEdgeUsage = {}; // "src:dst" -> usage count
    var CANON_RECENT_LIMIT = 20;
    var CANON_JUMP_HISTORY_LIMIT = 8;
    var beatsSinceLastCanonJump = rlMinDwell;
    var maxBeatReached = 0;
    var CANON_EDGE_USAGE_DECAY_INTERVAL = 16;
    var canonBeatsSinceUsageDecay = 0;
    var CANON_JUMP_TEMPERATURE = 0.25;
    var CANON_STUCK_WINDOW = 64;
    var CANON_STUCK_RATIO = 0.4;
    var recentCanonBeats = [];
    var CANON_EDGE_USAGE_DECAY_FACTOR = 0.96;
    var CANON_EDGE_USAGE_DECAY_THRESHOLD = 0.2;

    function trackCanonBeat(index) {
        if (typeof index !== "number" || index < 0) {
            return;
        }
        recentCanonBeats.push(index);
        if (recentCanonBeats.length > CANON_STUCK_WINDOW) {
            recentCanonBeats.shift();
        }
    }

    function maybeResetCanonIfStuck() {
        if (!recentCanonBeats.length || recentCanonBeats.length < 32) {
            return;
        }
        var windowSize = recentCanonBeats.length;
        var seen = Object.create(null);
        for (var i = 0; i < windowSize; i++) {
            seen[recentCanonBeats[i]] = true;
        }
        var uniqueCount = Object.keys(seen).length;
        var ratio = uniqueCount / windowSize;
        if (ratio >= CANON_STUCK_RATIO) {
            return;
        }
        if (typeof window !== "undefined" && window.__canonLog) {
            try {
                window.__canonLog.push({
                    type: "stuck_loop_reset",
                    windowSize: windowSize,
                    uniqueCount: uniqueCount,
                    ratio: ratio,
                    at: Date.now(),
                    index: curQ
                });
            } catch (e) {}
        }
        canonEdgeUsage = {};
        canonVisitedBars = {};
        recentCanonTargets = [];
        canonJumpHistory = [];
        beatsSinceLastCanonJump = rlMinDwell;
    }

    function decayCanonEdgeUsage() {
        Object.keys(canonEdgeUsage).forEach(function(key) {
            var v = canonEdgeUsage[key] * CANON_EDGE_USAGE_DECAY_FACTOR;
            if (v < CANON_EDGE_USAGE_DECAY_THRESHOLD) {
                delete canonEdgeUsage[key];
            } else {
                canonEdgeUsage[key] = v;
            }
        });
    }

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

    function isSafeCanonLanding(targetIdx, voiceOffsets) {
        if (!masterQs || !masterQs.length) return true;
        var total = masterQs.length;
        var targetBeat = masterQs[targetIdx];
        var beatsPerBar = (targetBeat && targetBeat.bar_length_beats) ? targetBeat.bar_length_beats : 4;
        for (var i = 0; i < voiceOffsets.length; i++) {
            var off = voiceOffsets[i];
            var destIdx = (targetIdx + off * beatsPerBar) % total;
            destIdx = ((destIdx % total) + total) % total;
            var destBeat = masterQs[destIdx];
            if (!destBeat) return false;
            var vol = (typeof destBeat.median_volume === "number") ? destBeat.median_volume :
                      (typeof destBeat.volume === "number") ? destBeat.volume :
                      (typeof destBeat.loudness === "number") ? destBeat.loudness : 0;
            if (vol < -60) {
                return false;
            }
        }
        return true;
    }

    function markCanonVisitedBar(index) {
        var b = masterQs && masterQs[index];
        if (!b || typeof b.bar_index !== "number") return;
        var bar = b.bar_index;
        canonVisitedBars[bar] = (canonVisitedBars[bar] || 0) + 1;
    }

    function decayCanonVisitedBars() {
        Object.keys(canonVisitedBars).forEach(function(k) {
            canonVisitedBars[k] *= 0.92;
            if (canonVisitedBars[k] < 0.1) {
                delete canonVisitedBars[k];
            }
        });
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
        // In base-audio-only mode, never perform canon jumps – just step sequentially
        if (typeof window !== "undefined" && window.harmonizerBaseAudioOnly) {
            var nextIdx = (sourceIndex + 1);
            return { index: nextIdx, reason: "sequential" };
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
        if (beatsSinceLastJump < CANON_PHRASE_DWELL) {
            return { index: clampCanonIndex(sequentialTarget), reason: "sequential" };
        }
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
        var dwellBeats =
            (canonSettings && canonSettings.dwellBeats) || 6;
        var voiceOffsetsForSafe = canonVoiceOffsetsForDriver || [];
        var scoredCandidates = [];
        var bestCandidate = candidates[0];
        var bestScore = null;

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
            // Safe landing check for follower voices
            if (candidate.reason !== "sequential" && voiceOffsetsForSafe.length) {
                if (!isSafeCanonLanding(candidate.target, voiceOffsetsForSafe)) {
                    return;
                }
            }
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

            // Bar visit / coverage shaping for non-sequential jumps
            if (
                candidate.reason !== "sequential" &&
                candidate.target < masterQs.length
            ) {
                var barIndex = masterQs[candidate.target] && masterQs[candidate.target].bar_index;
                if (barIndex !== null && barIndex !== undefined && typeof barIndex === "number") {
                    var visits = canonVisitedBars[barIndex] || 0;
                    var visitPenalty = visits * 0.08;
                    var coverageBonus = Math.max(0, 0.18 - visits * 0.05);
                    score -= visitPenalty;
                    score += coverageBonus;
                }
            }

            // Edge usage penalty to discourage overused jumps
            if (candidate.reason !== "sequential") {
                var edgeKey = sourceIndex + ":" + candidate.target;
                var usageCount = canonEdgeUsage[edgeKey] || 0;
                if (usageCount > 0) {
                    var usagePenalty = Math.min(0.35, Math.log(1 + usageCount) * 0.14);
                    score -= usagePenalty;
                }
            }

            candidate.score = score;
            if (typeof score === "number") {
                scoredCandidates.push(candidate);
                if (bestScore === null || score > bestScore) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }
        });

        if (!scoredCandidates.length) {
            return { index: clampCanonIndex(sequentialTarget), reason: "sequential" };
        }

        // Sort by score so we can build a softmax pool around the strongest options
        scoredCandidates.sort(function(a, b) {
            var sa = (typeof a.score === "number") ? a.score : -Infinity;
            var sb = (typeof b.score === "number") ? b.score : -Infinity;
            return sb - sa;
        });

        var dynamicMin = CANON_MIN_SCORE;
        if (beatsSinceLastJump > rlMinDwell * 2) {
            dynamicMin -= 0.05;
        }
        if (beatsSinceLastJump > rlMinDwell * 4) {
            dynamicMin -= 0.1;
        }
        if (bestScore !== null && bestScore < dynamicMin) {
            dynamicMin = bestScore - 0.05;
        }

        var pool = [];
        var maxPool = 6;
        for (var i = 0; i < scoredCandidates.length && pool.length < maxPool; i++) {
            var c = scoredCandidates[i];
            if (typeof c.score !== "number") {
                continue;
            }
            if (c.score >= dynamicMin) {
                pool.push(c);
            } else {
                break;
            }
        }
        if (!pool.length) {
            pool.push(bestCandidate);
        }

        var chosen = pool[0];
        if (pool.length > 1) {
            var temperature = CANON_JUMP_TEMPERATURE;
            var maxScore = pool[0].score;
            var weights = [];
            var totalWeight = 0;
            for (var wIdx = 0; wIdx < pool.length; wIdx++) {
                var s = pool[wIdx].score;
                var w = Math.exp((s - maxScore) / temperature);
                weights[wIdx] = w;
                totalWeight += w;
            }
            var r = Math.random() * totalWeight;
            for (var cIdx = 0; cIdx < pool.length; cIdx++) {
                r -= weights[cIdx];
                if (r <= 0) {
                    chosen = pool[cIdx];
                    break;
                }
            }
        }

        var targetIdx = clampCanonIndex(chosen.target);
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
        return { index: targetIdx, reason: chosen.reason };
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
        canonEdgeUsage = {};
        canonVisitedBars = {};
        recentCanonBeats = [];
        canonBeatsSinceUsageDecay = 0;
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
            trackCanonBeat(currentIndex);
            canonBeatsSinceUsageDecay += 1;
            if (canonBeatsSinceUsageDecay >= CANON_EDGE_USAGE_DECAY_INTERVAL) {
                canonBeatsSinceUsageDecay = 0;
                decayCanonEdgeUsage();
            }
            maybeResetCanonIfStuck();
            // Track maximum beat reached to prevent tight loops
            if (currentIndex > maxBeatReached) {
                maxBeatReached = currentIndex;
            }
           var nextQ = masterQs[currentIndex];
           nextQ.tile.highlight();

           // Highlight all overlay voices using INDEPENDENT voice positions from jremix
           var voiceStates = window.currentVoiceStates || [];
           if (voiceStates.length > 0) {
                for (var voiceIdx = 0; voiceIdx < voiceStates.length; voiceIdx++) {
                    var vs = voiceStates[voiceIdx];
                    var overlayBeat = masterQs[vs.beatIdx];
                    if (overlayBeat && overlayBeat.tile) {
                        var overlayFill = getOverlayColor(voiceIdx, voiceStates.length);
                        overlayBeat.tile.highlight2(overlayFill);
                    }
                }
            } else if (nextQ.others && Array.isArray(nextQ.others)) {
                // Fallback to pre-computed others if no voice states
                var targetOverlayCount = nextQ._overlayLimit != null ? nextQ._overlayLimit : nextQ.others.length;
                for (var voiceIdx = 0; voiceIdx < targetOverlayCount; voiceIdx++) {
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
            // Use all available overlay voices - no artificial breathing/limiting
            // Per-beat gain from analysis already handles dynamic balance
            if (nextQ.others && Array.isArray(nextQ.others) && nextQ.others.length) {
                nextQ._overlayLimit = nextQ.others.length; // Use all voices
                nextQ._pocketGate = false; // Disable downbeat ducking - sounds worse
            } else {
                nextQ._overlayLimit = null;
                nextQ._pocketGate = null;
            }
            notifyStackOnBeat({ mode: "canon", currentIndex: currentIndex, beat: nextQ });
            var delay = player.playQ(nextQ);
            renderOverlayChips(nextQ);
            var choice = chooseCanonNextIndex(currentIndex);
            var stackedIndex = applyStackedNextIndex({
                mode: "canon",
                currentIndex: currentIndex,
                proposedIndex: choice.index,
                beat: nextQ,
                proposedReason: choice.reason
            });
            if (stackedIndex !== choice.index) {
                choice.reason = "stack";
                choice.index = stackedIndex;
            }
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
                    var edgeKey = currentIndex + ":" + choice.index;
                    canonEdgeUsage[edgeKey] = (canonEdgeUsage[edgeKey] || 0) + 1;
                    markCanonJumpTarget(choice.index);
                    markCanonVisitedBar(choice.index);
                    decayCanonVisitedBars();
                    // Highlight main voice jump
                    drawJumpArcHighlight(currentIndex, choice.index, false);
                    // Highlight overlay voice jumps
                    var srcBeat = masterQs[currentIndex];
                    var dstBeat = masterQs[choice.index];
                    if (srcBeat && dstBeat) {
                        if (srcBeat.others && Array.isArray(srcBeat.others)) {
                            for (var ov = 0; ov < srcBeat.others.length; ov++) {
                                var srcOverlay = srcBeat.others[ov];
                                var dstOverlay = dstBeat.others && dstBeat.others[ov];
                                if (srcOverlay && dstOverlay && srcOverlay.which !== dstOverlay.which) {
                                    drawJumpArcHighlight(srcOverlay.which, dstOverlay.which, true);
                                }
                            }
                        } else if (srcBeat.other && dstBeat.other && srcBeat.other.which !== dstBeat.other.which) {
                            drawJumpArcHighlight(srcBeat.other.which, dstBeat.other.which, true);
                        }
                    }
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
    var edgeUsage = {}; // per-session edge usage counts: "src:dst" -> count
    var plannedJumps = []; // short-term plan of upcoming jumps
    var ROUTE_LENGTH = Math.max(4, Math.min(32, Math.round(coerceNumber(options.routeLength) || 8)));
    var rawJumpTemp = coerceNumber(options.jumpTemperature);
    if (rawJumpTemp === null) {
        rawJumpTemp = 0.25;
    }
    var JUMP_TEMPERATURE = Math.max(0.05, Math.min(0.8, rawJumpTemp));
    var JUMP_USAGE_DECAY_INTERVAL = 16; // beats between decay passes
    var JUMP_USAGE_DECAY_FACTOR = 0.96;
    var JUMP_USAGE_DECAY_THRESHOLD = 0.2;
    var JUMP_RESET_INTERVAL = 10; // number of jumps before a soft reset
    var beatsSinceUsageDecay = 0;
    var jumpsSinceReset = 0;
    var JBX_STUCK_WINDOW = 64;
    var JBX_STUCK_RATIO = 0.4;
    var recentJukeboxBeats = [];
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

    function trackJukeboxBeat(index) {
        if (typeof index !== "number" || index < 0) {
            return;
        }
        recentJukeboxBeats.push(index);
        if (recentJukeboxBeats.length > JBX_STUCK_WINDOW) {
            recentJukeboxBeats.shift();
        }
    }

    function maybeResetJukeboxIfStuck() {
        if (!recentJukeboxBeats.length || recentJukeboxBeats.length < 32) {
            return;
        }
        var windowSize = recentJukeboxBeats.length;
        var seen = Object.create(null);
        for (var i = 0; i < windowSize; i++) {
            seen[recentJukeboxBeats[i]] = true;
        }
        var uniqueCount = Object.keys(seen).length;
        var ratio = uniqueCount / windowSize;
        if (ratio >= JBX_STUCK_RATIO) {
            return;
        }
        if (typeof window !== "undefined" && window.__eternalLog) {
            try {
                window.__eternalLog.push({
                    type: "stuck_loop_reset",
                    mode: modeName,
                    windowSize: windowSize,
                    uniqueCount: uniqueCount,
                    ratio: ratio,
                    at: Date.now(),
                    index: currentIndex
                });
            } catch (e) {}
        }
        edgeUsage = {};
        loopHistory = [];
        plannedJumps = [];
        jumpsSinceReset = 0;
        visitedBars = {};
    }

    function takePlannedJumpIfValid() {
        if (!plannedJumps.length) {
            return null;
        }
        var plan = plannedJumps[0];
        if (!plan) {
            plannedJumps.shift();
            return null;
        }
        // If the plan has drifted out of sync with the current index, drop the whole route.
        if (plan.source !== currentIndex) {
            plannedJumps = [];
            return null;
        }
        if (
            typeof plan.target !== "number" ||
            plan.target < 0 ||
            plan.target >= masterQs.length ||
            plan.target === currentIndex
        ) {
            plannedJumps.shift();
            return null;
        }
        plannedJumps.shift();
        return plan;
    }

    function planRouteFrom(startIdx) {
        plannedJumps = [];
        var idx = startIdx;
        var steps = 0;
        var safety = ROUTE_LENGTH * 3;
        while (steps < ROUTE_LENGTH && safety-- > 0) {
            var jump = selectJumpCandidate(idx);
            if (!jump) {
                break;
            }
            if (
                typeof jump.target !== "number" ||
                jump.target < 0 ||
                jump.target >= masterQs.length ||
                jump.target === idx
            ) {
                break;
            }
            plannedJumps.push(jump);
            idx = jump.target;
            steps++;
        }
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

    function updateRouteLength(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = Math.max(4, Math.min(32, Math.round(num)));
        if (num === ROUTE_LENGTH) {
            return false;
        }
        ROUTE_LENGTH = num;
        plannedJumps = [];
        return true;
    }

    function updateJumpTemperature(value, opts) {
        var num = coerceNumber(value);
        if (num === null) {
            return false;
        }
        num = Math.max(0.05, Math.min(0.8, num));
        if (num === JUMP_TEMPERATURE) {
            return false;
        }
        JUMP_TEMPERATURE = num;
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
        edgeUsage = {};
        plannedJumps = [];
        recentJukeboxBeats = [];
        jumpsSinceReset = 0;
        visitedBars = {};
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

    function markBarVisit(beatOrIndex) {
        var beat = beatOrIndex;
        if (typeof beatOrIndex === "number") {
            beat = masterQs && masterQs[beatOrIndex];
        }
        if (!beat || typeof beat.bar_index !== "number") return;
        var idx = beat.bar_index;
        visitedBars[idx] = (visitedBars[idx] || 0) + 1;
    }

    function decayVisitedBars() {
        Object.keys(visitedBars).forEach(function(k) {
            var v = visitedBars[k] * 0.96;
            if (v < 0.1) {
                delete visitedBars[k];
            } else {
                visitedBars[k] = v;
            }
        });
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

        // Add canon overlay edges (q.other relationships) so driver can take those jumps
        // These are the cyan paths drawn on the visualization
        if (mode === "eternal" && masterQs && masterQs.length) {
            var canonOverlayCount = 0;
            _.each(masterQs, function(q, idx) {
                if (q.other && q.other.which !== idx) {
                    var targetIdx = q.other.which;
                    if (typeof targetIdx === "number" && targetIdx >= 0 && targetIdx < masterQs.length) {
                        var canonEdge = {
                            source_start: idx,
                            target_start: targetIdx,
                            similarity: q.otherGain || 0.7,
                            span: targetIdx - idx
                        };
                        loops.push(canonEdge);
                        registerEdge(canonEdge);
                        canonOverlayCount++;
                    }
                }
            });
            console.log('[rebuildLoopChoices] Added', canonOverlayCount, 'canon overlay edges to loopGraph');
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

        // Export loopGraph edges for visualization
        // This ensures all possible jump targets have visible arcs
        window._jukeboxLoopGraph = loopGraph;

        // Refresh visualization to show updated loop connections
        if (masterQs && masterQs.length && (mode === "jukebox" || mode === "eternal")) {
            drawAllCircularLoops(masterQs);
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
        // In base-audio-only mode, never perform jukebox/eternal jumps – always go sequential
        if (typeof window !== "undefined" && window.harmonizerBaseAudioOnly) {
            return {
                target: src + 1,
                reason: "sequential",
                similarity: 1.0,
                score: 1.0
            };
        }
        if (!masterQs || !masterQs.length) {
            return null;
        }

        // Collect candidates from current beat and nearby beats
        var searchRadius = Math.min(8, Math.floor(minLoopBeats / 2));
        var candidates = [];
        var loopGraphSize = Object.keys(loopGraph).length;
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
            console.log('[selectJumpCandidate] No candidates found for src:', src, 'loopGraph has', loopGraphSize, 'sources, searchRadius:', searchRadius);
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
            var visitPenalty = Math.min(0.45, barVisits * 0.08);
            var coverageBonus = Math.max(0, 0.18 - Math.min(3, barVisits) * 0.05);

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
            if (direction === "backward" && modeState === "explore") {
                directionBias -= 0.06;
            }
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

            var score = baseScore + chromaBonus + sectionBonus + directionBias + energyBonus + endZoneBonus - visitPenalty + coverageBonus;

            // Usage penalty: discourage reusing the same edge too often this session
            var edgeKey = src + ":" + targetIdx;
            var usageCount = edgeUsage[edgeKey] || 0;
            if (usageCount > 0) {
                var usagePenalty = Math.min(0.45, Math.log(1 + usageCount) * 0.18);
                score -= usagePenalty;
            }
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

        // Soft selection among the strongest candidates instead of always picking the single best
        var pool = [];
        var maxPool = 6;
        for (var i = 0; i < scored.length && pool.length < maxPool; i++) {
            if (scored[i].score >= dynamicMin) {
                pool.push(scored[i]);
            } else {
                break;
            }
        }
        if (!pool.length) {
            pool.push(best);
        }

        var chosen;
        if (pool.length === 1) {
            chosen = pool[0];
        } else {
            // Softmax-style sampling over scores for controlled randomness
            var temperature = JUMP_TEMPERATURE;
            var maxScore = pool[0].score;
            var weights = [];
            var totalWeight = 0;
            for (var wIdx = 0; wIdx < pool.length; wIdx++) {
                var s = pool[wIdx].score;
                var w = Math.exp((s - maxScore) / temperature);
                weights[wIdx] = w;
                totalWeight += w;
            }
            var r = Math.random() * totalWeight;
            for (var cIdx = 0; cIdx < pool.length; cIdx++) {
                r -= weights[cIdx];
                if (r <= 0) {
                    chosen = pool[cIdx];
                    break;
                }
            }
            if (!chosen) {
                chosen = pool[0];
            }
        }
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
        var prevIndex = currentIndex;
        var proposed = currentIndex + 1;
        var prevBeat = masterQs && masterQs[prevIndex];
        var stacked = applyStackedNextIndex({
            mode: modeName,
            currentIndex: prevIndex,
            proposedIndex: proposed,
            beat: prevBeat,
            proposedReason: "sequential"
        });
        var didStackJump = stacked !== proposed;
        currentIndex = stacked;
        if (didStackJump) {
            markBarVisit(stacked);
            registerJumpBubble(stacked);
            highlightJumpArc(prevIndex, stacked);
            var sourceBeat = masterQs[prevIndex];
            var targetBeat = masterQs[stacked];
            beatsSinceJump = 0;
            modeState = stacked < prevIndex ? "looping" : "explore";
            emitJumpLog({
                reason: "stack",
                source: prevIndex,
                target: stacked,
                similarity: null,
                span: null,
                sameSection: null,
                beatsUntilJump: beatsUntilJump,
                bubbleRadius: getCurrentJumpBubbleRadius(),
                source_time: sourceBeat ? sourceBeat.start : null,
                target_time: targetBeat ? targetBeat.start : null,
                quality_score: null,
            });
            scheduleNextJump(false);
            return;
        }
        if (currentIndex >= masterQs.length) {
            var reentry = fallbackReentryTarget();
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, reentry));
            markBarVisit(currentIndex);
            modeState = "looping";
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
        // Periodically decay edge usage so heavily penalized edges can recover over long sessions
        beatsSinceUsageDecay += 1;
        if (beatsSinceUsageDecay >= JUMP_USAGE_DECAY_INTERVAL) {
            beatsSinceUsageDecay = 0;
            Object.keys(edgeUsage).forEach(function(key) {
                var v = edgeUsage[key] * JUMP_USAGE_DECAY_FACTOR;
                if (v < JUMP_USAGE_DECAY_THRESHOLD) {
                    delete edgeUsage[key];
                } else {
                    edgeUsage[key] = v;
                }
            });
            decayVisitedBars();
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
                var sourceBeat = masterQs[retreatSourceIndex];
                var proposedTarget = retreatPoint.target;
                var stackedTarget = applyStackedNextIndex({
                    mode: modeName,
                    currentIndex: retreatSourceIndex,
                    proposedIndex: proposedTarget,
                    beat: sourceBeat,
                    proposedReason: "retreat"
                });
                loopHistory.push({ source: retreatSourceIndex, target: stackedTarget });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = stackedTarget;
                markBarVisit(stackedTarget);
                registerJumpBubble(stackedTarget);
                highlightJumpArc(retreatSourceIndex, stackedTarget);
                var targetBeat = masterQs[stackedTarget];
                beatsSinceJump = 0;
                modeState = "looping";
                emitJumpLog({
                    reason: "retreat",
                    source: retreatSourceIndex,
                    target: stackedTarget,
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
            var jump = takePlannedJumpIfValid();
            if (!jump && !plannedJumps.length) {
                planRouteFrom(currentIndex);
                jump = takePlannedJumpIfValid();
            }
            if (!jump) {
                jump = selectJumpCandidate(currentIndex);
            }
            if (jump) {
                console.log('[advanceIndex] JUMP!', currentIndex, '->', jump.target);
                var jumpSourceIndex = currentIndex;
                var sourceBeat = masterQs[jumpSourceIndex];
                var proposedTarget = jump.target;
                var stackedTarget = applyStackedNextIndex({
                    mode: modeName,
                    currentIndex: jumpSourceIndex,
                    proposedIndex: proposedTarget,
                    beat: sourceBeat,
                    proposedReason: "scheduled"
                });
                loopHistory.push({ source: jumpSourceIndex, target: stackedTarget });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                // Track edge usage for variety (penalize overused edges)
                var edgeKey = jumpSourceIndex + ":" + stackedTarget;
                edgeUsage[edgeKey] = (edgeUsage[edgeKey] || 0) + 1;
                jumpsSinceReset += 1;
                if (jumpsSinceReset >= JUMP_RESET_INTERVAL) {
                    edgeUsage = {};
                    loopHistory.length = 0;
                    jumpsSinceReset = 0;
                }

                currentIndex = stackedTarget;
                markBarVisit(stackedTarget);
                registerJumpBubble(stackedTarget);
                highlightJumpArc(jumpSourceIndex, stackedTarget);
                var targetBeat = masterQs[stackedTarget];
                beatsSinceJump = 0;
                modeState = jump.direction === "backward" ? "looping" : "explore";
                emitJumpLog({
                    reason: "scheduled",
                    source: jumpSourceIndex,
                    target: stackedTarget,
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
        incrementBeatCount();
        trackJukeboxBeat(currentIndex);
        maybeResetJukeboxIfStuck();
        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
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
            recentJukeboxBeats = [];
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
            // Don't rebuild loop choices on resume - just continue playing
            // rebuildLoopChoices() is only needed on initial start
            if (!loopChoices || !loopChoices.length) {
                rebuildLoopChoices();
            }
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

        setRouteLength: function(value) {
            updateRouteLength(value);
        },

        setJumpTemperature: function(value) {
            updateJumpTemperature(value);
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
            if (Object.prototype.hasOwnProperty.call(newSettings, "routeLength")) {
                updateRouteLength(newSettings.routeLength, { skipReschedule: true });
            }
            if (Object.prototype.hasOwnProperty.call(newSettings, "jumpTemperature")) {
                updateJumpTemperature(newSettings.jumpTemperature, { skipReschedule: true });
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

// ===== Dopamine Miner (Infinite Climax) =====
function sanitizeDopamineMinerSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.dopamineMiner || {};
    var out = cloneSettings(defaults);

    var pf = coerceNumber(input.peakFraction);
    if (pf === null) pf = defaults.peakFraction;
    out.peakFraction = clampNumber(pf, 0.02, 0.6);

    var minCluster = coerceNumber(input.minClusterBeats);
    if (minCluster === null) minCluster = defaults.minClusterBeats;
    out.minClusterBeats = clampNumber(Math.round(minCluster), 1, 256);

    var gap = coerceNumber(input.clusterGapBeats);
    if (gap === null) gap = defaults.clusterGapBeats;
    out.clusterGapBeats = clampNumber(Math.round(gap), 0, 16);

    var largest = coerceNumber(input.largestClusterOnly);
    if (largest === null) largest = defaults.largestClusterOnly;
    out.largestClusterOnly = largest >= 1 ? 1 : 0;

    var dwell = coerceNumber(input.minDwellBeats);
    if (dwell === null) dwell = defaults.minDwellBeats;
    out.minDwellBeats = clampNumber(Math.round(dwell), 1, 64);

    var maxSeq = coerceNumber(input.maxSequentialBeats);
    if (maxSeq === null) maxSeq = defaults.maxSequentialBeats;
    out.maxSequentialBeats = clampNumber(Math.round(maxSeq), 2, 256);

    var minSpan = coerceNumber(input.minJumpSpanBeats);
    if (minSpan === null) minSpan = defaults.minJumpSpanBeats;
    out.minJumpSpanBeats = clampNumber(Math.round(minSpan), 1, 128);

    var minSim = coerceNumber(input.minJumpSimilarity);
    if (minSim === null) minSim = defaults.minJumpSimilarity;
    out.minJumpSimilarity = clampNumber(minSim, 0.05, 0.99);

    var cross = coerceNumber(input.crossClusterBias);
    if (cross === null) cross = defaults.crossClusterBias;
    out.crossClusterBias = clamp01(cross);

    var temp = coerceNumber(input.jumpTemperature);
    if (temp === null) temp = defaults.jumpTemperature;
    out.jumpTemperature = clampNumber(temp, 0.05, 0.8);

    var escape = coerceNumber(input.escapeProb);
    if (escape === null) escape = defaults.escapeProb;
    out.escapeProb = clampNumber(escape, 0, 0.4);

    var burnoutWindow = coerceNumber(input.burnoutWindowBeats);
    if (burnoutWindow === null) burnoutWindow = defaults.burnoutWindowBeats;
    out.burnoutWindowBeats = clampNumber(Math.round(burnoutWindow), 8, 256);

    var burnoutRatio = coerceNumber(input.burnoutUniqueRatio);
    if (burnoutRatio === null) burnoutRatio = defaults.burnoutUniqueRatio;
    out.burnoutUniqueRatio = clampNumber(burnoutRatio, 0.05, 0.9);

    var burnoutCooldown = coerceNumber(input.burnoutCooldownBeats);
    if (burnoutCooldown === null) burnoutCooldown = defaults.burnoutCooldownBeats;
    out.burnoutCooldownBeats = clampNumber(Math.round(burnoutCooldown), 0, 256);

    return out;
}

function buildPeakClusters(beats, settings) {
    settings = settings || ADVANCED_DEFAULTS.dopamineMiner;
    if (!beats || !beats.length) {
        return {
            energies: [],
            threshold: 0,
            peakFlags: [],
            peakSet: {},
            clusters: [],
            clusterByBeat: []
        };
    }

    var n = beats.length;
    var energies = new Array(n);
    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var v = 0;
        if (b && typeof b.median_volume === "number") v = b.median_volume;
        else if (b && typeof b.volume === "number") v = b.volume;
        else if (b && typeof b.loudness === "number") v = b.loudness;
        if (!isFinite(v)) v = 0;
        energies[i] = v;
    }

    var sorted = energies.slice(0).sort(function(a, b) { return a - b; });
    var keepFrac = clampNumber(settings.peakFraction, 0.02, 0.6);
    var cutoffIdx = Math.floor((1 - keepFrac) * (sorted.length - 1));
    cutoffIdx = Math.max(0, Math.min(sorted.length - 1, cutoffIdx));
    var threshold = sorted[cutoffIdx];

    var peakFlags = new Array(n);
    for (var j = 0; j < n; j++) {
        peakFlags[j] = energies[j] >= threshold;
    }

    var clusters = [];
    var clusterByBeat = new Array(n);
    for (var c = 0; c < n; c++) clusterByBeat[c] = null;

    var maxGap = Math.max(0, Math.round(settings.clusterGapBeats || 0));
    var minLen = Math.max(1, Math.round(settings.minClusterBeats || 1));

    var inCluster = false;
    var start = 0;
    var lastPeak = -1;
    var highCount = 0;
    var sumEnergy = 0;

    function closeCluster(endIdx) {
        if (!inCluster) return;
        var length = endIdx - start + 1;
        if (length >= minLen && highCount > 0) {
            var beatsList = [];
            for (var k = start; k <= endIdx; k++) beatsList.push(k);
            var id = clusters.length;
            clusters.push({
                id: id,
                start: start,
                end: endIdx,
                beats: beatsList,
                peakCount: highCount,
                avgEnergy: sumEnergy / length
            });
            for (var kk = start; kk <= endIdx; kk++) {
                clusterByBeat[kk] = id;
            }
        }
        inCluster = false;
        highCount = 0;
        sumEnergy = 0;
        lastPeak = -1;
    }

    for (var idx = 0; idx < n; idx++) {
        var isPeak = peakFlags[idx];
        if (!inCluster) {
            if (isPeak) {
                inCluster = true;
                start = idx;
                lastPeak = idx;
                highCount = 1;
                sumEnergy = energies[idx];
            }
            continue;
        }

        sumEnergy += energies[idx];
        if (isPeak) {
            highCount += 1;
            lastPeak = idx;
            continue;
        }

        if (maxGap === 0) {
            closeCluster(idx - 1);
            continue;
        }
        if (idx - lastPeak > maxGap) {
            closeCluster(idx - 1);
        }
    }
    closeCluster(n - 1);

    if (clusters.length && settings.largestClusterOnly >= 1) {
        clusters.sort(function(a, b) {
            if (b.beats.length !== a.beats.length) return b.beats.length - a.beats.length;
            return b.avgEnergy - a.avgEnergy;
        });
        var keep = clusters[0];
        clusters = [keep];
        for (var cb = 0; cb < n; cb++) clusterByBeat[cb] = null;
        for (var kk2 = keep.start; kk2 <= keep.end; kk2++) clusterByBeat[kk2] = keep.id;
    }

    var peakSet = {};
    clusters.forEach(function(cl) {
        for (var bIdx = cl.start; bIdx <= cl.end; bIdx++) {
            peakSet[bIdx] = true;
        }
    });

    return {
        energies: energies,
        threshold: threshold,
        peakFlags: peakFlags,
        peakSet: peakSet,
        clusters: clusters,
        clusterByBeat: clusterByBeat
    };
}

function createDopamineMinerDriver(player, options) {
    options = options || {};
    var modeName = "dopamine";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var beatsSinceJump = 0;
    var sequentialCount = 0;
    var recentTargets = [];
    var RECENT_LIMIT = 18;
    var visitHistory = [];
    var pathHistory = [];
    var PATH_LIMIT = 96;
    var clusterHistory = [];
    var CLUSTER_HISTORY_LIMIT = 12;
    var edgeWindow = [];
    var edgeCounts = Object.create(null);
    var EDGE_WINDOW_LIMIT = 96;
    var fallbackRadius = 6;
    var burnoutCooldownLeft = 0;

    var settings = sanitizeDopamineMinerSettings(options, ADVANCED_DEFAULTS.dopamineMiner);
    var peakData = null;
    var clusterPeakBeatById = Object.create(null);
    var stuckLocalNow = false;
    var stepCounter = 0;
    var tabooUntil = Object.create(null);
    var tabooEdgeUntil = Object.create(null);

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function addTaboo(idx, ttlBeats) {
        if (typeof idx !== "number" || !isFinite(idx)) return;
        var ttl = Math.max(1, Math.round(ttlBeats || 0));
        var until = stepCounter + ttl;
        var prev = tabooUntil[idx];
        tabooUntil[idx] = (prev !== undefined && prev > until) ? prev : until;
    }

    function isTaboo(idx) {
        if (typeof idx !== "number" || !isFinite(idx)) return false;
        var until = tabooUntil[idx];
        return until !== undefined && stepCounter < until;
    }

    function edgeKey(src, dst) {
        return src + ">" + dst;
    }

    function addEdgeTaboo(src, dst, ttlBeats) {
        if (typeof src !== "number" || typeof dst !== "number") return;
        if (!isFinite(src) || !isFinite(dst)) return;
        var ttl = Math.max(1, Math.round(ttlBeats || 0));
        var until = stepCounter + ttl;
        var key = edgeKey(src, dst);
        var prev = tabooEdgeUntil[key];
        tabooEdgeUntil[key] = (prev !== undefined && prev > until) ? prev : until;
    }

    function isEdgeTaboo(src, dst) {
        var until = tabooEdgeUntil[edgeKey(src, dst)];
        return until !== undefined && stepCounter < until;
    }

    function rebuildClusterMeta() {
        clusterPeakBeatById = Object.create(null);
        if (!peakData || !peakData.clusters || !peakData.clusters.length) return;
        peakData.clusters.forEach(function(cl) {
            var best = cl.start;
            var bestEnergy = -Infinity;
            if (cl.beats && cl.beats.length && peakData.energies && peakData.energies.length) {
                for (var i = 0; i < cl.beats.length; i++) {
                    var b = cl.beats[i];
                    var e = peakData.energies[b];
                    if (typeof e !== "number" || !isFinite(e)) e = 0;
                    if (e > bestEnergy) {
                        bestEnergy = e;
                        best = b;
                    }
                }
            }
            clusterPeakBeatById[cl.id] = best;
        });
    }

    function splitPeakClustersBySection(data, minClusterBeats) {
        if (!data || !data.clusters || !data.clusters.length) return data;
        var outClusters = [];
        var clusterByBeat = new Array(masterQs.length);
        for (var i = 0; i < clusterByBeat.length; i++) clusterByBeat[i] = null;
        var nextId = 0;

        function closeCluster(startIdx, endIdx, beatsList) {
            if (!beatsList || beatsList.length < Math.max(1, minClusterBeats)) return;
            var sum = 0;
            for (var k = 0; k < beatsList.length; k++) {
                var e = (data.energies && typeof data.energies[beatsList[k]] === "number") ? data.energies[beatsList[k]] : 0;
                sum += (isFinite(e) ? e : 0);
            }
            var avg = beatsList.length ? (sum / beatsList.length) : 0;
            var id = nextId++;
            outClusters.push({ id: id, start: startIdx, end: endIdx, beats: beatsList.slice(), avgEnergy: avg });
            for (var b = 0; b < beatsList.length; b++) {
                clusterByBeat[beatsList[b]] = id;
            }
        }

        data.clusters.forEach(function(cl) {
            var start = null;
            var lastSection = null;
            var beatsList = [];
            for (var idx = cl.start; idx <= cl.end; idx++) {
                if (!data.peakSet[idx]) {
                    if (start !== null) {
                        closeCluster(start, beatsList[beatsList.length - 1], beatsList);
                        start = null;
                        lastSection = null;
                        beatsList = [];
                    }
                    continue;
                }
                var sec = masterQs[idx] ? masterQs[idx].section : null;
                if (start === null) {
                    start = idx;
                    lastSection = sec;
                    beatsList = [idx];
                    continue;
                }
                if (sec !== lastSection) {
                    closeCluster(start, beatsList[beatsList.length - 1], beatsList);
                    start = idx;
                    lastSection = sec;
                    beatsList = [idx];
                    continue;
                }
                beatsList.push(idx);
            }
            if (start !== null) {
                closeCluster(start, beatsList[beatsList.length - 1], beatsList);
            }
        });

        if (!outClusters.length) return data;
        return Object.assign({}, data, { clusters: outClusters, clusterByBeat: clusterByBeat });
    }

    function splitLongClustersByWindow(data, minClusterBeats) {
        if (!data || !data.clusters || data.clusters.length !== 1) return data;
        var cl = data.clusters[0];
        if (!cl || !cl.beats || cl.beats.length < Math.max(1, minClusterBeats * 3)) return data;

        var beats = cl.beats.slice().sort(function(a, b) { return a - b; });
        var targetSegments = 4;
        var windowSize = Math.max(minClusterBeats, Math.round(beats.length / targetSegments));

        var outClusters = [];
        var clusterByBeat = new Array(masterQs.length);
        for (var i = 0; i < clusterByBeat.length; i++) clusterByBeat[i] = null;
        var nextId = 0;

        for (var startIdx = 0; startIdx < beats.length; startIdx += windowSize) {
            var slice = beats.slice(startIdx, Math.min(beats.length, startIdx + windowSize));
            if (slice.length < minClusterBeats) continue;
            var startBeat = slice[0];
            var endBeat = slice[slice.length - 1];
            var sum = 0;
            for (var k = 0; k < slice.length; k++) {
                var e = (data.energies && typeof data.energies[slice[k]] === "number") ? data.energies[slice[k]] : 0;
                sum += (isFinite(e) ? e : 0);
            }
            var avg = slice.length ? (sum / slice.length) : 0;
            var id = nextId++;
            outClusters.push({ id: id, start: startBeat, end: endBeat, beats: slice, avgEnergy: avg });
            for (var b = 0; b < slice.length; b++) clusterByBeat[slice[b]] = id;
        }

        if (outClusters.length < 2) return data;
        return Object.assign({}, data, { clusters: outClusters, clusterByBeat: clusterByBeat });
    }

    function splitClustersToMinCount(data, minClusterBeats, targetMinClusters) {
        if (!data || !data.clusters || !data.clusters.length) return data;
        targetMinClusters = Math.max(1, Math.round(targetMinClusters || 0));
        minClusterBeats = Math.max(1, Math.round(minClusterBeats || 0));
        if (data.clusters.length >= targetMinClusters) return data;

        var clusters = data.clusters.map(function(c) {
            var beats = (c && c.beats) ? c.beats.slice().sort(function(a, b) { return a - b; }) : [];
            return Object.assign({}, c, { beats: beats });
        });

        function avgEnergy(beatsList) {
            var sum = 0;
            for (var i = 0; i < beatsList.length; i++) {
                var e = (data.energies && typeof data.energies[beatsList[i]] === "number") ? data.energies[beatsList[i]] : 0;
                sum += (isFinite(e) ? e : 0);
            }
            return beatsList.length ? (sum / beatsList.length) : 0;
        }

        while (clusters.length < targetMinClusters) {
            clusters.sort(function(a, b) { return (b.beats.length || 0) - (a.beats.length || 0); });
            var biggest = clusters[0];
            if (!biggest || !biggest.beats || biggest.beats.length < minClusterBeats * 2) {
                break;
            }
            clusters.shift();

            var beats = biggest.beats;
            var mid = Math.floor(beats.length / 2);
            var left = beats.slice(0, mid);
            var right = beats.slice(mid);
            if (left.length < minClusterBeats || right.length < minClusterBeats) {
                clusters.unshift(biggest);
                break;
            }

            clusters.push({
                id: null,
                start: left[0],
                end: left[left.length - 1],
                beats: left,
                avgEnergy: avgEnergy(left)
            });
            clusters.push({
                id: null,
                start: right[0],
                end: right[right.length - 1],
                beats: right,
                avgEnergy: avgEnergy(right)
            });
        }

        if (clusters.length <= data.clusters.length) return data;

        var clusterByBeat = new Array(masterQs.length);
        for (var j = 0; j < clusterByBeat.length; j++) clusterByBeat[j] = null;

        for (var k = 0; k < clusters.length; k++) {
            clusters[k].id = k;
            for (var b = 0; b < clusters[k].beats.length; b++) {
                clusterByBeat[clusters[k].beats[b]] = k;
            }
        }

        return Object.assign({}, data, { clusters: clusters, clusterByBeat: clusterByBeat });
    }

    function buildPeakDataWithOverrides(override) {
        override = override || {};
        var s = Object.assign({}, settings, override);
        var data = buildPeakClusters(masterQs, s);
        if (!data) return data;
        var minClusterBeats = Math.max(4, Math.min(24, Math.round(s.minClusterBeats || 16)));
        data = splitPeakClustersBySection(data, minClusterBeats);
        data = splitLongClustersByWindow(data, minClusterBeats);
        data = splitClustersToMinCount(data, minClusterBeats, 4);
        return data;
    }

    function ensureExplorablePeakData() {
        ensurePeakData();
        if (!peakData || !peakData.clusters || !peakData.clusters.length) return;
        if (peakData.clusters.length >= 4) return;

        // Try progressively expanding the peak set (more inclusive threshold) and splitting by section.
        var basePf = Math.max(0.02, Math.min(0.6, settings.peakFraction || 0.1));
        var attempts = [
            { peakFraction: Math.min(0.6, basePf * 1.8), clusterGapBeats: 0, minClusterBeats: Math.max(8, Math.round((settings.minClusterBeats || 16) / 2)) },
            { peakFraction: Math.min(0.6, basePf * 2.6), clusterGapBeats: 0, minClusterBeats: Math.max(6, Math.round((settings.minClusterBeats || 16) / 3)) },
            { peakFraction: Math.min(0.6, basePf * 3.6), clusterGapBeats: 0, minClusterBeats: 4 }
        ];

        for (var i = 0; i < attempts.length; i++) {
            var candidate = buildPeakDataWithOverrides(attempts[i]);
            if (candidate && candidate.clusters && candidate.clusters.length >= 4) {
                peakData = candidate;
                rebuildClusterMeta();
                return;
            }
        }
    }

    function ensurePeakData() {
        if (!peakData) {
            peakData = buildPeakDataWithOverrides(null);
            rebuildClusterMeta();
        }
    }

    function rememberTarget(idx) {
        recentTargets.push(idx);
        if (recentTargets.length > RECENT_LIMIT) recentTargets.shift();
    }

    function isRecentlyVisited(idx) {
        for (var i = recentTargets.length - 1; i >= 0; i--) {
            if (recentTargets[i] === idx) return true;
        }
        return false;
    }

    function countRecentVisits(idx) {
        var count = 0;
        for (var i = visitHistory.length - 1; i >= 0; i--) {
            if (visitHistory[i] === idx) {
                count += 1;
            }
        }
        return count;
    }

    function recordEdge(src, dst) {
        if (typeof src !== "number" || typeof dst !== "number") return;
        var key = src + ">" + dst;
        edgeWindow.push(key);
        edgeCounts[key] = (edgeCounts[key] || 0) + 1;
        if (edgeWindow.length > EDGE_WINDOW_LIMIT) {
            var old = edgeWindow.shift();
            if (edgeCounts[old] !== undefined) {
                edgeCounts[old] -= 1;
                if (edgeCounts[old] <= 0) delete edgeCounts[old];
            }
        }
    }

    function getEdgeRepeatCount(src, dst) {
        return edgeCounts[(src + ">" + dst)] || 0;
    }

    function collectLoopEdges(useFallback) {
        var out = [];
        if (serverLoopCandidateMap && serverLoopCandidateMap[currentIndex]) {
            var direct = serverLoopCandidateMap[currentIndex] || [];
            for (var i = 0; i < direct.length; i++) {
                if (!direct[i]) continue;
                out.push(Object.assign({ sourceOffset: 0 }, direct[i]));
            }
        }
        if (!useFallback) return out;
        for (var r = 1; r <= fallbackRadius; r++) {
            var left = currentIndex - r;
            var right = currentIndex + r;
            if (left >= 0 && serverLoopCandidateMap[left] && serverLoopCandidateMap[left].length) {
                var leftEdges = serverLoopCandidateMap[left];
                for (var li = 0; li < leftEdges.length; li++) {
                    if (!leftEdges[li]) continue;
                    out.push(Object.assign({ sourceOffset: r }, leftEdges[li]));
                }
            }
            if (right < masterQs.length && serverLoopCandidateMap[right] && serverLoopCandidateMap[right].length) {
                var rightEdges = serverLoopCandidateMap[right];
                for (var ri = 0; ri < rightEdges.length; ri++) {
                    if (!rightEdges[ri]) continue;
                    out.push(Object.assign({ sourceOffset: r }, rightEdges[ri]));
                }
            }
        }
        return out;
    }

    function pushCapped(arr, value, limit) {
        arr.push(value);
        if (arr.length > limit) arr.shift();
    }

    function noteVisit(idx) {
        stepCounter += 1;
        visitHistory.push(idx);
        var maxWindow = Math.max(8, Math.round(settings.burnoutWindowBeats || 0));
        if (visitHistory.length > maxWindow) {
            visitHistory.shift();
        }
        pushCapped(pathHistory, idx, PATH_LIMIT);
        if (peakData && peakData.clusterByBeat && idx >= 0 && idx < peakData.clusterByBeat.length) {
            var cid = peakData.clusterByBeat[idx];
            if (cid !== null && cid !== undefined) {
                pushCapped(clusterHistory, cid, CLUSTER_HISTORY_LIMIT);
            }
        }
        if (burnoutCooldownLeft > 0) {
            burnoutCooldownLeft -= 1;
        }
    }

    function recentUniqueRatio(windowSize) {
        windowSize = Math.max(1, Math.round(windowSize || 0));
        if (!pathHistory.length) return 1;
        var k = Math.min(windowSize, pathHistory.length);
        var uniq = Object.create(null);
        for (var i = pathHistory.length - k; i < pathHistory.length; i++) {
            uniq[pathHistory[i]] = true;
        }
        return Object.keys(uniq).length / Math.max(1, k);
    }

    function detectAnchorBeats(windowSize, minFrac) {
        windowSize = Math.max(8, Math.round(windowSize || 0));
        minFrac = Math.max(0.05, Math.min(0.95, (typeof minFrac === "number" ? minFrac : 0.35)));
        if (!pathHistory.length) return null;
        var k = Math.min(windowSize, pathHistory.length);
        var counts = Object.create(null);
        for (var i = pathHistory.length - k; i < pathHistory.length; i++) {
            var idx = pathHistory[i];
            counts[idx] = (counts[idx] || 0) + 1;
        }
        var bestA = null, bestAC = 0;
        var bestB = null, bestBC = 0;
        for (var key in counts) {
            if (!Object.prototype.hasOwnProperty.call(counts, key)) continue;
            var c = counts[key];
            var n = parseInt(key, 10);
            if (!isFinite(n)) continue;
            if (c > bestAC) {
                bestB = bestA; bestBC = bestAC;
                bestA = n; bestAC = c;
            } else if (c > bestBC) {
                bestB = n; bestBC = c;
            }
        }
        if (bestA === null) return null;
        var fracA = bestAC / Math.max(1, k);
        if (fracA < minFrac) return null;
        var out = { a: bestA, aCount: bestAC, fracA: fracA };
        var fracB = bestBC / Math.max(1, k);
        if (bestB !== null && bestB !== bestA && fracB >= minFrac) {
            out.b = bestB;
            out.bCount = bestBC;
            out.fracB = fracB;
        }
        return out;
    }

    function recentIndexSpan(windowSize) {
        windowSize = Math.max(1, Math.round(windowSize || 0));
        if (!pathHistory.length) return Infinity;
        var k = Math.min(windowSize, pathHistory.length);
        var minIdx = Infinity;
        var maxIdx = -Infinity;
        for (var i = pathHistory.length - k; i < pathHistory.length; i++) {
            var v = pathHistory[i];
            if (typeof v !== "number" || !isFinite(v)) continue;
            if (v < minIdx) minIdx = v;
            if (v > maxIdx) maxIdx = v;
        }
        if (!isFinite(minIdx) || !isFinite(maxIdx)) return Infinity;
        return maxIdx - minIdx;
    }

    function detectCyclePeriod(maxPeriod) {
        maxPeriod = Math.max(1, Math.round(maxPeriod || 10));
        var n = pathHistory.length;
        for (var p = 1; p <= maxPeriod; p++) {
            if (n < 3 * p) continue;
            var ok = true;
            for (var i = 1; i <= p; i++) {
                var a0 = pathHistory[n - i];
                var a1 = pathHistory[n - i - p];
                var a2 = pathHistory[n - i - 2 * p];
                if (a0 !== a1 || a1 !== a2) {
                    ok = false;
                    break;
                }
            }
            if (ok) return p;
        }
        return null;
    }

    function isTinyLooping() {
        // Fast exits to avoid false positives early.
        if (pathHistory.length < 18) return false;
        var p = detectCyclePeriod(10);
        if (p !== null && p <= 10) return true;
        // Diversity collapse in a small window (even before burnoutWindow fills).
        return recentUniqueRatio(24) < 0.55;
    }

    function isStuckLocal() {
        if (pathHistory.length < 18) return false;
        if (isTinyLooping()) return true;
        // Range-collapse: bouncing within a narrow index band is a "tiny loop"
        // even if the exact pattern isn't periodic.
        var span = recentIndexSpan(32);
        var uniq32 = recentUniqueRatio(32);
        if (isFinite(span) && span <= 32 && uniq32 < 0.78) return true;
        // Secondary: low diversity in a slightly larger window.
        return recentUniqueRatio(32) < 0.6;
    }

    function detectPingPong(windowSize) {
        windowSize = Math.max(6, Math.round(windowSize || 0));
        if (pathHistory.length < windowSize) return null;
        var a = pathHistory[pathHistory.length - 1];
        var b = pathHistory[pathHistory.length - 2];
        if (a === b) return null;
        for (var i = 0; i < windowSize; i++) {
            var expected = (i % 2 === 0) ? a : b;
            if (pathHistory[pathHistory.length - 1 - i] !== expected) return null;
        }
        return { a: a, b: b };
    }

    function recentClusterSet(maxItems) {
        maxItems = Math.max(1, Math.round(maxItems || 6));
        var set = Object.create(null);
        var seen = 0;
        for (var i = clusterHistory.length - 1; i >= 0 && seen < maxItems; i--) {
            var cid = clusterHistory[i];
            set[cid] = true;
            seen += 1;
        }
        return set;
    }

    function isBurnedOut() {
        var windowSize = Math.max(8, Math.round(settings.burnoutWindowBeats || 0));
        if (visitHistory.length < windowSize) {
            return false;
        }
        var uniq = Object.create(null);
        for (var i = 0; i < visitHistory.length; i++) {
            uniq[visitHistory[i]] = true;
        }
        var uniqueCount = Object.keys(uniq).length;
        var ratio = uniqueCount / Math.max(1, visitHistory.length);
        return ratio < (settings.burnoutUniqueRatio || 0.35);
    }

    function chooseBurnoutTarget(currentClusterId) {
        var forced = chooseDifferentClusterTarget(currentClusterId);
        if (forced !== null && forced !== currentIndex) return forced;
        var cl = null;
        if (peakData && currentClusterId !== null && peakData.clusters && peakData.clusters.length) {
            cl = peakData.clusters.filter(function(c) { return c.id === currentClusterId; })[0] || null;
        }
        if (cl && cl.beats && cl.beats.length) {
            var best = null;
            var bestDist = -1;
            cl.beats.forEach(function(bIdx) {
                if (bIdx === currentIndex) return;
                if (isRecentlyVisited(bIdx)) return;
                var d = Math.abs(bIdx - currentIndex);
                if (d > bestDist) {
                    bestDist = d;
                    best = bIdx;
                }
            });
            if (best !== null) {
                return best;
            }
            return cl.beats[Math.floor(Math.random() * cl.beats.length)];
        }
        return findNearestPeak(currentIndex);
    }

    function chooseDifferentClusterTarget(excludeClusterId) {
        if (!peakData || !peakData.clusters.length) return null;
        var pool = peakData.clusters.filter(function(c) { return c.id !== excludeClusterId; });
        if (!pool.length) return null;
        var total = 0;
        var weights = pool.map(function(c) {
            var w = Math.max(0.01, c.avgEnergy || 0.01) * Math.sqrt(c.beats.length);
            total += w;
            return w;
        });
        var r = Math.random() * total;
        for (var i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) return clusterPeakBeatById[pool[i].id] !== undefined ? clusterPeakBeatById[pool[i].id] : pool[i].start;
        }
        return clusterPeakBeatById[pool[0].id] !== undefined ? clusterPeakBeatById[pool[0].id] : pool[0].start;
    }

    function chooseDifferentClusterTargetAvoidingRecent(excludeClusterId) {
        if (!peakData || !peakData.clusters.length) return null;
        var recent = recentClusterSet(6);
        var pool = peakData.clusters.filter(function(c) {
            return c.id !== excludeClusterId && !recent[c.id];
        });
        if (!pool.length) {
            pool = peakData.clusters.filter(function(c) { return c.id !== excludeClusterId; });
        }
        if (!pool.length) return null;
        var total = 0;
        var weights = pool.map(function(c) {
            var w = Math.max(0.01, c.avgEnergy || 0.01) * Math.sqrt(c.beats.length);
            total += w;
            return w;
        });
        var r = Math.random() * total;
        for (var i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) return clusterPeakBeatById[pool[i].id] !== undefined ? clusterPeakBeatById[pool[i].id] : pool[i].start;
        }
        return clusterPeakBeatById[pool[0].id] !== undefined ? clusterPeakBeatById[pool[0].id] : pool[0].start;
    }

    function chooseFarBeatInCluster(currentClusterId) {
        var cl = null;
        if (peakData && currentClusterId !== null && peakData.clusters && peakData.clusters.length) {
            cl = peakData.clusters.filter(function(c) { return c.id === currentClusterId; })[0] || null;
        }
        if (!cl || !cl.beats || !cl.beats.length) return null;

        var recent = Object.create(null);
        var k = Math.min(24, pathHistory.length);
        for (var i = pathHistory.length - k; i < pathHistory.length; i++) {
            recent[pathHistory[i]] = true;
        }

        var bestForward = null;
        var bestForwardDist = -1;
        var bestAny = null;
        var bestAnyDist = -1;
        for (var j = 0; j < cl.beats.length; j++) {
            var bIdx = cl.beats[j];
            if (bIdx === currentIndex) continue;
            if (isTaboo(bIdx)) continue;
            var d = Math.abs(bIdx - currentIndex);
            if (!recent[bIdx] && bIdx > currentIndex && d > bestForwardDist) {
                bestForwardDist = d;
                bestForward = bIdx;
            }
            if (!recent[bIdx] && d > bestAnyDist) {
                bestAnyDist = d;
                bestAny = bIdx;
            }
        }
        if (bestForward !== null) return bestForward;
        if (bestAny !== null) return bestAny;

        // If everything is recent, still jump as far as possible.
        for (var t = 0; t < cl.beats.length; t++) {
            var cand = cl.beats[t];
            if (cand === currentIndex) continue;
            if (isTaboo(cand)) continue;
            var dist = Math.abs(cand - currentIndex);
            if (dist > bestAnyDist) {
                bestAnyDist = dist;
                bestAny = cand;
            }
        }
        return bestAny;
    }

    function chooseBeatInClusterAvoidingTaboo(cl, fromIdx) {
        if (!cl || !cl.beats || !cl.beats.length) return null;
        var peakBeat = (clusterPeakBeatById && clusterPeakBeatById[cl.id] !== undefined) ? clusterPeakBeatById[cl.id] : cl.start;
        if (!isTaboo(peakBeat)) return peakBeat;
        var best = null;
        var bestDist = -1;
        for (var i = 0; i < cl.beats.length; i++) {
            var bIdx = cl.beats[i];
            if (bIdx === fromIdx) continue;
            if (isTaboo(bIdx)) continue;
            var d = Math.abs(bIdx - fromIdx);
            if (d > bestDist) {
                bestDist = d;
                best = bIdx;
            }
        }
        return best;
    }

    function chooseTeleportTarget(currentClusterId) {
        if (!peakData || !peakData.clusters || !peakData.clusters.length) return null;
        if (peakData.clusters.length > 1) {
            var pool = peakData.clusters.filter(function(c) { return c.id !== currentClusterId; });
            if (!pool.length) pool = peakData.clusters.slice(0);
            var recent = recentClusterSet(6);
            pool.sort(function(a, b) {
                var ar = recent[a.id] ? 1 : 0;
                var br = recent[b.id] ? 1 : 0;
                if (ar !== br) return ar - br;
                return (b.avgEnergy || 0) - (a.avgEnergy || 0);
            });
            for (var i = 0; i < pool.length; i++) {
                var pick = chooseBeatInClusterAvoidingTaboo(pool[i], currentIndex);
                if (pick !== null && pick !== currentIndex) return pick;
            }
        }
        return chooseFarBeatInCluster(currentClusterId);
    }

    function chooseClusterTarget(excludeClusterId) {
        if (!peakData || !peakData.clusters.length) return null;
        var pool = peakData.clusters.filter(function(c) { return c.id !== excludeClusterId; });
        if (!pool.length) pool = peakData.clusters.slice(0);
        var total = 0;
        var weights = pool.map(function(c) {
            var w = Math.max(0.01, c.avgEnergy || 0.01) * Math.sqrt(c.beats.length);
            total += w;
            return w;
        });
        var r = Math.random() * total;
        for (var i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) return clusterPeakBeatById[pool[i].id] !== undefined ? clusterPeakBeatById[pool[i].id] : pool[i].start;
        }
        return clusterPeakBeatById[pool[0].id] !== undefined ? clusterPeakBeatById[pool[0].id] : pool[0].start;
    }

    function chooseGlobalExploreTarget() {
        if (!masterQs || !masterQs.length) return null;
        var n = masterQs.length;
        var recentSet = Object.create(null);
        var recentSections = Object.create(null);
        var recentWindow = Math.min(72, pathHistory.length);
        for (var i = pathHistory.length - recentWindow; i < pathHistory.length; i++) {
            var v = pathHistory[i];
            if (typeof v !== "number" || !isFinite(v)) continue;
            recentSet[v] = true;
            var sec = harmonizerBeatSectionIndex(v);
            if (sec !== null) recentSections[sec] = true;
        }

        var energies = new Array(n);
        var minE = Infinity;
        var maxE = -Infinity;
        for (var e = 0; e < n; e++) {
            var ev = beatEnergy(masterQs[e]);
            energies[e] = ev;
            if (ev < minE) minE = ev;
            if (ev > maxE) maxE = ev;
        }
        var range = Math.max(1e-6, maxE - minE);
        var minSpan = Math.max(24, Math.round(settings.minJumpSpanBeats * 4));
        var candidates = [];
        for (var b = 0; b < n; b++) {
            if (recentSet[b]) continue;
            if (isTaboo(b)) continue;
            var dist = Math.abs(b - currentIndex);
            if (dist < minSpan) continue;
            var dist01 = dist / Math.max(1, n - 1);
            var e01 = clamp01((energies[b] - minE) / range);
            var secB = harmonizerBeatSectionIndex(b);
            var sectionBonus = (secB !== null && !recentSections[secB]) ? 0.12 : 0;
            var score = 0.55 * dist01 + 0.25 * e01 + sectionBonus;
            candidates.push({ idx: b, score: score });
        }
        if (!candidates.length) return null;
        candidates.sort(function(a, b) { return b.score - a.score; });
        var pool = candidates.slice(0, Math.min(18, candidates.length));
        return pool[Math.floor(Math.random() * pool.length)].idx;
    }

    function findNearestPeak(fromIdx) {
        if (!peakData || !peakData.clusters.length) return 0;
        var best = null;
        var bestDist = Infinity;
        peakData.clusters.forEach(function(c) {
            var d = 0;
            if (fromIdx < c.start) d = c.start - fromIdx;
            else if (fromIdx > c.end) d = fromIdx - c.end;
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        });
        return best ? best.start : peakData.clusters[0].start;
    }

    function scoreCandidate(edge, currentClusterId) {
        var sourceOffset = edge.sourceOffset || 0;
        var absSpan =
            sourceOffset
                ? Math.abs((edge.target || 0) - currentIndex)
                : (typeof edge.abs_span === "number" && isFinite(edge.abs_span))
                    ? edge.abs_span
                    : Math.abs((edge.target || 0) - currentIndex);
        var spanNorm = absSpan / Math.max(1, masterQs.length / 2);
        var spanBonus = Math.pow(Math.min(1, spanNorm), 0.65) * 0.25;

        var sim = edge.similarity || 0;
        var simScore = Math.pow(sim, 1.6);

        var targetEnergy = 0;
        if (peakData && peakData.energies && peakData.energies[edge.target] !== undefined) {
            targetEnergy = peakData.energies[edge.target];
        }
        // When we're stuck locally, stop over-rewarding the absolute peak beat;
        // otherwise the miner keeps snapping back to the same hotspot.
        var energyScale = stuckLocalNow ? 0.12 : 0.3;
        var energyBonus = clamp01(targetEnergy) * energyScale;
        var anchorPenalty = 0;
        if (stuckLocalNow && clusterPeakBeatById && currentClusterId !== null) {
            var peakBeat = clusterPeakBeatById[currentClusterId];
            if (peakBeat !== undefined && edge.target === peakBeat) {
                anchorPenalty = 0.35;
            }
        }

        var targetCluster = peakData ? peakData.clusterByBeat[edge.target] : null;
        var crossBonus =
            targetCluster !== null &&
            currentClusterId !== null &&
            targetCluster !== currentClusterId
                ? settings.crossClusterBias * 0.35
                : 0;

        var recentPenalty = isRecentlyVisited(edge.target) ? 0.35 : 0;
        var repeatCount = countRecentVisits(edge.target);
        var burnoutPenalty = repeatCount > 0 ? Math.min(0.6, repeatCount * 0.1) : 0;
        var edgeRepeat = getEdgeRepeatCount(currentIndex, edge.target);
        var edgeRepeatPenalty = edgeRepeat > 0 ? Math.min(0.9, edgeRepeat * 0.18) : 0;
        var backwardPenalty = (edge.target < currentIndex && absSpan < Math.max(16, settings.minJumpSpanBeats * 2)) ? 0.18 : 0;

        var jitter = (Math.random() - 0.5) * settings.jumpTemperature * 0.25;
        var stuckRepeatBoost = stuckLocalNow ? Math.min(1.4, repeatCount * 0.16) : 0;
        var sourcePenalty = sourceOffset ? Math.min(0.18, sourceOffset * 0.02) : 0;
        var nonPeakPenalty = edge.nonPeak ? 0.08 : 0;
        return simScore + spanBonus + energyBonus + crossBonus + jitter - recentPenalty - burnoutPenalty - edgeRepeatPenalty - backwardPenalty - anchorPenalty - stuckRepeatBoost - sourcePenalty - nonPeakPenalty;
    }

    function selectJumpCandidate(currentClusterId, opts) {
        opts = opts || {};
        var edges = collectLoopEdges(false);
        var minSpan = Math.max(settings.minJumpSpanBeats, Math.round(opts.minSpan || 0));
        var preferCross = !!opts.preferCrossCluster;
        var preferForward = !!opts.preferForward;
        var allowNonPeak = !!opts.allowNonPeak;
        var minSim = (typeof opts.minSimilarity === "number")
            ? opts.minSimilarity
            : settings.minJumpSimilarity;
        function filterEdges(list) {
            return list.filter(function(edge) {
                if (!edge || typeof edge.target !== "number") return false;
                if (edge.target === currentIndex) return false;
                if (isTaboo(edge.target)) return false;
                if (isEdgeTaboo(currentIndex, edge.target)) return false;
                if (!peakData.peakSet[edge.target]) {
                    if (!allowNonPeak) return false;
                    edge.nonPeak = true;
                }
                if ((edge.similarity || 0) < minSim) return false;
                var absSpan =
                    edge.sourceOffset
                        ? Math.abs(edge.target - currentIndex)
                        : (typeof edge.abs_span === "number" && isFinite(edge.abs_span))
                            ? edge.abs_span
                            : Math.abs(edge.target - currentIndex);
                if (absSpan < minSpan) return false;
                if (preferCross && peakData.clusterByBeat && peakData.clusterByBeat[edge.target] === currentClusterId) return false;
                if (preferForward && edge.target < currentIndex && absSpan < Math.max(16, minSpan * 2)) return false;
                return true;
            });
        }

        var filtered = filterEdges(edges);
        if (!filtered.length) {
            filtered = filterEdges(collectLoopEdges(true));
        }
        if (!filtered.length) return null;

        var scored = filtered.map(function(edge) {
            return { edge: edge, score: scoreCandidate(edge, currentClusterId) };
        }).sort(function(a, b) { return b.score - a.score; });

        var bestScore = scored[0].score;
        var pool = scored.filter(function(s) { return s.score >= bestScore - 0.15; });
        var temperature = Math.max(0.05, settings.jumpTemperature);
        var maxScore = pool[0].score;
        var weights = [];
        var total = 0;
        for (var i = 0; i < pool.length; i++) {
            var w = Math.exp((pool[i].score - maxScore) / temperature);
            weights.push(w);
            total += w;
        }
        var r = Math.random() * total;
        for (var j = 0; j < pool.length; j++) {
            r -= weights[j];
            if (r <= 0) return pool[j].edge.target;
        }
        return pool[0].edge.target;
    }

    function computeNextIndex() {
        ensurePeakData();
        if (!peakData || !peakData.clusters.length) {
            return Math.min(masterQs.length - 1, currentIndex + 1);
        }

        var currentClusterId = peakData.clusterByBeat[currentIndex];
        if (currentClusterId === null || !peakData.peakSet[currentIndex]) {
            return findNearestPeak(currentIndex);
        }

        var currentCluster = peakData.clusters.filter(function(c) { return c.id === currentClusterId; })[0];
        var nextLinear = currentIndex + 1;
        var wouldExitPeak = !peakData.peakSet[nextLinear] || (currentCluster && nextLinear > currentCluster.end);
        var hitSeqCap = sequentialCount >= settings.maxSequentialBeats;
        var tinyLoop = isTinyLooping();
        var stuckLocal = isStuckLocal();
        stuckLocalNow = stuckLocal || tinyLoop;
        var pingpong = detectPingPong(8);
        var allowNonPeak = tinyLoop || stuckLocal || pingpong;
        var minSimOverride = allowNonPeak ? Math.max(0.5, settings.minJumpSimilarity - 0.12) : null;

        if (burnoutCooldownLeft <= 0 && stuckLocalNow) {
            var anchors = detectAnchorBeats(32, 0.32);
            if (anchors) {
                // If one/two beats are acting like "gravity wells", taboo them so the miner is forced
                // to route through other peaks instead of repeatedly returning to the same line(s).
                addTaboo(anchors.a, 26);
                if (anchors.b !== undefined) addTaboo(anchors.b, 26);
                ensureExplorablePeakData();
                var teleA = chooseTeleportTarget(currentClusterId);
                if (teleA !== null && teleA !== currentIndex && !isTaboo(teleA)) {
                    burnoutCooldownLeft = Math.max(settings.burnoutCooldownBeats || 0, 18);
                    return teleA;
                }
            }
        }

        if (burnoutCooldownLeft <= 0 && pingpong) {
            // Hard break for A<->B ping-pong loops.
            addTaboo(pingpong.a, 28);
            addTaboo(pingpong.b, 28);
            addEdgeTaboo(pingpong.a, pingpong.b, 64);
            addEdgeTaboo(pingpong.b, pingpong.a, 64);
            ensureExplorablePeakData();
            var tele = chooseTeleportTarget(currentClusterId);
            if (tele !== null && tele !== currentIndex) {
                burnoutCooldownLeft = Math.max(settings.burnoutCooldownBeats || 0, 20);
                return tele;
            }
        }

        // Break short deterministic cycles aggressively before they become "burnout".
        if (burnoutCooldownLeft <= 0 && (tinyLoop || stuckLocal)) {
            // If peak clustering collapsed into one giant cluster, rebuild a more explorable set.
            ensureExplorablePeakData();
            var loopEscape = null;
            if (peakData.clusters.length > 1) {
                loopEscape = chooseDifferentClusterTargetAvoidingRecent(currentClusterId);
            } else {
                loopEscape = chooseFarBeatInCluster(currentClusterId);
            }
            if (loopEscape !== null && loopEscape !== currentIndex) {
                burnoutCooldownLeft = Math.max(settings.burnoutCooldownBeats || 0, Math.round((settings.burnoutWindowBeats || 48) / 2));
                return loopEscape;
            }
            var globalEscape = chooseGlobalExploreTarget();
            if (globalEscape !== null && globalEscape !== currentIndex) {
                burnoutCooldownLeft = Math.max(settings.burnoutCooldownBeats || 0, Math.round((settings.burnoutWindowBeats || 48) / 2));
                return globalEscape;
            }
        }

        if (burnoutCooldownLeft <= 0 && isBurnedOut()) {
            var burnoutTarget = chooseBurnoutTarget(currentClusterId);
            if (burnoutTarget !== null && burnoutTarget !== currentIndex) {
                burnoutCooldownLeft = settings.burnoutCooldownBeats || 0;
                return burnoutTarget;
            }
        }

        if (Math.random() < settings.escapeProb) {
            var wild = chooseClusterTarget(currentClusterId);
            if (wild !== null) return wild;
        }

        if (beatsSinceJump < settings.minDwellBeats && sequentialCount < settings.maxSequentialBeats && !wouldExitPeak) {
            return nextLinear;
        }

        // If we just hit the sequential cap, strongly prefer escaping to a different peak cluster
        // instead of jumping backward within the same cluster (which tends to form short loops).
        if (hitSeqCap) {
            var forcedCross = chooseDifferentClusterTarget(currentClusterId);
            if (forcedCross !== null && forcedCross !== currentIndex) {
                return forcedCross;
            }
            if (peakData.clusters.length <= 1) {
                var intra = chooseBurnoutTarget(currentClusterId);
                if (intra !== null && intra !== currentIndex) return intra;
            }
        }

        var jumpTarget = selectJumpCandidate(currentClusterId, {
            preferCrossCluster: (peakData.clusters.length > 1) && (hitSeqCap || tinyLoop),
            minSpan: (tinyLoop || stuckLocal) ? Math.max(16, Math.round(settings.minJumpSpanBeats * 2)) : 0,
            preferForward: (tinyLoop || stuckLocal),
            allowNonPeak: allowNonPeak,
            minSimilarity: minSimOverride
        });
        if ((tinyLoop || stuckLocal || pingpong) && (jumpTarget === null || isRecentlyVisited(jumpTarget))) {
            var escapeTarget = chooseGlobalExploreTarget();
            if (escapeTarget !== null && escapeTarget !== currentIndex) {
                return escapeTarget;
            }
        }
        if (jumpTarget !== null) {
            if (hitSeqCap && peakData.clusters.length > 1) {
                var jtCluster = peakData.clusterByBeat[jumpTarget];
                if (jtCluster === currentClusterId) {
                    var forced = chooseDifferentClusterTarget(currentClusterId);
                    if (forced !== null && forced !== currentIndex) return forced;
                }
            }
            return jumpTarget;
        }

        if (!wouldExitPeak) {
            return nextLinear;
        }
        var fallback = chooseClusterTarget(currentClusterId);
        if (fallback === null) return findNearestPeak(currentIndex);
        if (fallback === currentIndex) {
            var far = chooseFarBeatInCluster(currentClusterId);
            if (far !== null && far !== currentIndex) return far;
        }
        return fallback;
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);
        ensurePeakData();
        noteVisit(currentIndex);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, driver: this });
        var delay = player.playQ(q);

        var proposed = computeNextIndex();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "dopamine"
        });

        // Guard against pathological "no-op" moves (can happen if a stack layer snaps back).
        if (nextIdx === currentIndex) {
            var cId = peakData && peakData.clusterByBeat ? peakData.clusterByBeat[currentIndex] : null;
            if (cId !== null && cId !== undefined) {
                var forcedMove = chooseFarBeatInCluster(cId);
                if (forcedMove !== null && forcedMove !== currentIndex) {
                    nextIdx = forcedMove;
                }
            }
        }
        if (isTaboo(nextIdx)) {
            var cId2 = peakData && peakData.clusterByBeat ? peakData.clusterByBeat[currentIndex] : null;
            if (cId2 !== null && cId2 !== undefined) {
                var forced = chooseTeleportTarget(cId2);
                if (forced !== null && forced !== currentIndex) {
                    nextIdx = forced;
                }
            }
        }

        recordEdge(currentIndex, nextIdx);
        if (nextIdx === currentIndex + 1) {
            sequentialCount += 1;
        } else {
            beatsSinceJump = 0;
            sequentialCount = 0;
            rememberTarget(nextIdx);
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }
        beatsSinceJump += 1;
        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeDopamineMinerSettings(customSettings, ADVANCED_DEFAULTS.dopamineMiner);
        peakData = buildPeakDataWithOverrides(null);
        rebuildClusterMeta();
        recentTargets = [];
        visitHistory = [];
        pathHistory = [];
        clusterHistory = [];
        edgeWindow = [];
        edgeCounts = Object.create(null);
        stepCounter = 0;
        tabooUntil = Object.create(null);
        tabooEdgeUntil = Object.create(null);
        burnoutCooldownLeft = 0;
        sequentialCount = 0;
        beatsSinceJump = 0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getDopamineMinerSettings());
            currentIndex = peakData && peakData.clusters.length ? peakData.clusters[0].start : 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            if (!peakData) {
                rebuildFromSettings(getDopamineMinerSettings());
            }
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {
            // no-op for now; stacked layers update separately
        },

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

function getDopamineMinerSettings() {
    var useAdvanced = isAdvancedGroupEnabled("dopamineMiner");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("dopamineMiner") : cloneAdvancedDefaults("dopamineMiner");
    return sanitizeDopamineMinerSettings(settings, ADVANCED_DEFAULTS.dopamineMiner);
}

// Register Dopamine Miner as a stackable layer (snap-to-peak filter).
registerStackLayer({
    id: "dopamine",
    label: "Dopamine Miner",
    description: "Constrain playback to top-energy peak clusters.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getDopamineMinerSettings();
        var data = buildPeakClusters(ctx.beats, settings);
        if (!data || !data.clusters.length) return null;

        function snapToNearestPeak(idx, fallbackIdx) {
            if (data.peakSet[idx]) return idx;
            var best = null;
            var bestDist = Infinity;
            data.clusters.forEach(function(c) {
                var d = 0;
                if (idx < c.start) d = c.start - idx;
                else if (idx > c.end) d = idx - c.end;
                if (d < bestDist) {
                    bestDist = d;
                    best = c;
                }
            });
            if (best) return best.start;
            return typeof fallbackIdx === "number" ? fallbackIdx : idx;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.proposedIndex !== "number") return null;
                var proposed = meta.proposedIndex;
                if (data.peakSet[proposed]) return null;
                var snapped = snapToNearestPeak(proposed, meta.currentIndex);
                return { index: snapped };
            }
        };
    }
});

// ===== Harmonic Trap (Modal Locking) =====
function sanitizeHarmonicTrapSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.harmonicTrap || {};
    var out = cloneSettings(defaults);

    var autoTarget = coerceNumber(input.autoTarget);
    if (autoTarget === null) autoTarget = defaults.autoTarget;
    out.autoTarget = autoTarget >= 1 ? 1 : 0;

    var pc = coerceNumber(input.targetPitchClass);
    if (pc === null) pc = defaults.targetPitchClass;
    out.targetPitchClass = clampNumber(Math.round(pc), 0, 11);

    var thr = coerceNumber(input.similarityThreshold);
    if (thr === null) thr = defaults.similarityThreshold;
    out.similarityThreshold = clampNumber(thr, 0.05, 0.99);

    var grace = coerceNumber(input.graceBeats);
    if (grace === null) grace = defaults.graceBeats;
    out.graceBeats = clampNumber(Math.round(grace), 0, 16);

    var cooldown = coerceNumber(input.cooldownBeats);
    if (cooldown === null) cooldown = defaults.cooldownBeats;
    out.cooldownBeats = clampNumber(Math.round(cooldown), 0, 256);

    var topK = coerceNumber(input.searchTopK);
    if (topK === null) topK = defaults.searchTopK;
    out.searchTopK = clampNumber(Math.round(topK), 1, 32);

    var minSpan = coerceNumber(input.minJumpSpanBeats);
    if (minSpan === null) minSpan = defaults.minJumpSpanBeats;
    out.minJumpSpanBeats = clampNumber(Math.round(minSpan), 1, 128);

    var escape = coerceNumber(input.escapeProb);
    if (escape === null) escape = defaults.escapeProb;
    out.escapeProb = clampNumber(escape, 0, 0.4);

    return out;
}

function normalizeChromaVector(vec) {
    if (!vec || vec.length !== 12) return new Array(12).fill(0);
    var sumSq = 0;
    for (var i = 0; i < 12; i++) {
        var v = vec[i] || 0;
        sumSq += v * v;
    }
    if (sumSq <= 0) return new Array(12).fill(0);
    var inv = 1 / Math.sqrt(sumSq);
    var out = new Array(12);
    for (var j = 0; j < 12; j++) {
        out[j] = (vec[j] || 0) * inv;
    }
    return out;
}

function chromaDotSimilarity(a, b) {
    if (!a || !b) return 0;
    var dot = 0;
    for (var i = 0; i < 12; i++) {
        dot += (a[i] || 0) * (b[i] || 0);
    }
    return dot;
}

function dominantPitchClass(vec) {
    var best = 0;
    var bestVal = -Infinity;
    for (var i = 0; i < 12; i++) {
        var v = vec[i] || 0;
        if (v > bestVal) {
            bestVal = v;
            best = i;
        }
    }
    return best;
}

function computeBeatTimbreVectors(beats) {
    if (!beats || !beats.length) return [];
    var timbres = new Array(beats.length);
    for (var i = 0; i < beats.length; i++) {
        var beat = beats[i];
        var segs =
            (beat && beat.overlappingSegments && beat.overlappingSegments.length)
                ? beat.overlappingSegments
                : (beat && beat.oseg ? [beat.oseg] : []);
        var acc = new Array(12).fill(0);
        var count = 0;
        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || !seg.timbre || seg.timbre.length < 12) continue;
            for (var t = 0; t < 12; t++) {
                acc[t] += seg.timbre[t] || 0;
            }
            count += 1;
        }
        if (count > 0) {
            for (var k = 0; k < 12; k++) {
                acc[k] /= count;
            }
        }
        timbres[i] = acc;
    }
    return timbres;
}

function computeBeatChromaVectors(beats) {
    if (!beats || !beats.length) return [];
    var chromas = new Array(beats.length);
    for (var i = 0; i < beats.length; i++) {
        var beat = beats[i];
        var segs = (beat && beat.overlappingSegments && beat.overlappingSegments.length)
            ? beat.overlappingSegments
            : (beat && beat.oseg ? [beat.oseg] : []);
        var acc = new Array(12).fill(0);
        var count = 0;
        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || !seg.pitches || seg.pitches.length < 12) continue;
            for (var p = 0; p < 12; p++) {
                acc[p] += seg.pitches[p] || 0;
            }
            count += 1;
        }
        if (count > 0) {
            for (var k = 0; k < 12; k++) {
                acc[k] /= count;
            }
        }
        chromas[i] = normalizeChromaVector(acc);
    }
    return chromas;
}

function buildHarmonicTrapState(beats, settings) {
    beats = beats || [];
    settings = settings || ADVANCED_DEFAULTS.harmonicTrap;
    var chromas = computeBeatChromaVectors(beats);
    if (!chromas.length) {
        return {
            chromas: [],
            targetPitchClass: settings.targetPitchClass,
            targetChroma: normalizeChromaVector(new Array(12).fill(0)),
            compatible: [],
            compatibleSet: {}
        };
    }

    var globalAcc = new Array(12).fill(0);
    for (var i = 0; i < chromas.length; i++) {
        var v = chromas[i];
        for (var p = 0; p < 12; p++) globalAcc[p] += v[p] || 0;
    }
    var globalChroma = normalizeChromaVector(globalAcc);

    var targetPC = settings.targetPitchClass;
    if (settings.autoTarget >= 1) {
        targetPC = dominantPitchClass(globalChroma);
    }

    var targetAcc = new Array(12).fill(0);
    var targetCount = 0;
    for (var j = 0; j < chromas.length; j++) {
        if (dominantPitchClass(chromas[j]) === targetPC) {
            for (var q = 0; q < 12; q++) targetAcc[q] += chromas[j][q] || 0;
            targetCount += 1;
        }
    }
    var targetChroma;
    if (targetCount >= 4) {
        for (var t = 0; t < 12; t++) targetAcc[t] /= targetCount;
        targetChroma = normalizeChromaVector(targetAcc);
    } else {
        var oneHot = new Array(12).fill(0);
        oneHot[targetPC] = 1;
        targetChroma = normalizeChromaVector(oneHot);
    }

    var compatible = new Array(chromas.length);
    var compatibleSet = {};
    var simToTarget = new Array(chromas.length);
    var compatibleCount = 0;
    for (var bIdx = 0; bIdx < chromas.length; bIdx++) {
        var sim = chromaDotSimilarity(chromas[bIdx], targetChroma);
        simToTarget[bIdx] = sim;
        compatible[bIdx] = sim >= settings.similarityThreshold;
        if (compatible[bIdx]) {
            compatibleSet[bIdx] = true;
            compatibleCount += 1;
        }
    }

    // Safeguard: if the threshold yields zero compatible beats (common when pitch data is sparse),
    // fall back to allowing the top-N closest beats so the mode can still function.
    if (compatibleCount === 0 && chromas.length) {
        var minKeep = Math.min(chromas.length, Math.max(8, Math.round(chromas.length * 0.05)));
        var ranked = [];
        for (var i2 = 0; i2 < simToTarget.length; i2++) {
            ranked.push({ idx: i2, sim: simToTarget[i2] || 0 });
        }
        ranked.sort(function(a, b) { return b.sim - a.sim; });
        for (var k2 = 0; k2 < minKeep; k2++) {
            var idxKeep = ranked[k2].idx;
            compatible[idxKeep] = true;
            compatibleSet[idxKeep] = true;
        }
    }

    return {
        chromas: chromas,
        targetPitchClass: targetPC,
        targetChroma: targetChroma,
        simToTarget: simToTarget,
        compatible: compatible,
        compatibleSet: compatibleSet
    };
}

function getHarmonicTrapSettings() {
    var useAdvanced = isAdvancedGroupEnabled("harmonicTrap");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("harmonicTrap") : cloneAdvancedDefaults("harmonicTrap");
    return sanitizeHarmonicTrapSettings(settings, ADVANCED_DEFAULTS.harmonicTrap);
}

function createHarmonicTrapDriver(player, options) {
    options = options || {};
    var modeName = "harmonictrap";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var outOfKeyStreak = 0;
    var cooldownLeft = 0;
    var state = null;
    var settings = sanitizeHarmonicTrapSettings(options, ADVANCED_DEFAULTS.harmonicTrap);

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function findNearestCompatible(fromIdx) {
        if (!state || !state.compatible || !state.compatible.length) return fromIdx;
        var n = state.compatible.length;
        for (var radius = 1; radius < n; radius++) {
            var fwd = fromIdx + radius;
            if (fwd < n && state.compatible[fwd]) return fwd;
            var back = fromIdx - radius;
            if (back >= 0 && state.compatible[back]) return back;
        }
        return fromIdx;
    }

    function selectTargetFromEdges(fromIdx) {
        if (!serverLoopCandidateMap || !serverLoopCandidateMap[fromIdx]) return null;
        var edges = serverLoopCandidateMap[fromIdx] || [];
        var pool = [];
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            if (!edge || typeof edge.target !== "number") continue;
            if (!state.compatibleSet[edge.target]) continue;
            var absSpan =
                (typeof edge.abs_span === "number" && isFinite(edge.abs_span))
                    ? edge.abs_span
                    : Math.abs(edge.target - fromIdx);
            if (absSpan < settings.minJumpSpanBeats) continue;
            pool.push(edge);
            if (pool.length >= settings.searchTopK) break;
        }
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)].target;
    }

    function computeNextIndex() {
        if (!state) state = buildHarmonicTrapState(masterQs, settings);
        if (!state || !state.chromas.length) {
            return currentIndex + 1;
        }

        var currentChroma = state.chromas[currentIndex] || null;
        var simNow = currentChroma ? chromaDotSimilarity(currentChroma, state.targetChroma) : 0;
        var isCompatible = simNow >= settings.similarityThreshold;

        if (!isCompatible && Math.random() >= settings.escapeProb) {
            outOfKeyStreak += 1;
        } else {
            outOfKeyStreak = 0;
        }

        if (cooldownLeft > 0) cooldownLeft -= 1;

        if (outOfKeyStreak > settings.graceBeats && cooldownLeft <= 0) {
            var target = selectTargetFromEdges(currentIndex);
            if (target === null) {
                target = findNearestCompatible(currentIndex);
            }
            if (target !== null && target !== currentIndex) {
                outOfKeyStreak = 0;
                cooldownLeft = settings.cooldownBeats;
                return target;
            }
        }

        return currentIndex + 1;
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
                outOfKeyStreak = 0;
                cooldownLeft = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        var proposed = computeNextIndex();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "harmonic"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeHarmonicTrapSettings(customSettings, ADVANCED_DEFAULTS.harmonicTrap);
        state = buildHarmonicTrapState(masterQs, settings);
        outOfKeyStreak = 0;
        cooldownLeft = 0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getHarmonicTrapSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            if (!state) {
                rebuildFromSettings(getHarmonicTrapSettings());
            }
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            outOfKeyStreak = 0;
            cooldownLeft = 0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// Register Harmonic Trap as a stackable harmonic gate.
registerStackLayer({
    id: "harmonictrap",
    label: "Harmonic Trap",
    description: "Snap playback to beats matching a target chord/key.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getHarmonicTrapSettings();
        var data = buildHarmonicTrapState(ctx.beats, settings);
        if (!data || !data.chromas.length) return null;

        function snapToCompatible(idx, fallbackIdx) {
            if (data.compatibleSet[idx]) return idx;
            var n = data.compatible.length;
            for (var r = 1; r < n; r++) {
                var fwd = idx + r;
                if (fwd < n && data.compatibleSet[fwd]) return fwd;
                var back = idx - r;
                if (back >= 0 && data.compatibleSet[back]) return back;
            }
            return typeof fallbackIdx === "number" ? fallbackIdx : idx;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.proposedIndex !== "number") return null;
                if (meta.mode === "harmonictrap") return null;
                var proposed = meta.proposedIndex;
                if (data.compatibleSet[proposed]) return null;
                var snapped = snapToCompatible(proposed, meta.currentIndex);
                return { index: snapped };
            }
        };
    }
});

// ===== Phase Shifter (Synced Phaser) =====
function getPhaseIntensityFactor() {
    var value = coerceNumber(typeof window !== "undefined" ? window.phaseIntensity : null);
    if (value === null) {
        return 1;
    }
    return clampNumber(value, 0, 4);
}

function sanitizePhaseShifterSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.phaseShifter || {};
    var out = cloneSettings(defaults);

    var rateDelta = coerceNumber(input.rateDelta);
    if (rateDelta === null) rateDelta = defaults.rateDelta;
    out.rateDelta = clampNumber(rateDelta, 0, 0.02);

    var overlayGain = coerceNumber(input.overlayGain);
    if (overlayGain === null) overlayGain = defaults.overlayGain;
    out.overlayGain = clamp01(overlayGain);

    var resyncOnJump = coerceNumber(input.resyncOnJump);
    if (resyncOnJump === null) resyncOnJump = defaults.resyncOnJump;
    out.resyncOnJump = resyncOnJump >= 1 ? 1 : 0;

    var resyncThresholdBeats = coerceNumber(input.resyncThresholdBeats);
    if (resyncThresholdBeats === null) resyncThresholdBeats = defaults.resyncThresholdBeats;
    out.resyncThresholdBeats = clampNumber(Math.round(resyncThresholdBeats), 1, 256);

    var overlayLoop = coerceNumber(input.overlayLoop);
    if (overlayLoop === null) overlayLoop = defaults.overlayLoop;
    out.overlayLoop = overlayLoop >= 1 ? 1 : 0;

    return out;
}

function getPhaseShifterSettings() {
    var useAdvanced = isAdvancedGroupEnabled("phaseShifter");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("phaseShifter") : cloneAdvancedDefaults("phaseShifter");
    return sanitizePhaseShifterSettings(settings, ADVANCED_DEFAULTS.phaseShifter);
}

window.applyPhaseIntensity = function() {
    if (mode === "phaseshifter" && driver && typeof driver.applySettings === "function") {
        driver.applySettings(getPhaseShifterSettings());
    }
    if (typeof rebuildActiveStackLayers === "function") {
        rebuildActiveStackLayers();
    }
};

function createPhaseOverlayHead(player, track, options) {
    var settings = sanitizePhaseShifterSettings(options, ADVANCED_DEFAULTS.phaseShifter);
    var source = null;
    var wetGain = null;
    var panner = null;
    var filterStages = [];
    var lfo = null;
    var lfoGain = null;
    var connected = false;
    var started = false;

    function getContext() {
        if (!player || typeof player.getContext !== "function") {
            return null;
        }
        return player.getContext();
    }

    function getBuffer() {
        if (track && track.buffer) {
            return track.buffer;
        }
        if (masterQs && masterQs.length && masterQs[0] && masterQs[0].track && masterQs[0].track.buffer) {
            return masterQs[0].track.buffer;
        }
        return null;
    }

    function ensureNodes() {
        var ctx = getContext();
        if (!ctx) {
            return false;
        }
        if (!wetGain) {
            wetGain = ctx.createGain();
            wetGain.gain.value = 0;
        }
        if (!filterStages.length) {
            var stageCount = 4;
            var prev = null;
            for (var i = 0; i < stageCount; i++) {
                var filter = ctx.createBiquadFilter();
                filter.type = "allpass";
                filter.Q.value = 0.7;
                filterStages.push(filter);
                if (prev) {
                    prev.connect(filter);
                }
                prev = filter;
            }
            if (prev) {
                prev.connect(wetGain);
            }
        }
        if (!connected) {
            if (typeof ctx.createStereoPanner === "function") {
                panner = ctx.createStereoPanner();
                try { panner.pan.value = 0; } catch (e) {}
                wetGain.connect(panner);
                panner.connect(ctx.destination);
            } else {
                wetGain.connect(ctx.destination);
            }
            connected = true;
        }
        if (!lfo) {
            lfo = ctx.createOscillator();
            lfoGain = ctx.createGain();
            lfo.type = "sine";
            lfo.connect(lfoGain);
            filterStages.forEach(function(filter) {
                lfoGain.connect(filter.frequency);
            });
            try { lfo.start(); } catch (e) {}
        }
        applyPhaserParams();
        return true;
    }

    function computePhaserParams() {
        var intensity = getPhaseIntensityFactor();
        var rateDelta = (settings && typeof settings.rateDelta === "number") ? settings.rateDelta : 0;
        var overlayGain = (settings && typeof settings.overlayGain === "number") ? settings.overlayGain : 0;
        var lfoRate = clampNumber(0.05 + rateDelta * 50, 0.05, 2.0);
        var baseHz = clampNumber(600 + intensity * 200, 200, 2000);
        var depthHz = clampNumber(300 * intensity, 0, 1500);
        var wet = clamp01(overlayGain * intensity);
        return { lfoRate: lfoRate, baseHz: baseHz, depthHz: depthHz, wet: wet };
    }

    function applyPhaserParams() {
        if (!wetGain || !filterStages.length || !lfo || !lfoGain) {
            return;
        }
        var params = computePhaserParams();
        wetGain.gain.value = params.wet;
        try { lfo.frequency.value = params.lfoRate; } catch (e) {}
        try { lfoGain.gain.value = params.depthHz; } catch (e) {}
        filterStages.forEach(function(filter, idx) {
            var base = params.baseHz * (1 + idx * 0.2);
            try { filter.frequency.value = base; } catch (e) {}
        });
    }

    function getBaseRate() {
        if (player && typeof player.getSpeedFactor === "function") {
            var rate = player.getSpeedFactor();
            if (typeof rate === "number" && isFinite(rate) && rate > 0) {
                return rate;
            }
        }
        return 1;
    }

    function stopSource() {
        if (source) {
            try { source.onended = null; } catch (e) {}
            try { source.stop(0); } catch (e) {}
            try { source.disconnect(); } catch (e) {}
            source = null;
        }
    }

    function normalizedOffset(offsetSeconds, buffer) {
        var dur = buffer && typeof buffer.duration === "number" ? buffer.duration : null;
        if (!dur || !isFinite(dur) || dur <= 0) {
            return Math.max(0, offsetSeconds || 0);
        }
        var raw = offsetSeconds || 0;
        raw = raw % dur;
        if (raw < 0) raw += dur;
        return raw;
    }

    function startAt(offsetSeconds) {
        var ctx = getContext();
        var buffer = getBuffer();
        if (!ctx || !buffer) {
            return false;
        }
        if (!ensureNodes()) {
            return false;
        }
        stopSource();
        var src = ctx.createBufferSource();
        src.buffer = buffer;
        var rate = getBaseRate();
        try { src.playbackRate.value = rate; } catch (e) {}
        if (settings.overlayLoop >= 1) {
            src.loop = true;
        }
        if (filterStages.length) {
            src.connect(filterStages[0]);
        } else if (wetGain) {
            src.connect(wetGain);
        }
        var offset = normalizedOffset(offsetSeconds, buffer);
        try {
            src.start(0, offset);
        } catch (e) {
            try { src.start(0); } catch (ee) {}
        }
        src.onended = function() {
            if (source === src) {
                source = null;
                started = false;
            }
        };
        source = src;
        started = true;
        return true;
    }

    function applySettings(nextSettings) {
        settings = sanitizePhaseShifterSettings(nextSettings, ADVANCED_DEFAULTS.phaseShifter);
        applyPhaserParams();
        if (source && source.playbackRate) {
            try { source.playbackRate.value = getBaseRate(); } catch (e) {}
        }
    }

    function stop() {
        stopSource();
        started = false;
    }

    return {
        startAt: startAt,
        stop: stop,
        applySettings: applySettings,
        isStarted: function() { return started; }
    };
}

function createPhaseShifterDriver(player, options) {
    options = options || {};
    var modeName = "phaseshifter";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var settings = sanitizePhaseShifterSettings(options, ADVANCED_DEFAULTS.phaseShifter);
    var phaseHead = createPhaseOverlayHead(player, curTrack, settings);

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        if (phaseHead) {
            phaseHead.stop();
        }
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        if (phaseHead) {
            phaseHead.stop();
        }
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        if (phaseHead && !phaseHead.isStarted()) {
            phaseHead.startAt(q.start || 0);
        }

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        var proposed = currentIndex + 1;
        if (proposed >= masterQs.length) {
            proposed = window.harmonizerLoopEnabled ? 0 : proposed;
        }

        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "phase"
        });

        if (
            phaseHead &&
            settings.resyncOnJump >= 1 &&
            typeof nextIdx === "number" &&
            Math.abs(nextIdx - currentIndex) >= (settings.resyncThresholdBeats || 8)
        ) {
            var targetBeat = masterQs[nextIdx];
            if (targetBeat) {
                phaseHead.startAt(targetBeat.start || 0);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizePhaseShifterSettings(customSettings, ADVANCED_DEFAULTS.phaseShifter);
        if (phaseHead) {
            phaseHead.applySettings(settings);
        }
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getPhaseShifterSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getPhaseShifterSettings());
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            if (phaseHead) {
                phaseHead.startAt(q.start || 0);
            }
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// Register Phase Shifter as a stackable phaser layer.
registerStackLayer({
    id: "phaseshifter",
    label: "Phase Shifter",
    description: "Applies a synced phaser sweep.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var player = driver && driver.player ? driver.player : null;
        var settings = getPhaseShifterSettings();
        var trackRef = ctx.track || (ctx.beats[0] ? ctx.beats[0].track : null);
        if (!player || typeof player.getContext !== "function") {
            return null;
        }
        var phaseHead = createPhaseOverlayHead(player, trackRef, settings);
        var lastIndex = null;

        return {
            onBeat: function(meta) {
                if (!meta || !meta.beat) return;
                if (meta.mode === "phaseshifter") return;
                var idx = typeof meta.currentIndex === "number" ? meta.currentIndex : null;
                if (!phaseHead.isStarted()) {
                    phaseHead.startAt(meta.beat.start || 0);
                    lastIndex = idx;
                    return;
                }
                if (
                    settings.resyncOnJump >= 1 &&
                    idx !== null &&
                    lastIndex !== null &&
                    Math.abs(idx - lastIndex) >= (settings.resyncThresholdBeats || 8)
                ) {
                    phaseHead.startAt(meta.beat.start || 0);
                }
                lastIndex = idx;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    phaseHead.stop();
                }
            },
            dispose: function() {
                phaseHead.stop();
            }
        };
    }
});

// ===== Granular Freeze (Chopped & Screwed Auto-Mode) =====
function sanitizeGranularFreezeSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.granularFreeze || {};
    var out = cloneSettings(defaults);

    var chance = coerceNumber(input.freezeChance);
    if (chance === null) chance = defaults.freezeChance;
    out.freezeChance = clampNumber(chance, 0, 1);

    var minVol = coerceNumber(input.minVolume);
    if (minVol === null) minVol = defaults.minVolume;
    out.minVolume = clampNumber(minVol, 0, 1);

    var attackMin = coerceNumber(input.sustainAttackMin);
    if (attackMin === null) attackMin = defaults.sustainAttackMin;
    out.sustainAttackMin = clampNumber(attackMin, 0, 1);

    var segDurMin = coerceNumber(input.sustainSegDurMin);
    if (segDurMin === null) segDurMin = defaults.sustainSegDurMin;
    out.sustainSegDurMin = clampNumber(segDurMin, 0.02, 2.5);

    var percMax = coerceNumber(input.percussiveRatioMax);
    if (percMax === null) percMax = defaults.percussiveRatioMax;
    out.percussiveRatioMax = clampNumber(percMax, 0.05, 1);

    var cooldown = coerceNumber(input.cooldownBeats);
    if (cooldown === null) cooldown = defaults.cooldownBeats;
    out.cooldownBeats = clampNumber(Math.round(cooldown), 0, 256);

    var repeatMode = coerceNumber(input.repeatMode);
    if (repeatMode === null) repeatMode = defaults.repeatMode;
    out.repeatMode = clampNumber(Math.round(repeatMode), 0, 2);

    var longBias = coerceNumber(input.repeatLongBias);
    if (longBias === null) longBias = defaults.repeatLongBias;
    out.repeatLongBias = clampNumber(longBias, 0, 1);

    return out;
}

function getGranularFreezeSettings() {
    var useAdvanced = isAdvancedGroupEnabled("granularFreeze");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("granularFreeze") : cloneAdvancedDefaults("granularFreeze");
    return sanitizeGranularFreezeSettings(settings, ADVANCED_DEFAULTS.granularFreeze);
}

function pickGranularRepeatCount(settings) {
    settings = settings || ADVANCED_DEFAULTS.granularFreeze;
    var mode = settings.repeatMode || 1;
    var options = mode === 0 ? [2, 4, 8] : mode === 2 ? [8, 16, 32] : [4, 8, 16];
    var bias = clampNumber(settings.repeatLongBias || 0.5, 0, 1);
    var center = (options.length - 1) / 2;
    var strength = (bias - 0.5) * 2.0;
    var weights = [];
    var total = 0;
    for (var i = 0; i < options.length; i++) {
        var w = Math.exp((i - center) * strength * 1.25);
        weights[i] = w;
        total += w;
    }
    var r = Math.random() * total;
    for (var j = 0; j < options.length; j++) {
        r -= weights[j];
        if (r <= 0) return options[j];
    }
    return options[options.length - 1];
}

function buildGranularFreezeState(beats, settings) {
    settings = sanitizeGranularFreezeSettings(settings, ADVANCED_DEFAULTS.granularFreeze);
    if (!beats || !beats.length) {
        return { eligible: [], eligibleSet: {}, strength: [] };
    }

    var n = beats.length;
    var eligible = new Array(n);
    var eligibleSet = {};
    var strength = new Array(n);

    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var vol =
            (b && typeof b.median_volume === "number") ? b.median_volume :
            (b && typeof b.volume === "number") ? b.volume :
            (b && typeof b.loudness === "number") ? b.loudness : 0;
        if (!isFinite(vol)) vol = 0;

        var segs = (b && b.overlappingSegments && b.overlappingSegments.length) ? b.overlappingSegments : [];
        if (!segs.length || vol < settings.minVolume) {
            eligible[i] = false;
            strength[i] = 0;
            continue;
        }

        var sumAttackRatio = 0;
        var maxDur = 0;
        var percussiveCount = 0;
        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg) continue;
            var dur = (typeof seg.duration === "number" && isFinite(seg.duration)) ? seg.duration : 0;
            if (dur > maxDur) maxDur = dur;
            var atk = (typeof seg.loudness_max_time === "number" && isFinite(seg.loudness_max_time)) ? seg.loudness_max_time : 0;
            var ratio = dur > 0.001 ? (atk / dur) : 0;
            sumAttackRatio += ratio;
            if (dur < 0.085 || ratio < 0.14) {
                percussiveCount += 1;
            }
        }
        var count = segs.length;
        var avgAttackRatio = sumAttackRatio / Math.max(1, count);
        var percussiveRatio = percussiveCount / Math.max(1, count);

        var ok =
            avgAttackRatio >= settings.sustainAttackMin &&
            maxDur >= settings.sustainSegDurMin &&
            percussiveRatio <= settings.percussiveRatioMax;
        eligible[i] = ok;
        if (ok) {
            eligibleSet[i] = true;
        }

        var attackStrength = clamp01((avgAttackRatio - settings.sustainAttackMin) / 0.45);
        var durStrength = clamp01((maxDur - settings.sustainSegDurMin) / 0.55);
        var percStrength = clamp01((settings.percussiveRatioMax - percussiveRatio) / Math.max(0.05, settings.percussiveRatioMax));
        strength[i] = clamp01(0.52 * attackStrength + 0.28 * durStrength + 0.2 * percStrength);
    }

    return { eligible: eligible, eligibleSet: eligibleSet, strength: strength };
}

function createGranularFreezeDriver(player, options) {
    options = options || {};
    var modeName = "granularfreeze";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var repeatsLeft = 0;
    var cooldownLeft = 0;

    var settings = sanitizeGranularFreezeSettings(options, ADVANCED_DEFAULTS.granularFreeze);
    var state = null;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function shouldFreeze(idx) {
        if (!state || !state.eligibleSet || !state.strength) return false;
        if (!state.eligibleSet[idx]) return false;
        var st = state.strength[idx] || 0;
        var chance = clamp01(settings.freezeChance * (0.35 + 0.65 * st));
        return Math.random() < chance;
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function computeProposedNext() {
        if (repeatsLeft > 0) {
            repeatsLeft -= 1;
            return currentIndex;
        }
        if (cooldownLeft > 0) {
            cooldownLeft -= 1;
        }
        if (cooldownLeft <= 0 && shouldFreeze(currentIndex)) {
            var totalPlays = Math.max(2, pickGranularRepeatCount(settings));
            repeatsLeft = totalPlays - 1;
            cooldownLeft = settings.cooldownBeats || 0;
            return currentIndex;
        }
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: proposed === currentIndex ? "freeze" : "sequential"
        });

        if (proposed === currentIndex && nextIdx !== currentIndex) {
            repeatsLeft = 0;
        }

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeGranularFreezeSettings(customSettings, ADVANCED_DEFAULTS.granularFreeze);
        state = buildGranularFreezeState(masterQs, settings);
        repeatsLeft = 0;
        cooldownLeft = 0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getGranularFreezeSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            if (!state) {
                rebuildFromSettings(getGranularFreezeSettings());
            }
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            repeatsLeft = 0;
            cooldownLeft = 0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// Register Granular Freeze as a stackable stutter/loop layer.
registerStackLayer({
    id: "granularfreeze",
    label: "Granular Freeze",
    description: "On sustain beats, loop 4/8/16x for vaporwave stutters.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getGranularFreezeSettings();
        var state = buildGranularFreezeState(ctx.beats, settings);
        if (!state || !state.eligibleSet) return null;

        var repeatsLeft = 0;
        var cooldownLeft = 0;

        function shouldFreeze(idx) {
            if (!state.eligibleSet[idx]) return false;
            var st = state.strength[idx] || 0;
            var chance = clamp01(settings.freezeChance * (0.35 + 0.65 * st));
            return Math.random() < chance;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number") return null;
                var idx = meta.currentIndex;

                if (repeatsLeft > 0) {
                    repeatsLeft -= 1;
                    return { index: idx };
                }
                if (cooldownLeft > 0) {
                    cooldownLeft -= 1;
                }
                if (cooldownLeft <= 0 && shouldFreeze(idx)) {
                    var totalPlays = Math.max(2, pickGranularRepeatCount(settings));
                    repeatsLeft = totalPlays - 1;
                    cooldownLeft = settings.cooldownBeats || 0;
                    return { index: idx };
                }
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    repeatsLeft = 0;
                    cooldownLeft = 0;
                }
            },
            dispose: function() {
                repeatsLeft = 0;
                cooldownLeft = 0;
            }
        };
    }
});

// ===== Elastic Velocity (Energy-linked playbackRate) =====
function sanitizeElasticVelocitySettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.elasticVelocity || {};
    var out = cloneSettings(defaults);

    var minRate = coerceNumber(input.minRate);
    if (minRate === null) minRate = defaults.minRate;
    out.minRate = clampNumber(minRate, 0.25, 2.5);

    var maxRate = coerceNumber(input.maxRate);
    if (maxRate === null) maxRate = defaults.maxRate;
    out.maxRate = clampNumber(maxRate, 0.25, 3.0);

    if (out.maxRate < out.minRate) {
        var tmp = out.maxRate;
        out.maxRate = out.minRate;
        out.minRate = tmp;
    }

    var curve = coerceNumber(input.curve);
    if (curve === null) curve = defaults.curve;
    out.curve = clampNumber(curve, 0.25, 4.0);

    var smoothingBeats = coerceNumber(input.smoothingBeats);
    if (smoothingBeats === null) smoothingBeats = defaults.smoothingBeats;
    out.smoothingBeats = clampNumber(Math.round(smoothingBeats), 0, 32);

    var maxDelta = coerceNumber(input.maxDeltaPerBeat);
    if (maxDelta === null) maxDelta = defaults.maxDeltaPerBeat;
    out.maxDeltaPerBeat = clampNumber(maxDelta, 0.0, 1.0);

    return out;
}

function getElasticVelocitySettings() {
    var useAdvanced = isAdvancedGroupEnabled("elasticVelocity");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("elasticVelocity") : cloneAdvancedDefaults("elasticVelocity");
    return sanitizeElasticVelocitySettings(settings, ADVANCED_DEFAULTS.elasticVelocity);
}

function elasticVelocityEnergy01(beat) {
    if (!beat) return 0;
    if (typeof beat.median_volume === "number" && isFinite(beat.median_volume)) {
        return clamp01(beat.median_volume);
    }
    if (typeof beat.volume === "number" && isFinite(beat.volume)) {
        return clamp01(beat.volume);
    }
    if (typeof beat.loudness === "number" && isFinite(beat.loudness)) {
        return clamp01((beat.loudness + 60) / 60);
    }
    return 0;
}

function elasticVelocityMapRate(energy01, settings) {
    settings = settings || ADVANCED_DEFAULTS.elasticVelocity;
    var e = clamp01(energy01);
    var curve = (settings && typeof settings.curve === "number") ? settings.curve : 1.0;
    var t = Math.pow(e, Math.max(0.01, curve));
    var minRate = (settings && typeof settings.minRate === "number") ? settings.minRate : 0.6;
    var maxRate = (settings && typeof settings.maxRate === "number") ? settings.maxRate : 1.5;
    return minRate + (maxRate - minRate) * t;
}

function createElasticVeloDriver(player, options) {
    options = options || {};
    var modeName = "elasticvelo";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;

    var settings = sanitizeElasticVelocitySettings(options, ADVANCED_DEFAULTS.elasticVelocity);
    var smoothRate = null;
    var lastRate = 1.0;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function resetRateState() {
        smoothRate = null;
        lastRate = 1.0;
        if (player && typeof player.setSpeedFactor === "function") {
            try { player.setSpeedFactor(1.0); } catch (e) {}
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        resetRateState();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        resetRateState();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function computeRateForBeat(beat) {
        var energy = elasticVelocityEnergy01(beat);
        var target = elasticVelocityMapRate(energy, settings);

        var smoothingBeats = settings.smoothingBeats || 0;
        var alpha = smoothingBeats <= 0 ? 1.0 : (1.0 / (1.0 + smoothingBeats));
        if (smoothRate === null || !isFinite(smoothRate)) {
            smoothRate = target;
        } else {
            smoothRate = smoothRate + alpha * (target - smoothRate);
        }

        var rate = smoothRate;
        var maxDelta = settings.maxDeltaPerBeat || 0;
        if (maxDelta > 0 && isFinite(lastRate)) {
            rate = clampNumber(rate, lastRate - maxDelta, lastRate + maxDelta);
        }
        rate = clampNumber(rate, settings.minRate, settings.maxRate);
        lastRate = rate;
        return rate;
    }

    function computeProposedNext() {
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        var rate = computeRateForBeat(q);
        if (player && typeof player.setSpeedFactor === "function") {
            try { player.setSpeedFactor(rate); } catch (e) {}
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, rate: rate });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "elastic"
        });

        if (nextIdx !== currentIndex + 1) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeElasticVelocitySettings(customSettings, ADVANCED_DEFAULTS.elasticVelocity);
        smoothRate = null;
        lastRate = 1.0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getElasticVelocitySettings());
            resetRateState();
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            if (!settings) {
                rebuildFromSettings(getElasticVelocitySettings());
            }
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            smoothRate = null;
            lastRate = 1.0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// ===== AutoCrooner (Vintage slow croon) =====
function sanitizeAutoCroonerSettings(input) {
    input = input || {};
    var out = {
        baseRate: 0.86,
        minRate: 0.76,
        maxRate: 0.98,
        energyTilt: 0.08,
        wobbleDepth: 0.018,
        wobbleBeats: 16,
        jitterDepth: 0.006,
        // FX bus defaults (applied by player FX chain in jremix.js)
        fxMix: 0.14,
        toneLowHz: 200,
        toneHighHz: 6200,
        noiseLevel: 0.012,
        satDrive: 0.8
    };

    var baseRate = coerceNumber(input.baseRate);
    if (baseRate !== null) out.baseRate = clampNumber(baseRate, 0.5, 1.5);
    var minRate = coerceNumber(input.minRate);
    if (minRate !== null) out.minRate = clampNumber(minRate, 0.25, 2.0);
    var maxRate = coerceNumber(input.maxRate);
    if (maxRate !== null) out.maxRate = clampNumber(maxRate, 0.25, 2.0);
    if (out.maxRate < out.minRate) {
        var tmp = out.maxRate;
        out.maxRate = out.minRate;
        out.minRate = tmp;
    }

    var energyTilt = coerceNumber(input.energyTilt);
    if (energyTilt !== null) out.energyTilt = clampNumber(energyTilt, 0.0, 0.5);
    var wobbleDepth = coerceNumber(input.wobbleDepth);
    if (wobbleDepth !== null) out.wobbleDepth = clampNumber(wobbleDepth, 0.0, 0.15);
    var wobbleBeats = coerceNumber(input.wobbleBeats);
    if (wobbleBeats !== null) out.wobbleBeats = clampNumber(Math.round(wobbleBeats), 2, 128);
    var jitterDepth = coerceNumber(input.jitterDepth);
    if (jitterDepth !== null) out.jitterDepth = clampNumber(jitterDepth, 0.0, 0.05);

    var fxMix = coerceNumber(input.fxMix);
    if (fxMix !== null) out.fxMix = clampNumber(fxMix, 0.0, 0.5);
    var toneLowHz = coerceNumber(input.toneLowHz);
    if (toneLowHz !== null) out.toneLowHz = clampNumber(toneLowHz, 20, 1200);
    var toneHighHz = coerceNumber(input.toneHighHz);
    if (toneHighHz !== null) out.toneHighHz = clampNumber(toneHighHz, out.toneLowHz + 200, 12000);
    var noiseLevel = coerceNumber(input.noiseLevel);
    if (noiseLevel !== null) out.noiseLevel = clampNumber(noiseLevel, 0.0, 0.15);
    var satDrive = coerceNumber(input.satDrive);
    if (satDrive !== null) out.satDrive = clampNumber(satDrive, 0.01, 2.5);

    return out;
}

function getAutoCroonerSettings() {
    var overrides = null;
    try {
        overrides = (typeof window !== "undefined" && window.autocroonerSettings) ? window.autocroonerSettings : null;
    } catch (e) {}
    return sanitizeAutoCroonerSettings(overrides);
}

function applyAutoCroonerFxSettings(player, settings) {
    if (!player) return;
    if (typeof player.setCroonerEnabled === "function") {
        try { player.setCroonerEnabled(true); } catch (e) {}
    }
    if (typeof player.setCroonerMix === "function") {
        try { player.setCroonerMix(settings && settings.fxMix); } catch (e2) {}
    }
    if (typeof player.setCroonerTone === "function") {
        try { player.setCroonerTone(settings && settings.toneLowHz, settings && settings.toneHighHz); } catch (e3) {}
    }
    if (typeof player.setCroonerNoise === "function") {
        try { player.setCroonerNoise(settings && settings.noiseLevel); } catch (e4) {}
    }
    if (typeof player.setCroonerSaturation === "function") {
        try { player.setCroonerSaturation(settings && settings.satDrive); } catch (e5) {}
    }
}

function createAutoCroonerDriver(player, options) {
    options = sanitizeAutoCroonerSettings(options || getAutoCroonerSettings());
    var modeName = "autocrooner";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var lastRate = 1.0;
    var wobblePhase = Math.random() * Math.PI * 2;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function resetRateState() {
        lastRate = 1.0;
        if (player && typeof player.setSpeedFactor === "function") {
            try { player.setSpeedFactor(1.0); } catch (e) {}
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        resetRateState();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        resetRateState();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function computeRateForBeat(beat, beatIndex) {
        var energy = elasticVelocityEnergy01(beat);
        var tilt = (energy - 0.5) * (options.energyTilt || 0);
        var wobbleBeats = Math.max(2, options.wobbleBeats || 16);
        var wobble =
            (options.wobbleDepth || 0) *
            Math.sin(wobblePhase + (beatIndex / wobbleBeats) * Math.PI * 2);
        var jitter = (Math.random() * 2 - 1) * (options.jitterDepth || 0);

        var target = (options.baseRate || 1.0) + tilt + wobble + jitter;
        target = clampNumber(target, options.minRate, options.maxRate);

        var maxDelta = 0.08;
        var next = clampNumber(target, lastRate - maxDelta, lastRate + maxDelta);
        lastRate = next;
        return next;
    }

    function computeProposedNext() {
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        var rate = computeRateForBeat(q, currentIndex);
        if (player && typeof player.setSpeedFactor === "function") {
            try { player.setSpeedFactor(rate); } catch (e) {}
        }

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, rate: rate });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "sequential"
        });

        if (nextIdx >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                nextIdx = nextIdx % masterQs.length;
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        options = sanitizeAutoCroonerSettings(customSettings || getAutoCroonerSettings());
        wobblePhase = Math.random() * Math.PI * 2;
        applyAutoCroonerFxSettings(player, options);
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getAutoCroonerSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getAutoCroonerSettings());
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            lastRate = 1.0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// ===== The Math Rocker (Time Signature Butcher) =====
function sanitizeMathRockerSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.mathRocker || {};
    var out = cloneSettings(defaults);

    var cycleBeats = coerceNumber(input.cycleBeats);
    if (cycleBeats === null) cycleBeats = defaults.cycleBeats;
    out.cycleBeats = clampNumber(Math.round(cycleBeats), 2, 64);

    var dropBeats = coerceNumber(input.dropBeats);
    if (dropBeats === null) dropBeats = defaults.dropBeats;
    out.dropBeats = clampNumber(Math.round(dropBeats), 1, out.cycleBeats - 1);

    var resetOnJump = coerceNumber(input.resetOnJump);
    if (resetOnJump === null) resetOnJump = defaults.resetOnJump;
    out.resetOnJump = resetOnJump >= 1 ? 1 : 0;

    return out;
}

function getMathRockerSettings() {
    var useAdvanced = isAdvancedGroupEnabled("mathRocker");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("mathRocker") : cloneAdvancedDefaults("mathRocker");
    return sanitizeMathRockerSettings(settings, ADVANCED_DEFAULTS.mathRocker);
}

function createMathRockerDriver(player, options) {
    options = options || {};
    var modeName = "mathrocker";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;

    var settings = sanitizeMathRockerSettings(options, ADVANCED_DEFAULTS.mathRocker);
    var anchorIndex = 0;
    var hiccupLeft = 0;
    var hiccupIndex = null;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function cyclePosFor(idx) {
        var cycle = Math.max(2, settings.cycleBeats || 8);
        var delta = idx - anchorIndex;
        var pos = delta % cycle;
        if (pos < 0) pos += cycle;
        return pos;
    }

    function computeProposedNext() {
        var cycle = Math.max(2, settings.cycleBeats || 8);
        var drop = clampNumber(settings.dropBeats || 1, 1, cycle - 1);
        var kept = Math.max(1, cycle - drop);
        var pos = cyclePosFor(currentIndex);

        // If we landed inside the "dropped" region (due to a jump), snap forward to the next cycle start.
        if (pos >= kept) {
            hiccupLeft = 0;
            hiccupIndex = null;
            var toNextCycle = cycle - pos;
            return currentIndex + toNextCycle;
        }

        // When we hit the last kept beat, skip the next `drop` beats.
        if (pos === kept - 1) {
            // Add a short "hiccup" (repeat) right before the drop so the groove is more obvious.
            // Scales with drop size: drop=1 repeats once, larger drops repeat twice.
            if (hiccupIndex !== currentIndex) {
                hiccupIndex = currentIndex;
                hiccupLeft = Math.max(0, Math.min(2, drop));
            }
            if (hiccupLeft > 0) {
                hiccupLeft -= 1;
                return currentIndex;
            }
            return currentIndex + 1 + drop;
        }

        return currentIndex + 1;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
                anchorIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        var cycle = Math.max(2, settings.cycleBeats || 8);
        var drop = clampNumber(settings.dropBeats || 1, 1, cycle - 1);
        var kept = Math.max(1, cycle - drop);
        var pos = cyclePosFor(currentIndex);
        notifyStackOnBeat({
            mode: modeName,
            currentIndex: currentIndex,
            beat: q,
            cycleBeats: cycle,
            dropBeats: drop,
            keptBeats: kept,
            cyclePos: pos
        });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: (proposed === currentIndex + 1) ? "sequential" : "drop"
        });

        if (nextIdx >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                nextIdx = nextIdx % masterQs.length;
                anchorIndex = 0;
                hiccupLeft = 0;
                hiccupIndex = null;
            }
        }

        if (nextIdx !== currentIndex + 1) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeMathRockerSettings(customSettings, ADVANCED_DEFAULTS.mathRocker);
        hiccupLeft = 0;
        hiccupIndex = null;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getMathRockerSettings());
            currentIndex = 0;
            anchorIndex = 0;
            hiccupLeft = 0;
            hiccupIndex = null;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            anchorIndex = currentIndex;
            hiccupLeft = 0;
            hiccupIndex = null;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// Register Math Rocker as a stackable beat-drop layer.
registerStackLayer({
    id: "mathrocker",
    label: "Math Rocker",
    description: "Drop beats on a cycle to force odd-meter grooves.",
    factory: function(ctx) {
        var settings = getMathRockerSettings();
        var anchorIndex = 0;
        var lastIndex = null;
        var hiccupLeft = 0;
        var hiccupIndex = null;

        function cyclePos(idx) {
            var cycle = Math.max(2, settings.cycleBeats || 8);
            var delta = idx - anchorIndex;
            var pos = delta % cycle;
            if (pos < 0) pos += cycle;
            return pos;
        }

        function onJumpDetected(idx) {
            if (settings.resetOnJump >= 1) {
                anchorIndex = idx;
            }
            hiccupLeft = 0;
            hiccupIndex = null;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "mathrocker") return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (lastIndex !== null && Math.abs(cur - lastIndex) > 1) {
                    onJumpDetected(cur);
                }
                lastIndex = cur;

                var cycle = Math.max(2, settings.cycleBeats || 8);
                var drop = clampNumber(settings.dropBeats || 1, 1, cycle - 1);
                var kept = Math.max(1, cycle - drop);
                var pos = cyclePos(cur);

                // If we're currently inside the "dropped" region, snap forward to next cycle start.
                if (pos >= kept) {
                    hiccupLeft = 0;
                    hiccupIndex = null;
                    var toNext = cycle - pos;
                    return { index: cur + toNext };
                }

                // Only butcher sequential movement; leave explicit jumps alone.
                if (proposed !== cur + 1) {
                    hiccupLeft = 0;
                    hiccupIndex = null;
                    return null;
                }

                // If the next beat would be the first "dropped" beat, skip forward by `drop`.
                if (pos === kept - 1) {
                    if (hiccupIndex !== cur) {
                        hiccupIndex = cur;
                        hiccupLeft = Math.max(0, Math.min(2, drop));
                    }
                    if (hiccupLeft > 0) {
                        hiccupLeft -= 1;
                        return { index: cur };
                    }
                    return { index: cur + 1 + drop };
                }

                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    anchorIndex = 0;
                    lastIndex = null;
                    hiccupLeft = 0;
                    hiccupIndex = null;
                }
            },
            dispose: function() {
                anchorIndex = 0;
                lastIndex = null;
                hiccupLeft = 0;
                hiccupIndex = null;
            }
        };
    }
});

// ===== The Stalker (Targeted Gravity) =====
function sanitizeStalkerSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.stalker || {};
    var out = cloneSettings(defaults);

    var threshold = coerceNumber(input.similarityThreshold);
    if (threshold === null) threshold = defaults.similarityThreshold;
    out.similarityThreshold = clampNumber(threshold, 0.3, 0.999);

    var cooldownBeats = coerceNumber(input.cooldownBeats);
    if (cooldownBeats === null) cooldownBeats = defaults.cooldownBeats;
    out.cooldownBeats = clampNumber(Math.round(cooldownBeats), 0, 256);

    var armBeats = coerceNumber(input.armBeats);
    if (armBeats === null) armBeats = defaults.armBeats;
    out.armBeats = clampNumber(Math.round(armBeats), 0, 64);

    var symmetric = coerceNumber(input.symmetricLookup);
    if (symmetric === null) symmetric = defaults.symmetricLookup;
    out.symmetricLookup = symmetric >= 1 ? 1 : 0;

    return out;
}

function getStalkerSettings() {
    var useAdvanced = isAdvancedGroupEnabled("stalker");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("stalker") : cloneAdvancedDefaults("stalker");
    return sanitizeStalkerSettings(settings, ADVANCED_DEFAULTS.stalker);
}

function stalkerLookupSimilarity(srcIdx, targetIdx, settings) {
    if (typeof srcIdx !== "number" || typeof targetIdx !== "number") return 0;
    if (!isFinite(srcIdx) || !isFinite(targetIdx)) return 0;
    if (srcIdx === targetIdx) return 1;
    // Prefer explicit loop-candidate similarity when available.
    // Fallback to chroma similarity so Stalker still works even when there is
    // no direct edge between src and target (common with sparse candidate maps).
    var best = 0;
    if (serverLoopCandidateMap) {
        var edges = serverLoopCandidateMap[srcIdx] || [];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (e && e.target === targetIdx) {
                var s = (typeof e.similarity === "number") ? e.similarity : 0;
                if (s > best) best = s;
                break;
            }
        }
    }
    if (best > 0 && (!settings || settings.symmetricLookup < 1)) {
        return best;
    }
    if (settings && settings.symmetricLookup >= 1) {
        if (serverLoopCandidateMap) {
            var rev = serverLoopCandidateMap[targetIdx] || [];
            for (var j = 0; j < rev.length; j++) {
                var r = rev[j];
                if (r && r.target === srcIdx) {
                    var sr = (typeof r.similarity === "number") ? r.similarity : 0;
                    if (sr > best) best = sr;
                    break;
                }
            }
        }
    }
    if (best > 0) {
        return best;
    }

    var chromas = getStalkerChromaVectors();
    if (!chromas || !chromas.length) return 0;
    var a = chromas[srcIdx];
    var b = chromas[targetIdx];
    if (!a || !b) return 0;
    return chromaDotSimilarity(a, b);
}

function ensureStalkerTarget(currentIndex) {
    if (typeof stalkerTargetIndex === "number" && isFinite(stalkerTargetIndex)) {
        return Math.max(0, Math.min(masterQs.length - 1, Math.round(stalkerTargetIndex)));
    }
    return setStalkerTargetIndexInternal(typeof currentIndex === "number" ? currentIndex : 0, { source: "auto" });
}

function createStalkerDriver(player, options) {
    options = options || {};
    var modeName = "stalker";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var cooldownLeft = 0;
    var beatsAway = 0;
    var simStreak = 0;
    var pullStepsLeft = 0;
    var pullDestIndex = null;

    var settings = sanitizeStalkerSettings(options, ADVANCED_DEFAULTS.stalker);

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function absDistance(a, b) {
        return Math.abs((a || 0) - (b || 0));
    }

    function computeReentryIndex(targetIdx) {
        // Slight pre-roll so it feels like a pull into the anchor, not a hard snap to it.
        var preRoll = 4;
        return Math.max(0, Math.min(masterQs.length - 1, Math.round(targetIdx) - preRoll));
    }

    function startPullSequence(destIdx, strength) {
        pullDestIndex = destIdx;
        var steps = 2 + Math.floor(clamp01(strength) * 5); // 2..7
        pullStepsLeft = clampNumber(steps, 2, 8);
    }

    function pullStepToward(destIdx) {
        if (typeof destIdx !== "number" || !isFinite(destIdx)) return null;
        var dist = absDistance(currentIndex, destIdx);
        if (dist <= 2) return null;

        // Prefer an edge that moves closer to the destination (stuttery "suction").
        var candidate = choosePullTarget(currentIndex, destIdx);
        if (candidate !== null && absDistance(candidate, destIdx) < dist) {
            return candidate;
        }

        // Fallback: nudge toward the destination in a few steps.
        var dir = destIdx > currentIndex ? 1 : -1;
        var stepSize = Math.round(dist / Math.max(2, pullStepsLeft + 1));
        stepSize = clampNumber(stepSize, 4, 18);
        var next = currentIndex + dir * stepSize;
        // Avoid overshooting into/through the destination so it feels like tightening spirals.
        if (dir > 0) next = Math.min(next, destIdx);
        else next = Math.max(next, destIdx);
        return Math.max(0, Math.min(masterQs.length - 1, Math.round(next)));
    }

    function choosePullTarget(fromIdx, targetIdx) {
        if (!serverLoopCandidateMap || !masterQs || !masterQs.length) return null;
        var best = null;
        var bestScore = -Infinity;
        var baseDist = absDistance(fromIdx, targetIdx);
        var searchRadius = 3;
        for (var off = 0; off <= searchRadius; off++) {
            var src = fromIdx + off;
            if (src >= 0 && src < masterQs.length) {
                var edges = serverLoopCandidateMap[src] || [];
                for (var i = 0; i < edges.length; i++) {
                    var e = edges[i];
                    if (!e || typeof e.target !== "number") continue;
                    var cand = e.target;
                    if (cand === fromIdx) continue;
                    var absSpan =
                        (typeof e.abs_span === "number" && isFinite(e.abs_span))
                            ? e.abs_span
                            : Math.abs(cand - src);
                    if (absSpan < 8) continue;
                    var simToAnchor = stalkerLookupSimilarity(cand, targetIdx, settings);
                    var edgeSim = (typeof e.similarity === "number") ? e.similarity : 0;
                    var newDist = absDistance(cand, targetIdx);
                    var distImprove = clamp01((baseDist - newDist) / 32);
                    var score = 0.65 * simToAnchor + 0.25 * edgeSim + 0.1 * distImprove;
                    if (score > bestScore) {
                        bestScore = score;
                        best = cand;
                    }
                }
            }
            if (off > 0) {
                src = fromIdx - off;
                if (src >= 0 && src < masterQs.length) {
                    var edgesBack = serverLoopCandidateMap[src] || [];
                    for (var j = 0; j < edgesBack.length; j++) {
                        var eb = edgesBack[j];
                        if (!eb || typeof eb.target !== "number") continue;
                        var candb = eb.target;
                        if (candb === fromIdx) continue;
                        var absSpanB =
                            (typeof eb.abs_span === "number" && isFinite(eb.abs_span))
                                ? eb.abs_span
                                : Math.abs(candb - src);
                        if (absSpanB < 8) continue;
                        var simToAnchorB = stalkerLookupSimilarity(candb, targetIdx, settings);
                        var edgeSimB = (typeof eb.similarity === "number") ? eb.similarity : 0;
                        var newDistB = absDistance(candb, targetIdx);
                        var distImproveB = clamp01((baseDist - newDistB) / 32);
                        var scoreB = 0.65 * simToAnchorB + 0.25 * edgeSimB + 0.1 * distImproveB;
                        if (scoreB > bestScore) {
                            bestScore = scoreB;
                            best = candb;
                        }
                    }
                }
            }
        }
        return best;
    }

    function computeProposedNext(targetIdx) {
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }

        // If we're currently being pulled, keep stepping toward the destination.
        if (pullStepsLeft > 0 && typeof pullDestIndex === "number") {
            var step = pullStepToward(pullDestIndex);
            pullStepsLeft -= 1;
            if (step !== null && step !== currentIndex) {
                return step;
            }
            // If we can't find a step (or we're already there), end the pull.
            pullStepsLeft = 0;
            pullDestIndex = null;
        }

        if (cooldownLeft > 0) {
            cooldownLeft -= 1;
            return nextLinear;
        }

        if (currentIndex === targetIdx) {
            beatsAway = 0;
            simStreak = 0;
            pullStepsLeft = 0;
            pullDestIndex = null;
            return nextLinear;
        }

        beatsAway += 1;
        if (beatsAway < (settings.armBeats || 0)) {
            return nextLinear;
        }

        // Don't yank back immediately; require some real distance from the anchor first.
        var minDistance = Math.max(12, Math.round((settings.armBeats || 0) * 4));
        if (absDistance(currentIndex, targetIdx) < minDistance) {
            return nextLinear;
        }

        var threshold = settings.similarityThreshold || 0.85;
        var sim = stalkerLookupSimilarity(currentIndex, targetIdx, settings);
        if (sim >= threshold) {
            simStreak += 1;
        } else {
            simStreak = 0;
        }

        // Require sustained similarity before applying pull.
        if (simStreak < 3) {
            return nextLinear;
        }

        var strength = clamp01((sim - threshold) / Math.max(0.001, (1 - threshold)));
        // Ramp pull chance up with time away, but keep it subtle.
        var awayFactor = clamp01((beatsAway - (settings.armBeats || 0)) / 24);
        var pullProb = Math.min(0.3, 0.06 + 0.18 * strength * (0.35 + 0.65 * awayFactor));
        if (Math.random() > pullProb) {
            return nextLinear;
        }

        // Start a multi-step suction sequence toward a pre-roll near the anchor.
        var destIdx = computeReentryIndex(targetIdx);
        startPullSequence(destIdx, strength);
        var first = pullStepToward(destIdx);
        if (first !== null && first !== currentIndex) {
            // Only start cooldown once we've committed to a pull.
            cooldownLeft = settings.cooldownBeats || 0;
            beatsAway = 0;
            simStreak = 0;
            pullStepsLeft = Math.max(0, pullStepsLeft - 1);
            return first;
        } else {
            pullStepsLeft = 0;
            pullDestIndex = null;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        var targetIdx = ensureStalkerTarget(currentIndex);
        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        var simNow = stalkerLookupSimilarity(currentIndex, targetIdx, settings);
        notifyStackOnBeat({
            mode: modeName,
            currentIndex: currentIndex,
            beat: q,
            targetIndex: targetIdx,
            similarityToTarget: simNow
        });
        var delay = player.playQ(q);

        var proposed = computeProposedNext(targetIdx);
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: proposed === targetIdx ? "gravity" : "sequential"
        });

        if (nextIdx !== currentIndex + 1) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeStalkerSettings(customSettings, ADVANCED_DEFAULTS.stalker);
        cooldownLeft = 0;
        beatsAway = 0;
        simStreak = 0;
        pullStepsLeft = 0;
        pullDestIndex = null;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getStalkerSettings());
            currentIndex = 0;
            ensureStalkerTarget(currentIndex);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            ensureStalkerTarget(currentIndex);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            ensureStalkerTarget(currentIndex);
            cooldownLeft = 0;
            beatsAway = 0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// ===== Timbre Surfing (The Texture Drone) =====
function sanitizeTimbreSurfingSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.timbreSurfing || {};
    var out = cloneSettings(defaults);

    var topK = coerceNumber(input.topK);
    if (topK === null) topK = defaults.topK;
    out.topK = clampNumber(Math.round(topK), 1, 16);

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0.0, 0.999);

    var minSpan = coerceNumber(input.minJumpSpanBeats);
    if (minSpan === null) minSpan = defaults.minJumpSpanBeats;
    out.minJumpSpanBeats = clampNumber(Math.round(minSpan), 0, 256);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var temp = coerceNumber(input.temperature);
    if (temp === null) temp = defaults.temperature;
    out.temperature = clampNumber(temp, 0.03, 1.5);

    var recent = coerceNumber(input.recentWindowBeats);
    if (recent === null) recent = defaults.recentWindowBeats;
    out.recentWindowBeats = clampNumber(Math.round(recent), 0, 512);

    var penalty = coerceNumber(input.repeatPenalty);
    if (penalty === null) penalty = defaults.repeatPenalty;
    out.repeatPenalty = clampNumber(penalty, 0.0, 1.0);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0.0, 1.0);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getTimbreSurfingSettings() {
    var useAdvanced = isAdvancedGroupEnabled("timbreSurfing");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("timbreSurfing") : cloneAdvancedDefaults("timbreSurfing");
    return sanitizeTimbreSurfingSettings(settings, ADVANCED_DEFAULTS.timbreSurfing);
}

var timbreSurfCache = {
    key: null,
    timbres: null
};

function getTimbreSurfState() {
    if (!masterQs || !masterQs.length) return { timbres: [] };
    var key = (curTrack && curTrack.id ? curTrack.id : "") + ":" + masterQs.length;
    if (timbreSurfCache.key === key && timbreSurfCache.timbres) {
        return timbreSurfCache;
    }
    timbreSurfCache.key = key;
    timbreSurfCache.timbres = computeBeatTimbreVectors(masterQs);
    return timbreSurfCache;
}

function timbreSurfPickByTimbre(currentIndex, settings, recentSet, recentCounts, state) {
    if (!state || !state.timbres || !state.timbres.length) return null;
    var timbres = state.timbres;
    if (currentIndex < 0 || currentIndex >= timbres.length) return null;
    var curTimbre = timbres[currentIndex];
    if (!curTimbre) return null;

    var n = timbres.length;
    var excludeNeighbors = settings.excludeNeighborBeats || 0;
    var minSpan = settings.minJumpSpanBeats || 0;
    var topK = settings.topK || 5;
    var sampleCount = Math.min(n, Math.max(80, Math.round(n * 0.25)));
    sampleCount = Math.min(sampleCount, 180);

    var candidates = [];
    if (n <= sampleCount) {
        for (var i = 0; i < n; i++) candidates.push(i);
    } else {
        var seen = Object.create(null);
        var attempts = 0;
        while (candidates.length < sampleCount && attempts < sampleCount * 6) {
            attempts += 1;
            var idx = Math.floor(Math.random() * n);
            if (seen[idx]) continue;
            seen[idx] = true;
            candidates.push(idx);
        }
    }

    var scored = [];
    for (var c = 0; c < candidates.length; c++) {
        var idx = candidates[c];
        if (idx === currentIndex) continue;
        var span = Math.abs(idx - currentIndex);
        if (span < minSpan) continue;
        if (excludeNeighbors > 0 && span <= excludeNeighbors) continue;
        var tv = timbres[idx];
        if (!tv) continue;
        var dist = euclidean_distance(curTimbre, tv);
        if (!isFinite(dist)) continue;
        var score = -(dist / 80);
        if (recentSet && recentSet[idx]) score -= 0.2;
        if (recentCounts && recentCounts[idx]) score -= 0.08 * recentCounts[idx];
        score += (Math.random() - 0.5) * 0.002;
        scored.push({ idx: idx, score: score });
    }
    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.max(1, Math.min(topK, scored.length)));
    if (pool.length === 1) return pool[0].idx;

    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var totalWeight = 0;
    for (var wIdx = 0; wIdx < pool.length; wIdx++) {
        var w = Math.exp((pool[wIdx].score - maxScore) / temperature);
        weights[wIdx] = w;
        totalWeight += w;
    }
    var r = Math.random() * totalWeight;
    for (var pick = 0; pick < pool.length; pick++) {
        r -= weights[pick];
        if (r <= 0) {
            return pool[pick].idx;
        }
    }
    return pool[0].idx;
}

function timbreSurfChooseNextIndex(currentIndex, settings, history) {
    settings = sanitizeTimbreSurfingSettings(settings, ADVANCED_DEFAULTS.timbreSurfing);
    history = Array.isArray(history) ? history : [];
    if (!masterQs || !masterQs.length) return null;
    if (!serverLoopCandidateMap) return null;

    var timbreState = getTimbreSurfState();
    var excludeNeighbors = settings.excludeNeighborBeats || 0;
    var minSpan = settings.minJumpSpanBeats || 0;
    var minSim = settings.minSimilarity || 0;
    var topK = settings.topK || 5;
    var recentWindow = settings.recentWindowBeats || 0;
    var repeatPenalty = settings.repeatPenalty || 0;
    var fallbackRadius = 6;

    var recentCounts = Object.create(null);
    var windowSlice = [];
    if (history.length) {
        windowSlice = (recentWindow > 0)
            ? history.slice(Math.max(0, history.length - recentWindow))
            : history.slice(Math.max(0, history.length - 24));
    }
    for (var h = 0; h < windowSlice.length; h++) {
        var idx = windowSlice[h];
        recentCounts[idx] = (recentCounts[idx] || 0) + 1;
    }
    var recentUniqueRatio = windowSlice.length
        ? (Object.keys(recentCounts).length / Math.max(1, windowSlice.length))
        : 1;
    var recentSet = Object.create(null);
    var edgeCounts = Object.create(null);
    for (var hs = 0; hs < windowSlice.length; hs++) {
        recentSet[windowSlice[hs]] = true;
        if (hs > 0) {
            var a = windowSlice[hs - 1];
            var b = windowSlice[hs];
            var kEdge = a + ":" + b;
            edgeCounts[kEdge] = (edgeCounts[kEdge] || 0) + 1;
        }
    }
    var prevIdx = (history.length >= 2) ? history[history.length - 2] : null;
    var prev2Idx = (history.length >= 3) ? history[history.length - 3] : null;
    var prev3Idx = (history.length >= 4) ? history[history.length - 4] : null;
    var backtrackPenalty = Math.max(0.75, repeatPenalty * 4);
    var nearPenalty = Math.max(0.35, repeatPenalty * 2);
    var edgeRepeatPenalty = Math.max(0.2, repeatPenalty * 1.5);
    var forceTimbreFallback = recentUniqueRatio < 0.45;

    function collectCandidateEdges(useFallback) {
        var out = [];
        var direct = serverLoopCandidateMap[currentIndex] || [];
        for (var d = 0; d < direct.length; d++) {
            if (!direct[d]) continue;
            out.push(Object.assign({ sourceOffset: 0 }, direct[d]));
        }
        if (!useFallback) return out;
        for (var r = 1; r <= fallbackRadius; r++) {
            var left = currentIndex - r;
            var right = currentIndex + r;
            if (left >= 0 && serverLoopCandidateMap[left] && serverLoopCandidateMap[left].length) {
                var leftEdges = serverLoopCandidateMap[left];
                for (var li = 0; li < leftEdges.length; li++) {
                    if (!leftEdges[li]) continue;
                    out.push(Object.assign({ sourceOffset: r }, leftEdges[li]));
                }
            }
            if (right < masterQs.length && serverLoopCandidateMap[right] && serverLoopCandidateMap[right].length) {
                var rightEdges = serverLoopCandidateMap[right];
                for (var ri = 0; ri < rightEdges.length; ri++) {
                    if (!rightEdges[ri]) continue;
                    out.push(Object.assign({ sourceOffset: r }, rightEdges[ri]));
                }
            }
        }
        return out;
    }

    function scoreEdges(edges) {
        var scored = [];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (!e) continue;
            var target = e.target;
            if (typeof target !== "number" || !isFinite(target)) continue;
            if (target < 0 || target >= masterQs.length) continue;

            var sim = (typeof e.similarity === "number") ? e.similarity : 0;
            if (sim < minSim) continue;
            var span = Math.abs(target - currentIndex);
            if (span < minSpan) continue;
            if (excludeNeighbors > 0 && span <= excludeNeighbors) continue;

            var s = sim;
            var sameSection = !!(e.section_match || e.sectionMatch || e.sameSection);
            if (!sameSection) s += 0.02;
            if (repeatPenalty > 0 && recentCounts[target]) s -= (recentCounts[target] * repeatPenalty);
            if (recentSet[target]) s -= 0.12;
            var eKey = currentIndex + ":" + target;
            if (edgeCounts[eKey]) s -= (edgeCounts[eKey] * edgeRepeatPenalty);
            if (target === prevIdx) s -= backtrackPenalty;
            if (target === prev2Idx || target === prev3Idx) s -= nearPenalty;
            if (e.sourceOffset) s -= Math.min(0.12, e.sourceOffset * 0.02);

            // Tiny jitter to break ties and reduce deterministic oscillation.
            s += (Math.random() - 0.5) * 0.0005;
            scored.push({ target: target, similarity: sim, score: s });
        }
        return scored;
    }

    var scored = scoreEdges(collectCandidateEdges(false));
    if (!scored.length) {
        scored = scoreEdges(collectCandidateEdges(true));
    }
    if (!scored.length || forceTimbreFallback) {
        var timbrePick = timbreSurfPickByTimbre(currentIndex, settings, recentSet, recentCounts, timbreState);
        if (typeof timbrePick === "number" && isFinite(timbrePick)) {
            return timbrePick;
        }
        if (!scored.length) return null;
    }

    if (!scored.length) return null;
    scored.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return b.similarity - a.similarity;
    });
    var pool = scored.slice(0, Math.max(1, Math.min(topK, scored.length)));
    if (pool.length === 1) return pool[0].target;

    // Softmax pick among topK.
    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var totalWeight = 0;
    for (var wIdx = 0; wIdx < pool.length; wIdx++) {
        var w = Math.exp((pool[wIdx].score - maxScore) / temperature);
        weights[wIdx] = w;
        totalWeight += w;
    }
    var r = Math.random() * totalWeight;
    for (var cIdx = 0; cIdx < pool.length; cIdx++) {
        r -= weights[cIdx];
        if (r <= 0) {
            return pool[cIdx].target;
        }
    }
    return pool[0].target;
}

function createTimbreSurfDriver(player, options) {
    options = options || {};
    var modeName = "timbresurf";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;
    var history = [];

    var settings = sanitizeTimbreSurfingSettings(options, ADVANCED_DEFAULTS.timbreSurfing);

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function computeProposedNext() {
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        history.push(currentIndex);
        if (history.length > 1024) history.shift();

        var proposed = computeProposedNext();
        var nextIdx = proposed;
        var usedSurf = false;
        if (Math.random() < (settings.applyChance || 1.0)) {
            var surfIdx = timbreSurfChooseNextIndex(currentIndex, settings, history);
            if (typeof surfIdx === "number" && isFinite(surfIdx)) {
                nextIdx = surfIdx;
                usedSurf = true;
            }
        }

        nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: nextIdx,
            beat: q,
            proposedReason: usedSurf ? "timbre" : "sequential"
        });

        if (nextIdx !== currentIndex + 1) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeTimbreSurfingSettings(customSettings, ADVANCED_DEFAULTS.timbreSurfing);
        history = [];
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getTimbreSurfingSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            history = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

// Register The Stalker as a stackable gravity layer.
registerStackLayer({
    id: "stalker",
    label: "The Stalker",
    description: "When the song reminds you of the target, it snaps back.",
    factory: function(ctx) {
        var settings = getStalkerSettings();
        var cooldownLeft = 0;
        var beatsAway = 0;
        var simStreak = 0;
        var pullStepsLeft = 0;
        var pullDestIndex = null;

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "stalker") return null;

                if (!masterQs || !masterQs.length) return null;
                var targetIdx = ensureStalkerTarget(meta.currentIndex);
                if (cooldownLeft > 0) {
                    cooldownLeft -= 1;
                    return null;
                }
                if (meta.currentIndex === targetIdx) {
                    beatsAway = 0;
                    simStreak = 0;
                    pullStepsLeft = 0;
                    pullDestIndex = null;
                    return null;
                }
                beatsAway += 1;
                if (beatsAway < (settings.armBeats || 0)) {
                    return null;
                }

                // Only apply subtle gravity to sequential movement; don't override other explicit jumps.
                if (meta.proposedIndex !== meta.currentIndex + 1) {
                    return null;
                }

                // If we're currently being pulled, keep stepping toward the destination.
                if (pullStepsLeft > 0 && typeof pullDestIndex === "number") {
                    pullStepsLeft -= 1;
                    var dist = Math.abs(meta.currentIndex - pullDestIndex);
                    if (dist <= 2) {
                        pullStepsLeft = 0;
                        pullDestIndex = null;
                        return null;
                    }
                    // Prefer a candidate edge that moves closer.
                    var best = null;
                    var bestScore = -Infinity;
                    if (serverLoopCandidateMap) {
                        var edges = serverLoopCandidateMap[meta.currentIndex] || [];
                        for (var ei = 0; ei < edges.length; ei++) {
                            var e = edges[ei];
                            if (!e || typeof e.target !== "number") continue;
                            var cand = e.target;
                            if (cand === meta.currentIndex) continue;
                            var newDist = Math.abs(cand - pullDestIndex);
                            if (newDist >= dist) continue;
                            var simToAnchor = stalkerLookupSimilarity(cand, targetIdx, settings);
                            var edgeSim = (typeof e.similarity === "number") ? e.similarity : 0;
                            var score = 0.7 * simToAnchor + 0.3 * edgeSim;
                            if (score > bestScore) {
                                bestScore = score;
                                best = cand;
                            }
                        }
                    }
                    if (best !== null) {
                        return { index: best };
                    }
                    // Fallback: nudge a small step toward the destination.
                    var dir = pullDestIndex > meta.currentIndex ? 1 : -1;
                    var stepSize = Math.round(dist / Math.max(2, pullStepsLeft + 2));
                    stepSize = clampNumber(stepSize, 4, 18);
                    var next = meta.currentIndex + dir * stepSize;
                    if (dir > 0) next = Math.min(next, pullDestIndex);
                    else next = Math.max(next, pullDestIndex);
                    next = Math.max(0, Math.min(masterQs.length - 1, Math.round(next)));
                    if (next !== meta.currentIndex) {
                        return { index: next };
                    }
                    pullStepsLeft = 0;
                    pullDestIndex = null;
                    return null;
                }

                var minDistance = Math.max(12, Math.round((settings.armBeats || 0) * 4));
                if (Math.abs(meta.currentIndex - targetIdx) < minDistance) {
                    return null;
                }

                var threshold = settings.similarityThreshold || 0.85;
                var sim = stalkerLookupSimilarity(meta.currentIndex, targetIdx, settings);
                if (sim >= threshold) simStreak += 1;
                else simStreak = 0;
                if (simStreak < 3) return null;

                var strength = clamp01((sim - threshold) / Math.max(0.001, (1 - threshold)));
                var awayFactor = clamp01((beatsAway - (settings.armBeats || 0)) / 24);
                var pullProb = Math.min(0.3, 0.06 + 0.18 * strength * (0.35 + 0.65 * awayFactor));
                if (Math.random() > pullProb) return null;

                // Start a multi-step suction sequence toward a pre-roll near the anchor.
                pullDestIndex = Math.max(0, Math.min(masterQs.length - 1, targetIdx - 4));
                var steps = 2 + Math.floor(strength * 5);
                pullStepsLeft = clampNumber(steps, 2, 8);
                cooldownLeft = settings.cooldownBeats || 0;
                beatsAway = 0;
                simStreak = 0;
                // Next tick will execute the first pull step.
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    cooldownLeft = 0;
                    beatsAway = 0;
                    simStreak = 0;
                    pullStepsLeft = 0;
                    pullDestIndex = null;
                }
            },
            dispose: function() {
                cooldownLeft = 0;
                beatsAway = 0;
                simStreak = 0;
                pullStepsLeft = 0;
                pullDestIndex = null;
            }
        };
    }
});

// Register Timbre Surfing as a stackable texture drift layer.
registerStackLayer({
    id: "timbresurf",
    label: "Timbre Surfing",
    description: "Jump among timbrally similar beats for infinite texture loops.",
    factory: function(ctx) {
        var settings = getTimbreSurfingSettings();
        var history = [];

        function remember(idx) {
            history.push(idx);
            var maxKeep = Math.max(16, Math.round((settings.recentWindowBeats || 0) * 2) + 32);
            if (history.length > maxKeep) {
                history = history.slice(history.length - maxKeep);
            }
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "timbresurf") return null;

                if (Math.random() > (settings.applyChance || 1.0)) {
                    return null;
                }

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;

                // Default: only affect sequential progress unless override is enabled.
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    remember(cur);
                    return null;
                }

                remember(cur);
                var next = timbreSurfChooseNextIndex(cur, settings, history);
                if (typeof next === "number" && isFinite(next)) {
                    return { index: next };
                }
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    history = [];
                }
            },
            dispose: function() {
                history = [];
            }
        };
    }
});

// ===== Chroma Stacking (The Wall of Sound) =====
function sanitizeChromaStackingSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.chromaStacking || {};
    var out = cloneSettings(defaults);

    var overlayGain = coerceNumber(input.overlayGain);
    if (overlayGain === null) overlayGain = defaults.overlayGain;
    out.overlayGain = clamp01(overlayGain);

    var minChroma = coerceNumber(input.minChromaSimilarity);
    if (minChroma === null) minChroma = defaults.minChromaSimilarity;
    out.minChromaSimilarity = clampNumber(minChroma, 0.2, 0.999);

    var minTimbre = coerceNumber(input.minTimbreDistance);
    if (minTimbre === null) minTimbre = defaults.minTimbreDistance;
    out.minTimbreDistance = clampNumber(minTimbre, 0, 300);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var minSpan = coerceNumber(input.minJumpSpanBeats);
    if (minSpan === null) minSpan = defaults.minJumpSpanBeats;
    out.minJumpSpanBeats = clampNumber(Math.round(minSpan), 0, 256);

    var searchTopK = coerceNumber(input.searchTopK);
    if (searchTopK === null) searchTopK = defaults.searchTopK;
    out.searchTopK = clampNumber(Math.round(searchTopK), 1, 32);

    var randomSample = coerceNumber(input.randomSample);
    if (randomSample === null) randomSample = defaults.randomSample;
    out.randomSample = clampNumber(Math.round(randomSample), 0, 256);

    var temperature = coerceNumber(input.temperature);
    if (temperature === null) temperature = defaults.temperature;
    out.temperature = clampNumber(temperature, 0.03, 1.5);

    var resampleBeats = coerceNumber(input.resampleBeats);
    if (resampleBeats === null) resampleBeats = defaults.resampleBeats;
    out.resampleBeats = clampNumber(Math.round(resampleBeats), 1, 64);

    return out;
}

function getChromaStackingSettings() {
    var useAdvanced = isAdvancedGroupEnabled("chromaStacking");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("chromaStacking") : cloneAdvancedDefaults("chromaStacking");
    return sanitizeChromaStackingSettings(settings, ADVANCED_DEFAULTS.chromaStacking);
}

function createSliceOverlayHead(player, trackRef, options) {
    options = options || {};
    var ctx = (player && typeof player.getContext === "function") ? player.getContext() : null;
    if (!ctx) return null;
    var buffer =
        (trackRef && trackRef.buffer) ||
        (masterQs && masterQs.length && masterQs[0] && masterQs[0].track && masterQs[0].track.buffer) ||
        null;
    if (!buffer) return null;

    var master = ctx.createGain();
    master.gain.value = clamp01(options.gain != null ? options.gain : 0.7);
    master.connect(ctx.destination);
    var active = null;

    function stopActive(fadeSeconds) {
        if (!active) return;
        try {
            var now = ctx.currentTime;
            var fade = Math.max(0.005, fadeSeconds || 0.02);
            try {
                active.gain.gain.cancelScheduledValues(now);
                active.gain.gain.setValueAtTime(active.gain.gain.value, now);
                active.gain.gain.linearRampToValueAtTime(0.0, now + fade);
            } catch (e) {}
            try {
                active.source.stop(now + fade + 0.01);
            } catch (e2) {
                try { active.source.stop(); } catch (e3) {}
            }
        } catch (e4) {}
        active = null;
    }

    function playSlice(offsetSeconds, durationSeconds, playbackRate) {
        if (!buffer) return;
        if (typeof window !== "undefined" && window.harmonizerBaseAudioOnly) {
            stopActive(0.02);
            return;
        }
        var offset = Math.max(0, offsetSeconds || 0);
        var dur = Math.max(0.02, durationSeconds || 0.1);
        if (offset >= buffer.duration) return;
        dur = Math.min(dur, Math.max(0.02, buffer.duration - offset));

        stopActive(0.015);

        var src = ctx.createBufferSource();
        src.buffer = buffer;
        try {
            src.playbackRate.value = (typeof playbackRate === "number" && isFinite(playbackRate)) ? playbackRate : 1.0;
        } catch (e) {}
        var g = ctx.createGain();
        g.gain.value = 0.0;
        src.connect(g);
        g.connect(master);
        var now = ctx.currentTime;
        try {
            g.gain.setValueAtTime(0.0, now);
            g.gain.linearRampToValueAtTime(1.0, now + 0.015);
        } catch (e2) {
            g.gain.value = 1.0;
        }
        try {
            src.start(0, offset, dur + 0.02);
        } catch (e3) {
            try { src.start(0, offset); } catch (e4) {}
        }
        active = { source: src, gain: g };
    }

    return {
        playSlice: playSlice,
        setGain: function(v) {
            try { master.gain.value = clamp01(v); } catch (e) {}
        },
        stop: function() {
            stopActive(0.02);
        }
    };
}

function buildChromaStackState(beats, settings) {
    beats = beats || [];
    settings = sanitizeChromaStackingSettings(settings, ADVANCED_DEFAULTS.chromaStacking);
    var chromas = computeBeatChromaVectors(beats);
    var timbres = computeBeatTimbreVectors(beats);
    var pitchClasses = new Array(beats.length);
    var buckets = new Array(12);
    for (var i = 0; i < 12; i++) buckets[i] = [];
    for (var b = 0; b < beats.length; b++) {
        var pc = chromas[b] ? dominantPitchClass(chromas[b]) : 0;
        pitchClasses[b] = pc;
        buckets[pc].push(b);
    }
    return {
        chromas: chromas,
        timbres: timbres,
        pitchClasses: pitchClasses,
        buckets: buckets
    };
}

function pickChromaStackOverlayIndex(curIdx, state, settings) {
    if (!state || !state.chromas || !state.chromas.length) return null;
    if (typeof curIdx !== "number" || !isFinite(curIdx)) return null;
    curIdx = Math.max(0, Math.min(state.chromas.length - 1, Math.round(curIdx)));
    var curChroma = state.chromas[curIdx];
    var curTimbre = state.timbres[curIdx];
    if (!curChroma || !curTimbre) return null;

    var excludeNeighbors = settings.excludeNeighborBeats || 0;
    var minSpan = settings.minJumpSpanBeats || 0;
    var minChroma = settings.minChromaSimilarity || 0.85;
    var minTimbre = settings.minTimbreDistance || 0;
    var searchTopK = settings.searchTopK || 10;
    var randomSample = settings.randomSample || 0;

    var candidates = [];
    var seen = Object.create(null);

    var edges = serverLoopCandidateMap ? (serverLoopCandidateMap[curIdx] || []) : [];
    for (var i = 0; i < edges.length && candidates.length < searchTopK; i++) {
        var e = edges[i];
        if (!e || typeof e.target !== "number") continue;
        var t = e.target;
        if (t < 0 || t >= state.chromas.length) continue;
        if (!seen[t]) {
            candidates.push(t);
            seen[t] = true;
        }
    }

    if (randomSample > 0 && state.buckets && state.pitchClasses) {
        var pc = state.pitchClasses[curIdx] || 0;
        var bucket = state.buckets[pc] || [];
        var tries = 0;
        var want = Math.min(randomSample, Math.max(0, bucket.length));
        while (candidates.length < (searchTopK + want) && tries < want * 4 && bucket.length) {
            tries += 1;
            var r = bucket[Math.floor(Math.random() * bucket.length)];
            if (r === curIdx) continue;
            if (!seen[r]) {
                candidates.push(r);
                seen[r] = true;
            }
        }
    }

    if (!candidates.length) return null;

    var scored = [];
    for (var c = 0; c < candidates.length; c++) {
        var idx = candidates[c];
        var span = Math.abs(idx - curIdx);
        if (excludeNeighbors > 0 && span <= excludeNeighbors) continue;
        if (span < minSpan) continue;
        var chromaSim = chromaDotSimilarity(curChroma, state.chromas[idx]);
        if (chromaSim < minChroma) continue;
        var tdist = euclidean_distance(curTimbre, state.timbres[idx]);
        if (tdist < minTimbre) continue;
        var score = chromaSim + 0.0025 * Math.min(200, Math.max(0, tdist));
        scored.push({ idx: idx, score: score });
    }

    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.min(8, scored.length));
    if (pool.length === 1) return pool[0].idx;

    var temperature = settings.temperature || 0.2;
    var maxScore = pool[0].score;
    var weights = [];
    var totalWeight = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        totalWeight += ww;
    }
    var rr = Math.random() * totalWeight;
    for (var pick = 0; pick < pool.length; pick++) {
        rr -= weights[pick];
        if (rr <= 0) {
            return pool[pick].idx;
        }
    }
    return pool[0].idx;
}

function createChromaStackDriver(player, options) {
    options = options || {};
    var modeName = "chromastack";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");
    var currentIndex = 0;

    var settings = sanitizeChromaStackingSettings(options, ADVANCED_DEFAULTS.chromaStacking);
    var state = null;
    var overlayHead = null;
    var overlayIndex = null;
    var overlayHold = 0;
    var lastOverlayIndex = null;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildChromaStackState(masterQs, settings);
        }
        if (!overlayHead) {
            overlayHead = createSliceOverlayHead(player, curTrack || (masterQs[0] ? masterQs[0].track : null), { gain: settings.overlayGain });
        }
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        if (overlayHead) overlayHead.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        if (overlayHead) overlayHead.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function maybePickOverlay() {
        if (overlayHold > 0 && overlayIndex !== null) {
            overlayHold -= 1;
            return overlayIndex;
        }
        var idx = pickChromaStackOverlayIndex(currentIndex, state, settings);
        if (typeof idx === "number" && isFinite(idx)) {
            overlayIndex = idx;
            overlayHold = Math.max(0, (settings.resampleBeats || 1) - 1);
            return overlayIndex;
        }
        overlayIndex = null;
        overlayHold = 0;
        return null;
    }

    function computeProposedNext() {
        var nextLinear = currentIndex + 1;
        if (nextLinear >= masterQs.length) {
            return window.harmonizerLoopEnabled ? 0 : nextLinear;
        }
        return nextLinear;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (autoPlayNext && playNextInQueue()) {
                return;
            }
            stop();
            return;
        }

        ensureState();

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        var chosenOverlay = maybePickOverlay();
        var overlayBeat = (typeof chosenOverlay === "number" && masterQs[chosenOverlay]) ? masterQs[chosenOverlay] : null;
        if (overlayBeat && overlayBeat.tile) {
            overlayBeat.tile.highlight2("rgba(168, 88, 255, 0.85)");
        }

        if (overlayHead && overlayBeat) {
            overlayHead.setGain(settings.overlayGain || 0.7);
            var rate = (player && typeof player.getSpeedFactor === "function") ? player.getSpeedFactor() : 1.0;
            overlayHead.playSlice(overlayBeat.start || 0, q.duration || 0.25, rate);
        }

        if (typeof chosenOverlay === "number" && lastOverlayIndex !== null && chosenOverlay !== lastOverlayIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(lastOverlayIndex, chosenOverlay, true);
            }
        }
        lastOverlayIndex = (typeof chosenOverlay === "number") ? chosenOverlay : lastOverlayIndex;

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, overlayIndex: chosenOverlay });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "sequential"
        });

        if (nextIdx !== currentIndex + 1) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeChromaStackingSettings(customSettings, ADVANCED_DEFAULTS.chromaStacking);
        state = null;
        overlayIndex = null;
        overlayHold = 0;
        lastOverlayIndex = null;
        if (overlayHead) {
            overlayHead.setGain(settings.overlayGain || 0.7);
        }
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getChromaStackingSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            overlayIndex = null;
            overlayHold = 0;
            lastOverlayIndex = null;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "chromastack",
    label: "Chroma Stacking",
    description: "Overlay harmonically-matching beats with contrasting timbre.",
    factory: function(ctx) {
        var player = driver && driver.player ? driver.player : null;
        if (!player || typeof player.getContext !== "function") return null;
        var settings = getChromaStackingSettings();
        var state = buildChromaStackState(ctx && ctx.beats ? ctx.beats : masterQs, settings);
        var overlayHead = createSliceOverlayHead(player, ctx && ctx.track ? ctx.track : curTrack, { gain: settings.overlayGain });
        if (!overlayHead) return null;
        var hold = 0;
        var overlayIndex = null;

        function maybePick(curIdx) {
            if (hold > 0 && overlayIndex !== null) {
                hold -= 1;
                return overlayIndex;
            }
            var idx = pickChromaStackOverlayIndex(curIdx, state, settings);
            if (typeof idx === "number" && isFinite(idx)) {
                overlayIndex = idx;
                hold = Math.max(0, (settings.resampleBeats || 1) - 1);
                return overlayIndex;
            }
            overlayIndex = null;
            hold = 0;
            return null;
        }

        return {
            onBeat: function(meta) {
                if (!meta || !meta.beat) return;
                if ((meta.mode || "").toLowerCase() === "chromastack") return;
                var curIdx = typeof meta.currentIndex === "number" ? meta.currentIndex : (meta.beat.which || 0);
                var idx = maybePick(curIdx);
                if (idx === null || idx === undefined) return;
                var beat = (masterQs && masterQs[idx]) ? masterQs[idx] : null;
                if (!beat) return;
                overlayHead.setGain(settings.overlayGain || 0.7);
                var rate = (player && typeof player.getSpeedFactor === "function") ? player.getSpeedFactor() : 1.0;
                overlayHead.playSlice(beat.start || 0, (meta.beat && meta.beat.duration) || 0.25, rate);
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    hold = 0;
                    overlayIndex = null;
                    overlayHead.stop();
                }
            },
            dispose: function() {
                hold = 0;
                overlayIndex = null;
                overlayHead.stop();
            }
        };
    }
});

// ===== Beat Sorting (Deconstruction) =====
function sanitizeBeatSortingSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.beatSorting || {};
    var out = cloneSettings(defaults);

    var feature = coerceNumber(input.feature);
    if (feature === null) feature = defaults.feature;
    out.feature = clampNumber(Math.round(feature), 0, 2); // 0=pitch, 1=brightness, 2=loudness

    var direction = coerceNumber(input.direction);
    if (direction === null) direction = defaults.direction;
    out.direction = direction >= 1 ? 1 : 0; // 0=asc, 1=desc

    var minVolume = coerceNumber(input.minVolume);
    if (minVolume === null) minVolume = defaults.minVolume;
    out.minVolume = clampNumber(minVolume, 0, 1);

    var repeatEach = coerceNumber(input.repeatEach);
    if (repeatEach === null) repeatEach = defaults.repeatEach;
    out.repeatEach = clampNumber(Math.round(repeatEach), 1, 16);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getBeatSortingSettings() {
    var useAdvanced = isAdvancedGroupEnabled("beatSorting");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("beatSorting") : cloneAdvancedDefaults("beatSorting");
    return sanitizeBeatSortingSettings(settings, ADVANCED_DEFAULTS.beatSorting);
}

function buildBeatSortingState(beats, settings) {
    settings = sanitizeBeatSortingSettings(settings, ADVANCED_DEFAULTS.beatSorting);
    beats = beats || [];
    var n = beats.length;
    var values = new Array(n);
    var raw = new Array(n);
    var energyRaw = new Array(n);

    var chromas = null;
    var timbres = null;

    if (settings.feature === 0) {
        chromas = computeBeatChromaVectors(beats);
    } else if (settings.feature === 1) {
        timbres = computeBeatTimbreVectors(beats);
    }

    var minV = Infinity;
    var maxV = -Infinity;
    var minE = Infinity;
    var maxE = -Infinity;
    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var energy = beatEnergy(b);
        if (!isFinite(energy)) energy = 0;
        energyRaw[i] = energy;
        if (energy < minE) minE = energy;
        if (energy > maxE) maxE = energy;
        var v = 0;
        if (settings.feature === 2) {
            v = energy;
        } else if (settings.feature === 1) {
            var tv = timbres && timbres[i] ? timbres[i] : null;
            v = tv ? (tv[1] || 0) : 0;
        } else {
            var cv = chromas && chromas[i] ? chromas[i] : null;
            if (cv) {
                var sum = 0;
                var wsum = 0;
                for (var p = 0; p < 12; p++) {
                    var w = cv[p] || 0;
                    wsum += w;
                    sum += w * p;
                }
                v = wsum > 0 ? (sum / wsum) : 0;
            } else {
                v = 0;
            }
        }
        if (!isFinite(v)) v = 0;
        raw[i] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }

    var range = maxV - minV;
    if (!isFinite(range) || range <= 1e-9) range = 1;
    for (var j = 0; j < n; j++) {
        values[j] = (raw[j] - minV) / range;
        if (!isFinite(values[j])) values[j] = 0;
        values[j] = clamp01(values[j]);
    }

    var order = [];
    var minVol = settings.minVolume || 0;
    var energy01 = new Array(n);
    var eRange = maxE - minE;
    if (!isFinite(eRange) || eRange <= 1e-9) eRange = 1;
    for (var k = 0; k < n; k++) {
        energy01[k] = clamp01((energyRaw[k] - minE) / eRange);
        if (energy01[k] < minVol) {
            continue;
        }
        order.push(k);
    }
    if (!order.length && n) {
        // Avoid a dead/no-op state if volume units differ (e.g., dB loudness).
        for (var kk = 0; kk < n; kk++) order.push(kk);
    }

    order.sort(function(a, b) {
        var va = values[a];
        var vb = values[b];
        if (va === vb) return a - b;
        return settings.direction >= 1 ? (vb - va) : (va - vb);
    });

    var posByIndex = Object.create(null);
    for (var z = 0; z < order.length; z++) {
        posByIndex[order[z]] = z;
    }

    return {
        feature: settings.feature,
        direction: settings.direction,
        values: values,
        energy01: energy01,
        order: order,
        posByIndex: posByIndex
    };
}

function createBeatSortingDriver(player, options) {
    options = options || {};
    var modeName = "beatsort";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeBeatSortingSettings(options, ADVANCED_DEFAULTS.beatSorting);
    var state = null;
    var orderPos = 0;
    var repeatLeft = 0;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildBeatSortingState(masterQs, settings);
            orderPos = 0;
            repeatLeft = Math.max(0, (settings.repeatEach || 1) - 1);
        }
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function currentIndex() {
        ensureState();
        if (!state.order.length) return 0;
        var pos = Math.max(0, Math.min(state.order.length - 1, orderPos));
        return state.order[pos];
    }

    function advancePosition() {
        ensureState();
        if (repeatLeft > 0) {
            repeatLeft -= 1;
            return;
        }
        orderPos += 1;
        repeatLeft = Math.max(0, (settings.repeatEach || 1) - 1);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        ensureState();

        if (!state.order.length) {
            stop();
            return;
        }

        if (orderPos >= state.order.length) {
            if (window.harmonizerLoopEnabled) {
                orderPos = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var idx = currentIndex();
        var q = masterQs[idx];
        if (!q) {
            orderPos = Math.max(0, Math.min(state.order.length - 1, orderPos + 1));
            scheduleNext(0.25);
            return;
        }

        // Play audio first; UI can fail safely without muting the mode.
        var delay = player.playQ(q);
        try {
            if (q.tile && typeof q.tile.highlight === "function") {
                q.tile.highlight();
            }
            updateCursors(q);
            mtime.text(fmtTime(q.start));
            pulseNotes(q.median_volume || q.volume || baseNoteStrength);
        } catch (uiErr) {}

        try {
            notifyStackOnBeat({ mode: modeName, currentIndex: idx, beat: q, sortPos: orderPos, sortValue: state.values[idx] });
        } catch (stackErr) {}

        var proposed = idx; // will be overridden below
        advancePosition();
        if (orderPos < state.order.length) {
            proposed = state.order[orderPos];
        } else {
            proposed = window.harmonizerLoopEnabled ? state.order[0] : masterQs.length;
        }

        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: idx,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "beatsort"
        });

        // If a stack layer changes the next beat, sync our cursor to it.
        if (nextIdx !== proposed && state.posByIndex && state.posByIndex[nextIdx] !== undefined) {
            orderPos = state.posByIndex[nextIdx];
            repeatLeft = Math.max(0, (settings.repeatEach || 1) - 1);
        }

        if (nextIdx !== idx + 1 && nextIdx !== idx) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(idx, nextIdx, false);
            }
        }

        // If nextIdx is beyond track end, let loop/end logic handle it at top.
        if (nextIdx >= 0 && nextIdx < masterQs.length) {
            // Align orderPos if possible.
            if (state.posByIndex && state.posByIndex[nextIdx] !== undefined) {
                orderPos = state.posByIndex[nextIdx];
            }
        } else {
            orderPos = state.order.length;
        }

        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeBeatSortingSettings(customSettings, ADVANCED_DEFAULTS.beatSorting);
        state = null;
        orderPos = 0;
        repeatLeft = 0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getBeatSortingSettings());
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            ensureState();
            var idx = q.which;
            if (state.posByIndex && state.posByIndex[idx] !== undefined) {
                orderPos = state.posByIndex[idx];
            } else {
                orderPos = 0;
            }
            repeatLeft = Math.max(0, (settings.repeatEach || 1) - 1);
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex(); },
        get running() { return running; }
    };
}

// Register Beat Sorting as a stackable reorder layer.
registerStackLayer({
    id: "beatsort",
    label: "Beat Sorting",
    description: "Reorder playback by pitch/brightness/loudness gradients.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getBeatSortingSettings();
        var state = buildBeatSortingState(ctx.beats, settings);
        if (!state || !state.order || !state.order.length) return null;

        var repeatLeft = 0;

        function resetRepeats() {
            repeatLeft = Math.max(0, (settings.repeatEach || 1) - 1);
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "beatsort") return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;

                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    resetRepeats();
                    return null;
                }

                if (repeatLeft > 0) {
                    repeatLeft -= 1;
                    return { index: cur };
                }

                var pos = (state.posByIndex && state.posByIndex[cur] !== undefined) ? state.posByIndex[cur] : null;
                if (pos === null) {
                    resetRepeats();
                    return { index: state.order[0] };
                }

                var nextPos = pos + 1;
                if (nextPos >= state.order.length) {
                    if (window.harmonizerLoopEnabled) {
                        nextPos = 0;
                    } else {
                        resetRepeats();
                        return null;
                    }
                }

                resetRepeats();
                return { index: state.order[nextPos] };
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    repeatLeft = 0;
                }
            },
            dispose: function() {
                repeatLeft = 0;
            }
        };
    }
});

// ===== Reverse Bloom (Drop-to-Rewind) =====
function sanitizeReverseBloomSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.reverseBloom || {};
    var out = cloneSettings(defaults);

    var thr = coerceNumber(input.triggerThreshold);
    if (thr === null) thr = defaults.triggerThreshold;
    out.triggerThreshold = clampNumber(thr, 0, 1);

    var rewindBeats = coerceNumber(input.rewindBeats);
    if (rewindBeats === null) rewindBeats = defaults.rewindBeats;
    out.rewindBeats = clampNumber(Math.round(rewindBeats), 1, 128);

    var chance = coerceNumber(input.rewindChance);
    if (chance === null) chance = defaults.rewindChance;
    out.rewindChance = clampNumber(chance, 0, 1);

    var cooldown = coerceNumber(input.cooldownBeats);
    if (cooldown === null) cooldown = defaults.cooldownBeats;
    out.cooldownBeats = clampNumber(Math.round(cooldown), 0, 256);

    var resumeMode = coerceNumber(input.resumeMode);
    if (resumeMode === null) resumeMode = defaults.resumeMode;
    out.resumeMode = resumeMode >= 1 ? 1 : 0; // 0=linear, 1=similarity hop

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0, 0.999);

    var minSpan = coerceNumber(input.bloomMinSpanBeats);
    if (minSpan === null) minSpan = defaults.bloomMinSpanBeats;
    out.bloomMinSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var topK = coerceNumber(input.bloomTopK);
    if (topK === null) topK = defaults.bloomTopK;
    out.bloomTopK = clampNumber(Math.round(topK), 1, 32);

    var temp = coerceNumber(input.bloomTemperature);
    if (temp === null) temp = defaults.bloomTemperature;
    out.bloomTemperature = clampNumber(temp, 0.03, 1.5);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getReverseBloomSettings() {
    var useAdvanced = isAdvancedGroupEnabled("reverseBloom");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("reverseBloom") : cloneAdvancedDefaults("reverseBloom");
    return sanitizeReverseBloomSettings(settings, ADVANCED_DEFAULTS.reverseBloom);
}

function reverseBloomEnergy01(beat) {
    var e = beatEnergy(beat);
    if (!isFinite(e)) e = 0;
    return clamp01(e);
}

function reverseBloomCrossedThreshold(prev, next, thr) {
    if (!isFinite(prev)) prev = 0;
    if (!isFinite(next)) next = 0;
    if (!isFinite(thr)) thr = 0;
    // A threshold of 0 should make triggering easier, not disable the mode.
    if (thr <= 0) {
        return prev <= 0 && next > 0;
    }
    return prev < thr && next >= thr;
}

function reverseBloomBoostedChance(baseChance, energy, threshold) {
    baseChance = clamp01(baseChance);
    if (!isFinite(energy)) energy = 0;
    if (!isFinite(threshold)) threshold = 0;
    if (energy <= threshold) return baseChance;
    var denom = Math.max(1e-6, 1 - threshold);
    var strength = clamp01((energy - threshold) / denom);
    // Above-threshold drops should be more reliable than a flat coin flip.
    return clamp01(baseChance + strength * (1 - baseChance) * 0.85);
}

function reverseBloomRememberTarget(list, idx, maxKeep) {
    if (!list) list = [];
    list.push(idx);
    if (list.length > maxKeep) {
        list = list.slice(list.length - maxKeep);
    }
    return list;
}

function reverseBloomPickSimilarDrop(anchorIdx, settings, recentTargets) {
    settings = sanitizeReverseBloomSettings(settings, ADVANCED_DEFAULTS.reverseBloom);
    if (!serverLoopCandidateMap || !masterQs || !masterQs.length) return null;
    var edges = serverLoopCandidateMap[anchorIdx] || [];
    if (!edges.length) return null;

    var minSim = settings.minSimilarity || 0;
    var minSpan = settings.bloomMinSpanBeats || 0;
    var scored = [];
    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var targetIdx = Math.round(edge.target);
        if (targetIdx < 0 || targetIdx >= masterQs.length) continue;
        if (targetIdx === anchorIdx) continue;

        var span = Math.abs(targetIdx - anchorIdx);
        if (span < minSpan) continue;

        var simRaw = (typeof edge.similarity === "number") ? edge.similarity : 0;
        var sim = simRaw < 0 ? (simRaw + 1) / 2 : simRaw;
        sim = clamp01(sim);
        if (sim < minSim) continue;

        var recentPenalty = 0;
        if (recentTargets && recentTargets.length) {
            for (var r = 0; r < recentTargets.length; r++) {
                if (recentTargets[r] === targetIdx) {
                    recentPenalty += 0.18;
                }
            }
        }

        var targetBeat = masterQs[targetIdx];
        var energyBonus = targetBeat ? reverseBloomEnergy01(targetBeat) * 0.12 : 0;
        // Candidate edges from the server use `section_match`; locally built edges use `sameSection`.
        // Reward jumping to a different section a bit more for variety.
        var sameSection = !!(edge.section_match || edge.sectionMatch || edge.sameSection);
        var sectionBonus = sameSection ? 0.02 : 0.06;
        var jitter = (Math.random() - 0.5) * settings.bloomTemperature * 0.05;
        var score = sim + energyBonus + sectionBonus + jitter - recentPenalty;
        scored.push({ target: targetIdx, score: score, sim: sim, span: span });
    }
    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });

    var pool = scored.slice(0, Math.max(1, Math.min(settings.bloomTopK || 10, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.bloomTemperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var rr = Math.random() * total;
    for (var j = 0; j < pool.length; j++) {
        rr -= weights[j];
        if (rr <= 0) return pool[j].target;
    }
    return pool[0].target;
}

function createReverseBloomDriver(player, options) {
    options = options || {};
    var modeName = "reversebloom";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeReverseBloomSettings(options, ADVANCED_DEFAULTS.reverseBloom);
    var currentIndex = 0;

    var smoothedEnergy = 0;
    var lastSmoothedEnergy = 0;
    var lastDelta = 0;
    var cooldownLeft = 0;
    var rewindLeft = 0;
    var anchorIndex = null;
    var recentDrops = [];

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function maybeTriggerRewind(beat) {
        if (!beat) return false;
        if (cooldownLeft > 0) {
            cooldownLeft -= 1;
            return false;
        }
        var thr = settings.triggerThreshold || 0;
        var energy = reverseBloomEnergy01(beat);
        lastSmoothedEnergy = smoothedEnergy;
        smoothedEnergy = smoothedEnergy * 0.72 + energy * 0.28;

        var delta = smoothedEnergy - lastSmoothedEnergy;
        var crossed = reverseBloomCrossedThreshold(lastSmoothedEnergy, smoothedEnergy, thr);
        var peaked = lastDelta > 0 && delta <= 0 && smoothedEnergy >= thr;
        lastDelta = delta;
        if (!(crossed || peaked)) return false;

        var effChance = reverseBloomBoostedChance(settings.rewindChance || 0, smoothedEnergy, thr);
        if (Math.random() > effChance) return false;
        if (currentIndex <= 0) return false;

        anchorIndex = currentIndex;
        rewindLeft = Math.min(settings.rewindBeats || 8, currentIndex);
        return rewindLeft > 0;
    }

    function computeProposedNext() {
        if (rewindLeft > 0) {
            if (rewindLeft === 1 && settings.resumeMode >= 1 && anchorIndex !== null) {
                var dropIdx = reverseBloomPickSimilarDrop(anchorIndex, settings, recentDrops);
                if (typeof dropIdx === "number" && isFinite(dropIdx) && dropIdx >= 0 && dropIdx < masterQs.length) {
                    recentDrops = reverseBloomRememberTarget(recentDrops, dropIdx, 10);
                    cooldownLeft = settings.cooldownBeats || 0;
                    rewindLeft = 0;
                    var startIdx = Math.max(0, Math.min(masterQs.length - 1, dropIdx - (settings.rewindBeats || 8)));
                    anchorIndex = null;
                    return startIdx;
                }
            }
            var nextBack = Math.max(0, currentIndex - 1);
            rewindLeft -= 1;
            if (rewindLeft <= 0) {
                cooldownLeft = settings.cooldownBeats || 0;
                anchorIndex = null;
            }
            return nextBack;
        }
        var beat = masterQs[currentIndex];
        if (maybeTriggerRewind(beat)) {
            var next = Math.max(0, currentIndex - 1);
            rewindLeft = Math.max(0, rewindLeft - 1);
            if (rewindLeft <= 0) {
                cooldownLeft = settings.cooldownBeats || 0;
                anchorIndex = null;
            }
            return next;
        }
        return currentIndex + 1;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, rewinding: rewindLeft > 0 });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: rewindLeft > 0 ? "rewind" : "sequential"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeReverseBloomSettings(customSettings, ADVANCED_DEFAULTS.reverseBloom);
        smoothedEnergy = 0;
        lastSmoothedEnergy = 0;
        lastDelta = 0;
        cooldownLeft = 0;
        rewindLeft = 0;
        anchorIndex = null;
        recentDrops = [];
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getReverseBloomSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            smoothedEnergy = 0;
            lastSmoothedEnergy = 0;
            lastDelta = 0;
            cooldownLeft = 0;
            rewindLeft = 0;
            anchorIndex = null;
            recentDrops = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "reversebloom",
    label: "Reverse Bloom",
    description: "On drops, rewind a beat-window then bloom into another.",
    factory: function(ctx) {
        var settings = getReverseBloomSettings();
        var smoothedEnergy = 0;
        var lastSmoothedEnergy = 0;
        var lastDelta = 0;
        var cooldownLeft = 0;
        var rewindLeft = 0;
        var anchorIndex = null;
        var recentDrops = [];

        function updateEnergy(beat) {
            var energy = reverseBloomEnergy01(beat);
            lastSmoothedEnergy = smoothedEnergy;
            smoothedEnergy = smoothedEnergy * 0.72 + energy * 0.28;
            var delta = smoothedEnergy - lastSmoothedEnergy;
            var peaked = lastDelta > 0 && delta <= 0;
            lastDelta = delta;
            return { peaked: peaked };
        }

        function shouldTrigger(curIdx, beat) {
            if (cooldownLeft > 0) {
                cooldownLeft -= 1;
                return false;
            }
            var thr = settings.triggerThreshold || 0;
            var info = updateEnergy(beat);
            var crossed = reverseBloomCrossedThreshold(lastSmoothedEnergy, smoothedEnergy, thr);
            var peaked = !!(info && info.peaked) && smoothedEnergy >= thr;
            if (!(crossed || peaked)) return false;
            var effChance = reverseBloomBoostedChance(settings.rewindChance || 0, smoothedEnergy, thr);
            if (Math.random() > effChance) return false;
            if (curIdx <= 0) return false;
            anchorIndex = curIdx;
            rewindLeft = Math.min(settings.rewindBeats || 8, curIdx);
            return rewindLeft > 0;
        }

        function finishCooldown() {
            cooldownLeft = settings.cooldownBeats || 0;
            rewindLeft = 0;
            anchorIndex = null;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "reversebloom") return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;

                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }

                var beat = meta.beat || (masterQs ? masterQs[cur] : null);
                if (!beat) return null;

                if (rewindLeft > 0) {
                    if (rewindLeft === 1 && settings.resumeMode >= 1 && anchorIndex !== null) {
                        var dropIdx = reverseBloomPickSimilarDrop(anchorIndex, settings, recentDrops);
                        if (typeof dropIdx === "number" && isFinite(dropIdx) && masterQs && dropIdx >= 0 && dropIdx < masterQs.length) {
                            recentDrops = reverseBloomRememberTarget(recentDrops, dropIdx, 10);
                            finishCooldown();
                            var startIdx = Math.max(0, Math.min(masterQs.length - 1, dropIdx - (settings.rewindBeats || 8)));
                            return { index: startIdx };
                        }
                    }
                    rewindLeft -= 1;
                    if (rewindLeft <= 0) {
                        finishCooldown();
                    }
                    return { index: Math.max(0, cur - 1) };
                }

                if (shouldTrigger(cur, beat)) {
                    rewindLeft = Math.max(0, rewindLeft - 1);
                    if (rewindLeft <= 0) {
                        finishCooldown();
                    }
                    return { index: Math.max(0, cur - 1) };
                }
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    smoothedEnergy = 0;
                    lastSmoothedEnergy = 0;
                    lastDelta = 0;
                    cooldownLeft = 0;
                    rewindLeft = 0;
                    anchorIndex = null;
                    recentDrops = [];
                }
            },
            dispose: function() {
                smoothedEnergy = 0;
                lastSmoothedEnergy = 0;
                lastDelta = 0;
                cooldownLeft = 0;
                rewindLeft = 0;
                anchorIndex = null;
                recentDrops = [];
            }
        };
    }
});

// ===== Barber Pole (Infinite Rising/Descending) =====
function sanitizeBarberPoleSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.barberPole || {};
    var out = cloneSettings(defaults);

    var feature = coerceNumber(input.feature);
    if (feature === null) feature = defaults.feature;
    out.feature = clampNumber(Math.round(feature), 0, 2); // 0=loudness, 1=brightness, 2=pitch

    var direction = coerceNumber(input.direction);
    if (direction === null) direction = defaults.direction;
    out.direction = direction >= 1 ? 1 : 0; // 0=down, 1=up

    var stepRanks = coerceNumber(input.stepRanks);
    if (stepRanks === null) stepRanks = defaults.stepRanks;
    out.stepRanks = clampNumber(Math.round(stepRanks), 1, 64);

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0, 0.999);

    var minVolume = coerceNumber(input.minVolume);
    if (minVolume === null) minVolume = defaults.minVolume;
    out.minVolume = clampNumber(minVolume, 0, 1);

    var minSpan = coerceNumber(input.minSpanBeats);
    if (minSpan === null) minSpan = defaults.minSpanBeats;
    out.minSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var topK = coerceNumber(input.topK);
    if (topK === null) topK = defaults.topK;
    out.topK = clampNumber(Math.round(topK), 1, 32);

    var temperature = coerceNumber(input.temperature);
    if (temperature === null) temperature = defaults.temperature;
    out.temperature = clampNumber(temperature, 0.03, 1.5);

    var recentWindowBeats = coerceNumber(input.recentWindowBeats);
    if (recentWindowBeats === null) recentWindowBeats = defaults.recentWindowBeats;
    out.recentWindowBeats = clampNumber(Math.round(recentWindowBeats), 0, 256);

    var repeatPenalty = coerceNumber(input.repeatPenalty);
    if (repeatPenalty === null) repeatPenalty = defaults.repeatPenalty;
    out.repeatPenalty = clampNumber(repeatPenalty, 0, 1);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0, 1);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getBarberPoleSettings() {
    var useAdvanced = isAdvancedGroupEnabled("barberPole");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("barberPole") : cloneAdvancedDefaults("barberPole");
    return sanitizeBarberPoleSettings(settings, ADVANCED_DEFAULTS.barberPole);
}

function buildBarberPoleState(beats, settings) {
    settings = sanitizeBarberPoleSettings(settings, ADVANCED_DEFAULTS.barberPole);
    beats = beats || [];
    var n = beats.length;
    var values = new Array(n);
    var raw = new Array(n);
    var energyRaw = new Array(n);

    var chromas = null;
    var timbres = null;
    if (settings.feature === 2) {
        chromas = computeBeatChromaVectors(beats);
    } else if (settings.feature === 1) {
        timbres = computeBeatTimbreVectors(beats);
    }

    var minV = Infinity;
    var maxV = -Infinity;
    var minE = Infinity;
    var maxE = -Infinity;
    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var e = beatEnergy(b);
        if (!isFinite(e)) e = 0;
        energyRaw[i] = e;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        var v = 0;
        if (settings.feature === 0) {
            v = e;
        } else if (settings.feature === 1) {
            var tv = timbres && timbres[i] ? timbres[i] : null;
            v = tv ? (tv[1] || 0) : 0;
        } else {
            var cv = chromas && chromas[i] ? chromas[i] : null;
            if (cv) {
                var sum = 0;
                var wsum = 0;
                for (var p = 0; p < 12; p++) {
                    var w = cv[p] || 0;
                    wsum += w;
                    sum += w * p;
                }
                v = wsum > 0 ? (sum / wsum) : 0;
            } else {
                v = 0;
            }
        }
        if (!isFinite(v)) v = 0;
        raw[i] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }

    var range = maxV - minV;
    if (!isFinite(range) || range <= 1e-9) range = 1;
    for (var j = 0; j < n; j++) {
        values[j] = (raw[j] - minV) / range;
        if (!isFinite(values[j])) values[j] = 0;
        values[j] = clamp01(values[j]);
    }

    var order = [];
    var minVol = settings.minVolume || 0;
    var eRange = maxE - minE;
    if (!isFinite(eRange) || eRange <= 1e-9) eRange = 1;
    var energy01 = new Array(n);
    for (var k = 0; k < n; k++) {
        energy01[k] = clamp01((energyRaw[k] - minE) / eRange);
        if (energy01[k] < minVol) continue;
        order.push(k);
    }
    if (!order.length && n) {
        for (var kk = 0; kk < n; kk++) order.push(kk);
    }
    order.sort(function(a, b) {
        var va = values[a];
        var vb = values[b];
        if (va === vb) return a - b;
        return va - vb;
    });

    var posByIndex = Object.create(null);
    for (var z = 0; z < order.length; z++) {
        posByIndex[order[z]] = z;
    }

    return { values: values, energy01: energy01, order: order, posByIndex: posByIndex, feature: settings.feature };
}

function barberPoleWrapIndex(idx, len) {
    if (len <= 0) return 0;
    var v = idx % len;
    if (v < 0) v += len;
    return v;
}

function barberPoleWrapDist(a, b, len) {
    if (len <= 0) return 0;
    var d = Math.abs(a - b);
    return Math.min(d, len - d);
}

function barberPoleCountRecent(history, idx, windowBeats) {
    if (!history || !history.length || windowBeats <= 0) return 0;
    var start = Math.max(0, history.length - windowBeats);
    var c = 0;
    for (var i = start; i < history.length; i++) {
        if (history[i] === idx) c += 1;
    }
    return c;
}

function barberPoleDeltaInDir(fromPos, toPos, dirSign, len) {
    if (len <= 0) return 0;
    if (dirSign >= 0) {
        return (toPos - fromPos + len) % len;
    }
    return (fromPos - toPos + len) % len;
}

function barberPoleFindPosForValue(order, values, targetValue) {
    if (!order || !order.length || !values) return 0;
    var bestPos = 0;
    var bestDiff = Infinity;
    for (var i = 0; i < order.length; i++) {
        var idx = order[i];
        var v = values[idx];
        if (!isFinite(v)) v = 0;
        var d = Math.abs(v - targetValue);
        if (d < bestDiff) {
            bestDiff = d;
            bestPos = i;
        }
    }
    return bestPos;
}

function barberPoleChooseNextIndex(curIdx, state, settings, history) {
    settings = sanitizeBarberPoleSettings(settings, ADVANCED_DEFAULTS.barberPole);
    if (!state || !state.order || !state.order.length) return curIdx + 1;
    if (!serverLoopCandidateMap || !serverLoopCandidateMap[curIdx]) return curIdx + 1;

    var order = state.order;
    var n = order.length;
    var curPos = state.posByIndex && state.posByIndex[curIdx] !== undefined ? state.posByIndex[curIdx] : null;
    var curVal = (state.values && state.values[curIdx] !== undefined) ? state.values[curIdx] : 0;
    if (curPos === null) curPos = barberPoleFindPosForValue(order, state.values, curVal);

    var dirSign = settings.direction >= 1 ? 1 : -1;
    var stepRanks = Math.max(1, settings.stepRanks || 1);
    var targetPos = barberPoleWrapIndex(curPos + dirSign * stepRanks, n);
    var targetIdx = order[targetPos];

    var edges = serverLoopCandidateMap[curIdx] || [];
    if (!edges.length) return targetIdx;

    var minSim = settings.minSimilarity || 0;
    var minSpan = settings.minSpanBeats || 0;
    var excl = settings.excludeNeighborBeats || 0;
    var recentWindow = settings.recentWindowBeats || 0;
    var repPenalty = settings.repeatPenalty || 0;
    var scoredPreferred = [];
    var scoredFallback = [];
    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var cand = Math.round(edge.target);
        if (!masterQs || cand < 0 || cand >= masterQs.length) continue;
        if (cand === curIdx) continue;
        var span = Math.abs(cand - curIdx);
        if (span < minSpan) continue;
        if (excl > 0 && span <= excl) continue;
        if (state.posByIndex && state.posByIndex[cand] === undefined) continue;

        var simRaw = (typeof edge.similarity === "number") ? edge.similarity : 0;
        var sim = simRaw < 0 ? (simRaw + 1) / 2 : simRaw;
        sim = clamp01(sim);
        if (sim < minSim) continue;

        var candPos = state.posByIndex[cand];
        var distToTarget = barberPoleWrapDist(candPos, targetPos, n);
        var prox = 1 - (distToTarget / Math.max(1, Math.floor(n / 2)));
        prox = clamp01(prox);

        var candVal = (state.values && state.values[cand] !== undefined) ? state.values[cand] : 0;
        var driftRaw = clampNumber(dirSign * (candVal - curVal), -1, 1);
        var driftScore = clamp01(driftRaw * 1.6);
        var deltaDir = barberPoleDeltaInDir(curPos, candPos, dirSign, n);
        var stepErr = Math.abs(deltaDir - stepRanks);
        var stepProx = 1 - Math.min(1, stepErr / Math.max(1, stepRanks * 2));
        stepProx = clamp01(stepProx);

        var repeatCount = barberPoleCountRecent(history, cand, recentWindow);
        var penalty = repeatCount > 0 ? Math.min(0.8, repeatCount * repPenalty) : 0;

        var sameSection = !!(edge.section_match || edge.sectionMatch || edge.sameSection);
        var sectionBonus = sameSection ? 0.02 : 0.06;
        var jitter = (Math.random() - 0.5) * settings.temperature * 0.05;
        // Stronger "pole" effect: prioritize moving in the chosen direction while staying similar.
        var wrongDirPenalty = driftRaw <= 0 ? 0.18 : 0;
        var score = 0.55 * sim + 0.28 * prox + 0.42 * driftScore + 0.26 * stepProx + sectionBonus + jitter - penalty - wrongDirPenalty;
        var bucket = driftRaw > 0 ? scoredPreferred : scoredFallback;
        bucket.push({ target: cand, score: score });
    }

    var scored = scoredPreferred.length ? scoredPreferred : scoredFallback;
    if (!scored.length) {
        return targetIdx;
    }

    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.max(1, Math.min(settings.topK || 12, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var r = Math.random() * total;
    for (var j2 = 0; j2 < pool.length; j2++) {
        r -= weights[j2];
        if (r <= 0) return pool[j2].target;
    }
    return pool[0].target;
}

function createBarberPoleDriver(player, options) {
    options = options || {};
    var modeName = "barberpole";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeBarberPoleSettings(options, ADVANCED_DEFAULTS.barberPole);
    var state = null;
    var history = [];
    var currentIndex = 0;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildBarberPoleState(masterQs, settings);
        }
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function remember(idx) {
        history.push(idx);
        var maxKeep = Math.max(48, (settings.recentWindowBeats || 0) * 2 + 64);
        if (history.length > maxKeep) {
            history = history.slice(history.length - maxKeep);
        }
    }

    function computeProposedNext() {
        ensureState();
        if (!state || !state.order || !state.order.length) return currentIndex + 1;
        if (Math.random() > (settings.applyChance || 1.0)) return currentIndex + 1;
        remember(currentIndex);
        return barberPoleChooseNextIndex(currentIndex, state, settings, history);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        ensureState();

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "barberpole"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeBarberPoleSettings(customSettings, ADVANCED_DEFAULTS.barberPole);
        state = null;
        history = [];
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getBarberPoleSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            history = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "barberpole",
    label: "Barber Pole",
    description: "Directional drift up/down a loudness/brightness gradient.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getBarberPoleSettings();
        var state = buildBarberPoleState(ctx.beats, settings);
        if (!state || !state.order || !state.order.length) return null;
        var history = [];

        function remember(idx) {
            history.push(idx);
            var maxKeep = Math.max(48, (settings.recentWindowBeats || 0) * 2 + 64);
            if (history.length > maxKeep) {
                history = history.slice(history.length - maxKeep);
            }
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "barberpole") return null;

                if (Math.random() > (settings.applyChance || 1.0)) {
                    return null;
                }

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }
                remember(cur);
                var next = barberPoleChooseNextIndex(cur, state, settings, history);
                if (typeof next === "number" && isFinite(next)) {
                    return { index: next };
                }
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    history = [];
                }
            },
            dispose: function() {
                history = [];
            }
        };
    }
});

// ===== Palindrome Engine (Forward/Backward Phrases) =====
function sanitizePalindromeEngineSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.palindromeEngine || {};
    var out = cloneSettings(defaults);

    var phraseBeats = coerceNumber(input.phraseBeats);
    if (phraseBeats === null) phraseBeats = defaults.phraseBeats;
    out.phraseBeats = clampNumber(Math.round(phraseBeats), 2, 256);

    var minSim = coerceNumber(input.turnMinSimilarity);
    if (minSim === null) minSim = defaults.turnMinSimilarity;
    out.turnMinSimilarity = clampNumber(minSim, 0, 0.999);

    var topK = coerceNumber(input.turnTopK);
    if (topK === null) topK = defaults.turnTopK;
    out.turnTopK = clampNumber(Math.round(topK), 1, 32);

    var temp = coerceNumber(input.turnTemperature);
    if (temp === null) temp = defaults.turnTemperature;
    out.turnTemperature = clampNumber(temp, 0.03, 1.5);

    var minSpan = coerceNumber(input.minTurnSpanBeats);
    if (minSpan === null) minSpan = defaults.minTurnSpanBeats;
    out.minTurnSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var cooldown = coerceNumber(input.flipCooldownBeats);
    if (cooldown === null) cooldown = defaults.flipCooldownBeats;
    out.flipCooldownBeats = clampNumber(Math.round(cooldown), 0, 256);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0, 1);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getPalindromeEngineSettings() {
    var useAdvanced = isAdvancedGroupEnabled("palindromeEngine");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("palindromeEngine") : cloneAdvancedDefaults("palindromeEngine");
    return sanitizePalindromeEngineSettings(settings, ADVANCED_DEFAULTS.palindromeEngine);
}

function palindromeNormalizeSimilarity(simRaw) {
    var sim = (typeof simRaw === "number" && isFinite(simRaw)) ? simRaw : 0;
    if (sim < 0) sim = (sim + 1) / 2;
    return clamp01(sim);
}

function palindromePickTurnTarget(curIdx, nextDir, settings, recentTargets) {
    settings = sanitizePalindromeEngineSettings(settings, ADVANCED_DEFAULTS.palindromeEngine);
    if (!serverLoopCandidateMap || !masterQs || !masterQs.length) return null;
    var edges = serverLoopCandidateMap[curIdx] || [];
    if (!edges.length) return null;

    var phrase = settings.phraseBeats || 16;
    var minSim = settings.turnMinSimilarity || 0;
    var minSpan = settings.minTurnSpanBeats || 0;
    var excl = settings.excludeNeighborBeats || 0;

    var scored = [];
    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var targetIdx = Math.round(edge.target);
        if (targetIdx < 0 || targetIdx >= masterQs.length) continue;
        if (targetIdx === curIdx) continue;
        var span = Math.abs(targetIdx - curIdx);
        if (span < minSpan) continue;
        if (excl > 0 && span <= excl) continue;

        // Require room to walk in the new direction for the whole phrase.
        var endIdx = targetIdx + nextDir * (phrase - 1);
        if (endIdx < 0 || endIdx >= masterQs.length) continue;

        var sim = palindromeNormalizeSimilarity(edge.similarity);
        if (sim < minSim) continue;

        // Penalize repeating the same turnaround target.
        var repeatPenalty = 0;
        if (recentTargets && recentTargets.length) {
            for (var r = 0; r < recentTargets.length; r++) {
                if (recentTargets[r] === targetIdx) {
                    repeatPenalty += 0.22;
                }
            }
        }

        var sectionBonus = edge.sameSection ? 0.02 : 0.06;
        var jitter = (Math.random() - 0.5) * settings.turnTemperature * 0.05;
        var score = sim + sectionBonus + jitter - repeatPenalty;
        scored.push({ target: targetIdx, score: score });
    }

    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });

    var pool = scored.slice(0, Math.max(1, Math.min(settings.turnTopK || 10, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.turnTemperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var rr = Math.random() * total;
    for (var j = 0; j < pool.length; j++) {
        rr -= weights[j];
        if (rr <= 0) return pool[j].target;
    }
    return pool[0].target;
}

function createPalindromeDriver(player, options) {
    options = options || {};
    var modeName = "palindrome";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizePalindromeEngineSettings(options, ADVANCED_DEFAULTS.palindromeEngine);
    var currentIndex = 0;
    var dir = 1;
    var stepsLeft = settings.phraseBeats || 16;
    var cooldownLeft = 0;
    var recentTurns = [];

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function rememberTurn(idx) {
        recentTurns.push(idx);
        if (recentTurns.length > 12) {
            recentTurns = recentTurns.slice(recentTurns.length - 12);
        }
    }

    function beginNewPhrase(nextDir) {
        dir = nextDir;
        stepsLeft = settings.phraseBeats || 16;
        if (cooldownLeft > 0) {
            cooldownLeft -= 1;
            return;
        }
        if (Math.random() > (settings.applyChance || 1.0)) {
            return;
        }
        var turnTarget = palindromePickTurnTarget(currentIndex, dir, settings, recentTurns);
        if (typeof turnTarget === "number" && isFinite(turnTarget)) {
            rememberTurn(turnTarget);
            currentIndex = turnTarget;
            cooldownLeft = settings.flipCooldownBeats || 0;
        }
    }

    function computeProposedNext() {
        if (!masterQs || !masterQs.length) return currentIndex + 1;

        if (stepsLeft <= 0) {
            beginNewPhrase(-dir);
        }

        var next = currentIndex + dir;
        stepsLeft -= 1;

        // Boundary guard: flip early when we hit edges.
        if (next < 0 || next >= masterQs.length) {
            beginNewPhrase(-dir);
            next = currentIndex + dir;
            stepsLeft -= 1;
        }
        return next;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }
        if (currentIndex < 0) currentIndex = 0;

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, dir: dir, stepsLeft: stepsLeft });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "palindrome"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex - 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizePalindromeEngineSettings(customSettings, ADVANCED_DEFAULTS.palindromeEngine);
        dir = 1;
        stepsLeft = settings.phraseBeats || 16;
        cooldownLeft = 0;
        recentTurns = [];
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getPalindromeEngineSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            dir = 1;
            stepsLeft = settings.phraseBeats || 16;
            cooldownLeft = 0;
            recentTurns = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "palindrome",
    label: "Palindrome Engine",
    description: "Alternate forward/backward phrases, pivoting on similarity.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getPalindromeEngineSettings();
        settings = sanitizePalindromeEngineSettings(settings, ADVANCED_DEFAULTS.palindromeEngine);
        var dir = 1;
        var stepsLeft = settings.phraseBeats || 16;
        var cooldownLeft = 0;
        var recentTurns = [];

        function rememberTurn(idx) {
            recentTurns.push(idx);
            if (recentTurns.length > 12) {
                recentTurns = recentTurns.slice(recentTurns.length - 12);
            }
        }

        function beginNewPhrase(curIdx, nextDir) {
            dir = nextDir;
            stepsLeft = settings.phraseBeats || 16;
            if (cooldownLeft > 0) {
                cooldownLeft -= 1;
                return curIdx;
            }
            if (Math.random() > (settings.applyChance || 1.0)) {
                return curIdx;
            }
            var turnTarget = palindromePickTurnTarget(curIdx, dir, settings, recentTurns);
            if (typeof turnTarget === "number" && isFinite(turnTarget)) {
                rememberTurn(turnTarget);
                cooldownLeft = settings.flipCooldownBeats || 0;
                return turnTarget;
            }
            return curIdx;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "palindrome") return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }

                if (stepsLeft <= 0) {
                    cur = beginNewPhrase(cur, -dir);
                }

                var next = cur + dir;
                stepsLeft -= 1;

                if (!masterQs || next < 0 || next >= masterQs.length) {
                    cur = beginNewPhrase(cur, -dir);
                    next = cur + dir;
                    stepsLeft -= 1;
                }

                return { index: next };
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    dir = 1;
                    stepsLeft = settings.phraseBeats || 16;
                    cooldownLeft = 0;
                    recentTurns = [];
                }
            },
            dispose: function() {
                dir = 1;
                stepsLeft = settings.phraseBeats || 16;
                cooldownLeft = 0;
                recentTurns = [];
            }
        };
    }
});

// ===== Spectral Gravity (Feature Attractor) =====
function sanitizeSpectralGravitySettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.spectralGravity || {};
    var out = cloneSettings(defaults);

    var axis = coerceNumber(input.axis);
    if (axis === null) axis = defaults.axis;
    out.axis = clampNumber(Math.round(axis), 0, 2); // 0=brightness, 1=loudness, 2=pitch

    var target = coerceNumber(input.target);
    if (target === null) target = defaults.target;
    out.target = clamp01(target);

    var bandWidth = coerceNumber(input.bandWidth);
    if (bandWidth === null) bandWidth = defaults.bandWidth;
    out.bandWidth = clampNumber(bandWidth, 0.01, 1);

    var triggerThreshold = coerceNumber(input.triggerThreshold);
    if (triggerThreshold === null) triggerThreshold = defaults.triggerThreshold;
    out.triggerThreshold = clampNumber(triggerThreshold, 0, 1);

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0, 0.999);

    var cooldown = coerceNumber(input.cooldownBeats);
    if (cooldown === null) cooldown = defaults.cooldownBeats;
    out.cooldownBeats = clampNumber(Math.round(cooldown), 0, 256);

    var minSpan = coerceNumber(input.minSpanBeats);
    if (minSpan === null) minSpan = defaults.minSpanBeats;
    out.minSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var topK = coerceNumber(input.topK);
    if (topK === null) topK = defaults.topK;
    out.topK = clampNumber(Math.round(topK), 1, 32);

    var temperature = coerceNumber(input.temperature);
    if (temperature === null) temperature = defaults.temperature;
    out.temperature = clampNumber(temperature, 0.03, 1.5);

    var recentWindowBeats = coerceNumber(input.recentWindowBeats);
    if (recentWindowBeats === null) recentWindowBeats = defaults.recentWindowBeats;
    out.recentWindowBeats = clampNumber(Math.round(recentWindowBeats), 0, 256);

    var repeatPenalty = coerceNumber(input.repeatPenalty);
    if (repeatPenalty === null) repeatPenalty = defaults.repeatPenalty;
    out.repeatPenalty = clampNumber(repeatPenalty, 0, 1);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0, 1);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getSpectralGravitySettings() {
    var useAdvanced = isAdvancedGroupEnabled("spectralGravity");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("spectralGravity") : cloneAdvancedDefaults("spectralGravity");
    return sanitizeSpectralGravitySettings(settings, ADVANCED_DEFAULTS.spectralGravity);
}

function spectralGravityDistance(a, b, axis) {
    var d = Math.abs(a - b);
    if (axis === 2) {
        // Pitch-class space wraps.
        d = Math.min(d, 1 - d);
    }
    return d;
}

function buildSpectralGravityState(beats, settings) {
    settings = sanitizeSpectralGravitySettings(settings, ADVANCED_DEFAULTS.spectralGravity);
    beats = beats || [];
    var n = beats.length;
    var values = new Array(n);
    var raw = new Array(n);

    var chromas = null;
    var timbres = null;
    if (settings.axis === 2) {
        chromas = computeBeatChromaVectors(beats);
    } else if (settings.axis === 0) {
        timbres = computeBeatTimbreVectors(beats);
    }

    var minV = Infinity;
    var maxV = -Infinity;
    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var v = 0;
        if (settings.axis === 1) {
            v = beatEnergy(b);
        } else if (settings.axis === 0) {
            var tv = timbres && timbres[i] ? timbres[i] : null;
            v = tv ? (tv[1] || 0) : 0;
        } else {
            var cv = chromas && chromas[i] ? chromas[i] : null;
            if (cv) {
                var sum = 0;
                var wsum = 0;
                for (var p = 0; p < 12; p++) {
                    var w = cv[p] || 0;
                    wsum += w;
                    sum += w * p;
                }
                v = wsum > 0 ? (sum / wsum) : 0;
            } else {
                v = 0;
            }
        }
        if (!isFinite(v)) v = 0;
        raw[i] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }

    var range = maxV - minV;
    if (!isFinite(range) || range <= 1e-9) range = 1;
    for (var j = 0; j < n; j++) {
        var vv;
        if (settings.axis === 1) {
            vv = clamp01(raw[j]);
        } else {
            vv = clamp01((raw[j] - minV) / range);
        }
        values[j] = vv;
    }

    var inBand = [];
    var orderByCloseness = [];
    var minVol = settings.axis === 1 ? 0 : 0;
    for (var k = 0; k < n; k++) {
        if (beatEnergy(beats[k]) < minVol) continue;
        var dist = spectralGravityDistance(values[k], settings.target, settings.axis);
        orderByCloseness.push({ idx: k, dist: dist });
        if (dist <= settings.bandWidth) {
            inBand.push(k);
        }
    }

    orderByCloseness.sort(function(a, b) {
        if (a.dist === b.dist) return a.idx - b.idx;
        return a.dist - b.dist;
    });

    return {
        axis: settings.axis,
        target: settings.target,
        values: values,
        inBand: inBand,
        closest: orderByCloseness.map(function(x) { return x.idx; })
    };
}

function spectralGravityCountRecent(history, idx, windowBeats) {
    if (!history || !history.length || windowBeats <= 0) return 0;
    var start = Math.max(0, history.length - windowBeats);
    var c = 0;
    for (var i = start; i < history.length; i++) {
        if (history[i] === idx) c += 1;
    }
    return c;
}

function spectralGravityChooseTarget(curIdx, state, settings, history) {
    settings = sanitizeSpectralGravitySettings(settings, ADVANCED_DEFAULTS.spectralGravity);
    if (!masterQs || !masterQs.length) return null;
    if (!state || !state.values) return null;

    var axis = settings.axis;
    var target = settings.target;
    var bandWidth = settings.bandWidth;
    var minSim = settings.minSimilarity || 0;
    var minSpan = settings.minSpanBeats || 0;
    var excl = settings.excludeNeighborBeats || 0;
    var recentWindow = settings.recentWindowBeats || 0;
    var repPenalty = settings.repeatPenalty || 0;

    var edges = serverLoopCandidateMap ? (serverLoopCandidateMap[curIdx] || []) : [];
    var scored = [];

    function maybeScoreCandidate(cand, sim, sameSection) {
        if (cand < 0 || cand >= masterQs.length) return;
        if (cand === curIdx) return;
        var span = Math.abs(cand - curIdx);
        if (span < minSpan) return;
        if (excl > 0 && span <= excl) return;

        var val = state.values[cand] !== undefined ? state.values[cand] : 0;
        var dist = spectralGravityDistance(val, target, axis);
        if (dist > bandWidth) return;

        if (sim < minSim) return;

        var closeness = 1 - clamp01(dist / Math.max(0.001, bandWidth));
        var repeatCount = spectralGravityCountRecent(history, cand, recentWindow);
        var penalty = repeatCount > 0 ? Math.min(0.8, repeatCount * repPenalty) : 0;
        var sectionBonus = sameSection ? 0.02 : 0.06;
        var jitter = (Math.random() - 0.5) * settings.temperature * 0.05;
        var score = 0.7 * sim + 0.35 * closeness + sectionBonus + jitter - penalty;
        scored.push({ target: cand, score: score });
    }

    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var cand = Math.round(edge.target);
        var sim = palindromeNormalizeSimilarity(edge.similarity);
        maybeScoreCandidate(cand, sim, !!edge.sameSection);
    }

    // Fallback: scan globally for in-band beats near the target.
    if (!scored.length && state.closest && state.closest.length) {
        var maxScan = Math.min(220, state.closest.length);
        for (var j = 0; j < maxScan; j++) {
            var cand2 = state.closest[j];
            var span2 = Math.abs(cand2 - curIdx);
            if (span2 < minSpan || (excl > 0 && span2 <= excl)) continue;
            var sim2 = 0.6; // fallback similarity guess
            maybeScoreCandidate(cand2, sim2, false);
            if (scored.length >= (settings.topK || 12)) break;
        }
    }

    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.max(1, Math.min(settings.topK || 12, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var r = Math.random() * total;
    for (var x = 0; x < pool.length; x++) {
        r -= weights[x];
        if (r <= 0) return pool[x].target;
    }
    return pool[0].target;
}

function createSpectralGravityDriver(player, options) {
    options = options || {};
    var modeName = "spectralgravity";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeSpectralGravitySettings(options, ADVANCED_DEFAULTS.spectralGravity);
    var state = null;
    var history = [];
    var currentIndex = 0;
    var cooldownLeft = 0;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildSpectralGravityState(masterQs, settings);
        }
    }

    function remember(idx) {
        history.push(idx);
        var maxKeep = Math.max(48, (settings.recentWindowBeats || 0) * 2 + 64);
        if (history.length > maxKeep) {
            history = history.slice(history.length - maxKeep);
        }
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function maybeComputeJump() {
        ensureState();
        if (!state || !state.values || currentIndex < 0 || currentIndex >= masterQs.length) return null;

        if (cooldownLeft > 0) {
            cooldownLeft -= 1;
            return null;
        }
        if (Math.random() > (settings.applyChance || 1.0)) return null;

        var val = state.values[currentIndex] !== undefined ? state.values[currentIndex] : 0;
        var dist = spectralGravityDistance(val, settings.target, settings.axis);
        if (dist <= settings.bandWidth) return null;
        if (dist < settings.triggerThreshold) return null;

        var strength = clamp01((dist - settings.triggerThreshold) / Math.max(0.001, 1 - settings.triggerThreshold));
        if (Math.random() > (0.35 + 0.65 * strength)) return null;

        remember(currentIndex);
        var next = spectralGravityChooseTarget(currentIndex, state, settings, history);
        if (typeof next === "number" && isFinite(next)) {
            cooldownLeft = settings.cooldownBeats || 0;
            return next;
        }
        return null;
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        ensureState();

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }
        if (currentIndex < 0) currentIndex = 0;

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q });
        var delay = player.playQ(q);

        var proposed = currentIndex + 1;
        var jump = maybeComputeJump();
        if (jump !== null && jump !== undefined) {
            proposed = jump;
        }
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: jump !== null ? "gravity" : "sequential"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeSpectralGravitySettings(customSettings, ADVANCED_DEFAULTS.spectralGravity);
        state = null;
        history = [];
        cooldownLeft = 0;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getSpectralGravitySettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            history = [];
            cooldownLeft = 0;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "spectralgravity",
    label: "Spectral Gravity",
    description: "Snap back to a target texture band when the spectrum drifts.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getSpectralGravitySettings();
        var state = buildSpectralGravityState(ctx.beats, settings);
        if (!state || !state.values) return null;

        var history = [];
        var cooldownLeft = 0;

        function remember(idx) {
            history.push(idx);
            var maxKeep = Math.max(48, (settings.recentWindowBeats || 0) * 2 + 64);
            if (history.length > maxKeep) {
                history = history.slice(history.length - maxKeep);
            }
        }

        function maybeJump(curIdx) {
            if (cooldownLeft > 0) {
                cooldownLeft -= 1;
                return null;
            }
            if (Math.random() > (settings.applyChance || 1.0)) return null;
            var val = state.values[curIdx] !== undefined ? state.values[curIdx] : 0;
            var dist = spectralGravityDistance(val, settings.target, settings.axis);
            if (dist <= settings.bandWidth) return null;
            if (dist < settings.triggerThreshold) return null;
            var strength = clamp01((dist - settings.triggerThreshold) / Math.max(0.001, 1 - settings.triggerThreshold));
            if (Math.random() > (0.35 + 0.65 * strength)) return null;
            remember(curIdx);
            var next = spectralGravityChooseTarget(curIdx, state, settings, history);
            if (typeof next === "number" && isFinite(next)) {
                cooldownLeft = settings.cooldownBeats || 0;
                return next;
            }
            return null;
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "spectralgravity") return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }
                var next = maybeJump(cur);
                if (next !== null && next !== undefined) {
                    return { index: next };
                }
                return null;
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    history = [];
                    cooldownLeft = 0;
                }
            },
            dispose: function() {
                history = [];
                cooldownLeft = 0;
            }
        };
    }
});

// ===== Call & Response (Bar Alternation) =====
function sanitizeCallResponseSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.callResponse || {};
    var out = cloneSettings(defaults);

    var callQ = coerceNumber(input.callQuantileMax);
    if (callQ === null) callQ = defaults.callQuantileMax;
    out.callQuantileMax = clampNumber(callQ, 0, 1);

    var respQ = coerceNumber(input.responseQuantileMin);
    if (respQ === null) respQ = defaults.responseQuantileMin;
    out.responseQuantileMin = clampNumber(respQ, 0, 1);

    var barsPerCall = coerceNumber(input.barsPerCall);
    if (barsPerCall === null) barsPerCall = defaults.barsPerCall;
    out.barsPerCall = clampNumber(Math.round(barsPerCall), 1, 16);

    var barsPerResponse = coerceNumber(input.barsPerResponse);
    if (barsPerResponse === null) barsPerResponse = defaults.barsPerResponse;
    out.barsPerResponse = clampNumber(Math.round(barsPerResponse), 1, 16);

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0, 0.999);

    var topK = coerceNumber(input.topK);
    if (topK === null) topK = defaults.topK;
    out.topK = clampNumber(Math.round(topK), 1, 32);

    var temperature = coerceNumber(input.temperature);
    if (temperature === null) temperature = defaults.temperature;
    out.temperature = clampNumber(temperature, 0.03, 1.5);

    var minSpan = coerceNumber(input.minSpanBeats);
    if (minSpan === null) minSpan = defaults.minSpanBeats;
    out.minSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var recentBars = coerceNumber(input.recentWindowBars);
    if (recentBars === null) recentBars = defaults.recentWindowBars;
    out.recentWindowBars = clampNumber(Math.round(recentBars), 0, 128);

    var repeatPenalty = coerceNumber(input.repeatPenalty);
    if (repeatPenalty === null) repeatPenalty = defaults.repeatPenalty;
    out.repeatPenalty = clampNumber(repeatPenalty, 0, 1);

    var energyBias = coerceNumber(input.energyBias);
    if (energyBias === null) energyBias = defaults.energyBias;
    out.energyBias = clampNumber(energyBias, 0, 1);

    var sameSectionBias = coerceNumber(input.sameSectionBias);
    if (sameSectionBias === null) sameSectionBias = defaults.sameSectionBias;
    out.sameSectionBias = clampNumber(sameSectionBias, 0, 1);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0, 1);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    // Prevent inverted quantiles from nuking sets.
    if (out.callQuantileMax > out.responseQuantileMin) {
        var mid = (out.callQuantileMax + out.responseQuantileMin) / 2;
        out.callQuantileMax = clampNumber(mid - 0.15, 0, 1);
        out.responseQuantileMin = clampNumber(mid + 0.15, 0, 1);
    }

    return out;
}

function getCallResponseSettings() {
    var useAdvanced = isAdvancedGroupEnabled("callResponse");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("callResponse") : cloneAdvancedDefaults("callResponse");
    return sanitizeCallResponseSettings(settings, ADVANCED_DEFAULTS.callResponse);
}

function callResponseGetBarIndex(beat) {
    if (!beat) return null;
    if (typeof beat.bar_index === "number") return beat.bar_index;
    if (beat.parent && typeof beat.parent.which === "number") return beat.parent.which;
    return null;
}

function callResponseQuantile(sorted, q) {
    if (!sorted || !sorted.length) return 0;
    q = clampNumber(q, 0, 1);
    var pos = (sorted.length - 1) * q;
    var base = Math.floor(pos);
    var frac = pos - base;
    var a = sorted[Math.max(0, Math.min(sorted.length - 1, base))];
    var b = sorted[Math.max(0, Math.min(sorted.length - 1, base + 1))];
    return a + frac * (b - a);
}

function buildCallResponseState(beats, settings) {
    settings = sanitizeCallResponseSettings(settings, ADVANCED_DEFAULTS.callResponse);
    beats = beats || [];
    var n = beats.length;
    var barKeyByBeat = new Array(n);
    var barsByKey = Object.create(null);

    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var barKey = callResponseGetBarIndex(b);
        if (barKey === null || !isFinite(barKey)) {
            barKey = i; // fallback: treat each beat as its own bar
        }
        barKey = Math.round(barKey);
        barKeyByBeat[i] = barKey;
        if (!barsByKey[barKey]) {
            barsByKey[barKey] = { key: barKey, beats: [], start: i, end: i };
        }
        var bar = barsByKey[barKey];
        bar.beats.push(i);
        bar.end = i;
    }

    var barKeys = Object.keys(barsByKey).map(function(k) { return parseInt(k, 10); });
    barKeys.sort(function(a, b) { return a - b; });

    var barCount = barKeys.length;
    var barStartBeat = new Array(barCount);
    var barEndBeat = new Array(barCount);
    var barEnergy = new Array(barCount);
    var barPosByKey = Object.create(null);

    for (var bi = 0; bi < barCount; bi++) {
        var key = barKeys[bi];
        barPosByKey[key] = bi;
        var barMeta = barsByKey[key];
        barStartBeat[bi] = barMeta.start;
        barEndBeat[bi] = barMeta.end;
        var sum = 0;
        for (var bj = 0; bj < barMeta.beats.length; bj++) {
            sum += beatEnergy(beats[barMeta.beats[bj]]);
        }
        var avg = barMeta.beats.length ? (sum / barMeta.beats.length) : 0;
        if (!isFinite(avg)) avg = 0;
        barEnergy[bi] = clamp01(avg);
    }

    var energySorted = barEnergy.slice(0).sort(function(a, b) { return a - b; });
    var callMax = callResponseQuantile(energySorted, settings.callQuantileMax);
    var respMin = callResponseQuantile(energySorted, settings.responseQuantileMin);

    var callBars = [];
    var responseBars = [];
    for (var bp = 0; bp < barCount; bp++) {
        if (barEnergy[bp] <= callMax) callBars.push(bp);
        if (barEnergy[bp] >= respMin) responseBars.push(bp);
    }
    if (!callBars.length || !responseBars.length) {
        var median = callResponseQuantile(energySorted, 0.5);
        callBars = [];
        responseBars = [];
        for (var bp2 = 0; bp2 < barCount; bp2++) {
            if (barEnergy[bp2] <= median) callBars.push(bp2);
            if (barEnergy[bp2] >= median) responseBars.push(bp2);
        }
    }

    var beatBarPos = new Array(n);
    for (var k = 0; k < n; k++) {
        beatBarPos[k] = barPosByKey[barKeyByBeat[k]] !== undefined ? barPosByKey[barKeyByBeat[k]] : 0;
    }

    var callStartBeatSet = new Array(n);
    var responseStartBeatSet = new Array(n);
    for (var z = 0; z < n; z++) {
        callStartBeatSet[z] = false;
        responseStartBeatSet[z] = false;
    }
    callBars.forEach(function(pos) { callStartBeatSet[barStartBeat[pos]] = true; });
    responseBars.forEach(function(pos) { responseStartBeatSet[barStartBeat[pos]] = true; });

    return {
        barKeys: barKeys,
        barPosByKey: barPosByKey,
        beatBarPos: beatBarPos,
        barStartBeat: barStartBeat,
        barEndBeat: barEndBeat,
        barEnergy: barEnergy,
        callBars: callBars,
        responseBars: responseBars,
        callStartBeatSet: callStartBeatSet,
        responseStartBeatSet: responseStartBeatSet
    };
}

function callResponseCountRecentBars(history, barPos, windowBars) {
    if (!history || !history.length || windowBars <= 0) return 0;
    var start = Math.max(0, history.length - windowBars);
    var c = 0;
    for (var i = start; i < history.length; i++) {
        if (history[i] === barPos) c += 1;
    }
    return c;
}

function callResponsePickBarStartFromEdges(curIdx, state, settings, isResponsePhase, recentBars) {
    settings = sanitizeCallResponseSettings(settings, ADVANCED_DEFAULTS.callResponse);
    if (!state || !state.beatBarPos || !state.barStartBeat) return null;
    if (!serverLoopCandidateMap || !serverLoopCandidateMap[curIdx]) return null;

    var startSet = isResponsePhase ? state.responseStartBeatSet : state.callStartBeatSet;
    if (!startSet) return null;

    var edges = serverLoopCandidateMap[curIdx] || [];
    var minSim = settings.minSimilarity || 0;
    var minSpan = settings.minSpanBeats || 0;
    var excl = settings.excludeNeighborBeats || 0;

    var scored = [];
    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var target = Math.round(edge.target);
        if (!masterQs || target < 0 || target >= masterQs.length) continue;
        if (!startSet[target]) continue;

        var span = Math.abs(target - curIdx);
        if (span < minSpan) continue;
        if (excl > 0 && span <= excl) continue;

        var sim = palindromeNormalizeSimilarity(edge.similarity);
        if (sim < minSim) continue;

        var barPos = state.beatBarPos[target] || 0;
        var barE = state.barEnergy[barPos] !== undefined ? state.barEnergy[barPos] : 0;
        var energyGoal = isResponsePhase ? barE : (1 - barE);
        var energyBonus = settings.energyBias * 0.25 * energyGoal;

        var sectionBonus = (edge.sameSection ? 1 : 0) * settings.sameSectionBias * 0.12;

        var repeatCount = callResponseCountRecentBars(recentBars, barPos, settings.recentWindowBars || 0);
        var repPenalty = repeatCount > 0 ? Math.min(0.8, repeatCount * (settings.repeatPenalty || 0)) : 0;

        var jitter = (Math.random() - 0.5) * settings.temperature * 0.05;
        var score = 0.75 * sim + energyBonus + sectionBonus + jitter - repPenalty;
        scored.push({ target: target, score: score, barPos: barPos });
    }

    if (!scored.length) return null;
    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.max(1, Math.min(settings.topK || 12, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var r = Math.random() * total;
    for (var j = 0; j < pool.length; j++) {
        r -= weights[j];
        if (r <= 0) return pool[j].target;
    }
    return pool[0].target;
}

function callResponsePickBarStartFallback(state, settings, isResponsePhase) {
    settings = sanitizeCallResponseSettings(settings, ADVANCED_DEFAULTS.callResponse);
    if (!state || !state.barStartBeat || !state.callBars || !state.responseBars) return 0;
    var barPool = isResponsePhase ? state.responseBars : state.callBars;
    if (!barPool.length) return 0;

    var total = 0;
    var weights = barPool.map(function(pos) {
        var e = state.barEnergy[pos] !== undefined ? state.barEnergy[pos] : 0;
        var goal = isResponsePhase ? e : (1 - e);
        var w = 0.15 + settings.energyBias * 0.85 * goal;
        total += w;
        return w;
    });
    var r = Math.random() * total;
    for (var i = 0; i < barPool.length; i++) {
        r -= weights[i];
        if (r <= 0) return state.barStartBeat[barPool[i]];
    }
    return state.barStartBeat[barPool[0]];
}

function createCallResponseDriver(player, options) {
    options = options || {};
    var modeName = "callresponse";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeCallResponseSettings(options, ADVANCED_DEFAULTS.callResponse);
    var state = null;
    var currentIndex = 0;

    var phase = "call"; // call -> response -> call ...
    var barsLeft = settings.barsPerCall || 1;
    var recentBars = [];

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildCallResponseState(masterQs, settings);
        }
    }

    function rememberBar(pos) {
        recentBars.push(pos);
        if (recentBars.length > 48) {
            recentBars = recentBars.slice(recentBars.length - 48);
        }
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        resetPlaybackState();
    }

    function flipPhase() {
        phase = phase === "call" ? "response" : "call";
        barsLeft = phase === "call" ? (settings.barsPerCall || 1) : (settings.barsPerResponse || 1);
    }

    function shouldAttemptJump() {
        return Math.random() <= (settings.applyChance || 1.0);
    }

    function computeProposedNext() {
        ensureState();
        if (!state || !state.barEndBeat) return currentIndex + 1;

        var curBarPos = state.beatBarPos[currentIndex] || 0;
        var isLastBeat = currentIndex === state.barEndBeat[curBarPos];
        if (!isLastBeat) {
            return currentIndex + 1;
        }

        // We are at the end of a bar.
        if (barsLeft > 1) {
            barsLeft -= 1;
            return currentIndex + 1;
        }

        // Phase boundary: flip and jump to a matching call/response bar.
        flipPhase();
        rememberBar(curBarPos);
        if (!shouldAttemptJump()) {
            return currentIndex + 1;
        }

        var wantResponse = phase === "response";
        var picked = callResponsePickBarStartFromEdges(currentIndex, state, settings, wantResponse, recentBars);
        if (typeof picked === "number" && isFinite(picked)) {
            return picked;
        }
        return callResponsePickBarStartFallback(state, settings, wantResponse);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        ensureState();

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }
        if (currentIndex < 0) currentIndex = 0;

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({ mode: modeName, currentIndex: currentIndex, beat: q, phase: phase, barsLeft: barsLeft });
        var delay = player.playQ(q);

        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "callresponse"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeCallResponseSettings(customSettings, ADVANCED_DEFAULTS.callResponse);
        state = null;
        phase = "call";
        barsLeft = settings.barsPerCall || 1;
        recentBars = [];
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getCallResponseSettings());
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,

        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            phase = "call";
            barsLeft = settings.barsPerCall || 1;
            recentBars = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },

        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },

        onStackChange: function() {},

        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "callresponse",
    label: "Call & Response",
    description: "Alternate low/high-energy bars with similarity-safe pivots.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getCallResponseSettings();
        var state = buildCallResponseState(ctx.beats, settings);
        if (!state || !state.barEndBeat) return null;

        var phase = "call";
        var barsLeft = settings.barsPerCall || 1;
        var recentBars = [];

        function rememberBar(pos) {
            recentBars.push(pos);
            if (recentBars.length > 48) {
                recentBars = recentBars.slice(recentBars.length - 48);
            }
        }

        function flipPhase() {
            phase = phase === "call" ? "response" : "call";
            barsLeft = phase === "call" ? (settings.barsPerCall || 1) : (settings.barsPerResponse || 1);
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "callresponse") return null;

                if (Math.random() > (settings.applyChance || 1.0)) {
                    return null;
                }

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }

                var curBarPos = state.beatBarPos[cur] || 0;
                var isLastBeat = cur === state.barEndBeat[curBarPos];
                if (!isLastBeat) return null;

                if (barsLeft > 1) {
                    barsLeft -= 1;
                    return null;
                }

                flipPhase();
                rememberBar(curBarPos);
                var wantResponse = phase === "response";
                var picked = callResponsePickBarStartFromEdges(cur, state, settings, wantResponse, recentBars);
                if (typeof picked === "number" && isFinite(picked)) {
                    return { index: picked };
                }
                return { index: callResponsePickBarStartFallback(state, settings, wantResponse) };
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    phase = "call";
                    barsLeft = settings.barsPerCall || 1;
                    recentBars = [];
                }
            },
            dispose: function() {
                phase = "call";
                barsLeft = settings.barsPerCall || 1;
                recentBars = [];
            }
        };
    }
});

// ===== Orbit Weaver (Anchor Carousel) =====
function sanitizeOrbitWeaverSettings(input, defaults) {
    input = input || {};
    defaults = defaults || ADVANCED_DEFAULTS.orbitWeaver || {};
    var out = cloneSettings(defaults);

    var anchorCount = coerceNumber(input.anchorCount);
    if (anchorCount === null) anchorCount = defaults.anchorCount;
    out.anchorCount = clampNumber(Math.round(anchorCount), 2, 16);

    var spinAxis = coerceNumber(input.spinAxis);
    if (spinAxis === null) spinAxis = defaults.spinAxis;
    out.spinAxis = clampNumber(Math.round(spinAxis), 0, 2);

    var barsPerAnchor = coerceNumber(input.barsPerAnchor);
    if (barsPerAnchor === null) barsPerAnchor = defaults.barsPerAnchor;
    out.barsPerAnchor = clampNumber(Math.round(barsPerAnchor), 1, 16);

    var jumpAtBarStart = coerceNumber(input.jumpAtBarStart);
    if (jumpAtBarStart === null) jumpAtBarStart = defaults.jumpAtBarStart;
    out.jumpAtBarStart = jumpAtBarStart >= 1 ? 1 : 0;

    var minSim = coerceNumber(input.minSimilarity);
    if (minSim === null) minSim = defaults.minSimilarity;
    out.minSimilarity = clampNumber(minSim, 0, 0.999);

    var topK = coerceNumber(input.topK);
    if (topK === null) topK = defaults.topK;
    out.topK = clampNumber(Math.round(topK), 1, 32);

    var temperature = coerceNumber(input.temperature);
    if (temperature === null) temperature = defaults.temperature;
    out.temperature = clampNumber(temperature, 0.03, 1.5);

    var minSpan = coerceNumber(input.minSpanBeats);
    if (minSpan === null) minSpan = defaults.minSpanBeats;
    out.minSpanBeats = clampNumber(Math.round(minSpan), 0, 512);

    var excl = coerceNumber(input.excludeNeighborBeats);
    if (excl === null) excl = defaults.excludeNeighborBeats;
    out.excludeNeighborBeats = clampNumber(Math.round(excl), 0, 32);

    var recentWindowBeats = coerceNumber(input.recentWindowBeats);
    if (recentWindowBeats === null) recentWindowBeats = defaults.recentWindowBeats;
    out.recentWindowBeats = clampNumber(Math.round(recentWindowBeats), 0, 512);

    var repeatPenalty = coerceNumber(input.repeatPenalty);
    if (repeatPenalty === null) repeatPenalty = defaults.repeatPenalty;
    out.repeatPenalty = clampNumber(repeatPenalty, 0, 1);

    var sameSectionBias = coerceNumber(input.sameSectionBias);
    if (sameSectionBias === null) sameSectionBias = defaults.sameSectionBias;
    out.sameSectionBias = clampNumber(sameSectionBias, 0, 1);

    var anchorPull = coerceNumber(input.anchorPull);
    if (anchorPull === null) anchorPull = defaults.anchorPull;
    out.anchorPull = clampNumber(anchorPull, 0, 1);

    var applyChance = coerceNumber(input.applyChance);
    if (applyChance === null) applyChance = defaults.applyChance;
    out.applyChance = clampNumber(applyChance, 0, 1);

    var overrideJumps = coerceNumber(input.overrideJumps);
    if (overrideJumps === null) overrideJumps = defaults.overrideJumps;
    out.overrideJumps = overrideJumps >= 1 ? 1 : 0;

    return out;
}

function getOrbitWeaverSettings() {
    var useAdvanced = isAdvancedGroupEnabled("orbitWeaver");
    var settings = useAdvanced ? ensureAdvancedGroupSettings("orbitWeaver") : cloneAdvancedDefaults("orbitWeaver");
    return sanitizeOrbitWeaverSettings(settings, ADVANCED_DEFAULTS.orbitWeaver);
}

function orbitWeaverGetBarIndex(beat) {
    if (!beat) return null;
    if (typeof beat.bar_index === "number") return beat.bar_index;
    if (beat.parent && typeof beat.parent.which === "number") return beat.parent.which;
    return null;
}

function orbitWeaverCircDist(a, b) {
    var d = Math.abs(a - b);
    return Math.min(d, 1 - d);
}

function orbitWeaverCountRecent(history, idx, windowBeats) {
    if (!history || !history.length || windowBeats <= 0) return 0;
    var start = Math.max(0, history.length - windowBeats);
    var c = 0;
    for (var i = start; i < history.length; i++) {
        if (history[i] === idx) c += 1;
    }
    return c;
}

function buildOrbitWeaverState(beats, settings) {
    settings = sanitizeOrbitWeaverSettings(settings, ADVANCED_DEFAULTS.orbitWeaver);
    beats = beats || [];
    var n = beats.length;

    // Bar metadata (start/end/position by beat).
    var barKeyByBeat = new Array(n);
    var barsByKey = Object.create(null);
    for (var i = 0; i < n; i++) {
        var b = beats[i];
        var barKey = orbitWeaverGetBarIndex(b);
        if (barKey === null || !isFinite(barKey)) {
            barKey = i;
        }
        barKey = Math.round(barKey);
        barKeyByBeat[i] = barKey;
        if (!barsByKey[barKey]) {
            barsByKey[barKey] = { key: barKey, beats: [], start: i, end: i };
        }
        var bar = barsByKey[barKey];
        bar.beats.push(i);
        bar.end = i;
    }
    var barKeys = Object.keys(barsByKey).map(function(k) { return parseInt(k, 10); });
    barKeys.sort(function(a, b) { return a - b; });
    var barCount = barKeys.length;
    var barStartBeat = new Array(barCount);
    var barEndBeat = new Array(barCount);
    var beatBarPos = new Array(n);
    var barPosByKey = Object.create(null);
    var barStartSet = Object.create(null);
    for (var bi = 0; bi < barCount; bi++) {
        var key = barKeys[bi];
        barPosByKey[key] = bi;
        var meta = barsByKey[key];
        barStartBeat[bi] = meta.start;
        barEndBeat[bi] = meta.end;
        barStartSet[meta.start] = true;
        for (var bj = 0; bj < meta.beats.length; bj++) {
            beatBarPos[meta.beats[bj]] = bi;
        }
    }

    // Feature vectors (energy, brightness, pitch).
    var energies = new Array(n);
    var brightRaw = new Array(n);
    var pitchVals = new Array(n);

    var timbres = computeBeatTimbreVectors(beats);
    var chromas = computeBeatChromaVectors(beats);

    var minBright = Infinity;
    var maxBright = -Infinity;
    for (var j = 0; j < n; j++) {
        var e = clamp01(beatEnergy(beats[j]));
        energies[j] = e;
        var tb = timbres && timbres[j] ? (timbres[j][1] || 0) : 0;
        if (!isFinite(tb)) tb = 0;
        brightRaw[j] = tb;
        if (tb < minBright) minBright = tb;
        if (tb > maxBright) maxBright = tb;

        var pv = 0;
        if (chromas && chromas[j] && chromas[j].length >= 12) {
            pv = dominantPitchClass(chromas[j]) / 11;
        }
        if (!isFinite(pv)) pv = 0;
        pitchVals[j] = clamp01(pv);
    }
    var brightRange = maxBright - minBright;
    if (!isFinite(brightRange) || brightRange <= 1e-9) brightRange = 1;
    var brightness = new Array(n);
    for (var k = 0; k < n; k++) {
        brightness[k] = clamp01((brightRaw[k] - minBright) / brightRange);
    }

    function featureDist(aIdx, bIdx) {
        var de = Math.abs(energies[aIdx] - energies[bIdx]);
        var db = Math.abs(brightness[aIdx] - brightness[bIdx]);
        var dp = orbitWeaverCircDist(pitchVals[aIdx], pitchVals[bIdx]);
        // Slightly favor pitch/texture diversity (feels like "orbiting" around harmonic space).
        return 0.30 * de + 0.30 * db + 0.40 * dp;
    }

    // Anchor candidates: bar starts if requested, otherwise all beats.
    var candidates = [];
    for (var c = 0; c < n; c++) {
        if (settings.jumpAtBarStart >= 1 && !barStartSet[c]) continue;
        // Avoid anchor selection on near-silence.
        if (energies[c] < 0.03) continue;
        candidates.push(c);
    }
    if (!candidates.length) {
        candidates = [];
        for (var c2 = 0; c2 < n; c2++) candidates.push(c2);
    }

    // Choose diverse anchors via farthest-point sampling.
    var anchors = [];
    var anchorCount = Math.min(settings.anchorCount || 6, Math.max(2, candidates.length));
    var seed = candidates[0] || 0;
    var bestE = -1;
    for (var s = 0; s < candidates.length; s++) {
        var idx = candidates[s];
        if (energies[idx] > bestE) {
            bestE = energies[idx];
            seed = idx;
        }
    }
    anchors.push(seed);

    var minSpan = settings.minSpanBeats || 0;
    for (var a = 1; a < anchorCount; a++) {
        var bestIdx = null;
        var bestScore = -Infinity;
        for (var p = 0; p < candidates.length; p++) {
            var cand = candidates[p];
            var ok = true;
            var minD = Infinity;
            for (var q = 0; q < anchors.length; q++) {
                var prev = anchors[q];
                if (minSpan > 0 && Math.abs(cand - prev) < minSpan) {
                    ok = false;
                    break;
                }
                var d = featureDist(cand, prev);
                if (d < minD) minD = d;
            }
            if (!ok) continue;
            if (minD > bestScore) {
                bestScore = minD;
                bestIdx = cand;
            }
        }
        if (bestIdx === null) break;
        anchors.push(bestIdx);
    }

    // Sort anchors along a chosen axis to get a stable "carousel" order.
    anchors = Array.from(new Set(anchors));
    var axis = settings.spinAxis || 2;
    anchors.sort(function(aIdx, bIdx) {
        var av = axis === 0 ? energies[aIdx] : axis === 1 ? brightness[aIdx] : pitchVals[aIdx];
        var bv = axis === 0 ? energies[bIdx] : axis === 1 ? brightness[bIdx] : pitchVals[bIdx];
        if (av === bv) return aIdx - bIdx;
        return av - bv;
    });

    // Anchor bar starts (for clean jumps).
    var anchorStarts = anchors.map(function(idx) {
        if (settings.jumpAtBarStart < 1) return idx;
        var barPos = beatBarPos[idx] || 0;
        return barStartBeat[barPos] || idx;
    });

    return {
        energies: energies,
        brightness: brightness,
        pitch: pitchVals,
        barKeyByBeat: barKeyByBeat,
        barStartBeat: barStartBeat,
        barEndBeat: barEndBeat,
        beatBarPos: beatBarPos,
        barStartSet: barStartSet,
        anchors: anchors,
        anchorStarts: anchorStarts
    };
}

function orbitWeaverIsBarBoundary(state, beatIdx, beatsLen) {
    if (!state || !state.barKeyByBeat || typeof beatIdx !== "number") return false;
    if (beatsLen === undefined || beatsLen === null) {
        beatsLen = state.barKeyByBeat.length || 0;
    }
    var idx = Math.round(beatIdx);
    if (idx < 0 || idx >= beatsLen) return false;
    if (idx === beatsLen - 1) return true;
    return state.barKeyByBeat[idx] !== state.barKeyByBeat[idx + 1];
}

function orbitWeaverAnchorProximity(state, beatIdx, anchorIdx) {
    if (!state || !state.energies) return 0;
    var e = state.energies[beatIdx] || 0;
    var b = state.brightness[beatIdx] || 0;
    var p = state.pitch[beatIdx] || 0;

    var ae = state.energies[anchorIdx] || 0;
    var ab = state.brightness[anchorIdx] || 0;
    var ap = state.pitch[anchorIdx] || 0;

    var dist = 0.30 * Math.abs(e - ae) + 0.30 * Math.abs(b - ab) + 0.40 * orbitWeaverCircDist(p, ap);
    return clamp01(1 - dist);
}

function orbitWeaverPickFromEdges(curIdx, state, settings, targetAnchorBeatIdx, history) {
    settings = sanitizeOrbitWeaverSettings(settings, ADVANCED_DEFAULTS.orbitWeaver);
    if (!serverLoopCandidateMap || !serverLoopCandidateMap[curIdx]) return null;
    var edges = serverLoopCandidateMap[curIdx] || [];
    if (!edges.length) return null;

    var minSim = settings.minSimilarity || 0;
    var minSpan = settings.minSpanBeats || 0;
    var excl = settings.excludeNeighborBeats || 0;
    var recentWindow = settings.recentWindowBeats || 0;
    var repPenalty = settings.repeatPenalty || 0;
    var secBias = settings.sameSectionBias || 0;
    var pull = settings.anchorPull || 0;

    var scored = [];
    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!edge || typeof edge.target !== "number") continue;
        var cand = Math.round(edge.target);
        if (!masterQs || cand < 0 || cand >= masterQs.length) continue;
        if (cand === curIdx) continue;

        var span = Math.abs(cand - curIdx);
        if (span < minSpan) continue;
        if (excl > 0 && span <= excl) continue;
        if (settings.jumpAtBarStart >= 1 && !state.barStartSet[cand]) continue;

        var simRaw = (typeof edge.similarity === "number") ? edge.similarity : 0;
        var sim = simRaw < 0 ? (simRaw + 1) / 2 : simRaw;
        sim = clamp01(sim);
        if (sim < minSim) continue;

        var prox = orbitWeaverAnchorProximity(state, cand, targetAnchorBeatIdx);
        var sameSection = !!(edge.section_match || edge.sectionMatch || edge.sameSection);
        var sectionBonus = sameSection ? (0.02 + 0.06 * secBias) : 0;
        var repeatCount = orbitWeaverCountRecent(history, cand, recentWindow);
        var penalty = repeatCount > 0 ? Math.min(0.85, repeatCount * repPenalty) : 0;
        var jitter = (Math.random() - 0.5) * (settings.temperature || 0.25) * 0.04;

        var score = (1 - pull) * sim + pull * prox + sectionBonus + jitter - penalty;
        scored.push({ target: cand, score: score });
    }
    if (!scored.length) return null;

    scored.sort(function(a, b) { return b.score - a.score; });
    var pool = scored.slice(0, Math.max(1, Math.min(settings.topK || 12, scored.length)));
    if (pool.length === 1) return pool[0].target;

    var temperature = settings.temperature || 0.25;
    var maxScore = pool[0].score;
    var weights = [];
    var total = 0;
    for (var w = 0; w < pool.length; w++) {
        var ww = Math.exp((pool[w].score - maxScore) / temperature);
        weights[w] = ww;
        total += ww;
    }
    var r = Math.random() * total;
    for (var j = 0; j < pool.length; j++) {
        r -= weights[j];
        if (r <= 0) return pool[j].target;
    }
    return pool[0].target;
}

function orbitWeaverFallbackToAnchor(state, settings, anchorBeatIdx) {
    if (!state) return anchorBeatIdx;
    if (settings.jumpAtBarStart >= 1 && !state.barStartSet[anchorBeatIdx]) {
        var barPos = state.beatBarPos[anchorBeatIdx] || 0;
        return state.barStartBeat[barPos] || anchorBeatIdx;
    }
    return anchorBeatIdx;
}

function createOrbitWeaverDriver(player, options) {
    options = options || {};
    var modeName = "orbitweaver";
    var running = false;
    var processTimer = null;
    var mtime = $("#mtime");

    var settings = sanitizeOrbitWeaverSettings(options, ADVANCED_DEFAULTS.orbitWeaver);
    var state = null;
    var history = [];

    var currentIndex = 0;
    var anchorPos = 0;
    var barsLeft = settings.barsPerAnchor || 1;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function scheduleNext(delaySeconds) {
        clearProcessTimer();
        var ms = Math.max(0.1, delaySeconds || 0.1) * 1000;
        processTimer = setTimeout(function() {
            if (running) process();
        }, ms);
    }

    function ensureState() {
        if (!state) {
            state = buildOrbitWeaverState(masterQs, settings);
            anchorPos = 0;
            barsLeft = settings.barsPerAnchor || 1;
            history = [];
        }
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        clearOverlayChips();
        $("#play").text("Play");
        setPlayingClass(null);
        notifyStackPlaybackStateChange({ playing: false, mode: modeName });
    }

    function pausePlayback() {
        if (!running) return;
        running = false;
        clearProcessTimer();
        player.stop();
        $("#play").text("Resume");
        setPlayingClass(null);
        notifyStackPlaybackStateChange({ playing: false, mode: modeName });
    }

    function shouldAttemptJump() {
        var chance = settings.applyChance || 1.0;
        return Math.random() <= chance;
    }

    function remember(idx) {
        history.push(idx);
        var maxKeep = Math.max(16, settings.recentWindowBeats || 0);
        if (history.length > maxKeep * 2) {
            history = history.slice(history.length - maxKeep * 2);
        }
    }

    function computeProposedNext() {
        if (!state || !state.anchors || !state.anchors.length) {
            return currentIndex + 1;
        }

        if (!orbitWeaverIsBarBoundary(state, currentIndex, masterQs ? masterQs.length : null)) {
            return currentIndex + 1;
        }

        // Bar boundary.
        if (barsLeft > 1) {
            barsLeft -= 1;
            return currentIndex + 1;
        }

        // Switch anchor target on boundary.
        anchorPos = (anchorPos + 1) % state.anchors.length;
        barsLeft = settings.barsPerAnchor || 1;
        if (!shouldAttemptJump()) {
            return currentIndex + 1;
        }

        var targetAnchorBeat = state.anchorStarts[anchorPos] || state.anchors[anchorPos] || 0;
        var picked = orbitWeaverPickFromEdges(currentIndex, state, settings, targetAnchorBeat, history);
        if (typeof picked === "number" && isFinite(picked)) {
            remember(picked);
            return picked;
        }
        return orbitWeaverFallbackToAnchor(state, settings, targetAnchorBeat);
    }

    function process() {
        if (!running || !masterQs || !masterQs.length) return;
        ensureState();

        if (currentIndex >= masterQs.length) {
            if (window.harmonizerLoopEnabled) {
                currentIndex = 0;
            } else if (autoPlayNext && playNextInQueue()) {
                return;
            } else {
                stop();
                return;
            }
        }
        if (currentIndex < 0) currentIndex = 0;

        var q = masterQs[currentIndex];
        if (!q) {
            currentIndex = Math.max(0, Math.min(masterQs.length - 1, currentIndex + 1));
            scheduleNext(0.25);
            return;
        }

        q.tile.highlight();
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);

        notifyStackOnBeat({
            mode: modeName,
            currentIndex: currentIndex,
            beat: q,
            anchorPos: anchorPos,
            barsLeft: barsLeft
        });

        var delay = player.playQ(q);
        var proposed = computeProposedNext();
        var nextIdx = applyStackedNextIndex({
            mode: modeName,
            currentIndex: currentIndex,
            proposedIndex: proposed,
            beat: q,
            proposedReason: "orbitweaver"
        });

        if (nextIdx !== currentIndex + 1 && nextIdx !== currentIndex) {
            if (typeof drawJumpArcHighlight === "function") {
                drawJumpArcHighlight(currentIndex, nextIdx, false);
            }
        }

        currentIndex = nextIdx;
        scheduleNext(delay);
    }

    function rebuildFromSettings(customSettings) {
        settings = sanitizeOrbitWeaverSettings(customSettings, ADVANCED_DEFAULTS.orbitWeaver);
        state = null;
        history = [];
        anchorPos = 0;
        barsLeft = settings.barsPerAnchor || 1;
    }

    return {
        start: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            rebuildFromSettings(getOrbitWeaverSettings());
            clearProcessTimer();
            currentIndex = 0;
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },
        resume: function() {
            if (!masterQs || !masterQs.length) return;
            resetTileColors(masterQs);
            running = true;
            markPlaybackStarted();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },
        stop: stop,
        pause: pausePlayback,
        isRunning: function() { return running; },
        player: player,
        setNextQ: function(q) {
            if (!q || typeof q.which !== "number") return;
            currentIndex = q.which;
            anchorPos = 0;
            barsLeft = settings.barsPerAnchor || 1;
            history = [];
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(q.median_volume || q.volume || baseNoteStrength);
            }
        },
        applySettings: function(customSettings) {
            rebuildFromSettings(customSettings);
        },
        onStackChange: function() {},
        get curQ() { return currentIndex; },
        get running() { return running; }
    };
}

registerStackLayer({
    id: "orbitweaver",
    label: "Orbit Weaver",
    description: "Cycle a carousel of diverse anchors, weaving via similarity at bar boundaries.",
    factory: function(ctx) {
        if (!ctx || !ctx.beats || !ctx.beats.length) return null;
        var settings = getOrbitWeaverSettings();
        var state = buildOrbitWeaverState(ctx.beats, settings);
        if (!state || !state.anchors || !state.anchors.length) return null;

        var anchorPos = 0;
        var barsLeft = settings.barsPerAnchor || 1;
        var history = [];

        function remember(idx) {
            history.push(idx);
            if (history.length > 256) history = history.slice(history.length - 256);
        }

        return {
            transformNextIndex: function(meta) {
                if (!meta || typeof meta.currentIndex !== "number" || typeof meta.proposedIndex !== "number") return null;
                if ((meta.mode || "").toLowerCase() === "orbitweaver") return null;
                if (Math.random() > (settings.applyChance || 1.0)) return null;

                var cur = meta.currentIndex;
                var proposed = meta.proposedIndex;
                if (settings.overrideJumps < 1 && proposed !== cur + 1) {
                    return null;
                }

                if (!orbitWeaverIsBarBoundary(state, cur, ctx && ctx.beats ? ctx.beats.length : null)) return null;

                if (barsLeft > 1) {
                    barsLeft -= 1;
                    return null;
                }

                anchorPos = (anchorPos + 1) % state.anchors.length;
                barsLeft = settings.barsPerAnchor || 1;

                var targetAnchorBeat = state.anchorStarts[anchorPos] || state.anchors[anchorPos] || 0;
                remember(cur);
                var picked = orbitWeaverPickFromEdges(cur, state, settings, targetAnchorBeat, history);
                if (typeof picked === "number" && isFinite(picked)) {
                    remember(picked);
                    return { index: picked };
                }
                return { index: orbitWeaverFallbackToAnchor(state, settings, targetAnchorBeat) };
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    anchorPos = 0;
                    barsLeft = settings.barsPerAnchor || 1;
                    history = [];
                }
            },
            dispose: function() {
                anchorPos = 0;
                barsLeft = settings.barsPerAnchor || 1;
                history = [];
            }
        };
    }
});

// Register Elastic Velocity as a stackable speed warp layer.
registerStackLayer({
    id: "elasticvelo",
    label: "Elastic Velocity",
    description: "Map beat energy to playback speed (nightcore ↔ vaporwave).",
    factory: function(ctx) {
        var player = driver && driver.player ? driver.player : null;
        if (!player || typeof player.setSpeedFactor !== "function") {
            return null;
        }
        var settings = getElasticVelocitySettings();
        var smoothRate = null;
        var lastRate = 1.0;

        function reset() {
            smoothRate = null;
            lastRate = 1.0;
            try { player.setSpeedFactor(1.0); } catch (e) {}
        }

        function computeRate(beat) {
            var energy = elasticVelocityEnergy01(beat);
            var target = elasticVelocityMapRate(energy, settings);
            var smoothingBeats = settings.smoothingBeats || 0;
            var alpha = smoothingBeats <= 0 ? 1.0 : (1.0 / (1.0 + smoothingBeats));
            if (smoothRate === null || !isFinite(smoothRate)) {
                smoothRate = target;
            } else {
                smoothRate = smoothRate + alpha * (target - smoothRate);
            }
            var rate = smoothRate;
            var maxDelta = settings.maxDeltaPerBeat || 0;
            if (maxDelta > 0 && isFinite(lastRate)) {
                rate = clampNumber(rate, lastRate - maxDelta, lastRate + maxDelta);
            }
            rate = clampNumber(rate, settings.minRate, settings.maxRate);
            lastRate = rate;
            return rate;
        }

        return {
            onBeat: function(meta) {
                if (!meta || !meta.beat) return;
                if ((meta.mode || "").toLowerCase() === "elasticvelo") return;
                var rate = computeRate(meta.beat);
                try { player.setSpeedFactor(rate); } catch (e) {}
            },
            onPlaybackStateChange: function(meta) {
                if (meta && meta.playing === false) {
                    reset();
                }
            },
            dispose: function() {
                reset();
            }
        };
    }
});

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
    // Let phrases breathe, but still guarantee swaps
    var BORING_CROSS_AFTER = 64; // ~16 bars
    var FORCE_CROSS_ONLY_AFTER = 64; // once this hits, ignore intra edges

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
    var autohEdgeUsage = {};
    var AUTOH_EDGE_USAGE_DECAY_INTERVAL = 16;
    var autohBeatsSinceUsageDecay = 0;
    var AUTOH_EDGE_USAGE_DECAY_FACTOR = 0.96;
    var AUTOH_EDGE_USAGE_DECAY_THRESHOLD = 0.2;

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

    // Track for audio-driven processing
    var lastProcessedBeat = -1;
    var heartbeatInterval = null;

    // Heartbeat using setInterval - doesn't depend on timeupdate events
    // setInterval is throttled to ~1000ms in background tabs, but that's enough
    function heartbeat() {
        if (!running) {
            return;
        }

        var currentController = getControllerForTrack(currentTrack);
        if (!currentController || !currentController.audio) {
            return;
        }

        // CRITICAL: Always ensure current track is playing
        // Background tabs can pause audio at any time, especially after seek/play
        if (currentController.audio.paused) {
            console.log("[Autoharmonizer] Heartbeat restarting paused audio");
            currentController.ensurePlaying();
        }

        // Audio-driven beat advancement: check if we've passed the current beat's end
        var currentTime = currentController.audio.currentTime;
        var beats = getBeatsForTrack(currentTrack);
        if (beats && beats.length && curQ < beats.length) {
            var currentBeat = beats[curQ];
            var beatEnd = (currentBeat.start || 0) + (currentBeat.duration || 0.25);

            // If audio has progressed past the current beat's end, advance
            if (currentTime >= beatEnd - 0.05 && curQ !== lastProcessedBeat) {
                console.log("[Autoharmonizer] Heartbeat advancing beat", curQ, "->", curQ + 1, "at time", currentTime.toFixed(2));
                lastProcessedBeat = curQ;
                clearProcessTimer();
                process();
                return;
            }
        }

        // Fallback: if no timer is scheduled, schedule one
        if (!processTimer) {
            scheduleNextProcess(0);
        }
    }

    // Start interval-based heartbeat (500ms when focused, still works at ~1000ms when backgrounded)
    function startHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        heartbeatInterval = setInterval(heartbeat, 500);
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    // Also listen to timeupdate for faster response when tab is focused
    if (track1Controller && track1Controller.audio) {
        track1Controller.audio.addEventListener("timeupdate", heartbeat);
    }
    if (track2Controller && track2Controller.audio) {
        track2Controller.audio.addEventListener("timeupdate", heartbeat);
    }

    if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("visibilitychange", function() {
            if (!running) {
                return;
            }
            // When tab becomes visible again, immediately restart audio
            var currentController = getControllerForTrack(currentTrack);
            if (currentController && currentController.audio && currentController.audio.paused) {
                console.log("[Autoharmonizer] Tab visible - restarting audio");
                currentController.ensurePlaying();
            }
            // Force immediate process check
            lastProcessedBeat = -1;
            if (!processTimer) {
                scheduleNextProcess(0);
            }
        });
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
            // Retry playback after a short delay if it fails (background tabs can reject play())
            setTimeout(function() {
                if (running && controller.audio && controller.audio.paused) {
                    controller.ensurePlaying();
                }
            }, 100);
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

        // Multiple retries to ensure playback starts (browsers can be stubborn)
        var retryCount = 0;
        var maxRetries = 5;
        function retryPlayback() {
            if (!running) return;
            if (targetController.audio && targetController.audio.paused) {
                retryCount++;
                console.log("[Autoharmonizer] Retry playback attempt", retryCount);
                targetController.ensurePlaying();
                if (retryCount < maxRetries) {
                    setTimeout(retryPlayback, 100);
                }
            }
        }
        setTimeout(retryPlayback, 50);

        // Fade out source track but DON'T pause it - let it keep playing silently
        // This ensures timeupdate events keep firing for heartbeat
        if (sourceController) {
            sourceController.fadeTo(0, fadeWindow);
            // Don't pause - just keep it at volume 0
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

    function decayAutohEdgeUsage() {
        Object.keys(autohEdgeUsage).forEach(function(key) {
            var v = autohEdgeUsage[key] * AUTOH_EDGE_USAGE_DECAY_FACTOR;
            if (v < AUTOH_EDGE_USAGE_DECAY_THRESHOLD) {
                delete autohEdgeUsage[key];
            } else {
                autohEdgeUsage[key] = v;
            }
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
            // Bar visit shaping: mild burnout plus coverage bonus for under-visited bars
            var barIndex = tb && typeof tb.bar_index === "number" ? tb.bar_index : null;
            var barVisits = 0;
            if (barIndex !== null && visitedBars[tgtTrack]) {
                barVisits = visitedBars[tgtTrack][barIndex] || 0;
                var visitPenalty = barVisits * 0.08;
                var coverageBonus = Math.max(0, 0.18 - barVisits * 0.05);
                score -= visitPenalty;
                score += coverageBonus;
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
            // Edge-usage penalty: discourage reusing the same transition too often
            var edgeKey = trackNum + ":" + currentBeatIdx + ":" + tgtTrack + ":" + tgtIdx;
            var usageCount = autohEdgeUsage[edgeKey] || 0;
            if (usageCount > 0) {
                var usagePenalty = Math.min(0.5, Math.log(1 + usageCount) * 0.2);
                score -= usagePenalty;
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
        autohEdgeUsage = {};
        autohBeatsSinceUsageDecay = 0;
        visitedBars = { 1: {}, 2: {} };
        recentTargets = { 1: [], 2: [] };
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

        // When "Base audio only" is enabled, avoid cross-track playback – stay on the current track only
        var baseAudioOnly = (typeof window !== "undefined" && !!window.harmonizerBaseAudioOnly);

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
        autohBeatsSinceUsageDecay += 1;
        if (autohBeatsSinceUsageDecay >= AUTOH_EDGE_USAGE_DECAY_INTERVAL) {
            autohBeatsSinceUsageDecay = 0;
            decayAutohEdgeUsage();
        }

        var beatDuration = Math.max(currentBeat.duration || 0.25, 0.15);
        var bored = beatsSinceCross >= BORING_CROSS_AFTER;
        var forceCrossOnly = beatsSinceCross >= FORCE_CROSS_ONLY_AFTER;
        var forceCross = beatsSinceCross >= FORCE_CROSS_AFTER || bored;
        var preferCross = forceCross || bored;
        // Enforce longer dwell before any jump
        var hardDwell = Math.max(minDwellBeats, 16);
        var allowJump = beatsSinceJump >= hardDwell;
        var allowCross = !baseAudioOnly; // in base-audio-only mode, never cross to the other track
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
            if (!baseAudioOnly && otherBeats && otherBeats.length) {
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
            var usageKey = currentTrack + ":" + curQ + ":" + choice.track + ":" + choice.index;
            autohEdgeUsage[usageKey] = (autohEdgeUsage[usageKey] || 0) + 1;
            if (isSameTrack) {
                curQ = choice.index % beatsForTrack.length;
                lastProcessedBeat = -1; // Reset so heartbeat can detect next beat
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
                lastProcessedBeat = -1; // Reset so heartbeat can detect next beat
                crossfadeToTrack(choice.track, choice.index, 480);
                beatsSinceCross = 0;
                beatsSinceJump = 0;
                return;
            }
        }

        // Sequential playback - continue to next beat
        curQ = (curQ + 1) % beats.length;
        lastProcessedBeat = -1; // Reset so heartbeat can detect next beat
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
            autohEdgeUsage = {};
            autohBeatsSinceUsageDecay = 0;
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
            startHeartbeat(); // Start interval-based heartbeat for background tab support
            process();
        },
        stop: function() {
            stopHeartbeat();
            stopPlayback({ resetPosition: true });
        },
        pause: function() {
            if (!running) {
                return;
            }
            running = false;
            clearProcessTimer();
            stopHeartbeat();
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
            autohEdgeUsage = {};
            autohBeatsSinceUsageDecay = 0;
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
            // Ensure heartbeat is running so jumps and crossfades continue even when tab is unfocused
            startHeartbeat();
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
    // Keep AutoCrooner FX isolated: only enable the crooner bus in autocrooner mode.
    if (player && typeof player.setCroonerEnabled === "function") {
        try { player.setCroonerEnabled(mode === "autocrooner"); } catch (e) {}
    }
    if (mode === "jukebox") {
        var jukeboxSettings = getLoopSettingsForMode("jukebox");
        return createJukeboxDriver(player, jukeboxSettings);
    } else if (mode === "eternal") {
        var eternalSettings = getLoopSettingsForMode("eternal");
        return createJukeboxDriver(player, eternalSettings);
    } else if (mode === "autocrooner") {
        return createAutoCroonerDriver(player);
    } else if (mode === "dopamine") {
        var dopamineSettings = getDopamineMinerSettings();
        return createDopamineMinerDriver(player, dopamineSettings);
	    } else if (mode === "harmonictrap") {
	        var harmonicSettings = getHarmonicTrapSettings();
	        return createHarmonicTrapDriver(player, harmonicSettings);
	    } else if (mode === "phaseshifter") {
	        var phaseSettings = getPhaseShifterSettings();
	        return createPhaseShifterDriver(player, phaseSettings);
	    } else if (mode === "granularfreeze") {
	        var granularSettings = getGranularFreezeSettings();
	        return createGranularFreezeDriver(player, granularSettings);
	    } else if (mode === "elasticvelo") {
	        var elasticSettings = getElasticVelocitySettings();
	        return createElasticVeloDriver(player, elasticSettings);
	    } else if (mode === "mathrocker") {
	        var mathSettings = getMathRockerSettings();
	        return createMathRockerDriver(player, mathSettings);
	    } else if (mode === "stalker") {
	        var stalkerSettings = getStalkerSettings();
	        return createStalkerDriver(player, stalkerSettings);
	    } else if (mode === "timbresurf") {
	        var timbreSettings = getTimbreSurfingSettings();
	        return createTimbreSurfDriver(player, timbreSettings);
	    } else if (mode === "chromastack") {
	        var chromaSettings = getChromaStackingSettings();
	        return createChromaStackDriver(player, chromaSettings);
	    } else if (mode === "beatsort") {
	        var sortSettings = getBeatSortingSettings();
	        return createBeatSortingDriver(player, sortSettings);
	    } else if (mode === "reversebloom") {
	        var bloomSettings = getReverseBloomSettings();
	        return createReverseBloomDriver(player, bloomSettings);
	    } else if (mode === "barberpole") {
	        var poleSettings = getBarberPoleSettings();
	        return createBarberPoleDriver(player, poleSettings);
	    } else if (mode === "palindrome") {
	        var palSettings = getPalindromeEngineSettings();
	        return createPalindromeDriver(player, palSettings);
	    } else if (mode === "spectralgravity") {
	        var gravSettings = getSpectralGravitySettings();
	        return createSpectralGravityDriver(player, gravSettings);
	    } else if (mode === "callresponse") {
	        var crSettings = getCallResponseSettings();
	        return createCallResponseDriver(player, crSettings);
	    } else if (mode === "orbitweaver") {
	        var owSettings = getOrbitWeaverSettings();
	        return createOrbitWeaverDriver(player, owSettings);
	    } else if (mode === "autoharmonizer") {
	        return createAutoharmonizerDriver(player);
	    } else if (mode === "sculptor") {
	        return createSectionSculptorDriver(player);
	    }
    return createCanonDriver(player);
}

// Stack modal UI
$(document).ready(function() {
    var stackModal = $("#stack-modal");
    var stackToggleBtn = $("#stack-toggle");
    var stackListRoot = $("#stack-layer-list");

    function renderStackList() {
        if (!stackListRoot || !stackListRoot.length) return;
        stackListRoot.empty();
        var layers = (typeof window.getAvailableStackLayers === "function") ? window.getAvailableStackLayers() : [];
        var active = (typeof window.getStackedLayers === "function") ? window.getStackedLayers() : [];
        if (!layers.length) {
            stackListRoot.append('<p style="color:#888; margin:0;">No stackable modes yet.</p>');
            return;
        }
        var baseOrder = ["phaseshifter", "elasticvelo", "reversebloom"];
        var baseSet = {};
        baseOrder.forEach(function(id) { baseSet[id] = true; });
        var baseMap = {};
        var experimentalLayers = [];
        layers.forEach(function(layer) {
            var id = (layer.id || "") + "";
            if (baseSet[id]) {
                baseMap[id] = layer;
            } else {
                experimentalLayers.push(layer);
            }
        });
        var baseLayers = baseOrder.map(function(id) { return baseMap[id]; }).filter(Boolean);
        var orderedLayers = baseLayers.concat(experimentalLayers);

        orderedLayers.forEach(function(layer, idx) {
            if (baseLayers.length && experimentalLayers.length && idx === baseLayers.length) {
                stackListRoot.append('<div class="stack-divider" aria-hidden="true"></div>');
            }
            var id = (layer.id || "") + "";
            var isOn = active.indexOf(id) !== -1;
            var item = $('<label style="display:flex; flex-direction:column; gap:4px; padding:8px; border:1px solid rgba(232,180,184,0.15); border-radius:6px; background:rgba(255,255,255,0.03); cursor:pointer;"></label>');
            var header = $('<div style="display:flex; align-items:center; gap:8px;"></div>');
            var checkbox = $('<input type="checkbox" />').attr("data-layer-id", id);
            checkbox.prop("checked", isOn);
            var title = $('<span style="font-weight:600; color:rgba(232,180,184,0.95);"></span>').text(layer.label || id);
            header.append(checkbox);
            header.append(title);
            item.append(header);
            if (layer.description) {
                item.append($('<span style="font-size:0.85rem; color:rgba(232,180,184,0.7);"></span>').text(layer.description));
            }
            checkbox.on("change", function() {
                var current = (typeof window.getStackedLayers === "function") ? window.getStackedLayers() : [];
                var next = current.slice();
                if (this.checked) {
                    if (next.indexOf(id) === -1) next.push(id);
                } else {
                    next = next.filter(function(x) { return x !== id; });
                }
                if (typeof window.setStackedLayers === "function") {
                    window.setStackedLayers(next);
                }
            });
            stackListRoot.append(item);
        });
    }

    function openStackModal() {
        renderStackList();
        stackModal.show();
    }

    if (stackToggleBtn && stackToggleBtn.length) {
        stackToggleBtn.on("click", function() {
            openStackModal();
        });
    }

    $("#stack-modal-close, #stack-modal-cancel").on("click", function() {
        stackModal.hide();
    });

    $("#stack-modal-clear").on("click", function() {
        if (typeof window.clearStackedLayers === "function") {
            window.clearStackedLayers();
        }
        renderStackList();
    });

    stackModal.on("click", function(e) {
        if (e.target === stackModal[0]) {
            stackModal.hide();
        }
    });

    updateStackButtonLabel();
});

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
