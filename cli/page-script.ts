// The extension's page report gets its behaviour from the report viewer
// (src/report/report.ts), which only runs inside the extension. A report
// rendered by the CLI carries the same behaviour inline: bars and score count
// up, criteria open all at once, snippets show and copy, print opens folds.
// Keep in step with report.ts.
export const PAGE_REPORT_SCRIPT = `<script>
(function () {
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  var criteria = function () { return $$('details.crit'); };
  var toggleAll = document.getElementById('toggle-all');
  if (toggleAll) {
    var sync = function () {
      var allOpen = criteria().every(function (d) { return d.open; });
      toggleAll.textContent = (allOpen ? toggleAll.dataset.collapse : toggleAll.dataset.expand) || '';
    };
    toggleAll.addEventListener('click', function () {
      var open = !criteria().every(function (d) { return d.open; });
      criteria().forEach(function (d) { d.open = open; });
      sync();
    });
    criteria().forEach(function (d) { d.addEventListener('toggle', sync); });
  }

  var before = [];
  var printable = function () { return $$('details.crit, details.recs-more'); };
  window.addEventListener('beforeprint', function () {
    before = printable().map(function (d) { return d.open; });
    printable().forEach(function (d) { d.open = true; });
  });
  window.addEventListener('afterprint', function () {
    printable().forEach(function (d, i) { d.open = before[i] || false; });
  });

  $$('.count-up').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-target') || '0');
    var start = performance.now();
    var step = function (now) {
      var p = Math.min((now - start) / 1200, 1);
      el.textContent = (target * (1 - Math.pow(1 - p, 3))).toFixed(1);
      if (p < 1) requestAnimationFrame(step); else el.textContent = target.toFixed(1);
    };
    requestAnimationFrame(step);
  });

  $$('.progress-bar, .hero-bar').forEach(function (bar, i) {
    setTimeout(function () { bar.style.width = bar.getAttribute('data-target') + '%'; }, 200 + i * 40);
  });

  $$('.snippet-toggle').forEach(function (btn) {
    var showLabel = (btn.textContent || '').trim() || 'Show snippet';
    btn.addEventListener('click', function () {
      var preview = document.getElementById(btn.getAttribute('data-snippet-target') || '');
      if (!preview) return;
      if (preview.hasAttribute('hidden')) {
        preview.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = btn.dataset.hideLabel || 'Hide';
      } else {
        preview.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = showLabel;
      }
    });
  });

  $$('.snippet-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var codeEl = document.getElementById(btn.getAttribute('data-snippet-code') || '');
      if (!codeEl) return;
      var code = codeEl.textContent || '';
      var done = function () {
        var label = btn.querySelector('.snippet-copy-label');
        if (!label) return;
        var original = label.dataset.original || label.textContent || 'Copy';
        label.dataset.original = original;
        label.textContent = btn.dataset.copiedLabel || 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () { label.textContent = original; btn.classList.remove('copied'); }, 1500);
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); done();
      };
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, fallback); else fallback();
    });
  });
})();
</script>`;
