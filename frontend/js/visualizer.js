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

var remixer = null;
var driver = null;
var mode = "canon";
var curTrack = null;
var masterQs = null;
var masterGain = .55;
var masterColor = "#E8B4B8";
var otherColor = "#F9F6F2";
var trackDuration;
var masterCursor = null;
var otherCursor = null;

var paper = null;
var W = 1000;
var H = 300;
var TH = 450;
var CH = (TH - H) - 10;
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

// Queue management
var trackQueue = [];
var currentQueueIndex = -1;
var selectedQueueIndex = -1;
var autoPlayNext = false;
var ADVANCED_DEFAULTS = {
    canonOverlay: {
        musicality: 65,
        minOffsetBeats: 8,
        maxOffsetBeats: 64,
        dwellBeats: 6,
        density: 2,
        jumpBubbleBeats: 8,
        variation: 2
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
    }
};

function cloneSettings(obj) {
    return JSON.parse(JSON.stringify(obj));
}

var advancedSettings = {
    canonOverlay: cloneSettings(ADVANCED_DEFAULTS.canonOverlay),
    eternalOverlay: cloneSettings(ADVANCED_DEFAULTS.eternalOverlay),
    jukeboxLoop: cloneSettings(ADVANCED_DEFAULTS.jukeboxLoop),
    eternalLoop: cloneSettings(ADVANCED_DEFAULTS.eternalLoop)
};

var canonAdvancedEnabled = false;
var canonSettings = advancedSettings.canonOverlay;

var advancedEnabled = {
    canonOverlay: false,
    eternalOverlay: false,
    jukeboxLoop: false,
    eternalLoop: false
};

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

var BASE_AUDIO_ONLY_STORAGE_KEY = "harmonizer:baseAudioOnly";
var overlayMuteEnabled = false;

(function hydrateBaseAudioOnlyPreference() {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            var stored = window.localStorage.getItem(BASE_AUDIO_ONLY_STORAGE_KEY);
            if (stored === "1") {
                overlayMuteEnabled = true;
            }
        }
    } catch (err) {
        overlayMuteEnabled = false;
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
    advancedPresets.canonOverlay = [
        {
            id: DEFAULT_CANON_PRESET_ID,
            name: "Legacy Default",
            settings: legacySettings,
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
    if (mode === "jukebox") {
        drawLoopConnections(masterQs, loopEdges, false);
    } else if (mode === "eternal") {
        // Redraw both canon overlays and loop connections
        drawConnections(masterQs);
        drawLoopConnections(masterQs, loopEdges, true);
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

function syncBaseAudioToggleUI() {
    if (typeof document === "undefined") {
        return;
    }
    var toggle = document.getElementById("base-audio-only-toggle");
    if (toggle) {
        toggle.checked = overlayMuteEnabled;
    }
    if (document.body) {
        document.body.classList.toggle("base-audio-only", overlayMuteEnabled);
    }
}

function applyOverlayMuteState() {
    if (!driver || !driver.player) {
        return;
    }
    var audioEngine = driver.player;
    if (audioEngine && typeof audioEngine.setOverlayMuted === "function") {
        audioEngine.setOverlayMuted(overlayMuteEnabled);
    }
}

function setBaseAudioOnlyPlayback(enabled) {
    var normalized = !!enabled;
    var changed = normalized !== overlayMuteEnabled;
    overlayMuteEnabled = normalized;
    if (changed) {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem(
                    BASE_AUDIO_ONLY_STORAGE_KEY,
                    overlayMuteEnabled ? "1" : "0"
                );
            }
        } catch (err) {
            // ignore persistence errors
        }
    }
    syncBaseAudioToggleUI();
    applyOverlayMuteState();
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

function getLoopSettingsForMode(modeName) {
    var groupKey = (modeName === "eternal") ? "eternalLoop" : "jukeboxLoop";
    var defaults = cloneAdvancedDefaults(groupKey);
    var state = cloneAdvancedState(groupKey);
    var useAdvanced = isAdvancedGroupEnabled(groupKey);
    var sanitized = sanitizeLoopSettings(useAdvanced ? state : defaults, defaults);
    sanitized.modeName = modeName;
    return sanitized;
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
    var nextPlayer = remixer.getPlayer();
    if (!nextPlayer) {
        driver = null;
        return;
    }
    driver = Driver(nextPlayer);
    applyOverlayMuteState();
    if (resume && driver && typeof driver.start === "function") {
        driver.start();
    }
}

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
    $("#status-panel").text(s);
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
                        section_match: cand.section_match || false
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
    } else {
        canonLoopCandidates = [];
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
    window.setBaseAudioOnlyPlayback = setBaseAudioOnlyPlayback;
    window.isBaseAudioOnlyPlaybackEnabled = function() { return overlayMuteEnabled; };
    window.setBeatRoundingEnabled = function(enabled) {
        setBeatRoundingEnabledInternal(enabled);
    };
    window.isBeatRoundingEnabled = function() {
        return beatRoundingEnabled;
    };
    window.getAdvancedSettings = function(group) {
        // If no group specified, return all settings
        if (!group) {
            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop'];
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

        var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop'];
        allGroups.forEach(function(group) {
            if (allSettings[group]) {
                var groupData = allSettings[group];

                // Set enabled state
                if (typeof groupData.enabled !== 'undefined') {
                    setAdvancedGroupEnabledFlag(group, groupData.enabled);
                }

                // Set settings values
                if (groupData.settings) {
                    Object.keys(groupData.settings).forEach(function(key) {
                        setAdvancedGroupSettingValue(group, key, groupData.settings[key]);
                    });
                }
            }
        });

        console.log('[Settings] Applied imported settings to all groups');
    };

    window.syncAllGroupsFromState = function() {
        if (typeof window.syncGroupFromState === 'function') {
            var allGroups = ['canonOverlay', 'eternalOverlay', 'jukeboxLoop', 'eternalLoop'];
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
    masterQs = curTrack.analysis.beats;
    masterGain = (mode === "canon") ? 0.55 : (mode === "eternal" ? 0.7 : 1.0);
    _.each(masterQs, function(q1) {
        q1.section = getSection(q1);
    });
    prepareLoopCandidates(curTrack);
    canonLoopCandidates = [];
    canonBaseAssignments = [];

    var lastBeat = masterQs[masterQs.length - 1];
    var remaining = Math.max(trackDuration - lastBeat.start, 0.1);
    var durationSamples = _.map(masterQs.slice(0, -1), function(b) { return b.duration; });
    var medianDuration = durationSamples.length ? _.sortBy(durationSamples)[Math.floor(durationSamples.length / 2)] : remaining;
    var cap = medianDuration ? medianDuration * 1.6 : remaining;
    lastBeat.duration = Math.min(remaining, cap);

    _.each(masterQs, function(q1) {
        calculateNearestNeighborsForQuantum(masterQs, q1);
    });

    var canonApplied = false;
    if (mode === "canon" || mode === "eternal") {
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
            // Enable eternal overlay by default for eternal mode
            if (mode === "eternal" && !eternalAdvancedEnabled) {
                setEternalAdvancedEnabled(true);
            }
            if (eternalAdvancedEnabled) {
                regenerateEternalOverlay({ initial: true });
            } else {
                assignNormalizedVolumes(masterQs);
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
    pulseNotes(baseNoteStrength);
    $("#mode-pill").text(mode === "jukebox" ? "Eternal Jukebox" : (mode === "eternal" ? "Eternal Canonizer" : "Autocanonizer"));

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
    var remoteUrl = 'http://static.echonest.com/infinite_jukebox_data/' + trid + '.json';
    info('Fetching the analysis');
    $.getJSON(localUrl, function(data) { gotTheAnalysis(data); })
        .fail(function() {
            $.getJSON(remoteUrl, function(data) { gotTheAnalysis(data); })
                .fail(function() {
                    info("Sorry, can't find info for that track");
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
    document.body.classList.remove("playing-canon", "playing-jukebox");
    if (modeName === "canon") {
        document.body.classList.add("playing-canon");
        baseNoteStrength = 0.05;
    } else if (modeName === "jukebox") {
        document.body.classList.add("playing-jukebox");
        baseNoteStrength = 0.08;
    } else if (modeName === "eternal") {
        document.body.classList.add("playing-jukebox");
        baseNoteStrength = 0.1;
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
    var decayDelay = mode === "jukebox" ? 180 : 280;
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
        if (driver.pause && typeof driver.pause === "function") {
            driver.pause();
        } else {
            driver.stop();
        }
    } else {
        if (driver.resume && typeof driver.resume === "function") {
            driver.resume();
        } else {
            driver.start();
        }
    }
}

function init() {
    jQuery.ajaxSettings.traditional = true;  
    setDisplayMode(false);
    setPlayingClass(null);
    pulseNotes(baseNoteStrength);

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

    var baseAudioToggle = document.getElementById("base-audio-only-toggle");
    if (baseAudioToggle) {
        baseAudioToggle.addEventListener("change", function(event) {
            setBaseAudioOnlyPlayback(event.target.checked);
        });
    }
    syncBaseAudioToggleUI();

    var containerWidth = $("#tiles").innerWidth();
    if (!containerWidth || containerWidth < 100) {
        containerWidth = $(window).width() - 140;
    }
    W = containerWidth;
    paper = Raphael("tiles", W, TH);
    $(document).keydown(keydown);


    if (window.webkitAudioContext === undefined && window.AudioContext === undefined) {
        error("Sorry, this app needs advanced web audio. Your browser doesn't"
            + " support it. Try the latest version of Chrome, Firefox (nightly)  or Safari");

        hideAll();

    } else {
        var context = getAudioContext();
        var initialTrid = processParams();
        remixer = createJRemixer(context, $);
        var initialPlayer = remixer.getPlayer();
        driver = Driver(initialPlayer);
        applyOverlayMuteState();

        // Load playlist queue from sessionStorage if available
        loadPlaylistQueue();

        if (initialTrid) {
            fetchAnalysis(initialTrid);
        } else {
            info("Load a track to begin.");
        }
    }
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
            minimizeBtn.html("□");
        } else {
            minimizeBtn.html("−");
        }
    });

    // Close queue button handler
    $("#queue-close-btn").click(function() {
        $("#queue-container").hide();
        // Remove minimized class when closing
        $("#queue-container").removeClass("minimized");
        $("#queue-minimize-btn").html("−");
    });

    // Export settings button handler
    $("#export-settings-btn").click(function() {
        try {
            var allSettings = window.getAdvancedSettings();
            var settingsJSON = JSON.stringify(allSettings, null, 2);

            // Create a blob and download it
            var blob = new Blob([settingsJSON], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'harmonizer-settings.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('[Settings] Exported settings successfully');
        } catch (err) {
            console.error('[Settings] Failed to export settings:', err);
            alert('Failed to export settings: ' + err.message);
        }
    });

    // Import settings button handler
    $("#import-settings-btn").click(function() {
        // Create a file input element
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';

        fileInput.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function(event) {
                try {
                    var settingsJSON = event.target.result;
                    var allSettings = JSON.parse(settingsJSON);

                    // Apply the imported settings
                    window.setAdvancedSettings(allSettings);

                    // Sync UI with the new settings
                    window.syncAllGroupsFromState();

                    console.log('[Settings] Imported settings successfully');
                    alert('Settings imported successfully!');
                } catch (err) {
                    console.error('[Settings] Failed to import settings:', err);
                    alert('Failed to import settings: ' + err.message);
                }
            };
            reader.readAsText(file);
        };

        fileInput.click();
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

// ==============================
// Spotify Search & Player
// ==============================
(function() {
    var spotifyBtn = $("#spotify-search-btn");
    if (!spotifyBtn.length) {
        return;
    }
    var spotifyModal = $("#spotify-modal");
    var spotifyCloseBtn = $("#spotify-modal-close");
    var spotifyForm = $("#spotify-search-form");
    var spotifyInput = $("#spotify-search-input");
    var spotifyResults = $("#spotify-search-results");
    var spotifyStatus = $("#spotify-search-status");
    var spotifyPlayer = $("#spotify-player-panel");
    var spotifyPlayerClose = $("#spotify-player-close");
    var spotifyEmbed = $("#spotify-embed-frame");
    var activeController = null;

    function setSpotifyStatus(message, state) {
        if (!spotifyStatus.length) {
            return;
        }
        spotifyStatus.removeClass("error info");
        if (state) {
            spotifyStatus.addClass(state);
        }
        spotifyStatus.text(message || "");
    }

    function openSpotifyModal() {
        spotifyModal.show();
        setSpotifyStatus("", "");
        spotifyResults.empty();
        if (spotifyInput && spotifyInput.length) {
            setTimeout(function() {
                spotifyInput.trigger("focus");
            }, 60);
        }
    }

    function closeSpotifyModal() {
        spotifyModal.hide();
        if (activeController) {
            activeController.abort();
            activeController = null;
        }
        spotifyInput.val("");
        spotifyResults.empty();
        setSpotifyStatus("", "");
    }

    function showSpotifyPlayer(trackId) {
        if (!trackId || !spotifyEmbed.length) {
            return;
        }
        var src = "https://open.spotify.com/embed/track/" + encodeURIComponent(trackId) + "?utm_source=harmonizer";
        spotifyEmbed.attr("src", src);
        spotifyPlayer.removeClass("is-hidden");
    }

    function hideSpotifyPlayer() {
        spotifyPlayer.addClass("is-hidden");
        spotifyEmbed.attr("src", "");
    }

    function renderSpotifyResults(tracks) {
        spotifyResults.empty();
        if (!tracks || !tracks.length) {
            setSpotifyStatus("No Spotify results found.", "info");
            return;
        }
        setSpotifyStatus("", "");
        tracks.forEach(function(track) {
            var artists = (track.artists || []).join(", ");
            var artwork = track.image
                ? '<img src="' + track.image + '" alt="Album art" loading="lazy">'
                : '<div class="spotify-artwork-placeholder">No Art</div>';
            var duration = "";
            if (track.duration_ms) {
                var totalSeconds = Math.round(track.duration_ms / 1000);
                var mins = Math.floor(totalSeconds / 60);
                var secs = totalSeconds % 60;
                duration = mins + ":" + String(secs).padStart(2, "0");
            }
            var playBtn = track.id
                ? '<button type="button" class="viz-button ghost small spotify-play-btn" data-track-id="' + track.id + '">Play</button>'
                : "";
            var external = track.external_url
                ? '<a class="spotify-open-link" href="' + track.external_url + '" target="_blank" rel="noopener">Open in Spotify</a>'
                : "";
            var markup =
                '<div class="spotify-result">' +
                artwork +
                '<div class="spotify-result-details">' +
                '<h4>' + (track.name || "Unknown track") + '</h4>' +
                '<p>' + (artists || "Unknown artist") + '</p>' +
                (track.album
                    ? '<p>' + track.album + (duration ? ' - ' + duration : '') + '</p>'
                    : duration
                    ? '<p>' + duration + '</p>'
                    : '') +
                '</div>' +
                '<div class="spotify-result-actions">' +
                playBtn +
                external +
                '</div>' +
                '</div>';
            spotifyResults.append(markup);
        });
    }

    function performSpotifySearch(query) {
        if (!window.fetch) {
            setSpotifyStatus("Browser does not support Spotify search.", "error");
            return;
        }
        if (activeController) {
            activeController.abort();
        }
        activeController = new AbortController();
        setSpotifyStatus("Searching Spotify�", "info");
        spotifyResults.empty();
        fetch("/api/spotify/search?q=" + encodeURIComponent(query), {
            signal: activeController.signal,
        })
            .then(function(resp) {
                if (!resp.ok) {
                    return resp.json().catch(function() {
                        return { error: "Spotify search failed." };
                    });
                }
                return resp.json();
            })
            .then(function(payload) {
                if (activeController) {
                    activeController = null;
                }
                if (!payload) {
                    setSpotifyStatus("Spotify search failed.", "error");
                    return;
                }
                if (payload.error) {
                    setSpotifyStatus(payload.error, "error");
                    return;
                }
                renderSpotifyResults(payload.tracks || []);
            })
            .catch(function(err) {
                if (err.name === "AbortError") {
                    return;
                }
                console.error("[Spotify] Search failed:", err);
                setSpotifyStatus("Spotify search failed. Try again.", "error");
            });
    }

    spotifyBtn.on("click", function() {
        openSpotifyModal();
    });

    spotifyCloseBtn.on("click", function() {
        closeSpotifyModal();
    });

    spotifyModal.on("click", function(evt) {
        if (evt.target === spotifyModal[0]) {
            closeSpotifyModal();
        }
    });

    $(document).on("keydown", function(evt) {
        if (evt.key === "Escape" && spotifyModal.is(":visible")) {
            closeSpotifyModal();
        }
    });

    spotifyForm.on("submit", function(evt) {
        evt.preventDefault();
        var query = (spotifyInput.val() || "").trim();
        if (!query) {
            setSpotifyStatus("Enter a search phrase.", "error");
            return;
        }
        performSpotifySearch(query);
    });

    spotifyResults.on("click", ".spotify-play-btn", function() {
        var trackId = $(this).data("trackId");
        if (trackId) {
            showSpotifyPlayer(trackId);
        }
    });

    spotifyPlayerClose.on("click", function() {
        hideSpotifyPlayer();
    });
})();

function setURL() {
    if (curTrack) {
        var p = "?trid=" + curTrack.id + "&mode=" + mode;
        history.replaceState({}, document.title, p);
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
    if (requestedMode === "jukebox" || requestedMode === "canon" || requestedMode === "eternal") {
        mode = requestedMode;
    }
    var trid = params.get("trid");
    return trid ? trid.trim() : null;
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

    highlight2: function() {
        this.rect.attr("fill", otherColor);
        this.rect.attr("stroke", otherColor);
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
            driver.setNextQ(that.q);
            if (!driver.isRunning()) {
                try {
                    if (remixer && typeof remixer.ensureContext === "function") {
                        await remixer.ensureContext();
                    }
                    driver.resume();
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

var vPad = 20;
var hPad = 20;

function createTiles(qlist) {
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
    } else if (mode === "jukebox") {
        var loopEdges = collectVisualizationLoops(80);
        drawLoopConnections(qlist, loopEdges, false);
    } else if (mode === "eternal") {
        // Draw both canon overlay connections AND loop connections with different colors
        drawConnections(qlist);
        var loopEdges = collectVisualizationLoops(80);
        drawLoopConnections(qlist, loopEdges, true);
    }
    updateCursors(qlist[0]);
    return tiles;
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
    var cursorWidth = 8;
    if (masterCursor == null) {
        masterCursor = paper.rect(0, H - vPad, cursorWidth, vPad / 2);
        //masterCursor.attr("stroke", masterColor);
        masterCursor.attr("fill", masterColor);

        otherCursor = paper.rect(0, H - vPad / 2 - 1, cursorWidth, vPad / 2);
        //otherCursor.attr("stroke", otherColor);
        otherCursor.attr("fill", otherColor);
    }
    var TW = W - hPad;
    var x = hPad + TW * q.start / trackDuration - cursorWidth / 2;
    masterCursor.attr( {x:x} );

    var ox = hPad + TW * q.other.start / trackDuration - cursorWidth / 2;
    if (q.ppath) {
        moveAlong(otherCursor, q.ppath, q.other.duration * .75);
    } else {
        otherCursor.attr( {x:ox} );
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
    } else if (q.overlappingSegments.length > 0) {
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
    var curQ = 0;
    var running = false;
    var mtime = $("#mtime");
    var processTimer = null;

    function clearProcessTimer() {
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
    }

    function stop() {
        running = false;
        clearProcessTimer();
        player.stop();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function process() {
        if (curQ >= masterQs.length) {
            // Check if we should auto-play the next track in queue
            if (autoPlayNext && playNextInQueue()) {
                console.log('[Canon Driver] Auto-playing next track in queue');
                return;
            }
            stop();
        } else if (running) {
            var nextQ = masterQs[curQ];
            var delay = player.playQ(nextQ);
            curQ++;
            clearProcessTimer();
            processTimer = setTimeout(function() {
                processTimer = null;
                process();
            }, 1000 * delay);
            nextQ.tile.highlight();
            if (nextQ.other && nextQ.other.tile) {
                nextQ.other.tile.highlight2();
            }

            updateCursors(nextQ);
            mtime.text(fmtTime(nextQ.start));
            pulseNotes(nextQ.median_volume || nextQ.volume || baseNoteStrength);
        }
    }

    return {
        start: function() {
            clearProcessTimer();
            resetTileColors(masterQs);
            // Prefer server-recommended start_index; otherwise start of section 0 on a bar boundary
            var startIdx = 0;
            try {
                if (curTrack && curTrack.analysis && curTrack.analysis.canon_alignment) {
                    var align = curTrack.analysis.canon_alignment;
                    var si = align.start_index;
                    var duration = trackDuration || (masterQs && masterQs.length ? masterQs[masterQs.length - 1].start + masterQs[masterQs.length - 1].duration : 0);
                    var beats = masterQs || [];
                    // clamp recommended start if itΓÇÖs too deep into the song
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
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass("canon");
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            if (running) {
                return;
            }
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass("canon");
            pulseNotes(baseNoteStrength);
        },

        pause: function() {
            if (!running) {
                return;
            }
            running = false;
            clearProcessTimer();
            if (player && typeof player.pause === "function") {
                player.pause();
            } else {
                player.stop();
            }
            $("#play").text("Play");
            setPlayingClass(null);
        },

        stop: stop,

        isRunning: function() {
            return running;
        },

        process: function() {
            process();
        },
        player: player,

        setNextQ: function(q) {
            curQ = q.which;
            if (!running) {
                q.tile.highlight();
                updateCursors(q);
                mtime.text(fmtTime(q.start));
                pulseNotes(baseNoteStrength);
            }
        }
    };
}

function createJukeboxDriver(player, options) {
    options = options || {};
    var currentIndex = 0;
    var running = false;
    var mtime = $("#mtime");
    var modeName = options.modeName || "jukebox";
    var processTimer = null;

    // Stats tracking for eternal modes
    var totalBeatsPlayed = 0;
    var sessionStartTime = null;
    var listenTimeSeconds = 0;
    var statsUpdateInterval = null;
    var listenTimeDisplay = $("#listen-time");
    var beatsPlayedDisplay = $("#beats-played");
    var eternalStatsContainer = $("#eternal-stats");

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
        console.log('[updateSectionBias]', num, '→ sameSectionBonus:', sameSectionBonusBase.toFixed(3), 'crossSectionBonus:', crossSectionBonusBase.toFixed(3));
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
        console.log('[updateJumpVariance]', num, '→ weightJitter:', weightJitterStrength.toFixed(3), 'spanScale:', spanScaleBase.toFixed(3));
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
        if (canonSettings && canonSettings.jumpBubbleBeats !== undefined) {
            radius = canonSettings.jumpBubbleBeats;
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

    function stop() {
        running = false;
        if (processTimer) {
            clearTimeout(processTimer);
            processTimer = null;
        }
        player.stop();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
        clearJumpBubbleHistory();
        stopStatsTracking();
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
            span: span
        };
    }

    function registerEdge(src, dst, similarity, span, direction, sectionMatch) {
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

        loopGraph[src].push({
            target: dst,
            similarity: similarity,
            span: span,
            direction: direction || (dst < src ? 'backward' : 'forward'),
            sameSection: sameSection
        });
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
                    section_match: entry.section_match || false
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
                    registerEdge(
                        normalized.source_start,
                        normalized.target_start,
                        normalized.similarity,
                        normalized.span,
                        loop.direction,
                        loop.section_match
                    );
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
                        registerEdge(normalized.source_start, normalized.target_start, normalized.similarity, normalized.span);
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
                    registerEdge(normalized.source_start, normalized.target_start, normalized.similarity, normalized.span);
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
                registerEdge(bridge.source_start, bridge.target_start, bridge.similarity, bridge.span);
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
            if (mode === "jukebox") {
                drawLoopConnections(masterQs, loopEdges, false);
            } else if (mode === "eternal") {
                drawLoopConnections(masterQs, loopEdges, true);
            }
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
            console.log('[findRetreatPoint] Found retreat anchor:', retreatPoint.source, '→', retreatPoint.target,
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
        // To prevent local minima, consider loops from nearby beats, not just exact current beat
        var searchRadius = Math.min(8, Math.floor(minLoopBeats / 2));
        var candidates = [];

        // Collect candidates from current beat and nearby beats
        for (var offset = 0; offset <= searchRadius; offset++) {
            var searchIdx = src + offset;
            if (searchIdx >= 0 && searchIdx < masterQs.length && loopGraph[searchIdx]) {
                _.each(loopGraph[searchIdx], function(edge) {
                    candidates.push({
                        source: searchIdx,
                        target: edge.target,
                        similarity: edge.similarity,
                        span: edge.span,
                        sameSection: edge.sameSection,
                        distance: offset // track how far from current position
                    });
                });
            }
            if (offset > 0) {
                searchIdx = src - offset;
                if (searchIdx >= 0 && searchIdx < masterQs.length && loopGraph[searchIdx]) {
                    _.each(loopGraph[searchIdx], function(edge) {
                        candidates.push({
                            source: searchIdx,
                            target: edge.target,
                            similarity: edge.similarity,
                            span: edge.span,
                            sameSection: edge.sameSection,
                            distance: offset
                        });
                    });
                }
            }
        }

        if (!candidates || !candidates.length) {
            return null;
        }

        var filtered = _.filter(candidates, function(edge) {
            for (var i = loopHistory.length - 1; i >= Math.max(0, loopHistory.length - 3); i--) {
                var hist = loopHistory[i];
                if (!hist) {
                    continue;
                }
                if ((hist.source === edge.source && hist.target === edge.target) ||
                    (hist.source === edge.target && hist.target === edge.source)) {
                    return false;
                }
            }
            return true;
        });
        if (!filtered.length) {
            filtered = candidates.slice(0);
        }

        var currentBubbleRadius = getCurrentJumpBubbleRadius();
        if (currentBubbleRadius > 0 && jumpBubbleHistory.length) {
            var bubbleFiltered = _.filter(filtered, function(edge) {
                return edge && !isWithinJumpBubble(edge.target, currentBubbleRadius);
            });
            if (bubbleFiltered.length) {
                filtered = bubbleFiltered;
            }
        }

        var weights = [];
        var total = 0;
        var sameSectionCount = 0;
        var crossSectionCount = 0;

        // Check if we're in end zone (last 20% of song)
        var endZoneStart = Math.floor(masterQs.length * 0.8);
        var startZoneEnd = Math.floor(masterQs.length * 0.3);
        var inEndZone = src >= endZoneStart;

        _.each(filtered, function(edge) {
            if (edge.sameSection) {
                sameSectionCount++;
            } else {
                crossSectionCount++;
            }
            var simNorm = Math.max(0, Math.min(1, (edge.similarity + 1) / 2));
            var spanNorm = Math.min(1, Math.max(0.2, edge.span / (minLoopBeats * spanScaleBase)));
            var sectionBonus = edge.sameSection ? sameSectionBonusBase : crossSectionBonusBase;
            var weight = 0.22 + simNorm * 0.5 + spanNorm * 0.25 + sectionBonus;

            // Small penalty for distance from current beat (prevents weird jumps)
            if (edge.distance && edge.distance > 0) {
                var distancePenalty = edge.distance * 0.02;
                weight -= distancePenalty;
            }

            // MAJOR BOOST for jumps back to beginning when in end zone
            // This prevents getting stuck looping the last 30 seconds
            if (inEndZone && edge.target < startZoneEnd) {
                weight *= 2.5; // Strongly prefer going back to start
                console.log('[selectJumpCandidate] END ZONE: Boosting jump to beginning:', edge.source, '→', edge.target, 'weight boosted');
            }

            // Strong penalty for staying in end zone when in end zone
            if (inEndZone && edge.target >= endZoneStart) {
                weight *= 0.3; // Heavily discourage staying in end zone
                console.log('[selectJumpCandidate] END ZONE: Penalizing end-zone loop:', edge.source, '→', edge.target);
            }

            var targetSection = null;
            if (masterQs[edge.target] && typeof masterQs[edge.target].section === "number") {
                targetSection = masterQs[edge.target].section;
            }
            if (targetSection !== null) {
                var depth = 0;
                for (var r = recentSections.length - 1; r >= 0 && depth < 4; r--, depth++) {
                    if (recentSections[r] === targetSection) {
                        var penalty = recentPenaltyScale * (4 - depth) * 0.35;
                        weight -= penalty;
                        break;
                    }
                }
            }
            if (weightJitterStrength > 0) {
                var jitter = (Math.random() * 2 - 1) * weightJitterStrength;
                weight *= (1 + jitter);
            }
            if (weight < 0.05) {
                weight = 0.05;
            }
            total += weight;
            weights.push(weight);
        });
        if (total <= 0) {
            return filtered[Math.floor(Math.random() * filtered.length)];
        }
        var pick = Math.random() * total;
        var selectedIdx = -1;
        for (var i = 0; i < filtered.length; i++) {
            pick -= weights[i];
            if (pick <= 0) {
                selectedIdx = i;
                break;
            }
        }
        if (selectedIdx === -1) {
            selectedIdx = filtered.length - 1;
        }
        var selected = filtered[selectedIdx];
        console.log('[selectJumpCandidate] Beat', src, '→', selected.target, '| Candidates:', filtered.length,
                    '(same-section:', sameSectionCount, 'cross-section:', crossSectionCount + ')',
                    '| Selected weight:', weights[selectedIdx].toFixed(3), '| sameSection:', selected.sameSection);
        return selected;
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

        // Check if we're in the end zone and should use retreat point
        var endZoneStart = Math.floor(masterQs.length * 0.8);
        var inEndZone = currentIndex >= endZoneStart;

        // If in end zone and have a retreat point, consider using it
        if (inEndZone && retreatPoint && currentIndex >= retreatPoint.source - 4) {
            // Force a retreat when we're very close to or past the retreat source point
            if (currentIndex >= retreatPoint.source || beatsUntilJump <= 2) {
                console.log('[advanceIndex] Using retreat point:', currentIndex, '→', retreatPoint.target);
                loopHistory.push({ source: currentIndex, target: retreatPoint.target });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = retreatPoint.target;
                registerJumpBubble(retreatPoint.target);
                scheduleNextJump(false);
                return;
            }
        }

        beatsUntilJump -= 1;
        if (beatsUntilJump <= 0) {
            var jump = selectJumpCandidate(currentIndex);
            if (jump) {
                loopHistory.push({ source: currentIndex, target: jump.target });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = jump.target;
                registerJumpBubble(jump.target);
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
        var delay = player.playQ(q);
        q.tile.highlight();
        if (q.other && q.other.tile) {
            q.other.tile.highlight2();
        }
        updateCursors(q);
        mtime.text(fmtTime(q.start));
        pulseNotes(q.median_volume || q.volume || baseNoteStrength);
        if (delay <= 0 || isNaN(delay)) {
            delay = q.duration;
        }
        advanceIndex();
        if (processTimer) {
            clearTimeout(processTimer);
        }
        processTimer = setTimeout(function() {
            processTimer = null;
            process();
        }, 1000 * delay);
    }

    return {
        start: function() {
            if (processTimer) {
                clearTimeout(processTimer);
                processTimer = null;
            }
            resetTileColors(masterQs);
            currentIndex = 0;
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
            if (running) {
                return;
            }
            running = true;
            startStatsTracking();
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        pause: function() {
            if (!running) {
                return;
            }
            running = false;
            if (processTimer) {
                clearTimeout(processTimer);
                processTimer = null;
            }
            if (player && typeof player.pause === "function") {
                player.pause();
            } else {
                player.stop();
            }
            $("#play").text("Play");
            setPlayingClass(null);
        },

        stop: stop,

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
    }
    return createCanonDriver(player);
}

    window.onload = init;


function ga_track(page, action, id) {
    _gaq.push(['_trackEvent', page, action, id]);
}










window.onload = init;









