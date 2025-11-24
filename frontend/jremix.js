
function createJRemixer(context, jquery) {
    var $ = jquery;
    var resumePromise = null;

    var remixer = {

        remixTrackById: function(id, callback) {
            var url = 'http://labs.echonest.com/Uploader/profile?callback=?'
            $.getJSON(url, { trid:trid}, function(data) {
                if (data.response.status.code == 0) {
                    remixer.remixTrack(data.response.track, callback)
                }
            });
        },

        remixTrack : function(track, callback) {

            function fetchAudio(url) {
                var request = new XMLHttpRequest();
                trace("fetchAudio " + url);
                track.buffer = null;
                request.open("GET", url, true);
                request.responseType = "arraybuffer";
                this.request = request;

                request.onload = function() {
                    trace('audio loaded');
                     if (false) {
                        track.buffer = context.createBuffer(request.response, false);
                        track.status = 'ok'
                        callback(1, track, 100);
                    } else {
                        context.decodeAudioData(request.response, 
                            function(buffer) {      // completed function
                                track.buffer = buffer;
                                track.status = 'ok'
                                callback(1, track, 100);
                            }, 
                            function(e) { // error function
                                track.status = 'error: loading audio'
                                callback(-1, track, 0);
                                console.log('audio error', e);
                                error("trouble loading audio");
                            }
                        );
                    }
                }

                request.onerror = function(e) {
                    trace('error loading loaded');
                    track.status = 'error: loading audio'
                    callback(-1, track, 0);
                }

                request.onprogress = function(e) {
                    var percent = Math.round(e.position * 100  / e.totalSize);
                    callback(0, track, percent);
                }
                request.send();
            }

            function preprocessTrack(track) {
                trace('preprocessTrack');
                var types = ['sections', 'bars', 'beats', 'tatums', 'segments'];

                
                for (var i in types) {
                    var type = types[i];
                    trace('preprocessTrack ' + type);
                    for (var j in track.analysis[type]) {
                        var qlist = track.analysis[type]

                        j = parseInt(j)

                        var q = qlist[j]
                        q.track = track;
                        q.which = j;
                        if (j > 0) {
                            q.prev = qlist[j-1];
                        } else {
                            q.prev = null
                        }
                        
                        if (j < qlist.length - 1) {
                            q.next = qlist[j+1];
                        } else {
                            q.next = null
                        }
                    }
                }

                connectQuanta(track, 'sections', 'bars');
                connectQuanta(track, 'bars', 'beats');
                connectQuanta(track, 'beats', 'tatums');
                connectQuanta(track, 'tatums', 'segments');

                connectFirstOverlappingSegment(track, 'bars');
                connectFirstOverlappingSegment(track, 'beats');
                connectFirstOverlappingSegment(track, 'tatums');

                connectAllOverlappingSegments(track, 'bars');
                connectAllOverlappingSegments(track, 'beats');
                connectAllOverlappingSegments(track, 'tatums');


                filterSegments(track);
            }

            function filterSegments(track) {
                var threshold = .3;
                var fsegs = [];
                fsegs.push(track.analysis.segments[0]);
                for (var i = 1; i < track.analysis.segments.length; i++) {
                    var seg = track.analysis.segments[i];
                    var last = fsegs[fsegs.length - 1];
                    if (isSimilar(seg, last) && seg.confidence < threshold) {
                        fsegs[fsegs.length -1].duration += seg.duration;
                    } else {
                        fsegs.push(seg);
                    }
                }
                track.analysis.fsegments = fsegs;
            }

            function isSimilar(seg1, seg2) {
                var threshold = 1;
                var distance = timbral_distance(seg1, seg2);
                return (distance < threshold);
            }

            function connectQuanta(track, parent, child) {
                var last = 0;
                var qparents = track.analysis[parent];
                var qchildren = track.analysis[child];

                for (var i in qparents) {
                    var qparent = qparents[i]
                    qparent.children = [];

                    for (var j = last; j < qchildren.length; j++) {
                        var qchild = qchildren[j];
                        if (qchild.start >= qparent.start 
                                    && qchild.start < qparent.start + qparent.duration) {
                            qchild.parent = qparent;
                            qchild.indexInParent = qparent.children.length;
                            qparent.children.push(qchild);
                            last = j;
                        } else if (qchild.start > qparent.start) {
                            break;
                        }
                    }
                }
            }

            // connects a quanta with the first overlapping segment
            function connectFirstOverlappingSegment(track, quanta_name) {
                var last = 0;
                var quanta = track.analysis[quanta_name];
                var segs = track.analysis.segments;

                for (var i = 0; i < quanta.length; i++) {
                    var q = quanta[i]

                    for (var j = last; j < segs.length; j++) {
                        var qseg = segs[j];
                        if (qseg.start >= q.start) {
                            q.oseg = qseg;
                            last = j;
                            break
                        } 
                    }
                }
            }

            function connectAllOverlappingSegments(track, quanta_name) {
                var last = 0;
                var quanta = track.analysis[quanta_name];
                var segs = track.analysis.segments;

                for (var i = 0; i < quanta.length; i++) {
                    var q = quanta[i]
                    q.overlappingSegments = [];

                    for (var j = last; j < segs.length; j++) {
                        var qseg = segs[j];
                        // seg starts before quantum so no
                        if ((qseg.start + qseg.duration) < q.start) {
                            continue;
                        }
                        // seg starts after quantum so no
                        if (qseg.start > (q.start + q.duration)) {
                            break;
                        }
                        last = j;
                        q.overlappingSegments.push(qseg);
                    }
                }
            }


            if (track.status == 'complete') {
                preprocessTrack(track);
                fetchAudio(track.info.url);
            } else {
                track.status = 'error: incomplete analysis';
                callback(false, track);
            }
        },

        getPlayer : function() {
            var speedFactor = 1.00;
            var curQ = null;
            var curAudioSource = null;
            var masterGain = 0.85;
            // Base gain for overlay voices - lower than main to stay in background
            var overlayGain = 0.65;
            var deltaTime = 0;

            // Get number of voices from window setting (default 2 for backwards compatibility)
            // For non-canon modes, always use 2 voices
            var currentMode = (typeof window !== 'undefined' && document.body)
                ? document.body.getAttribute('data-mode')
                : 'canon';
            var requestedVoices = window.canonVoiceCount || 2;
            var numVoices = (currentMode === 'canon')
                ? Math.max(2, Math.min(8, requestedVoices))
                : 2; // Force 2 voices for jukebox/eternal modes
            console.log('[JRemixer] Initializing player with', numVoices, 'voices (mode:', currentMode, ', requested:', requestedVoices, ')');

            // Create main voice (always present)
            var mainGain = context.createGain();
            var mainPanner = null;

            // Create array for overlay voices (numVoices - 1, since main is separate)
            var overlayVoices = [];
            var skewDeltas = [];
            var maxSkewDelta = .05;

            // Independent voice path state - each voice tracks its own bar offset
            var voiceOffsets = []; // Current bar offset for each overlay voice
            var voiceBeatsSinceJump = []; // Beats since last offset change
            var voiceJumpCooldown = 16; // Minimum beats between offset changes (4 bars)
            var availableBarOffsets = [4, 8, 16, -4, -8, -16, 32, -32, 2, 6, 12, 24]; // Pool of offsets to choose from

            // Setup main voice
            if (typeof context.createStereoPanner === "function") {
                mainPanner = context.createStereoPanner();
                try {
                    mainPanner.pan.value = 0; // Center for main voice
                } catch (e) {
                    // ignore failures on platforms without setter
                }
                mainGain.connect(mainPanner);
                mainPanner.connect(context.destination);
            } else {
                mainGain.connect(context.destination);
            }
            mainGain.gain.value = masterGain;

            // Setup overlay voices with spatial distribution
            for (var i = 0; i < numVoices - 1; i++) {
                var voiceGain = context.createGain();
                var voiceHp = context.createBiquadFilter ? context.createBiquadFilter() : null;
                var voicePanner = null;
                var voiceSource = null;

                // Distribute voices across stereo field
                // For 2 voices: [-0.28, 0.28]
                // For 3 voices: [-0.5, 0, 0.5]
                // For 4 voices: [-0.6, -0.2, 0.2, 0.6]
                var panValue = 0;
                if (numVoices > 2) {
                    // Spread evenly from -0.7 to 0.7
                    panValue = -0.7 + (1.4 * (i + 1) / numVoices);
                } else {
                    // Original 2-voice behavior
                    panValue = 0.28;
                }

                if (voiceHp) {
                    voiceHp.type = "highpass";
                    voiceHp.frequency.value = 250;
                    voiceGain.connect(voiceHp);
                }
                var gainNodeToConnect = voiceHp || voiceGain;

                if (typeof context.createStereoPanner === "function") {
                    voicePanner = context.createStereoPanner();
                    try {
                        voicePanner.pan.value = panValue;
                    } catch (e) {
                        // ignore
                    }
                    gainNodeToConnect.connect(voicePanner);
                    voicePanner.connect(context.destination);
                } else {
                    gainNodeToConnect.connect(context.destination);
                }

                // Adjust gain for multiple voices - use gentler reduction to keep all voices audible
                // sqrt reduction is too aggressive for 8 voices (would be 0.34x)
                // Use linear reduction with a floor to ensure audibility
                var voiceReduction = 1 / (1 + (numVoices - 2) * 0.15); // Max 8 voices = 1/(1+0.9) = 0.53
                var adjustedGain = overlayGain * Math.max(0.5, voiceReduction);
                voiceGain.gain.value = adjustedGain;

                overlayVoices.push({
                    gain: voiceGain,
                    baseGain: adjustedGain,
                    panner: voicePanner,
                    hp: voiceHp,
                    source: null,
                    index: i
                });
                skewDeltas.push(0);

                // Initialize independent path state for this voice
                // Stagger initial offsets so voices start at different positions
                var initialOffset = availableBarOffsets[i % availableBarOffsets.length];
                voiceOffsets.push(initialOffset);
                voiceBeatsSinceJump.push(0);

                console.log('[JRemixer] Voice', i + 1, 'pan:', panValue.toFixed(2), 'gain:', adjustedGain.toFixed(2), 'initialOffset:', initialOffset);
            }

            // Decide if a voice should jump to a new offset (only in canon mode)
            function maybeJumpVoiceOffset(voiceIdx, mainBeatIdx, totalBeats, beatsPerBar) {
                voiceBeatsSinceJump[voiceIdx]++;

                // Only allow jumping in canon mode - eternal/jukebox modes use fixed offsets
                var currentMode = (typeof window !== 'undefined' && document.body)
                    ? document.body.getAttribute('data-mode')
                    : 'canon';
                if (currentMode !== 'canon') {
                    return false;
                }

                // Check cooldown
                if (voiceBeatsSinceJump[voiceIdx] < voiceJumpCooldown) {
                    return false;
                }

                // Random chance to jump at phrase boundaries (every 8 beats)
                var isPhraseBoundary = (mainBeatIdx % 8) === 0;
                var jumpProbability = isPhraseBoundary ? 0.3 : 0.05;

                if (Math.random() > jumpProbability) {
                    return false;
                }

                // Pick a new offset different from current
                var currentOffset = voiceOffsets[voiceIdx];
                var candidates = availableBarOffsets.filter(function(off) {
                    return off !== currentOffset;
                });

                if (candidates.length === 0) {
                    return false;
                }

                var newOffset = candidates[Math.floor(Math.random() * candidates.length)];
                var oldOffset = voiceOffsets[voiceIdx];
                voiceOffsets[voiceIdx] = newOffset;
                voiceBeatsSinceJump[voiceIdx] = 0;

                console.log('[Voice ' + (voiceIdx + 1) + '] Jump: bar offset ' + oldOffset + ' → ' + newOffset + ' at beat ' + mainBeatIdx);

                // Notify visualizer of the jump
                if (typeof window !== 'undefined') {
                    window.lastVoiceJump = {
                        voiceIdx: voiceIdx,
                        fromOffset: oldOffset,
                        toOffset: newOffset,
                        beatIdx: mainBeatIdx,
                        timestamp: Date.now()
                    };
                }

                return true;
            }

            // Compute the beat index for a voice given main beat and voice's bar offset
            function getVoiceBeatIndex(mainBeatIdx, voiceIdx, totalBeats, beatsPerBar) {
                var barOffset = voiceOffsets[voiceIdx] || 0;
                var beatOffset = barOffset * beatsPerBar;
                var targetIdx = (mainBeatIdx + beatOffset) % totalBeats;
                // Handle negative modulo
                if (targetIdx < 0) targetIdx += totalBeats;
                return targetIdx;
            }

            function playQuantumWithDurationSimple(when, q, dur, gain, channel) {
                var now = context.currentTime;
                var start = when == 0 ? now : when;
                start = 0;

                if (dur == undefined) {
                    dur = q.duration;
                }

                if (gain == undefined) {
                    gain = 1;
                }

                var duration = dur * speedFactor;

                var audioSource = context.createBufferSource();
                var audioGain = ('createGain' in context) ? context.createGain() : context.createGainNode();
                audioGain.gain.value = gain;
                audioSource.buffer = q.track.buffer;
                audioSource.connect(audioGain);
                audioSource.start(start, q.start, duration);
                audioGain.connect(context.destination);
                return duration + when;
            }

            function error(s) {
                console.log(s);
            }

            function llPlay(buffer, start, duration, gain) {
                var audioSource = context.createBufferSource();
                audioSource.buffer = buffer;
                audioSource.connect(gain);
                audioSource.start(0, start, duration);
                return audioSource;
            }


            function playQ(q) {
                // all this complexity is about click reduction.
                // We want to continuously play as much as we can
                // without getting out of sync

                // Play main voice
                if (curQ == null || curQ.next != q) {
                    if (curAudioSource) {
                        curAudioSource.stop();
                    }
                    var tduration = q.track.audio_summary.duration - q.start;
                    curAudioSource = llPlay(q.track.buffer, q.start, tduration, mainGain);
                    deltaTime = context.currentTime - q.start;
                }

                var now = context.currentTime - deltaTime;
                var delta = now - q.start;

                // Play overlay voices
                // For 2 voices: use pre-computed q.others from canon alignment (follows main voice's loop path)
                // For 3+ voices: use INDEPENDENT PATHS where each voice jumps on its own
                var mainBeatIdx = q.which || 0;
                var totalBeats = (q.track && q.track.analysis && q.track.analysis.beats)
                    ? q.track.analysis.beats.length
                    : (window.masterQs ? window.masterQs.length : 100);
                var beatsPerBar = (q.bar_length_beats) ? q.bar_length_beats : 4;
                var useIndependentPaths = numVoices > 2; // Only use independent jumping for 3+ voices

                // Expose current voice states for visualizer
                var voiceStates = [];

                // Play each overlay voice
                for (var i = 0; i < overlayVoices.length; i++) {
                    var voice = overlayVoices[i];
                    var otherBeat = null;
                    var voiceBeatIdx = 0;

                    if (useIndependentPaths) {
                        // 3+ voices: use independent path with jumping
                        maybeJumpVoiceOffset(i, mainBeatIdx, totalBeats, beatsPerBar);
                        voiceBeatIdx = getVoiceBeatIndex(mainBeatIdx, i, totalBeats, beatsPerBar);
                        var beats = (q.track && q.track.analysis && q.track.analysis.beats)
                            ? q.track.analysis.beats
                            : (window.masterQs || []);
                        otherBeat = beats[voiceBeatIdx];
                    } else {
                        // 2 voices: use pre-computed q.others from canon alignment
                        if (q.others && q.others[i]) {
                            otherBeat = q.others[i];
                            voiceBeatIdx = otherBeat.which || 0;
                        } else if (q.other && i === 0) {
                            // Legacy fallback
                            otherBeat = q.other;
                            voiceBeatIdx = otherBeat.which || 0;
                        }
                    }

                    // Track voice state for visualizer
                    voiceStates.push({
                        voiceIdx: i,
                        beatIdx: voiceBeatIdx,
                        barOffset: useIndependentPaths ? voiceOffsets[i] : 0,
                        beatsSinceJump: useIndependentPaths ? voiceBeatsSinceJump[i] : 0
                    });

                    if (!otherBeat) {
                        // No beat for this voice, stop it if playing
                        if (voice.source) {
                            try {
                                voice.source.stop();
                            } catch (e) {}
                            voice.source = null;
                        }
                        continue;
                    }

                    // Check if we need to restart this voice
                    var needsRestart = curQ == null;
                    if (useIndependentPaths) {
                        // For 3+ voices: restart if beat position changed discontinuously (due to jumping)
                        if (voice.lastBeatIdx !== undefined) {
                            var expectedNext = (voice.lastBeatIdx + 1) % totalBeats;
                            needsRestart = needsRestart || (voiceBeatIdx !== expectedNext);
                        }
                    } else {
                        // For 2 voices: use original logic - restart only if not continuous
                        if (curQ && q.others && q.others[i]) {
                            var prevOther = curQ.others && curQ.others[i];
                            needsRestart = needsRestart || !prevOther || prevOther.next !== otherBeat;
                        }
                    }
                    needsRestart = needsRestart || Math.abs(skewDeltas[i]) > maxSkewDelta;
                    voice.lastBeatIdx = voiceBeatIdx;

                    if (needsRestart) {
                        skewDeltas[i] = 0;
                        if (voice.source) {
                            try {
                                voice.source.stop();
                            } catch (e) {}
                        }
                        // Use main track's audio buffer - all beats share the same audio
                        var trackRef = otherBeat.track || q.track;
                        if (!trackRef || !trackRef.buffer) {
                            continue; // Skip if no audio available
                        }
                        var oduration = trackRef.audio_summary.duration - otherBeat.start;
                        var panLfo = Math.sin((q.which || 0) * 0.05) * 0.7;
                        var baseGain = (typeof voice.baseGain === "number") ? voice.baseGain : voice.gain.gain.value;
                        // Consistent volume - no per-beat variation, just use the base gain
                        var targetGain = baseGain;
                        if (voice.panner && typeof voice.panner.pan !== "undefined") {
                            try { voice.panner.pan.value = panLfo; } catch (e) {}
                        }
                        voice.source = llPlay(trackRef.buffer, otherBeat.start, oduration, voice.gain);
                        voice.gain.gain.value = targetGain;

                        // Set gain values to prevent clicks
                        try {
                            var gainNow = context.currentTime;
                            voice.gain.gain.cancelScheduledValues(gainNow);
                            voice.gain.gain.setValueAtTime(voice.gain.gain.value, gainNow);
                            mainGain.gain.cancelScheduledValues(gainNow);
                            mainGain.gain.setValueAtTime(masterGain, gainNow);
                        } catch (e) {
                            // Fallback for older browsers
                        }
                    }

                    // Track skew for this voice
                    skewDeltas[i] += q.duration - otherBeat.duration;
                }

                // Expose voice states to window for visualizer
                if (typeof window !== 'undefined') {
                    window.currentVoiceStates = voiceStates;
                    window.currentMainBeatIdx = mainBeatIdx;
                }

                curQ = q;
                return q.duration - delta;
            }

            var player = {
                play: function(when, q, duration, gain, channel) {
                    return playQuantumWithDurationSimple(when, q, duration, gain, channel);
                },

                playQ: function(q) {
                    return playQ(q);
                },

                setSpeedFactor : function(factor) {
                    speedFactor = factor;
                },

                getSpeedFactor: function() {
                    return speedFactor;
                },

                stop: function() {
                    if (curAudioSource) {
                        curAudioSource.stop(0);
                        curAudioSource = null;
                    }
                    // Stop all overlay voice sources
                    if (overlayVoices && overlayVoices.length) {
                        overlayVoices.forEach(function(voice, idx) {
                            if (voice && voice.source) {
                                try {
                                    voice.source.stop(0);
                                } catch (e) {}
                                voice.source = null;
                            }
                            skewDeltas[idx] = 0;
                        });
                    }
                    curQ = null;
                    deltaTime = 0;
                    // Reset skew tracking
                    for (var i = 0; i < skewDeltas.length; i++) {
                        skewDeltas[i] = 0;
                    }
                },

                curTime: function() {
                    return context.currentTime;
                }
            }
            return player;
        },

        ensureContext: function() {
            if (!context || typeof context.resume !== "function") {
                return Promise.resolve();
            }
            if (context.state === "running" || context.state === "closed") {
                return Promise.resolve();
            }
            if (!resumePromise) {
                resumePromise = context.resume().then(function() {
                    resumePromise = null;
                }, function(err) {
                    resumePromise = null;
                    throw err;
                });
            }
            return resumePromise;
        },

        getContextState: function() {
            return context && context.state ? context.state : "unknown";
        },

        fetchSound : function(audioURL, callback) {
            var request = new XMLHttpRequest();

            trace("fetchSound " + audioURL);
            request.open("GET", audioURL, true);
            request.responseType = "arraybuffer";
            this.request = request;

            request.onload = function() {
                var buffer = context.createBuffer(request.response, false);
                callback(true, buffer);
            }

            request.onerror = function(e) {
                callback(false, null);
            }
            request.send();
        },
    };

    function isQuantum(a) {
        return 'start' in a && 'duration' in a;
    }

    function isAudioBuffer(a) {
        return 'getChannelData' in a;
    }

    function trace(text) {
        if (false) {
            console.log(text);
        }
    }

    return remixer;
}


function euclidean_distance(v1, v2) {
    var sum = 0;
    for (var i = 0; i < 3; i++) {
        var delta = v2[i] - v1[i];
        sum += delta * delta;
    }
    return Math.sqrt(sum);
}

function timbral_distance(s1, s2) {
    return euclidean_distance(s1.timbre, s2.timbre);
}


function clusterSegments(track, numClusters, fieldName, vecName) {
    var vname = vecName || 'timbre';
    var fname = fieldName || 'cluster';
    var maxLoops = 1000;

    function zeroArray(size) {
        var arry = [];
        for (var i = 0; i < size; i++) {
            arry.push(0);
        }
        return arry;
    }

    function reportClusteringStats() {
        var counts = zeroArray(numClusters);
        for (var i = 0; i < track.analysis.segments.length; i++) {
            var cluster = track.analysis.segments[i][fname];
            counts[cluster]++;
        }
        //console.log('clustering stats');
        for (var i = 0; i < counts.length; i++) {
            //console.log('clus', i, counts[i]);
        }
    }

    function sumArray(v1, v2) {
        for (var i = 0; i < v1.length; i++) {
            v1[i] += v2[i];
        }
        return v1;
    }

    function divArray(v1, scalar) {
        for (var i = 0; i < v1.length; i++) {
            v1[i] /= scalar
        }
        return v1;
    }
    function getCentroid(cluster) {
        var count = 0;
        var segs = track.analysis.segments;
        var vsum = zeroArray(segs[0][vname].length);

        for (var i = 0; i < segs.length; i++) {
            if (segs[i][fname] === cluster) {
                count++;
                vsum = sumArray(vsum, segs[i][vname]);
            }
        }

        vsum = divArray(vsum, count);
        return vsum;
    }

    function findNearestCluster(clusters, seg) {
        var shortestDistance = Number.MAX_VALUE;
        var bestCluster = -1;

        for (var i = 0; i < clusters.length; i++) {
            var distance = euclidean_distance(clusters[i], seg[vname]);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                bestCluster = i;
            }
        }
        return bestCluster;
    }

    // kmeans clusterer
    // use random initial assignments
    for (var i = 0; i < track.analysis.segments.length; i++) {
        track.analysis.segments[i][fname] = Math.floor(Math.random() * numClusters);
    }

    reportClusteringStats();

    while (maxLoops-- > 0) {
        // calculate cluster centroids
        var centroids = [];
        for (var i = 0; i < numClusters; i++) {
            centroids[i] = getCentroid(i);
        }
        // reassign segs to clusters
        var switches = 0;
        for (var i = 0; i < track.analysis.segments.length; i++) {
            var seg = track.analysis.segments[i];
            var oldCluster = seg[fname];
            var newCluster = findNearestCluster(centroids, seg);
            if (oldCluster !== newCluster) {
                switches++;
                seg[fname] = newCluster;
            }
        }
        //console.log("loopleft", maxLoops, 'switches', switches);
        if (switches == 0) {
            break;
        }
    }
    reportClusteringStats();
}
