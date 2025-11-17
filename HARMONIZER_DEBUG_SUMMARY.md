# Man Of The Year - RL Loop Bug Analysis

## Problem Confirmed

✅ **LOOPING VERIFIED** - Man Of The Year gets stuck in an endless loop with RL enabled

### Test Results

**Track**: Man Of The Year by Juice WRLD (ID: TR4C61EE96C2)  
**Total Beats**: 183  
**RL Status**: Model A (enabled)

### Loop Behavior

After 60 seconds of playback:
- **Total beats logged**: 90
- **Unique beats visited**: 40 (only 44.4%!)
- **Beat range**: 0-54 (out of 183) - never progresses past beat 54

### The Loop Pattern

```
Beat progression:
0 → 1 → 2 → ... → 18 → [JUMP +16] → 34 → 35 → ... → 52 
→ [JUMP -16] → 36 → 37 → ... → 54 
→ [JUMP -16] → 38 → 39 → ... → 54 
→ [JUMP -16] → 39 → 40 → ... → 54 
→ [loops forever]
```

### Jump Analysis

Total jumps: 4
- 1 forward jump: beat 18 → 34 (Δ+16)
- 3 backward jumps: all with Δ-16
  - Jump 1: 52 → 36 (at 25.4s)
  - Jump 2: 53 → 37 (at 37.8s)
  - Jump 3: 54 → 38 (at 50.3s)

### Beat Revisit Frequency

Beats 38-52 are ALL visited 4 times each:
- Beat 38-52: each visited 4 times ⚡

## Root Cause

The RL is choosing canon edges at beats 52-54 that jump backward to beats 36-38, scoring them higher than sequential continuation. This creates a stable 16-beat loop because:

1. **Recent target list too small** (only 6 beats) - by the time we loop back, the target is no longer "recent"
2. **Repeat penalty insufficient** for this pattern
3. **No forward progress requirement**

## Recommended Fix

Increase `CANON_RECENT_LIMIT` from 6 to 20 in visualizer.js:5446

```javascript
var CANON_RECENT_LIMIT = 20; // was 6
```

## Fix Applied ✅

### Changes Made

Added forward progress tracking to prevent tight backward loops:

1. Added `maxBeatReached` variable to track maximum beat reached
2. Prevent backward jumps when near max progress (within 20 beats)
3. This allows the RL to make forward jumps but blocks loops

### Code Changes

**File**: `frontend/js/visualizer.js`

**Lines 5449**: Added tracking variable
```javascript
var maxBeatReached = 0;
```

**Lines 5700-5710**: Added loop prevention logic
```javascript
// Prevent backward jumps that would create tight loops
if (
    allowLooping &&
    candidate.reason !== "sequential" &&
    candidate.target < sourceIndex &&
    sourceIndex > maxBeatReached - 20
) {
    return; // Block this candidate
}
```

**Lines 5787-5790**: Update max beat in process()
```javascript
if (currentIndex > maxBeatReached) {
    maxBeatReached = currentIndex;
}
```

**Line 5867**: Reset on start
```javascript
maxBeatReached = startIdx;
```

### Test Results After Fix

✅ **LOOP ELIMINATED**

- **Unique beats**: 68/91 (74.7% vs 44.4% before)
- **Max beat reached**: 182/183 (vs 54 before)
- **Backward jumps**: 1 (end→start, healthy) vs 3 tight loops before
- **Beat revisits**: Max 2 times (vs 4+ before)

Progression pattern:
```
0 → 18 → 34 → 64 → 160 → 182 → 0 (loops to start)
```

The RL now properly explores the track and only loops at the very end!
