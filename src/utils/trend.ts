import type { GEOAnalysisResult, TrendInfo, StoredHistory } from '../types/analysis';
import { t } from './i18n';

/** Criterion key → met, from a (mapped) result; not-applicable checks left out. */
export function criterionChecks(result: GEOAnalysisResult): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const category of Object.values(result.categories)) {
    for (const d of category.details) {
      if (!d.id || d.weight === 0) continue;
      const met = d.found && (!d.progress || d.progress.current >= d.progress.target);
      checks[d.id] = met;
    }
  }
  return checks;
}

/** Criteria fixed and newly failing between two check maps (common keys only). */
export function diffChecks(
  previous: Record<string, boolean>,
  current: Record<string, boolean>
): { fixed: string[]; regressed: string[] } {
  const fixed: string[] = [];
  const regressed: string[] = [];
  for (const [key, met] of Object.entries(current)) {
    if (!(key in previous) || previous[key] === met) continue;
    (met ? fixed : regressed).push(key);
  }
  return { fixed, regressed };
}

export function computeTrend(
  currentScore: number,
  history: StoredHistory,
  currentChecks?: Record<string, boolean>
): TrendInfo | null {
  // entries[0] would be the just-saved current result, so compare to entries[1]
  // But we call this BEFORE saving, so entries[0] is the most recent previous
  if (history.entries.length === 0) return null;

  const previous = history.entries[0];
  const delta = Math.round((currentScore - previous.totalScore) * 10) / 10;

  return {
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    delta: Math.abs(delta),
    previousScore: previous.totalScore,
    previousTimestamp: previous.timestamp,
    ...(previous.checks && currentChecks ? diffChecks(previous.checks, currentChecks) : {}),
  };
}

export function formatTrendLabel(trend: TrendInfo): string {
  if (trend.direction === 'flat') {
    return t('trend_flat');
  }
  const arrow = trend.direction === 'up' ? '↑' : '↓';
  const sign = trend.direction === 'up' ? '+' : '-';
  const relTime = formatRelativeTime(new Date(trend.previousTimestamp));
  return t('trend_since', { arrow, sign, delta: trend.delta.toFixed(1), time: relTime });
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 1) return t('trend_justNow');
  if (diffMins < 60) return t('trend_minutesAgo', { n: diffMins });
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return t('trend_hoursAgo', { n: diffHours });
  const diffDays = Math.round(diffHours / 24);
  return t('trend_daysAgo', { n: diffDays });
}

// Criterion names for the "fixed / new" lines, at most `max` plus "+N"
export function formatCriterionList(keys: string[], max = 4): string {
  const names = keys.slice(0, max).map((k) => t(k));
  return keys.length > max ? `${names.join(', ')} +${keys.length - max}` : names.join(', ');
}
