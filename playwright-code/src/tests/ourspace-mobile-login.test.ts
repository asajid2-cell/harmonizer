import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { session } from '../runtime/session.js';
import { navigate } from '../api/playwright/navigate.js';
import { screenshot } from '../api/playwright/screenshot.js';

const MOCK_API_SCRIPT = `
(function() {
  if (window.__ourspaceMockFetch) {
    return;
  }
  window.__ourspaceMockFetch = true;
  var originalFetch = window.fetch.bind(window);
  var state = { loggedIn: false, username: null, profile: null };
  var jsonResponse = function(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  window.fetch = async function(input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/ourspace/') === -1) {
      return originalFetch(input, init);
    }

    if (url.indexOf('/api/ourspace/me') !== -1) {
      return state.loggedIn
        ? jsonResponse({ authenticated: true, username: state.username || 'playwright' })
        : jsonResponse({ authenticated: false });
    }

    if (url.indexOf('/api/ourspace/login') !== -1) {
      try {
        var payload = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
        state.username = payload.username || 'playwright';
      } catch (err) {
        console.warn('[MockAuth] Unable to parse login body', err);
        state.username = 'playwright';
      }
      state.loggedIn = true;
      return jsonResponse({ success: true, user_id: 1, username: state.username });
    }

    if (url.indexOf('/api/ourspace/profile/load') !== -1) {
      if (!state.profile && window.OurSpace && window.OurSpace.profile) {
        state.profile = JSON.parse(JSON.stringify(window.OurSpace.profile));
      }
      var baseProfile = state.profile || {
        profile: {
          name: 'Playwright User',
          tagline: 'Testing mobile login',
          profilePic: '',
          profilePicOffset: { x: 50, y: 50 },
          bannerImage: '',
          bannerOffset: { x: 50, y: 50 },
          mood: { icon: '\\uD83D\\uDE0E', text: 'mobile ready' },
          onlineStatus: true
        },
        widgets: {},
        theme: (window.OurSpace && window.OurSpace.profile && window.OurSpace.profile.theme) || {}
      };
      baseProfile.meta = Object.assign(
        { visits: 42, created: Date.now(), lastModified: Date.now() },
        baseProfile.meta || {}
      );
      return jsonResponse(baseProfile);
    }

    if (url.indexOf('/api/ourspace/friends') !== -1) {
      return jsonResponse({ friends: [] });
    }

    if (url.indexOf('/api/ourspace/profile/save') !== -1) {
      return jsonResponse({ success: true, saved: 'mock' });
    }

    return jsonResponse({ success: true });
  };
})();
`;

async function runMobileLoginFlowTest() {
  session.setDeviceType('iPhone SE');
  await session.resetContext();

  const htmlPath = path.resolve('..', 'frontend', 'ourspace.html');
  const url = pathToFileURL(htmlPath).href;
  console.log('📱 Testing mobile login flow against', url);
  await navigate(url);

  const page = await session.getPage();
  await page.waitForSelector('#ourspace-main', { timeout: 15000 });

  // Stub API endpoints so login flow succeeds in file:// context.
  await page.evaluate(
    (script) => {
      // eslint-disable-next-line no-new-func
      new Function(script)();
    },
    MOCK_API_SCRIPT,
  );
  await page.evaluate(() => {
    if (window.OurSpaceAuth && typeof window.OurSpaceAuth.updateUI === 'function') {
      window.OurSpaceAuth.updateUI();
    }
  });

  // Ensure customize mode and mobile viewport.
  await page.evaluate(() => {
    const toggle = document.getElementById('mode-toggle-btn');
    if (document.body.classList.contains('view-mode') && toggle) {
      toggle.click();
    }
  });
  await page.waitForFunction(() => document.body.classList.contains('ourspace-mobile'), { timeout: 5000 });

  // Switch to Account tab and start login.
  await page.evaluate(() => {
    const panel = document.getElementById('customization-panel');
    if (panel) {
      panel.classList.remove('collapsed');
    }
    const accountTab = document.querySelector('.panel-tab[data-tab="account"]');
    if (accountTab instanceof HTMLElement) {
      accountTab.click();
    }
  });
  const loginExists = await page.evaluate(() => !!document.getElementById('login-btn'));
  console.log('Login button present after switching to account tab:', loginExists);
  await page.waitForSelector('#login-btn', { timeout: 5000 });
  await page.click('#login-btn');
  await page.waitForSelector('#auth-modal', { state: 'visible', timeout: 5000 });

  await page.fill('#auth-username', 'playwright');
  await page.fill('#auth-password', 'password123');
  await page.click('#auth-submit-btn');
  await page.waitForSelector('#auth-modal', { state: 'hidden', timeout: 5000 });

  const panelState = await page.evaluate(() => {
    const panel = document.getElementById('customization-panel');
    let mqResult: boolean | null = null;
    if (typeof window.matchMedia === 'function') {
      mqResult = window.matchMedia('(max-width: 768px)').matches;
    }
    return {
      isMobile: document.body.classList.contains('ourspace-mobile'),
      collapsed: panel ? panel.classList.contains('collapsed') : null,
      innerWidth: window.innerWidth,
      mq: mqResult,
    };
  });

  const screenshotPath = await screenshot({
    label: 'ourspace-mobile-login',
    fullPage: true,
  });
  console.log('📷 Captured mobile login flow screenshot:', screenshotPath);
  console.log('Viewport info after login:', {
    innerWidth: panelState.innerWidth,
    matchMedia: panelState.mq,
    mobileClass: panelState.isMobile,
  });

  assert.equal(panelState.isMobile, true, 'Body should remain in ourspace-mobile mode after login');
  assert.equal(
    panelState.collapsed,
    false,
    'Mobile customization drawer should stay visible after completing login',
  );
}

runMobileLoginFlowTest()
  .catch((error) => {
    console.error('Mobile login flow test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await session.dispose();
  });
