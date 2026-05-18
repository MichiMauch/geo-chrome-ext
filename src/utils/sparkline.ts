import type { HistoryEntry } from '../types/analysis';

export function renderSparkline(canvas: HTMLCanvasElement, entries: HistoryEntry[]): void {
  if (entries.length < 2) {
    canvas.classList.add('hidden');
    return;
  }

  canvas.classList.remove('hidden');

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 8, bottom: 8, left: 4, right: 4 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Entries are newest-first, reverse for left-to-right chronological
  const data = [...entries].reverse();
  const scores = data.map((e) => e.totalScore);
  const minScore = Math.max(0, Math.min(...scores) - 1);
  const maxScore = Math.min(20, Math.max(...scores) + 1);
  const range = maxScore - minScore || 1;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Draw area fill
  ctx.beginPath();
  data.forEach((entry, i) => {
    const x = pad.left + (i / (data.length - 1)) * plotW;
    const y = pad.top + (1 - (entry.totalScore - minScore) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  // Close path for fill
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.fillStyle = isDark ? 'rgba(51, 204, 204, 0.15)' : 'rgba(51, 204, 204, 0.1)';
  ctx.fill();

  // Draw line
  ctx.beginPath();
  data.forEach((entry, i) => {
    const x = pad.left + (i / (data.length - 1)) * plotW;
    const y = pad.top + (1 - (entry.totalScore - minScore) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#33CCCC';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Draw dots for last and first point
  const drawDot = (i: number, color: string) => {
    const x = pad.left + (i / (data.length - 1)) * plotW;
    const y = pad.top + (1 - (data[i].totalScore - minScore) / range) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  drawDot(0, isDark ? '#6b7280' : '#9ca3af');
  drawDot(data.length - 1, '#33CCCC');
}
