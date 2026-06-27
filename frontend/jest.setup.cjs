require('@testing-library/jest-dom');
const { configureAxe } = require('jest-axe');
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill Web Crypto API for jsdom (needed by computeTermsHash → crypto.subtle.digest)
const { webcrypto } = require('crypto');
Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });

// Mock window.matchMedia (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Configure axe for accessibility testing
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: true },
    'html-has-lang': { enabled: true },
    label: { enabled: true },
    'landmark-one-main': { enabled: true },
  },
});

// Make axe available globally
global.axe = axe;

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({ data: [] })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => []),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
  }));
}

if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ rates: { USD: 1 } }),
  }));
}
