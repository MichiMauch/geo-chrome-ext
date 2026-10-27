// The analyzers and extractors expect browser globals (DOMParser for parsed
// pages and sitemaps, Node/Element for type checks, window.location as a
// default argument). In Node they come from one jsdom window, installed once
// before the first analysis.
import { JSDOM } from 'jsdom';

const GLOBALS = [
  'DOMParser',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLScriptElement',
  'NodeFilter',
  'XMLSerializer',
  'getComputedStyle',
] as const;

let installed = false;

export function installDomGlobals(): void {
  if (installed) return;
  installed = true;
  const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.invalid/' });
  const g = globalThis as Record<string, unknown>;
  g.window = window;
  g.document = window.document;
  for (const name of GLOBALS) {
    if (g[name] !== undefined) continue;
    const value = (window as unknown as Record<string, unknown>)[name];
    g[name] = typeof value === 'function' && name === 'getComputedStyle' ? value.bind(window) : value;
  }
}
