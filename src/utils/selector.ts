// Generates a CSS selector that uniquely identifies an element within its
// document. Used to hand DOM positions from the analysis (page context) to
// the side panel and back without serializing element references.

function escapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function uniqueIdSelector(el: Element): string | null {
  if (!el.id) return null;
  const selector = `#${escapeIdent(el.id)}`;
  try {
    if (el.ownerDocument.querySelectorAll(selector).length === 1) return selector;
  } catch {
    return null;
  }
  return null;
}

export function cssPath(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return tag;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current) {
    const currentTag = current.tagName.toLowerCase();
    if (currentTag === 'html' || currentTag === 'body') {
      parts.unshift(currentTag);
      break;
    }

    // An ancestor (or the element itself) with a unique id anchors the path —
    // shorter selectors survive unrelated DOM changes better.
    const idSelector = uniqueIdSelector(current);
    if (idSelector) {
      parts.unshift(idSelector);
      break;
    }

    let part = currentTag;
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName
      );
      if (sameTagSiblings.length > 1) {
        part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }

  return parts.join(' > ');
}
