# Mobile Testing with Playwright

## Overview

Playwright supports mobile device emulation with built-in device profiles that include viewport size, user agent, touch support, and more.

**The browser window is ALWAYS visible** for debugging - you'll see the browser window resize and test your app in real-time!

## Quick Start

### Run Mobile Tests

```bash
cd playwright-code
npm run test:mobile
```

This will:
- Open a visible browser window
- Test your app on multiple mobile devices (iPhone, Android, iPad)
- Resize the browser window to match each device
- Take screenshots and save them to `artifacts/screenshots/`
- Slow down actions by 100ms so you can see what's happening

## Available Device Types

### Preset Device Types

Use these simple device types:

- `'desktop'` - Standard desktop (1280x720)
- `'mobile'` - iPhone 12 Pro (390x844)
- `'tablet'` - iPad Pro (1024x1366)

### Built-in Playwright Devices

Playwright includes 100+ real device profiles. Here are the most popular:

#### iPhones
- `'iPhone 12 Pro'` - 390x844
- `'iPhone 12'` - 390x844
- `'iPhone 11 Pro'` - 375x812
- `'iPhone 11'` - 414x896
- `'iPhone SE'` - 375x667
- `'iPhone 13 Pro'` - 390x844
- `'iPhone 14 Pro Max'` - 430x932

#### Android Phones
- `'Pixel 5'` - 393x851
- `'Pixel 4'` - 353x745
- `'Galaxy S9+'` - 320x658
- `'Galaxy S8'` - 360x740
- `'Galaxy Note 3'` - 360x640

#### Tablets
- `'iPad Pro'` - 1024x1366
- `'iPad Mini'` - 768x1024
- `'iPad (gen 7)'` - 810x1080
- `'Galaxy Tab S4'` - 712x1138

#### Desktops
- `'Desktop Chrome'` - 1920x1080
- `'Desktop Firefox'` - 1920x1080
- `'Desktop Safari'` - 1920x1080

## Usage Examples

### Example 1: Test on Specific Device

```typescript
import { session } from './runtime/session.js';
import { screenshot } from './api/playwright/screenshot.js';
import { navigate } from './api/playwright/navigate.js';

// Set device
session.setDeviceType('iPhone 12 Pro');

// Navigate and test
await navigate({ url: 'http://localhost:3000' });
await screenshot({ label: 'mobile-home' });
```

### Example 2: Test Multiple Devices

```typescript
const devices = ['iPhone 12 Pro', 'Pixel 5', 'iPad Pro'];

for (const device of devices) {
  session.setDeviceType(device);
  await navigate({ url: 'http://localhost:3000' });
  await screenshot({ label: `test-${device}` });
  await session.resetContext();
}
```

### Example 3: Custom Viewport Size

```typescript
const page = await session.getPage();

// Set custom viewport
await page.setViewportSize({ width: 375, height: 812 });

await navigate({ url: 'http://localhost:3000' });
await screenshot({ label: 'custom-mobile' });
```

### Example 4: Test Responsive Breakpoints

```typescript
const breakpoints = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: '4k', width: 3840, height: 2160 },
];

for (const bp of breakpoints) {
  const page = await session.getPage();
  await page.setViewportSize({ width: bp.width, height: bp.height });
  await navigate({ url: 'http://localhost:3000' });
  await screenshot({ label: `responsive-${bp.name}` });
}
```

## Device Features

Each device profile includes:

- **Viewport size** - Screen dimensions
- **User agent** - Browser identifier string
- **Device scale factor** - Pixel density (retina displays)
- **Touch support** - Mobile touch events
- **Geolocation** - GPS capabilities
- **Color scheme** - Light/dark mode preference

## Testing Mobile Features

### Test Touch Interactions

```typescript
const page = await session.getPage();
session.setDeviceType('iPhone 12 Pro');

await navigate({ url: 'http://localhost:3000' });

// Tap an element
await page.tap('button.menu');

// Swipe
await page.touchscreen.tap(100, 100);
await page.mouse.move(300, 100);
```

### Test Orientation

```typescript
// Portrait
await page.setViewportSize({ width: 390, height: 844 });
await screenshot({ label: 'portrait' });

// Landscape
await page.setViewportSize({ width: 844, height: 390 });
await screenshot({ label: 'landscape' });
```

### Test Dark Mode

```typescript
const context = await browser.newContext({
  ...devices['iPhone 12 Pro'],
  colorScheme: 'dark',
});

const page = await context.newPage();
await page.goto('http://localhost:3000');
await screenshot({ label: 'dark-mode-mobile' });
```

## Common Mobile Test Scenarios

### 1. Responsive Layout
Test that your layout adapts to different screen sizes

### 2. Touch Targets
Verify buttons and links are large enough for touch (min 44x44px)

### 3. Text Readability
Check font sizes are readable on mobile (min 16px)

### 4. Navigation
Test mobile menus, hamburger menus, and drawer navigation

### 5. Forms
Verify form inputs work with mobile keyboards

### 6. Performance
Test page load times on mobile network conditions

## Package.json Script

Add this to your `package.json`:

```json
{
  "scripts": {
    "test:mobile": "tsx src/tests/mobile.test.ts"
  }
}
```

## Tips

1. **Test on real devices too** - Emulation is good but not perfect
2. **Test both orientations** - Portrait and landscape
3. **Test touch interactions** - Taps, swipes, pinch-to-zoom
4. **Test slow networks** - Use Playwright's network throttling
5. **Check viewport meta tag** - Ensure proper mobile scaling
6. **Test safe areas** - Account for notches and curved edges

## Full Device List

To see all 100+ available devices:

```typescript
import { devices } from 'playwright';
console.log(Object.keys(devices));
```
