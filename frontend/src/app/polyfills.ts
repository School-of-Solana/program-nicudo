import { Buffer } from 'buffer';

declare global {
  interface Window {
    Buffer: typeof Buffer;
    global: typeof globalThis;
  }
  var Buffer: typeof import('buffer').Buffer;
}

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window.global || window;
}

if (typeof global !== 'undefined') {
  (global as any).Buffer = Buffer;
}

// Polyfill global for browser
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
}
