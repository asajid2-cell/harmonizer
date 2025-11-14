# Background Image Transformations Feature

## Overview

Added comprehensive background image transformation controls allowing users to manipulate custom backgrounds with tiling, distortions, filters, and effects.

## Features

### 1. Tiling & Repeat Options

Control how the background image repeats across the page:

- **No Repeat**: Display image once
- **Tile (Repeat)**: Tessellate image in all directions
- **Repeat Horizontally**: Tile only along X-axis
- **Repeat Vertically**: Tile only along Y-axis
- **Space**: Evenly space repeated images
- **Round**: Round and tile to fit perfectly

### 2. Size Control

Adjust the scale of the background:

- **Cover**: Fill entire background (default)
- **Contain**: Fit within viewport
- **Auto**: Use original image size
- **50%, 100%, 200%, 400%**: Fixed percentage sizes

### 3. Position Control

Set where the image is anchored:

- Center, Top, Bottom, Left, Right
- Corner positions: Top Left, Top Right, Bottom Left, Bottom Right

### 4. Transform Effects

#### Scale (0.1x - 3.0x)
- Zoom in/out on the background
- Real-time slider with live preview
- Creates interesting tessellation effects when combined with repeat

#### Rotate (0° - 360°)
- Rotate background image around center
- Perfect for creating dynamic angled patterns
- Combines with repeat for kaleidoscope effects

#### Skew X (-45° to +45°)
- Horizontal shear/slant transformation
- Creates perspective distortion effects
- Great for artistic backgrounds

#### Skew Y (-45° to +45°)
- Vertical shear/slant transformation
- Pairs with Skew X for complex distortions

#### Flip Horizontal
- Mirror image across vertical axis
- Checkbox toggle

#### Flip Vertical
- Mirror image across horizontal axis
- Checkbox toggle

### 5. Filter Effects

#### Blur (0px - 20px)
- Apply gaussian blur
- Create dreamy, unfocused backgrounds

#### Brightness (0% - 200%)
- Darken (0-99%) or brighten (101-200%)
- 100% = original brightness

#### Contrast (0% - 200%)
- Reduce (0-99%) or increase (101-200%) contrast
- 100% = original contrast

#### Saturation (0% - 200%)
- Desaturate (0-99%) or oversaturate (101-200%)
- 100% = original saturation
- 0% = grayscale (alternative method)

#### Hue Rotate (0° - 360°)
- Shift colors around color wheel
- Creates psychedelic color effects
- Great for changing mood without re-uploading

#### Invert (0% - 100%)
- Invert colors (like a photo negative)
- 0% = normal, 100% = fully inverted

#### Sepia (0% - 100%)
- Apply vintage/antique photo effect
- 0% = normal, 100% = full sepia tone

#### Grayscale (0% - 100%)
- Convert to black and white
- 0% = full color, 100% = monochrome

### 6. Blend Modes

#### Mode Options
Advanced compositing modes for artistic effects:

- **Normal**: Default rendering
- **Multiply**: Darken effect
- **Screen**: Lighten effect
- **Overlay**: Contrast boost
- **Darken**: Keep darkest pixels
- **Lighten**: Keep lightest pixels
- **Color Dodge**: Brightens highlights
- **Color Burn**: Darkens shadows
- **Hard Light**: Strong contrast
- **Soft Light**: Subtle contrast
- **Difference**: Inverted difference
- **Exclusion**: Similar to difference, softer
- **Hue**: Apply hue only
- **Saturation**: Apply saturation only
- **Color**: Apply hue + saturation
- **Luminosity**: Apply brightness only

#### Opacity (0% - 100%)
- Control background transparency
- 100% = fully opaque
- 0% = fully transparent

### 7. Reset All Transformations

Red button at bottom of transform panel instantly resets all effects to defaults.

## Technical Implementation

### Data Structure

Added to `theme.background` in profile:

```javascript
background: {
    type: "pattern",  // existing
    pattern: "hearts",  // existing
    image: "",  // existing
    repeat: "repeat",  // existing + enhanced
    attachment: "fixed",  // existing
    gradient: "",  // existing
    size: "auto",  // NEW
    position: "center",  // NEW
    transform: {  // NEW
        scale: 1,
        rotate: 0,
        skewX: 0,
        skewY: 0,
        flipX: false,
        flipY: false
    },
    filter: {  // NEW
        blur: 0,
        brightness: 100,
        contrast: 100,
        saturate: 100,
        hueRotate: 0,
        invert: 0,
        sepia: 0,
        grayscale: 0
    },
    blend: {  // NEW
        mode: "normal",
        opacity: 100
    }
}
```

### Files Modified

#### [frontend/js/myspace-core.js](frontend/js/myspace-core.js)

**Lines 36-67**: Updated DEFAULT_PROFILE with new properties

**Lines 282-293**: Added backwards compatibility initialization in `applyTheme()`

**Lines 324-386**: Enhanced image background application:
- Creates transform overlay div for CSS transform effects
- Applies CSS filters array
- Applies blend mode and opacity
- Handles repeat, size, position

```javascript
// Transform overlay for rotation, scale, skew without affecting layout
const overlay = document.getElementById('bg-transform-overlay');
overlay.style.transform = transforms.join(' ');
overlay.style.filter = filters.join(' ');
```

#### [frontend/js/myspace-customizer.js](frontend/js/myspace-customizer.js)

**Lines 406-744**: Added `setupBackgroundTransformControls()` function:
- Show/hide transform panel based on bg type
- Event listeners for all sliders, selects, checkboxes
- Real-time updates with `input` event
- Save to database on `change` event
- Reset button functionality

**Line 406**: Called from `setupBackgroundControls()`

#### [frontend/myspace.html](frontend/myspace.html)

**Lines 140-289**: Added comprehensive transform panel UI:
- Collapsible panel (shown only when type = "image")
- Organized into sections: Transform, Filters, Blend
- All controls with live value displays
- Inline styles for compact layout

### CSS Transform Overlay Technique

Since CSS transforms can't be applied directly to background images, we use an overlay div:

```javascript
overlay.style.cssText = `
    position: fixed;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    pointer-events: none;
    z-index: -1;
`;
```

This allows transforms without affecting page layout or interactivity.

## User Experience

### Panel Visibility
- Transform panel hidden by default
- Automatically shows when "Custom Image" background type selected
- Hides when switching to other background types

### Live Preview
- All sliders update in real-time as you drag
- Value displays show current settings
- Changes save to database on slider release

### Performance
- CSS-based transformations (hardware accelerated)
- No image re-processing needed
- Instant visual feedback

## Use Cases

### 1. Tessellated Patterns
```
Upload: Small decorative icon
Settings:
- Repeat: Tile (Repeat)
- Size: 50%
- Scale: 0.5
- Hue Rotate: 180°
Result: Colorful repeating pattern
```

### 2. Kaleidoscope Effect
```
Upload: Symmetrical image
Settings:
- Repeat: Tile
- Rotate: 45°
- Scale: 1.5
- Saturation: 150%
Result: Psychedelic tessellation
```

### 3. Subtle Texture
```
Upload: Photo texture
Settings:
- Size: Cover
- Blur: 5px
- Opacity: 30%
- Brightness: 120%
Result: Soft, unobtrusive background
```

### 4. Vintage Aesthetic
```
Upload: Any photo
Settings:
- Sepia: 80%
- Contrast: 110%
- Brightness: 90%
- Blend Mode: Soft Light
Result: Old photograph look
```

### 5. Abstract Art
```
Upload: Complex image
Settings:
- Repeat: Repeat
- Rotate: 30°
- Skew X: 20°
- Skew Y: -15°
- Hue Rotate: 270°
- Blend Mode: Difference
Result: Trippy abstract composition
```

## Keyboard Shortcuts

None currently implemented, but all sliders support:
- Arrow keys for fine adjustment
- Page Up/Down for larger jumps

## Browser Compatibility

All features use standard CSS:
- `background-*` properties (universal support)
- `transform` (all modern browsers)
- `filter` (all modern browsers)
- `mix-blend-mode` (all modern browsers)

## Future Enhancements

Possible additions:
- [ ] Preset transformation combinations
- [ ] Animation of transform values
- [ ] Dual-layer backgrounds
- [ ] Custom size input (not just dropdown)
- [ ] Save transformation presets
- [ ] Undo/redo for transformations
- [ ] Copy/paste transformation values
- [ ] Random transformation generator

## Testing

### Test Scenarios

1. **Upload & Transform**:
   - Upload background image
   - Adjust scale, rotate, filters
   - Save & publish profile
   - Logout/login to verify persistence

2. **Tessellation**:
   - Upload small icon
   - Set repeat to "Tile"
   - Adjust size to 100% or 200%
   - Rotate to create patterns

3. **Extreme Values**:
   - Max out all filters
   - Rotate 360°
   - Scale to 3.0x
   - Verify no crashes/glitches

4. **Reset Function**:
   - Apply various transforms
   - Click "Reset All Transformations"
   - Verify everything returns to defaults

5. **View Other Profiles**:
   - User A: Apply transformations and publish
   - User B: View User A's profile
   - Verify transformations render correctly

## Known Limitations

1. **Transform overlay covers entire viewport**: May cause clipping on very large transforms
2. **Blend modes don't work in all contexts**: Some modes incompatible with certain elements
3. **No undo history**: Can't step back through changes (use reset button)
4. **Filter performance**: Multiple heavy filters may impact performance on low-end devices

## Accessibility

- All sliders have ARIA labels (value displays)
- Keyboard navigable
- Color filters don't affect text readability (transforms apply to background only)
- Reset button provides escape hatch for problematic settings

## Security

- All transformations are CSS-based (no code execution)
- Values validated and sanitized
- No XSS risk from user inputs
- Uploaded images already sanitized by server

## Related Files

- [myspace-core.js](frontend/js/myspace-core.js) - Theme application
- [myspace-customizer.js](frontend/js/myspace-customizer.js) - Transform controls
- [myspace.html](frontend/myspace.html) - Transform panel UI
- [myspace-base.css](frontend/css/myspace-base.css) - Styling (no changes needed)

## Summary

This feature transforms the background customization from basic image upload to a full creative suite, enabling:
- ✅ Tessellation and tiling patterns
- ✅ Geometric transformations (scale, rotate, skew, flip)
- ✅ Color and visual filters
- ✅ Advanced blending modes
- ✅ Real-time preview
- ✅ Persistent storage in database
- ✅ Cross-user profile viewing
