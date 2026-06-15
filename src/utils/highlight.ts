// In-page overlay rendering. Runs only in the content script (page context).
// Deliberately permission-free: a <style> tag, CSS classes and absolutely
// positioned badge elements — no additional Chrome APIs involved.

import type { HighlightTarget } from '../types/analysis';

const STYLE_ID = 'geoa-highlight-style';
const BADGE_CONTAINER_ID = 'geoa-highlight-badges';
const HL_CLASS = 'geoa-hl';

// 'high'/'medium' mark broken elements (solid red/amber outline); 'info'
// marks a PLACE where something is missing (dashed blue outline).
export type HighlightSeverity = 'high' | 'medium' | 'info';

const COLORS: Record<HighlightSeverity, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  info: '#3b82f6',
};

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${HL_CLASS} {
      outline: 3px solid var(--geoa-hl-color, ${COLORS.medium}) !important;
      outline-offset: 2px;
      scroll-margin: 96px;
    }
    .${HL_CLASS}--info {
      outline-style: dashed !important;
    }
    #${BADGE_CONTAINER_ID} {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
    }
    #${BADGE_CONTAINER_ID} span {
      position: absolute;
      transform: translateY(-100%);
      padding: 1px 6px;
      border-radius: 4px 4px 4px 0;
      font: 600 11px/1.6 system-ui, sans-serif;
      color: #fff;
      white-space: nowrap;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

// Badges are positioned once in document coordinates (rect + scroll offset):
// position:absolute keeps them anchored while scrolling. Layout shifts after
// apply can drift them — acceptable, they are rebuilt on every toggle.
export function applyHighlights(
  targets: HighlightTarget[],
  severity: HighlightSeverity
): number {
  clearHighlights();
  ensureStyles();

  const container = document.createElement('div');
  container.id = BADGE_CONTAINER_ID;
  let count = 0;

  targets.forEach((target) => {
    let el: Element | null = null;
    try {
      el = document.querySelector(target.selector);
    } catch {
      return;
    }
    if (!el) return;

    count++;
    // A per-target color (e.g. a readability band) wins over the severity hue.
    const color = target.color ?? COLORS[severity];
    el.classList.add(HL_CLASS);
    if (severity === 'info') el.classList.add(`${HL_CLASS}--info`);
    (el as HTMLElement).style.setProperty('--geoa-hl-color', color);

    // The badge explains WHY this element is marked (e.g. "Skipped level:
    // H1 → H3"). img & co. can't carry ::before/::after, so badges are own
    // elements.
    const rect = el.getBoundingClientRect();
    const badge = document.createElement('span');
    badge.textContent = target.label;
    badge.style.left = `${Math.max(rect.left + window.scrollX, 0)}px`;
    badge.style.top = `${Math.max(rect.top + window.scrollY, 18)}px`;
    badge.style.backgroundColor = color;
    container.appendChild(badge);
  });

  if (count > 0) document.body.appendChild(container);
  return count;
}

export function clearHighlights(): void {
  document.querySelectorAll(`.${HL_CLASS}`).forEach((el) => {
    el.classList.remove(HL_CLASS, `${HL_CLASS}--info`);
    (el as HTMLElement).style.removeProperty('--geoa-hl-color');
  });
  document.getElementById(BADGE_CONTAINER_ID)?.remove();
}

export function scrollToFirst(targets: HighlightTarget[]): boolean {
  for (const target of targets) {
    let el: Element | null = null;
    try {
      el = document.querySelector(target.selector);
    } catch {
      continue;
    }
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
  }
  return false;
}
