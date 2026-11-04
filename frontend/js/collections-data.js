/* Harmonizer Labs — single source of truth for the homepage and /collections.
   Every entry here is live. Nothing retired, nothing "coming soon". */
(function () {
  'use strict';

  const collections = [
    {
      id: 'sound',
      name: 'Sound',
      note: 'Listening, mixing, and the lab records.'
    },
    {
      id: 'rooms',
      name: 'Rooms',
      note: 'Places to be, watch, and talk.'
    },
    {
      id: 'tools',
      name: 'Tools',
      note: 'Small utilities that do one job.'
    },
    {
      id: 'things',
      name: 'Things',
      note: 'Sims, engines, and one app for your phone.'
    }
  ];

  const items = [
    {
      id: 'musiclab',
      name: 'Music Lab',
      href: '/musiclab',
      collection: 'sound',
      gate: 'open',
      note: 'Slices tracks into beats, loops, and strange old-web audio experiments.',
      icon: { type: 'img', value: '/assets/harmonizer/harmonizer-mascot-icon.png' },
      accent: '#5cff8a'
    },
    {
      id: 'cloudsqueeze',
      name: 'Squeezebox Cloud',
      href: '/cloud-squeeze/',
      collection: 'sound',
      gate: 'signin',
      note: 'The jukebox, online.',
      icon: { type: 'img', value: '/assets/squeezebox/squeezebox-discotheque-orbit-icon-v3.png' },
      accent: '#ff5f83'
    },
    {
      id: 'mixtape',
      name: 'The Mixtape',
      href: '/projects',
      collection: 'sound',
      gate: 'open',
      note: 'Internet Discotheque — ten tracks, playable in the browser.',
      icon: { type: 'cls', value: 'pixelart-icons-font-music' },
      accent: '#ffd86b'
    },
    {
      id: 'radio',
      name: 'Radio',
      href: 'https://plaza.one/',
      collection: 'sound',
      gate: 'external',
      note: 'Plaza.one, playing in another tab.',
      icon: { type: 'cls', value: 'pixelart-icons-font-radio-on' },
      accent: '#ff9f5a',
      external: true
    },

    {
      id: 'ourspace',
      name: 'OurSpace',
      href: '/ourspace.html',
      collection: 'rooms',
      gate: 'open',
      note: 'ourspace — i see you.',
      icon: { type: 'img', value: '/assets/ourspace/ourspace-constellation-friends-icon.png' },
      accent: '#9a7bff'
    },
    {
      id: 'talk',
      name: 'Talk to Disco-teque',
      href: '/talk-to-disco-teque.html',
      collection: 'rooms',
      gate: 'open',
      note: 'A conversation with the disco.',
      icon: { type: 'img', value: '/assets/talk/talk-discoteque-terminal-icon.png' },
      accent: '#8fe7ff'
    },
    {
      id: 'htv',
      name: 'Harmonizer TV',
      href: '/htv/',
      collection: 'rooms',
      gate: 'signin',
      note: 'Streaming client for the lab television.',
      icon: { type: 'cls', value: 'pixelart-icons-font-device-tv' },
      accent: '#ffb347'
    },
    {
      id: 'multiplex',
      name: 'Multiplex',
      href: '/multiplex/',
      collection: 'rooms',
      gate: 'keyed',
      note: 'PC tab and terminal relay for the web.',
      icon: { type: 'cls', value: 'pixelart-icons-font-server' },
      accent: '#7bd7ff'
    },
    {
      id: 'neondrift',
      name: 'Neon Drift',
      href: '/neondrift/',
      collection: 'rooms',
      gate: 'passkey',
      note: 'Neon Drift.',
      icon: { type: 'cls', value: 'pixelart-icons-font-zap' },
      accent: '#d98cff'
    },

    {
      id: 'convert',
      name: 'Convert',
      href: '/convert/',
      collection: 'tools',
      gate: 'passkey',
      note: 'Node conversion service.',
      icon: { type: 'cls', value: 'pixelart-icons-font-download' },
      accent: '#8ab4ff'
    },
    {
      id: 'cloudlink',
      name: 'Cloud Link',
      href: '/cloud-link/',
      collection: 'tools',
      gate: 'passkey',
      note: 'Lyrion cloud-link service.',
      icon: { type: 'cls', value: 'pixelart-icons-font-cloud' },
      accent: '#66d9ff'
    },
    {
      id: 'alarmonizer',
      name: 'Alarmonizer',
      href: '/alarmonizer/',
      collection: 'tools',
      gate: 'signin',
      note: 'Lyrion alarm service.',
      icon: { type: 'cls', value: 'pixelart-icons-font-clock' },
      accent: '#ffd86b'
    },
    {
      id: 'language',
      name: 'Language',
      href: '/language/',
      collection: 'tools',
      gate: 'signin',
      note: 'Foothold language app.',
      icon: { type: 'cls', value: 'pixelart-icons-font-book-open' },
      accent: '#a5ffa5'
    },
    {
      id: 'harmdrop',
      name: 'Harm Drop',
      href: '/harmdrop/',
      collection: 'tools',
      gate: 'signin',
      note: 'File drop.',
      icon: { type: 'cls', value: 'pixelart-icons-font-upload' },
      accent: '#ff7ac8'
    },
    {
      id: 'topology',
      name: 'Topology',
      href: '/topology/',
      collection: 'tools',
      gate: 'passkey',
      note: 'Tangent 3D — a parametric modeler.',
      icon: { type: 'cls', value: 'pixelart-icons-font-frame' },
      accent: '#7affff'
    },

    {
      id: 'sand',
      name: 'Sand Sim',
      href: '/sand.html',
      collection: 'things',
      gate: 'open',
      note: 'A sandbox that falls.',
      icon: { type: 'img', value: '/assets/sand/sand-discotheque-vortex-icon.png' },
      accent: '#f8d27a'
    },
    {
      id: 'venpod',
      name: 'VENPOD',
      href: '/venpod.html',
      collection: 'things',
      gate: 'open',
      note: 'A 3D voxel physics engine.',
      icon: { type: 'img', value: '/assets/venpod/venpod-myspace-glitter-sim-icon.png' },
      accent: '#ff6b6b'
    },
    {
      id: 'terrapin',
      name: 'Terrapin',
      href: '/terrapin/',
      collection: 'things',
      gate: 'ios',
      note: 'A private phone blocker for iOS.',
      icon: { type: 'img', value: '/assets/terrapin/terrapin-app-icon-256.png' },
      accent: '#f0567f',
      more: { label: 'App Store', href: 'https://apps.apple.com/app/terrapin/id6818588096' }
    },
    {
      id: 'optio',
      name: 'Optio',
      href: '/optio',
      collection: 'things',
      gate: 'open',
      note: 'Plan where to live in Edmonton around the people, places, and routines that matter.',
      icon: { type: 'cls', value: 'pixelart-icons-font-map' },
      accent: '#53ffd6'
    }
  ];

  const gates = {
    open: 'Open',
    signin: 'Sign-in',
    passkey: 'Passkey',
    keyed: 'Keyed',
    external: 'External',
    ios: 'iOS'
  };

  window.HL_COLLECTIONS = { collections, items, gates };
})();
