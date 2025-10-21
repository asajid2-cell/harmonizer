"use strict";

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
var ADVANCED_DEFAULTS = {
    canonOverlay: {
        minOffsetBeats: 8,
        maxOffsetBeats: 64,
        dwellBeats: 6,
        density: 2,
        variation: 2
    },
    eternalOverlay: {
        minOffsetBeats: 8,
        maxOffsetBeats: 64,
        dwellBeats: 6,
        density: 2,
        variation: 2
    },
    jukeboxLoop: {
        minLoopBeats: 12,
        maxSequentialBeats: 36,
        loopThreshold: 0.55,
        sectionBias: 0.6,
        jumpVariance: 0.4
    },
    eternalLoop: {
        minLoopBeats: 8,
        maxSequentialBeats: 28,
        loopThreshold: 0.5,
        sectionBias: 0.55,
        jumpVariance: 0.5
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

var eternalAdvancedEnabled = false;

var advancedPresets = {
    canonOverlay: [],
    eternalOverlay: [],
    jukeboxLoop: [],
    eternalLoop: []
};

var queuedAdvancedApplyTimers = Object.create(null);
var debugLogBuffer = [];
var DEBUG_LOG_LIMIT = 12;

function debugStep(step, detail) {
    if (typeof document === "undefined") {
        return;
    }
    try {
        var el = document.getElementById("debug-log");
        if (!el) {
            return;
        }
        var stamp = (typeof performance !== "undefined" ? (performance.now() / 1000).toFixed(2) : String(Date.now()));
        var message = "[" + stamp + "] " + step + (detail ? " :: " + detail : "");
        debugLogBuffer.push(message);
        if (debugLogBuffer.length > DEBUG_LOG_LIMIT) {
            debugLogBuffer.shift();
        }
        el.style.display = "block";
        el.textContent = debugLogBuffer.join("   |   ");
    } catch (err) {
        try {
            console.warn("debugStep failed", err);
        } catch (consoleErr) {}
    }
}

function recomputeLoopGraphForMode(modeName) {
    if (!modeName) {
        debugStep("recomputeLoopGraph", "no mode provided");
        return;
    }
    var normalized = modeName === "eternal" ? "eternal" : "jukebox";
    var loopSettings = getLoopSettingsForMode(normalized);
    debugStep("recomputeLoopGraph", normalized + " settings=" + JSON.stringify(loopSettings));
    if (mode === normalized) {
        if (driver && typeof driver.recomputeLoopGraph === "function") {
            driver.recomputeLoopGraph(loopSettings);
            debugStep("recomputeLoopGraph", "driver recomputed");
        } else {
            debugStep("recomputeLoopGraph", "driver missing recomputeLoopGraph");
        }
        renderModeVisualization();
    } else {
        debugStep("recomputeLoopGraph", "skipped because current mode=" + mode);
    }
}

if (typeof window !== "undefined") {
    window.setMode = function(newMode) {
        var desired = (newMode || "").toLowerCase();
        if (desired !== "canon" && desired !== "jukebox" && desired !== "eternal") {
            debugStep("setMode", "ignored invalid mode " + newMode);
            return;
        }
        if (desired === mode) {
            debugStep("setMode", "already in mode " + desired);
            renderModeVisualization();
            return;
        }
        var wasRunning = !!(driver && typeof driver.isRunning === "function" && driver.isRunning());
        debugStep("setMode", "switch " + mode + " -> " + desired + " (running=" + wasRunning + ")");
        mode = desired;
        setPlayingClass(mode);
        rebuildDriverForCurrentMode(false);
        if (!isTrackReady) {
            debugStep("setMode", "track not ready yet");
            renderModeVisualization();
            setURL();
            return;
        }
        if (mode === "canon") {
            debugStep("setMode", "regenerating canon");
            regenerateCanonMapping({ reason: "mode-change" });
        } else {
            recomputeLoopGraphForMode(mode);
            if (mode === "eternal") {
                debugStep("setMode", "regenerating eternal overlay");
                regenerateEternalOverlay({ reason: "mode-change" });
            }
        }
        renderModeVisualization();
        if (wasRunning && driver && typeof driver.start === "function") {
            driver.start();
            debugStep("setMode", "driver restarted");
        }
        if (curTrack && typeof getFullTitle === "function") {
            info(getFullTitle() + " - " + getModeLabel(mode));
        }
        setURL();
    };
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

function applyLoopFieldToDriver(fieldKey, value) {
    if (!driver) {
        return false;
    }
    if (fieldKey === "minLoopBeats" && typeof driver.setMinLoopBeats === "function") {
        driver.setMinLoopBeats(value);
        return true;
    }
    if (fieldKey === "maxSequentialBeats" && typeof driver.setMaxSequentialBeats === "function") {
        driver.setMaxSequentialBeats(value);
        return true;
    }
    if (fieldKey === "loopThreshold" && typeof driver.setLoopSimilarityThreshold === "function") {
        driver.setLoopSimilarityThreshold(value);
        return true;
    }
    if (fieldKey === "sectionBias" && typeof driver.setLoopSectionBias === "function") {
        driver.setLoopSectionBias(value);
        return true;
    }
    if (fieldKey === "jumpVariance" && typeof driver.setLoopJumpVariance === "function") {
        driver.setLoopJumpVariance(value);
        return true;
    }
    return false;
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

function updateAdvancedGroupSetting(group, key, value) {
    var target = ensureAdvancedGroupSettings(group);
    if (target && key !== undefined) {
        target[key] = value;
    }
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
        debugStep("rebuildDriver", "skipped (trackReady=" + isTrackReady + ")");
        return;
    }
    var resume = !!shouldResume && driver && typeof driver.isRunning === "function" && driver.isRunning();
    debugStep("rebuildDriver", "shouldResume=" + shouldResume + " resumeNow=" + resume);
    if (driver && typeof driver.stop === "function") {
        try {
            driver.stop();
        } catch (e) {}
    }
    driver = Driver(remixer.getPlayer());
    debugStep("rebuildDriver", "driver created");
    if (resume && driver && typeof driver.start === "function") {
        driver.start();
        debugStep("rebuildDriver", "driver restarted");
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
    _.each(serverLoopCandidateMap, function(entries, key) {
        serverLoopCandidateMap[key] = _.sortBy(entries, function(entry) {
            return -entry.similarity;
        }).slice(0, 12);
    });
}

function collectLoopEdgesFromServer(threshold, minBeats) {
    var results = [];
    var beats = masterQs || [];
    if (!beats.length) {
        debugStep("collectLoopEdges", "no beats");
        return results;
    }
    var minSpan = (typeof minBeats === "number" && minBeats >= 0) ? Math.floor(minBeats) : 1;
    if (minSpan < 1) {
        minSpan = 1;
    }
    var similarityThreshold = (typeof threshold === "number") ? threshold : 0;
    _.each(serverLoopCandidateMap, function(entries, key) {
        var src = parseInt(key, 10);
        if (isNaN(src) || src < 0 || src >= beats.length) {
            return;
        }
        _.each(entries, function(entry) {
            if (!entry) {
                return;
            }
            var dst = entry.target;
            if (typeof dst !== "number" || dst < 0 || dst >= beats.length) {
                return;
            }
            if (dst >= src) {
                return;
            }
            var sim = (typeof entry.similarity === "number") ? entry.similarity : 0;
            if (sim < similarityThreshold) {
                return;
            }
            var span = Math.abs(src - dst);
            if (span < minSpan) {
                return;
            }
            results.push({
                source_start: src,
                target_start: dst,
                similarity: sim,
                span: span
            });
        });
    });
    if (!results.length) {
        debugStep("collectLoopEdges", "0 edges from server (minSpan=" + minSpan + ", thr=" + similarityThreshold + ")");
        return results;
    }
    results.sort(function(a, b) {
        if (a.source_start === b.source_start) {
            return b.similarity - a.similarity;
        }
        return b.similarity - a.similarity;
    });
    var seen = {};
    var deduped = [];
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var key = item.source_start + ":" + item.target_start;
        if (seen[key]) {
            continue;
        }
        seen[key] = true;
        deduped.push(item);
    }
    debugStep("collectLoopEdges", "edges=" + deduped.length);
    return deduped;
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

function clearOverlayVisualization() {
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
}

function refreshCanonVisualization(options) {
    var opts = options || {};
    if (!paper || !masterQs || !masterQs.length) {
        return;
    }
    if (opts.clear !== false) {
        clearOverlayVisualization();
    }
    var targetMode = opts.mode || mode;
    var allowEternal = opts.allowEternal !== false;
    var shouldDraw = (targetMode === "canon") || (allowEternal && targetMode === "eternal") || opts.force === true;
    if (shouldDraw) {
        drawConnections(masterQs);
    }
}

function regenerateCanonMapping(options) {
    if (mode !== "canon" || !masterQs || !masterQs.length) {
        debugStep("regenerateCanonMapping", "skipped (mode=" + mode + ")");
        return;
    }
    options = options || {};
    restoreBaseCanonMapping(masterQs);

    if (!canonAdvancedEnabled) {
        assignNormalizedVolumes(masterQs);
        renderModeVisualization();
        debugStep("regenerateCanonMapping", "legacy overlay used");
        if (typeof window.onCanonRegenerated === "function") {
            window.onCanonRegenerated({ mode: "legacy" });
        }
        return;
    }

    var result = regenerateOverlayFromSettings(canonSettings, { targetMode: "canon" });
    renderModeVisualization();
    debugStep("regenerateCanonMapping", "advanced applied");
    if (typeof window.onCanonRegenerated === "function") {
        window.onCanonRegenerated(result ? Object.assign({ mode: "advanced" }, result) : { mode: "advanced" });
    }
}

function regenerateEternalOverlay(options) {
    if (mode !== "eternal" || !masterQs || !masterQs.length) {
        debugStep("regenerateEternalOverlay", "skipped (mode=" + mode + ")");
        return;
    }
    options = options || {};
    restoreBaseCanonMapping(masterQs);
    if (!eternalAdvancedEnabled) {
        assignNormalizedVolumes(masterQs);
        renderModeVisualization();
        debugStep("regenerateEternalOverlay", "legacy overlay used");
        return;
    }
    regenerateOverlayFromSettings(advancedSettings.eternalOverlay, { targetMode: "eternal" });
    renderModeVisualization();
    debugStep("regenerateEternalOverlay", "advanced applied");
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
        maxAbsOffset: maxOffset
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
        canonSettings.density = Math.min(6, Math.max(1, Math.floor(value)));
    } else if (key === "variation") {
        canonSettings.variation = Math.min(10, Math.max(0, Math.floor(value)));
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
            variation: canonSettings.variation
        };
    };
    window.setCanonAdvancedEnabled = setCanonAdvancedEnabled;
    window.isCanonAdvancedEnabled = function() { return canonAdvancedEnabled; };
    window.setEternalAdvancedEnabled = setEternalAdvancedEnabled;
    window.isEternalAdvancedEnabled = function() { return eternalAdvancedEnabled; };
    window.regenerateEternalOverlay = regenerateEternalOverlay;
    window.getAdvancedDefaults = function(group) { return cloneAdvancedDefaults(group); };
    window.getAdvancedSettings = function(group) {
        return {
            enabled: isAdvancedGroupEnabled(group),
            settings: cloneAdvancedState(group),
            defaults: cloneAdvancedDefaults(group)
        };
    };
    window.setAdvancedGroupEnabled = function(group, enabled) {
        if (group === "canonOverlay") {
            setCanonAdvancedEnabled(enabled);
            debugStep("setAdvancedGroupEnabled", group + "=" + enabled);
            return;
        }
        if (group === "eternalOverlay") {
            setEternalAdvancedEnabled(enabled);
            debugStep("setAdvancedGroupEnabled", group + "=" + enabled);
            return;
        }
        if (!enabled && queuedAdvancedApplyTimers[group]) {
            clearTimeout(queuedAdvancedApplyTimers[group]);
            queuedAdvancedApplyTimers[group] = null;
        }
        setAdvancedGroupEnabledFlag(group, enabled);
        if (group === "jukeboxLoop") {
            recomputeLoopGraphForMode("jukebox");
            if (mode === "jukebox") {
                renderModeVisualization();
            }
            debugStep("setAdvancedGroupEnabled", group + "=" + enabled);
        } else if (group === "eternalLoop") {
            recomputeLoopGraphForMode("eternal");
            if (mode === "eternal") {
                renderModeVisualization();
            }
            debugStep("setAdvancedGroupEnabled", group + "=" + enabled);
        }
    };
    window.isAdvancedGroupEnabled = function(group) { return isAdvancedGroupEnabled(group); };
    window.updateAdvancedGroupSetting = function(group, key, value) {
        updateAdvancedGroupSetting(group, key, value);
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
        var snapshot = resetAdvancedGroupSettings(group);
        if (group === "canonOverlay") {
            canonSettings = ensureAdvancedGroupSettings("canonOverlay");
        }
        if (group === "canonOverlay" && mode === "canon") {
            regenerateCanonMapping({ reason: "reset" });
        } else if (group === "eternalOverlay" && mode === "eternal") {
            regenerateEternalOverlay({ reason: "reset" });
        } else if (group === "jukeboxLoop" && mode === "jukebox") {
            recomputeLoopGraphForMode("jukebox");
        } else if (group === "eternalLoop" && mode === "eternal") {
            recomputeLoopGraphForMode("eternal");
        }
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
            debugStep("applyImmediateAdvancedSetting", "auto-enabling " + group);
        }

        updateAdvancedGroupSetting(group, key, numericValue);

        var handled = false;
        if (group === "canonOverlay") {
            if (!canonAdvancedEnabled) {
                setCanonAdvancedEnabled(true);
            }
            updateCanonSetting(key, numericValue);
            triggerCanonOverlayRefresh(key);
            handled = true;
            debugStep("applyImmediateAdvancedSetting", "canon " + key + "=" + numericValue);
        } else if (group === "eternalOverlay") {
            if (!eternalAdvancedEnabled) {
                setEternalAdvancedEnabled(true);
            }
            scheduleEternalOverlayRecalc("slider");
            handled = true;
            debugStep("applyImmediateAdvancedSetting", "eternal overlay " + key + "=" + numericValue);
        } else if (group === "jukeboxLoop") {
            handled = true;
            var appliedJukebox = applyLoopFieldToDriver(key, numericValue);
            scheduleJukeboxLoopRecalc();
            if (mode === "jukebox" && (appliedJukebox || isTrackReady)) {
                renderModeVisualization();
            }
            debugStep("applyImmediateAdvancedSetting", "jukebox " + key + "=" + numericValue);
        } else if (group === "eternalLoop") {
            handled = true;
            var appliedEternal = applyLoopFieldToDriver(key, numericValue);
            scheduleEternalLoopRecalc();
            if (mode === "eternal" && (appliedEternal || isTrackReady)) {
                renderModeVisualization();
            }
            debugStep("applyImmediateAdvancedSetting", "eternal loop " + key + "=" + numericValue);
        }

        if (!handled && typeof window.applyAdvancedGroup === "function") {
            window.applyAdvancedGroup(group, { source: "immediate" });
        }
    };
    window.renderModeVisualization = renderModeVisualization;
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
            var sizeReward = 0;
            var absDelta = Math.abs(delta);
            if (maxAbsOffset !== null && maxAbsOffset > 0) {
                sizeReward = Math.min(0.35, absDelta / maxAbsOffset * 0.3);
            } else {
                sizeReward = Math.min(0.25, absDelta / Math.max(8, minAbsOffset * 2) * 0.25);
            }
            var cost = deltaCost + simCost - sizeReward;
            if (!best || cost < best.cost) { best = { beat: b, cost: cost, delta: delta }; }
        }
        // Dwell/hysteresis: resist changing offset too often
        if (best) {
            if (lastDelta === null || best.delta === lastDelta) {
                runLen += 1;
            } else {
                if (runLen < minDwell) {
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
    rebuildDriverForCurrentMode(false);
    $("#play").prop("disabled", false).text("Play");
    error("");
    setPlayingClass(mode);
    pulseNotes(baseNoteStrength);

    var modeLabel = getModeLabel(mode);
    if (curTrack && typeof getFullTitle === "function") {
        info(getFullTitle() + " - " + modeLabel);
    } else {
        info(modeLabel);
    }
    createTiles(masterQs);
    renderModeVisualization();
}


function gotTheAnalysis(profile) {
    var status = get_status(profile);
    if (status == 'complete') {
        info("Loading track ...");
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
    var localUrl = 'data/' + trid + '.json';
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

function getModeLabel(modeName) {
    switch ((modeName || "").toLowerCase()) {
        case "jukebox":
            return "Eternal Jukebox";
        case "eternal":
            return "Eternal Canonizer";
        default:
            return "Autocanonizer";
    }
}

function updateModeIndicators(modeName) {
    var normalized = (modeName || mode || "canon");
    var label = getModeLabel(normalized);
    if (document.body && document.body.dataset) {
        document.body.dataset.mode = normalized;
    }
    var pill = $("#mode-pill");
    if (pill && pill.length) {
        pill.text(label);
    }
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
    updateModeIndicators(modeName);
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
        driver.stop();
    } else {
        driver.start();
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
        driver = Driver(remixer.getPlayer());
        if (initialTrid) {
            fetchAnalysis(initialTrid);
        } else {
            info("Load a track to begin.");
        }
    }
}


function showPlotPage(trid) {
    var url = location.protocol + "//" + 
                location.host + location.pathname + "?trid=" + trid;
    location.href = url;
}

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
    if (!requestedMode && document.body && document.body.dataset && document.body.dataset.mode) {
        requestedMode = document.body.dataset.mode;
    }
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
    debugStep("collectVisualizationLoops", "edges=" + edges.length);
    return edges;
}

function collectFallbackVisualizationLoops(minBeats) {
    var loops = [];
    var qlist = masterQs || [];
    if (!qlist.length) {
        return loops;
    }
    var seen = {};
    var minSpan = Math.max(1, Math.floor(minBeats || 1));
    _.each(qlist, function(q) {
        if (!q || !q.goodNeighbors || !q.goodNeighbors.length) {
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
            if (span < minSpan) {
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
                source: src,
                target: dst,
                similarity: sim
            });
        });
    });
    if (!loops.length) {
        return loops;
    }
    loops.sort(function(a, b) {
        return b.similarity - a.similarity;
    });
    debugStep("collectFallbackVisualizationLoops", "edges=" + loops.length);
    return loops;
}

function drawLoopConnections(qlist, edges) {
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
            stroke: "#6B8AF0",
            "stroke-width": strokeWidth,
            "stroke-opacity": opacity
        });
        loopPaths.push(path);
    });
}

var vPad = 20;
var hPad = 20;

function drawLoopVisualizationForMode(modeName) {
    if (!masterQs || !masterQs.length) {
        clearLoopPaths();
        debugStep("drawLoopVisualization", "no beats");
        return;
    }
    var loopSettings = getLoopSettingsForMode(modeName);
    var threshold = loopSettings.loopThreshold;
    var minBeats = loopSettings.minLoopBeats;
    var edges = collectLoopEdgesFromServer(threshold, minBeats);
    if ((!edges || !edges.length) && typeof collectVisualizationLoops === "function") {
        edges = collectVisualizationLoops(80);
    }
    if ((!edges || !edges.length) && typeof collectFallbackVisualizationLoops === "function") {
        var fallback = collectFallbackVisualizationLoops(minBeats);
        if (fallback && fallback.length) {
            edges = fallback;
            debugStep("drawLoopVisualization", "using fallback edges (" + fallback.length + ") for " + modeName);
        }
    }
    if (edges && edges.length) {
        drawLoopConnections(masterQs, edges);
        debugStep("drawLoopVisualization", modeName + " edges=" + edges.length);
    } else {
        clearLoopPaths();
        debugStep("drawLoopVisualization", modeName + " edges=0");
    }
}

function renderModeVisualization(options) {
    if (!paper || !masterQs || !masterQs.length) {
        clearLoopPaths();
        clearOverlayVisualization();
        debugStep("renderModeVisualization", "no paper or beats");
        return;
    }
    clearLoopPaths();
    clearOverlayVisualization();
    if (mode === "canon") {
        refreshCanonVisualization({ clear: false, mode: "canon" });
        debugStep("renderModeVisualization", "mode=canon");
    } else if (mode === "jukebox") {
        drawLoopVisualizationForMode("jukebox");
        debugStep("renderModeVisualization", "mode=jukebox");
    } else if (mode === "eternal") {
        refreshCanonVisualization({ clear: false, mode: "eternal", allowEternal: true });
        drawLoopVisualizationForMode("eternal");
        debugStep("renderModeVisualization", "mode=eternal");
    }
}

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

    function stop() {
        running = false;
        player.stop();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
    }

    function process() {
        if (curQ >= masterQs.length) {
            stop();
        } else if (running) {
            var nextQ = masterQs[curQ];
            var delay = player.playQ(nextQ);
            curQ++;
            setTimeout(function() { process(); }, 1000 * delay);
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
            resetTileColors(masterQs);
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass("canon");
            pulseNotes(baseNoteStrength);
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
        if (!opts || opts.skipReschedule !== true) {
            scheduleNextJump(true);
        }
        return true;
    }

    var loopChoices = [];
    var loopGraph = {};
    var loopHistory = [];
    var LOOP_HISTORY_LIMIT = 8;
    var beatsUntilJump = 0;
    var recentSections = [];
    var sectionAnchors = [];
    var orderedSectionAnchors = [];

    (function initializeSectionAnchors() {
        // === FIX: derive beat.section if missing so Jukebox/Eternal can build section anchors ===
        try {
            if (typeof masterQs !== "undefined" && masterQs && masterQs.length) {
                var haveAnySection = false;
                for (var __i = 0; __i < masterQs.length; __i++) {
                    var __b = masterQs[__i];
                    if (__b && typeof __b.section === "number") { haveAnySection = true; break; }
                }
                if (!haveAnySection) {
                    var __secs = (curTrack && curTrack.analysis && curTrack.analysis.sections) ? curTrack.analysis.sections : null;
                    if (__secs && __secs.length) {
                        for (var __j = 0; __j < masterQs.length; __j++) {
                            var __beat = masterQs[__j];
                            if (!__beat) continue;
                            var __t = (typeof __beat.start === "number") ? __beat.start : 0;
                            var __assigned = 0;
                            for (var __s = 0; __s < __secs.length; __s++) {
                                var __sStart = (typeof __secs[__s].start === "number") ? __secs[__s].start : 0;
                                var __sEnd = __sStart + ((typeof __secs[__s].duration === "number") ? __secs[__s].duration : 0);
                                if (__t >= __sStart && __t < __sEnd) { __assigned = __s; break; }
                                if (__t >= __sEnd) { __assigned = __s; }
                            }
                            __beat.section = __assigned;
                        }
                    } else {
                        // No sections array present; fall back to a single synthetic section
                        for (var __k = 0; __k < masterQs.length; __k++) {
                            if (masterQs[__k] && typeof masterQs[__k].section !== "number") {
                                masterQs[__k].section = 0;
                            }
                        }
                    }
                }
            }
        } catch (__deriveErr) {
            try { console.warn("Section-derivation fallback failed:", __deriveErr); } catch(__e) {}
        }
        // === END FIX ===

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

    function stop() {
        running = false;
        player.stop();
        $("#play").text("Play");
        setURL();
        setPlayingClass(null);
        pulseNotes(baseNoteStrength);
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

    function registerEdge(src, dst, similarity, span) {
        if (src < 0 || dst < 0 || src >= masterQs.length || dst >= masterQs.length || src === dst) {
            return;
        }
        if (dst >= src) {
            return;
        }
        if (!loopGraph[src]) {
            loopGraph[src] = [];
        }
        var sameSection = false;
        try {
            var s1 = masterQs[src] ? masterQs[src].section : null;
            var s2 = masterQs[dst] ? masterQs[dst].section : null;
            sameSection = (s1 !== null && s2 !== null && s1 === s2);
        } catch (e) {}
        loopGraph[src].push({
            target: dst,
            similarity: similarity,
            span: span,
            sameSection: sameSection
        });
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
        loopGraph = {};
        var loops = [];
        if (canonLoopCandidates && canonLoopCandidates.length) {
            _.each(canonLoopCandidates, function(loop) {
                var normalized = normalizeLoop(loop);
                if (normalized && normalized.similarity >= loopThreshold) {
                    loops.push(normalized);
                    registerEdge(normalized.source_start, normalized.target_start, normalized.similarity, normalized.span);
                }
            });
        }
        if (!loops.length) {
            _.each(collectLoopEdgesFromServer(loopThreshold, minLoopBeats), function(loop) {
                var normalized = normalizeLoop(loop);
                if (normalized) {
                    loops.push(normalized);
                    registerEdge(normalized.source_start, normalized.target_start, normalized.similarity, normalized.span);
                }
            });
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
        recentSections = [];
        scheduleNextJump(true);
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
        var candidates = loopGraph[src];
        if (!candidates || !candidates.length) {
            return null;
        }
        var filtered = _.filter(candidates, function(edge) {
            for (var i = loopHistory.length - 1; i >= Math.max(0, loopHistory.length - 3); i--) {
                var hist = loopHistory[i];
                if (!hist) {
                    continue;
                }
                if ((hist.source === src && hist.target === edge.target) ||
                    (hist.source === edge.target && hist.target === src)) {
                    return false;
                }
            }
            return true;
        });
        if (!filtered.length) {
            filtered = candidates.slice(0);
        }
        var weights = [];
        var total = 0;
        _.each(filtered, function(edge) {
            var simNorm = Math.max(0, Math.min(1, (edge.similarity + 1) / 2));
            var spanNorm = Math.min(1, Math.max(0.2, edge.span / (minLoopBeats * spanScaleBase)));
            var sectionBonus = edge.sameSection ? sameSectionBonusBase : crossSectionBonusBase;
            var weight = 0.22 + simNorm * 0.5 + spanNorm * 0.25 + sectionBonus;
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
        for (var i = 0; i < filtered.length; i++) {
            pick -= weights[i];
            if (pick <= 0) {
                return filtered[i];
            }
        }
        return filtered[filtered.length - 1];
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
        beatsUntilJump -= 1;
        if (beatsUntilJump <= 0) {
            var jump = selectJumpCandidate(currentIndex);
            if (jump) {
                loopHistory.push({ source: currentIndex, target: jump.target });
                if (loopHistory.length > LOOP_HISTORY_LIMIT) {
                    loopHistory.shift();
                }
                currentIndex = jump.target;
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
        setTimeout(function() { process(); }, 1000 * delay);
    }

    return {
        start: function() {
            resetTileColors(masterQs);
            currentIndex = 0;
            rebuildLoopChoices();
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
        },

        resume: function() {
            resetTileColors(masterQs);
            rebuildLoopChoices();
            running = true;
            process();
            setURL();
            $("#play").text("Stop");
            setPlayingClass(modeName);
            pulseNotes(baseNoteStrength);
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
        return createJukeboxDriver(player, getLoopSettingsForMode("jukebox"));
    } else if (mode === "eternal") {
        return createJukeboxDriver(player, getLoopSettingsForMode("eternal"));
    }
    return createCanonDriver(player);
}

    window.onload = init;


function ga_track(page, action, id) {
    _gaq.push(['_trackEvent', page, action, id]);
}










window.onload = init;








