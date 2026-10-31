'use strict';

/**
 * Matrix360 Scenario Budget Range & A/B Sample Size Estimator
 *
 * Implements:
 * 1. Diminishing-returns saturation curve for budget scenarios (Low, Expected, High)
 * 2. Minimum Detectable Effect (MDE) sample-size calculator for A/B testing
 * 3. Strict labeling: ESTIMATE_ONLY_NOT_HISTORICAL_RESULT with explicit assumptions
 */

const BADGE_DISCLAIMER = 'ESTIMATE_ONLY_NOT_HISTORICAL_RESULT';

/**
 * Computes diminishing-returns response curve
 * R(b) = R_max * (b / (b + k))
 */
function calculateSaturationResponse(budget, rMax, halfSaturationK) {
  if (budget <= 0) return 0;
  return Math.round(rMax * (budget / (budget + halfSaturationK)));
}

// Acklam inverse-normal approximation; accurate enough for planning inputs.
function inverseNormal(probability) {
  if (!(probability > 0 && probability < 1)) throw new Error('Probability must be between 0 and 1');
  const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924];
  const b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857];
  const c=[-.00778489400243029,-.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878];
  const d=[.00778469570904146,.32246712907004,2.445134137143,3.75440866190742];
  const low=.02425, high=1-low;
  if(probability<low){const q=Math.sqrt(-2*Math.log(probability));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(probability>high){const q=Math.sqrt(-2*Math.log(1-probability));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  const q=probability-.5,r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

/**
 * Generates low, expected, and high budget scenario estimates
 *
 * @param {Object} options
 * @param {number} options.budget - Budget in INR (e.g. 50000)
 * @param {string} options.profileType - 'b2b_industrial' | 'b2c_affinity'
 * @param {number} [options.durationDays=30] - Campaign length in days
 */
function estimateBudgetScenarios(options = {}) {
  const budget = Math.max(1000, Number(options.budget) || 35000);
  const profileType = options.profileType || 'b2c_affinity';
  const durationDays = Math.max(7, Number(options.durationDays) || 30);

  // Industry-grounded cost & conversion parameters
  const isB2B = profileType === 'b2b_industrial';

  const params = isB2B ? {
    segment_type: 'B2B Industrial / Logistics',
    avg_cpc: { low: 65, expected: 48, high: 34 },
    cvr: { low: 0.012, expected: 0.024, high: 0.042 }, // 1.2% - 4.2%
    half_sat_k: 60000,
    r_max_impressions: 120000,
    notes: 'Higher CPC reflecting senior decision-maker B2B targeting (Procurement, Plant Heads, Directors)'
  } : {
    segment_type: 'B2C Residential / Affinity',
    avg_cpc: { low: 22, expected: 15, high: 9 },
    cvr: { low: 0.018, expected: 0.032, high: 0.055 }, // 1.8% - 5.5%
    half_sat_k: 40000,
    r_max_impressions: 280000,
    notes: 'Residential affinity parameters reflecting localized and diaspora demographics'
  };

  // Impressions using diminishing returns saturation
  const impressions = {
    low: calculateSaturationResponse(budget * 0.85, params.r_max_impressions, params.half_sat_k * 1.2),
    expected: calculateSaturationResponse(budget, params.r_max_impressions, params.half_sat_k),
    high: calculateSaturationResponse(budget * 1.15, params.r_max_impressions, params.half_sat_k * 0.85)
  };

  // Clicks = Budget / CPC
  const clicks = {
    low: Math.round(budget / params.avg_cpc.low),
    expected: Math.round(budget / params.avg_cpc.expected),
    high: Math.round(budget / params.avg_cpc.high)
  };

  // Leads = Clicks * CVR
  const qualifiedLeads = {
    low: Math.max(1, Math.round(clicks.low * params.cvr.low)),
    expected: Math.max(2, Math.round(clicks.expected * params.cvr.expected)),
    high: Math.max(3, Math.round(clicks.high * params.cvr.high))
  };

  // Cost Per Lead (CPL)
  const cpl = {
    low: Math.round(budget / qualifiedLeads.high), // best CPL
    expected: Math.round(budget / qualifiedLeads.expected),
    high: Math.round(budget / qualifiedLeads.low) // worst CPL
  };

  return {
    badge: BADGE_DISCLAIMER,
    budget_inr: budget,
    duration_days: durationDays,
    daily_spend_inr: Math.round(budget / durationDays),
    profile_type: profileType,
    scenarios: {
      conservative_low: {
        impressions: impressions.low,
        estimated_clicks: clicks.low,
        estimated_leads: qualifiedLeads.low,
        estimated_cpl_inr: cpl.high,
        assumed_cpc_inr: params.avg_cpc.low,
        assumed_conversion_rate: `${(params.cvr.low * 100).toFixed(1)}%`
      },
      expected_median: {
        impressions: impressions.expected,
        estimated_clicks: clicks.expected,
        estimated_leads: qualifiedLeads.expected,
        estimated_cpl_inr: cpl.expected,
        assumed_cpc_inr: params.avg_cpc.expected,
        assumed_conversion_rate: `${(params.cvr.expected * 100).toFixed(1)}%`
      },
      optimistic_high: {
        impressions: impressions.high,
        estimated_clicks: clicks.high,
        estimated_leads: qualifiedLeads.high,
        estimated_cpl_inr: cpl.low,
        assumed_cpc_inr: params.avg_cpc.high,
        assumed_conversion_rate: `${(params.cvr.high * 100).toFixed(1)}%`
      }
    },
    saturation_curve_model: {
      formula: 'R(b) = R_max * (b / (b + k))',
      r_max_impressions: params.r_max_impressions,
      half_saturation_k: params.half_sat_k,
      diminishing_returns_threshold: `Optimal efficiency plateaus above ₹${Math.round(params.half_sat_k * 1.5).toLocaleString('en-IN')}`
    },
    stated_assumptions: [
      'Planning defaults only; no client historical ad account data was supplied.',
      params.notes,
      'Estimates assume approved ad creative and consistent landing-page message alignment.',
      'Actual auction dynamics, seasonal competition, and ad account history will influence live results.',
      'Zero historical return is guaranteed or fabricated.'
    ]
  };
}

/**
 * Calculates required sample size for A/B testing using two-proportion z-test math
 *
 * n ≈ 2 * (Z_alpha/2 + Z_beta)^2 * p * (1 - p) / delta^2
 *
 * @param {Object} options
 * @param {number} [options.baselineConversion=0.03] - Baseline conversion rate (e.g. 0.03 = 3%)
 * @param {number} [options.expectedLiftPercent=25] - Expected relative lift in % (e.g. 25%)
 * @param {number} [options.significance=0.05] - Alpha level (default 0.05 -> 95% confidence)
 * @param {number} [options.power=0.80] - Power (default 0.80 -> 80% power)
 * @param {number} [options.dailyVisitors=500] - Estimated daily traffic to calculate test duration
 */
function calculateABSampleSize(options = {}) {
  const p = Math.max(0.001, Math.min(0.5, Number(options.baselineConversion) || 0.03));
  const lift = Math.max(5, Math.min(200, Number(options.expectedLiftPercent) || 25)) / 100;
  const delta = p * lift; // absolute minimum detectable effect
  const dailyVisitors = Math.max(10, Number(options.dailyVisitors) || 400);
  const significance = Number(options.significance ?? 0.05);
  const power = Number(options.power ?? 0.80);
  if (!(significance > 0 && significance < 0.5)) throw new Error('significance must be between 0 and 0.5');
  if (!(power > 0.5 && power < 1)) throw new Error('power must be between 0.5 and 1');
  const zAlphaHalf = inverseNormal(1 - significance / 2);
  const zBeta = inverseNormal(power);
  const zSumSquared = Math.pow(zAlphaHalf + zBeta, 2); // ~7.849

  // Sample size per variant
  const nPerVariant = Math.ceil((2 * zSumSquared * p * (1 - p)) / Math.pow(delta, 2));
  const totalSampleSize = nPerVariant * 2;
  const estimatedDays = Math.ceil(totalSampleSize / dailyVisitors);

  return {
    badge: BADGE_DISCLAIMER,
    baseline_conversion: `${(p * 100).toFixed(1)}%`,
    minimum_detectable_lift: `${(lift * 100).toFixed(0)}% relative lift (from ${(p * 100).toFixed(2)}% to ${((p + delta) * 100).toFixed(2)}%)`,
    confidence_level: `${((1-significance)*100).toFixed(1)}% (α = ${significance})`,
    statistical_power: `${(power*100).toFixed(1)}% (β = ${(1-power).toFixed(3)})`,
    sample_size_per_variant: nPerVariant,
    total_required_sample_size: totalSampleSize,
    estimated_duration_days: estimatedDays,
    minimum_test_duration_rule: 'Run for minimum 14 full days to account for day-of-week seasonality, even if statistical significance is reached earlier.',
    methodology: 'Two-proportion hypothesis test sample size calculation with asymptotic normal approximation.'
  };
}

module.exports = {
  BADGE_DISCLAIMER,
  estimateBudgetScenarios,
  calculateABSampleSize
};
