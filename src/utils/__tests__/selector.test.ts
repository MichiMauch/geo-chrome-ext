// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { cssPath } from '../selector';

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe('cssPath', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the tag itself for html and body', () => {
    expect(cssPath(document.documentElement)).toBe('html');
    expect(cssPath(document.body)).toBe('body');
  });

  it('uses a unique id as shortcut', () => {
    setBody('<div id="main"><p>Hello</p></div>');
    const el = document.getElementById('main')!;
    expect(cssPath(el)).toBe('#main');
  });

  it('anchors the path at the closest ancestor with a unique id', () => {
    setBody('<div id="content"><section><p>One</p><p>Two</p></section></div>');
    const p2 = document.querySelectorAll('p')[1];
    expect(cssPath(p2)).toBe('#content > section > p:nth-of-type(2)');
  });

  it('falls back to a body-rooted nth-of-type path without ids', () => {
    setBody('<div><p>One</p></div><div><p>Two</p></div>');
    const p2 = document.querySelectorAll('p')[1];
    expect(cssPath(p2)).toBe('body > div:nth-of-type(2) > p');
  });

  it('skips nth-of-type when the element is the only one of its tag', () => {
    setBody('<article><h1>Title</h1></article>');
    const h1 = document.querySelector('h1')!;
    expect(cssPath(h1)).toBe('body > article > h1');
  });

  it('ignores duplicate ids and keeps walking up', () => {
    setBody('<div id="dup"><p>One</p></div><div id="dup"><p>Two</p></div>');
    const p2 = document.querySelectorAll('p')[1];
    // #dup is ambiguous, so the path must not rely on it
    expect(cssPath(p2)).toBe('body > div:nth-of-type(2) > p');
  });

  it('escapes ids that need it', () => {
    setBody('<div id="a:b"><p>Hi</p></div>');
    const el = document.querySelector('div')!;
    expect(document.querySelector(cssPath(el))).toBe(el);
  });

  it('round-trips: querySelector(cssPath(el)) === el for a deep tree', () => {
    setBody(`
      <main>
        <section><h2>A</h2><p>1</p><p>2</p><img src="x.png"></section>
        <section><h2>B</h2><ul><li>a</li><li>b</li></ul><img src="y.png"></section>
      </main>
    `);
    document.querySelectorAll('main *').forEach((el) => {
      expect(document.querySelector(cssPath(el))).toBe(el);
    });
  });
});
