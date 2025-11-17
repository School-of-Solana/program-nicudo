import { Buffer } from 'buffer';
import process from 'process';

// Polyfill Buffer globally before anything else
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
  (window as any).process = process;
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
  (globalThis as any).process = process;
}

export {};
