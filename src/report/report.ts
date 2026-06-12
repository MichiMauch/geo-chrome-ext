chrome.storage.local.get('geo_report_html', (data) => {
  const html = data['geo_report_html'] as string;
  if (!html) return;

  // Replace the entire document with the report HTML
  document.open();
  document.write(html);
  document.close();

  // Run animations and wire up button after DOM is ready
  setTimeout(() => {
    // Print button
    const btn = document.getElementById('print-btn');
    if (btn) {
      btn.addEventListener('click', () => window.print());
    }

    // Count-up score
    document.querySelectorAll('.count-up').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-target') || '0');
      const duration = 1200;
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = (target * eased).toFixed(1);
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target.toFixed(1);
      };
      requestAnimationFrame(step);
    });

    // Animate progress bars (including hero bar)
    const allBars = document.querySelectorAll<HTMLElement>('.progress-bar, .hero-bar');
    allBars.forEach((bar, i) => {
      const target = bar.getAttribute('data-target');
      setTimeout(() => { bar.style.width = target + '%'; }, 200 + i * 40);
    });

    // Fix-snippet show/hide toggles
    document.querySelectorAll<HTMLButtonElement>('.snippet-toggle').forEach((btn) => {
      const showLabel = btn.textContent?.trim() || 'Show snippet';
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-snippet-target');
        if (!targetId) return;
        const preview = document.getElementById(targetId);
        if (!preview) return;
        const isHidden = preview.hasAttribute('hidden');
        if (isHidden) {
          preview.removeAttribute('hidden');
          btn.setAttribute('aria-expanded', 'true');
          btn.dataset.originalLabel ||= showLabel;
          btn.textContent = btn.dataset.hideLabel || 'Hide';
        } else {
          preview.setAttribute('hidden', '');
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = btn.dataset.originalLabel || showLabel;
        }
      });
    });

    // Domain dashboard: per-row remove buttons. Two-step inline confirm
    // (no window.confirm): first click arms the button, second click deletes
    // the page's history entry and drops the row. Header stats (count +
    // average) are recomputed from the remaining rows; the rating badge
    // keeps its snapshot value until the dashboard is reopened.
    document.querySelectorAll<HTMLButtonElement>('.dash-remove').forEach((btn) => {
      let armed = false;
      let disarmTimer: ReturnType<typeof setTimeout> | undefined;
      btn.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          btn.classList.add('confirm');
          btn.textContent = btn.dataset.confirm || '×';
          disarmTimer = setTimeout(() => {
            armed = false;
            btn.classList.remove('confirm');
            btn.textContent = '×';
          }, 3000);
          return;
        }
        if (disarmTimer) clearTimeout(disarmTimer);
        const row = btn.closest('tr');
        const key = row?.getAttribute('data-key');
        if (!row || !key) return;
        try {
          await chrome.storage.local.remove(key);
        } catch {
          return; // keep the row if deletion failed
        }
        const tbody = row.parentElement;
        row.remove();
        const rows = Array.from(document.querySelectorAll<HTMLElement>('tr[data-key]'));
        const countEl = document.getElementById('dash-count');
        if (countEl) countEl.textContent = String(rows.length);
        const avgEl = document.getElementById('dash-avg');
        if (avgEl && rows.length > 0) {
          const avg = rows.reduce((sum, r) => sum + parseFloat(r.dataset.score || '0'), 0) / rows.length;
          avgEl.textContent = (Math.round(avg * 10) / 10).toFixed(1);
        }
        if (rows.length === 0) {
          if (avgEl) avgEl.textContent = '0.0';
          const card = tbody?.closest('.card');
          if (card) {
            card.innerHTML = `<p class="empty"></p>`;
            card.querySelector('.empty')!.textContent = card.getAttribute('data-empty') || '';
          }
        }
      });
    });

    // Fix-snippet copy buttons
    document.querySelectorAll<HTMLButtonElement>('.snippet-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const codeId = btn.getAttribute('data-snippet-code');
        if (!codeId) return;
        const codeEl = document.getElementById(codeId);
        if (!codeEl) return;
        const code = codeEl.textContent || '';
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = code;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* ignore */ }
          document.body.removeChild(ta);
        }
        const label = btn.querySelector<HTMLElement>('.snippet-copy-label');
        if (label) {
          const original = label.dataset.original || label.textContent || 'Copy';
          label.dataset.original = original;
          label.textContent = btn.dataset.copiedLabel || 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            label.textContent = original;
            btn.classList.remove('copied');
          }, 1500);
        }
      });
    });
  }, 50);

  // Clean up stored HTML
  chrome.storage.local.remove('geo_report_html');
});
