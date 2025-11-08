/**
 * Eternal Jukebox Engine - Circular Timeline Random Walk
 *
 * Implements a probabilistic weighted random-walk on a circular beat timeline
 * with anti-sticky mechanisms, memory penalties, and phrase-aware scheduling.
 *
 * Author: Claude (Anthropic)
 * Version: 2.0.0
 */

(function(window) {
    'use strict';

    /**
     * Circular modulo operation (handles negative numbers correctly)
     */
    function mod(n, m) {
        return ((n % m) + m) % m;
    }

    /**
     * Compute circular distance from src to dst
     * Returns positive for forward, negative for backward
     */
    function circularDistance(src, dst, nBeats) {
        var forwardDist = mod(dst - src, nBeats);
        var backwardDist = mod(src - dst, nBeats);

        if (forwardDist <= backwardDist) {
            return forwardDist;
        } else {
            return -backwardDist;
        }
    }

    /**
     * Eternal Jukebox Engine
     */
    function EternalJukeboxEngine(config) {
        this.config = _.extend({
            // Similarity & scoring
            timbreWeight: 0.7,
            similarityPower: 1.8,      // γ in weight = sim^γ

            // Span bonuses
            minSpan: 8,
            maxSpan: null,             // Auto: n_beats / 2
            spanPowerForward: 0.8,     // Prefer longer forward jumps
            spanPowerBackward: 0.6,    // Less preference for backward

            // Section & musicality
            sectionBias: 0.6,
            sameSectionBonus: 0.3,
            crossSectionPenalty: 0.1,
            downbeatBonus: 0.2,

            // Memory & anti-sticky
            memorySize: 32,            // Remember last N beats
            memoryPenalty: 0.7,        // Penalty multiplier
            visitCountDecay: 0.95,     // Visit count decay per beat
            cycleDetectionLength: 8,   // Detect short cycles
            cyclePenalty: 0.5,

            // Escape / annealing
            escapeProb: 0.05,          // 5% chance to escape
            escapeTempIncrease: 0.3,   // Increase randomness when escaping

            // Phrase awareness
            preferPhraseStart: true,
            phraseStartBonus: 0.25,

            // Logging
            verbose: true
        }, config || {});

        this.nBeats = 0;
        this.beats = [];
        this.sections = [];
        this.adjacencyList = {};     // beat_idx -> [{target, similarity, span, ...}]

        // Memory & state
        this.visitHistory = [];      // Recent beat indices
        this.visitCount = {};        // beat_idx -> count
        this.cycleMemory = [];       // Detected cycles
        this.lastJumps = [];         // Last N jumps for cycle detection

        // Stats
        this.totalJumps = 0;
        this.forwardJumps = 0;
        this.backwardJumps = 0;
    }

    /**
     * Initialize with track data
     */
    EternalJukeboxEngine.prototype.initialize = function(track) {
        this.beats = track.analysis.beats || [];
        this.sections = track.analysis.sections || [];
        this.nBeats = this.beats.length;

        if (!this.config.maxSpan) {
            this.config.maxSpan = Math.floor(this.nBeats / 2);
        }

        // Build adjacency list from eternal_loop_candidates
        this._buildAdjacencyList(track.analysis.eternal_loop_candidates || {});

        // Initialize visit tracking
        this.visitCount = {};
        for (var i = 0; i < this.nBeats; i++) {
            this.visitCount[i] = 0;
        }

        if (this.config.verbose) {
            console.log('[EternalJukebox] Initialized:', this.nBeats, 'beats,',
                        Object.keys(this.adjacencyList).length, 'beats with candidates');
        }
    };

    /**
     * Build adjacency list from eternal_loop_candidates JSON
     */
    EternalJukeboxEngine.prototype._buildAdjacencyList = function(candidates) {
        this.adjacencyList = {};

        for (var srcKey in candidates) {
            if (!candidates.hasOwnProperty(srcKey)) continue;

            var srcIdx = parseInt(srcKey, 10);
            if (isNaN(srcIdx)) continue;

            var edges = candidates[srcKey];
            if (!_.isArray(edges)) continue;

            this.adjacencyList[srcIdx] = edges.map(function(edge) {
                return {
                    target: edge.target,
                    similarity: edge.similarity || 0,
                    span: edge.span || 0,
                    abs_span: edge.abs_span || Math.abs(edge.span),
                    direction: edge.direction || (edge.span > 0 ? 'forward' : 'backward'),
                    section_match: edge.section_match || false
                };
            });
        }
    };

    /**
     * Select next beat using weighted random walk with circular timeline
     *
     * @param currentBeat - Current beat index
     * @param options - { force: boolean, direction: 'forward'|'backward'|null }
     * @returns { target: number, isJump: boolean, reason: string }
     */
    EternalJukeboxEngine.prototype.selectNextBeat = function(currentBeat, options) {
        options = options || {};
        currentBeat = mod(currentBeat, this.nBeats);

        // Record visit
        this._recordVisit(currentBeat);

        // Check if we should jump
        var candidates = this.adjacencyList[currentBeat];
        if (!candidates || candidates.length === 0) {
            // No candidates, advance sequentially
            return {
                target: mod(currentBeat + 1, this.nBeats),
                isJump: false,
                reason: 'no_candidates'
            };
        }

        // Apply escape probability (simulated annealing)
        var shouldEscape = Math.random() < this.config.escapeProb;
        var temperature = shouldEscape ? this.config.escapeTempIncrease : 0;

        // Compute weights for all candidates
        var weights = [];
        var totalWeight = 0;
        var self = this;

        candidates.forEach(function(edge) {
            var weight = self._computeEdgeWeight(currentBeat, edge, temperature);
            weights.push(weight);
            totalWeight += weight;
        });

        // Weighted random selection
        if (totalWeight <= 0) {
            return {
                target: mod(currentBeat + 1, this.nBeats),
                isJump: false,
                reason: 'no_valid_weights'
            };
        }

        var pick = Math.random() * totalWeight;
        var selectedIdx = -1;
        for (var i = 0; i < weights.length; i++) {
            pick -= weights[i];
            if (pick <= 0) {
                selectedIdx = i;
                break;
            }
        }

        if (selectedIdx === -1) {
            selectedIdx = weights.length - 1;
        }

        var selected = candidates[selectedIdx];

        // Record jump
        this._recordJump(currentBeat, selected.target, selected.direction);

        if (this.config.verbose && this.totalJumps % 10 === 0) {
            console.log('[EternalJukebox] Jump', this.totalJumps, ':', currentBeat, '→', selected.target,
                        '| Direction:', selected.direction, '| Similarity:', selected.similarity.toFixed(3),
                        '| Weight:', weights[selectedIdx].toFixed(3));
        }

        return {
            target: selected.target,
            isJump: true,
            reason: 'weighted_random_walk',
            similarity: selected.similarity,
            span: selected.span,
            direction: selected.direction
        };
    };

    /**
     * Compute edge weight with all factors
     */
    EternalJukeboxEngine.prototype._computeEdgeWeight = function(src, edge, temperature) {
        temperature = temperature || 0;

        // Base similarity score (with power)
        var simScore = Math.pow(edge.similarity, this.config.similarityPower);

        // Span factor (prefer larger spans up to a point)
        var spanFactor = 1.0;
        if (edge.direction === 'forward') {
            spanFactor = Math.pow(edge.abs_span / this.config.maxSpan, this.config.spanPowerForward);
        } else {
            spanFactor = Math.pow(edge.abs_span / this.config.maxSpan, this.config.spanPowerBackward);
        }
        spanFactor = Math.min(1.5, 0.5 + spanFactor);

        // Section bias
        var sectionFactor = 1.0;
        if (edge.section_match) {
            sectionFactor += this.config.sameSectionBonus;
        } else {
            sectionFactor -= this.config.crossSectionPenalty;
        }

        // Musicality (downbeat preference)
        var musicalityFactor = 1.0;
        if (this.config.preferPhraseStart && this.beats[edge.target]) {
            var beat = this.beats[edge.target];
            // Prefer beats with higher confidence (likely downbeats)
            if (beat.confidence && beat.confidence > 0.8) {
                musicalityFactor += this.config.downbeatBonus;
            }
        }

        // Memory penalty (penalize recently visited beats)
        var memoryPenalty = 1.0;
        var targetVisitIdx = this.visitHistory.indexOf(edge.target);
        if (targetVisitIdx !== -1) {
            var recency = this.visitHistory.length - targetVisitIdx;
            memoryPenalty = Math.pow(this.config.memoryPenalty, recency / this.config.memorySize);
        }

        // Visit count penalty (penalize frequently visited beats)
        var visitPenalty = 1.0;
        var targetVisits = this.visitCount[edge.target] || 0;
        if (targetVisits > 0) {
            visitPenalty = 1.0 / (1.0 + targetVisits * 0.1);
        }

        // Cycle penalty (detect and penalize short repetitive cycles)
        var cyclePenalty = 1.0;
        if (this._detectsCycle(src, edge.target)) {
            cyclePenalty = this.config.cyclePenalty;
        }

        // Temperature factor (increase randomness when escaping)
        var tempFactor = 1.0 + temperature * (Math.random() * 2 - 1);

        // Combine all factors
        var weight = simScore * spanFactor * sectionFactor * musicalityFactor *
                     memoryPenalty * visitPenalty * cyclePenalty * tempFactor;

        return Math.max(0.01, weight);
    };

    /**
     * Detect if adding this edge would create a short cycle
     */
    EternalJukeboxEngine.prototype._detectsCycle = function(src, target) {
        if (this.lastJumps.length < this.config.cycleDetectionLength) {
            return false;
        }

        // Check if target appears in recent jumps
        var recentTargets = this.lastJumps.slice(-this.config.cycleDetectionLength);
        var cycleCount = 0;
        for (var i = 0; i < recentTargets.length; i++) {
            if (recentTargets[i] === target) {
                cycleCount++;
            }
        }

        // If target appears multiple times in recent history, it's a cycle
        return cycleCount >= 2;
    };

    /**
     * Record a visit to a beat
     */
    EternalJukeboxEngine.prototype._recordVisit = function(beatIdx) {
        this.visitHistory.push(beatIdx);
        if (this.visitHistory.length > this.config.memorySize) {
            this.visitHistory.shift();
        }

        this.visitCount[beatIdx] = (this.visitCount[beatIdx] || 0) + 1;

        // Decay all visit counts slightly
        for (var idx in this.visitCount) {
            if (this.visitCount.hasOwnProperty(idx)) {
                this.visitCount[idx] *= this.config.visitCountDecay;
            }
        }
    };

    /**
     * Record a jump
     */
    EternalJukeboxEngine.prototype._recordJump = function(src, target, direction) {
        this.totalJumps++;
        if (direction === 'forward') {
            this.forwardJumps++;
        } else {
            this.backwardJumps++;
        }

        this.lastJumps.push(target);
        if (this.lastJumps.length > this.config.cycleDetectionLength * 2) {
            this.lastJumps.shift();
        }
    };

    /**
     * Get statistics
     */
    EternalJukeboxEngine.prototype.getStats = function() {
        return {
            totalJumps: this.totalJumps,
            forwardJumps: this.forwardJumps,
            backwardJumps: this.backwardJumps,
            forwardRatio: this.totalJumps > 0 ? (this.forwardJumps / this.totalJumps) : 0,
            uniqueBeatsVisited: Object.keys(this.visitCount).filter(function(k) {
                return this.visitCount[k] > 0;
            }.bind(this)).length,
            coverage: this.nBeats > 0 ? (Object.keys(this.visitCount).filter(function(k) {
                return this.visitCount[k] > 0;
            }.bind(this)).length / this.nBeats) : 0
        };
    };

    /**
     * Reset state (keeps adjacency graph)
     */
    EternalJukeboxEngine.prototype.reset = function() {
        this.visitHistory = [];
        this.visitCount = {};
        this.cycleMemory = [];
        this.lastJumps = [];
        this.totalJumps = 0;
        this.forwardJumps = 0;
        this.backwardJumps = 0;

        for (var i = 0; i < this.nBeats; i++) {
            this.visitCount[i] = 0;
        }
    };

    // Export to window
    window.EternalJukeboxEngine = EternalJukeboxEngine;

})(window);
