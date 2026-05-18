import type { GEOAnalysisResult, ScoreRating } from '../types/analysis';
import { t } from './i18n';

export function calculateTotalScore(
  categories: GEOAnalysisResult['categories']
): number {
  const total = Object.values(categories).reduce(
    (sum, cat) => sum + cat.score,
    0
  );
  return Math.round(total * 10) / 10;
}

export function getScoreRating(totalScore: number): ScoreRating {
  // Thresholds scaled to /30 (~83%, ~63%, ~40% — same ratios as the old /25 grid).
  if (totalScore >= 25) {
    return { level: 'excellent', label: t('rating_excellent'), color: '#22c55e' };
  }
  if (totalScore >= 19) {
    return { level: 'good', label: t('rating_good'), color: '#84cc16' };
  }
  if (totalScore >= 12) {
    return { level: 'moderate', label: t('rating_moderate'), color: '#eab308' };
  }
  return { level: 'poor', label: t('rating_poor'), color: '#ef4444' };
}

export function getCategoryColor(score: number): string {
  if (score >= 4) return '#22c55e'; // Grün
  if (score >= 3) return '#84cc16'; // Hellgrün
  if (score >= 2) return '#eab308'; // Gelb
  return '#ef4444'; // Rot
}

export function normalizeScore(
  weightedScore: number,
  totalWeight: number
): number {
  if (totalWeight === 0) return 0;
  const score = (weightedScore / totalWeight) * 5;
  return Math.round(Math.min(5, Math.max(0, score)) * 10) / 10;
}
