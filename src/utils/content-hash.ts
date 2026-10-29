// Compute a quick hash of the page's key content
export function computeContentHash(doc: Document = document): string {
  const parts: string[] = [];
  parts.push(doc.title);
  parts.push(doc.querySelector('meta[name="description"]')?.getAttribute('content') || '');

  // All headings
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    parts.push(h.tagName + ':' + (h.textContent || '').trim());
  });

  // Body text content length + first/last 500 chars as fingerprint
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  parts.push('LEN:' + bodyText.length);
  parts.push(bodyText.slice(0, 500));
  parts.push(bodyText.slice(-500));

  // Number of structural elements
  parts.push('P:' + doc.querySelectorAll('p').length);
  parts.push('L:' + doc.querySelectorAll('ul,ol').length);
  parts.push('A:' + doc.querySelectorAll('a').length);
  // Alt-attribute fingerprint: fixing alt texts doesn't change the body text,
  // but must bust the cache (alt coverage score + highlight targets).
  parts.push('IMG:' + doc.querySelectorAll('img').length + ':' + doc.querySelectorAll('img:not([alt])').length);

  // Simple string hash (djb2)
  const str = parts.join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}
