/**
 * Simple statistics for A/B test analysis.
 *
 * Computes:
 * - Conversion rates per variant
 * - Z-score for two-proportion z-test
 * - P-value from z-score (normal approximation)
 * - Confidence intervals
 * - Winner declaration at given confidence level
 */

export interface VariantStats {
  variant: string;
  sampleSize: number;
  successes: number;
  successRate: number;
  avgLatencyMs: number;
  avgCost: number;
}

export interface ABTestStats {
  variantA: VariantStats;
  variantB: VariantStats;
  pValue: number;
  zScore: number;
  confidenceLevel: number;
  winner: string | null;
  significant: boolean;
  lift: number; // percentage improvement of B over A
}

export function computeABTestStats(
  variantA: VariantStats,
  variantB: VariantStats,
  confidenceLevel: number = 0.95,
): ABTestStats {
  const pA = variantA.successRate;
  const pB = variantB.successRate;
  const nA = variantA.sampleSize;
  const nB = variantB.sampleSize;

  // Pooled proportion
  const pPool = (variantA.successes + variantB.successes) / (nA + nB);

  // Standard error
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));

  // Z-score
  const zScore = se > 0 ? (pB - pA) / se : 0;

  // P-value from z-score (two-tailed, normal approximation)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

  // Significance
  const alpha = 1 - confidenceLevel;
  const significant = pValue < alpha;

  // Lift
  const lift = pA > 0 ? ((pB - pA) / pA) * 100 : 0;

  // Winner
  let winner: string | null = null;
  if (significant) {
    if (pB > pA) winner = 'b';
    else if (pA > pB) winner = 'a';
  }

  return {
    variantA,
    variantB,
    pValue,
    zScore,
    confidenceLevel,
    winner,
    significant,
    lift,
  };
}

/**
 * Calculate the minimum detectable effect for a given sample size.
 */
export function minimumDetectableEffect(
  baselineRate: number,
  sampleSize: number,
  confidenceLevel: number = 0.95,
  power: number = 0.8,
): number {
  const zAlpha = normalInverseCDF(1 - (1 - confidenceLevel) / 2);
  const zBeta = normalInverseCDF(power);
  const se = Math.sqrt((baselineRate * (1 - baselineRate)) / sampleSize);
  return (zAlpha + zBeta) * se / baselineRate;
}

/**
 * Estimate required sample size to detect a given effect.
 */
export function requiredSampleSize(
  baselineRate: number,
  minimumDetectableLift: number,
  confidenceLevel: number = 0.95,
  power: number = 0.8,
): number {
  const zAlpha = normalInverseCDF(1 - (1 - confidenceLevel) / 2);
  const zBeta = normalInverseCDF(power);
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableLift);
  const pBar = (p1 + p2) / 2;

  const n =
    (Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2)) /
    Math.pow(p2 - p1, 2);

  return Math.ceil(n);
}

// ── Statistical helpers ──────────────────────────────────────

function normalCDF(x: number): number {
  // Approximation of the standard normal CDF
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

function normalInverseCDF(p: number): number {
  // Approximation of the inverse standard normal CDF
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const q = Math.min(p, 1 - p);
  let x: number;

  if (q > 0.02425) {
    const r = q - 0.5;
    const r2 = r * r;
    x =
      (((((a[0] * r2 + a[1]) * r2 + a[2]) * r2 + a[3]) * r2 + a[4]) * r2 + a[5]) * r /
      (((((b[0] * r2 + b[1]) * r2 + b[2]) * r2 + b[3]) * r2 + b[4]) * r2 + 1);
  } else {
    const r = Math.sqrt(-2 * Math.log(q));
    x =
      (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }

  return p < 0.5 ? -x : x;
}
