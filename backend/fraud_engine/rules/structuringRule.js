/**
 * RULE 1 — STRUCTURING DETECTOR
 *
 * Detects attempts to break large transactions into smaller amounts to avoid
 * ₹50,000 (PMLA) reporting thresholds.
 *
 * Analyses:
 *   - Aggregate amount across rolling windows (15m, 30m, 1h)
 *   - Near-threshold value clustering
 *   - Transaction frequency vs. historical baseline
 *   - One-to-many (fan-out structuring) and many-to-one (convergence)
 *   - Mule-aware convergence amplification (v2.1)
 *       After MANY_TO_ONE_CONVERGENCE fires, uses computeMuleScore() from
 *       muleRiskRule to score the convergence receiver:
 *         receiver score 25–54 → +8  (CONVERGENCE_TO_MULE_MEDIUM)
 *         receiver score 55+   → +15 (CONVERGENCE_TO_MULE_HIGH)
 *       Represents a coordinated mule collection network — the most
 *       dangerous form of structuring convergence.
 *   - Salary / utility / recurring business patterns (reduce risk)
 *
 * New ML features (v2.1):
 *   receiver_mule_score
 *
 * Returns: { ruleName, riskContribution, flags, reasons, features }
 */

const { MODIFIERS, BEHAVIOUR } = require('../config/riskWeights');
const { deviationFactor } = require('../services/behaviourBaseline');
const { computeMuleScore } = require('./muleRiskRule');

const THRESHOLD = BEHAVIOUR.STRUCTURING_THRESHOLD_INR;
const NEAR_BAND = BEHAVIOUR.NEAR_THRESHOLD_BAND;

/**
 * @param {Object}   tx         - current transaction
 * @param {Object[]} allTx      - all transactions in context (memory / recent DB pull)
 * @param {Object}   baseline   - from behaviourBaseline.buildBaseline()
 * @param {Object[]} allAccounts - all accounts in memory (used for mule scoring)
 * @param {Object[]} allAlerts   - all alerts in memory  (used for mule scoring)
 * @returns {{ riskContribution: number, flags: string[], reasons: string[], features: Object }}
 */
function checkStructuring(tx, allTx, baseline, allAccounts = [], allAlerts = []) {
  const flags = [];
  const reasons = [];
  let contribution = 0;
  const now = new Date(tx.timestamp).getTime();

  // ── Pull rolling windows ──────────────────────────────────────────────────────
  const windows = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h':  60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  };

  const windowTxs = {};
  for (const [label, ms] of Object.entries(windows)) {
    windowTxs[label] = allTx.filter(
      t => t.sender === tx.sender &&
           t.tx_id !== tx.tx_id &&
           now - new Date(t.timestamp).getTime() <= ms
    );
  }

  // Include current tx for aggregates
  const recent1h = [...windowTxs['1h'], tx];
  const recent30m = [...windowTxs['30m'], tx];

  const aggregate1h  = recent1h.reduce((s, t) => s + t.amount, 0);
  const aggregate30m = recent30m.reduce((s, t) => s + t.amount, 0);
  const count1h      = recent1h.length;

  // ── Near-Threshold Pattern ───────────────────────────────────────────────────
  // Transactions where NEAR_BAND * THRESHOLD ≤ amount < THRESHOLD
  const nearThresholdMin = THRESHOLD * NEAR_BAND;
  const nearThresholdTxs = recent1h.filter(
    t => t.amount >= nearThresholdMin && t.amount < THRESHOLD
  );
  const nearThresholdCount = nearThresholdTxs.length;
  const nearThresholdTotal = nearThresholdTxs.reduce((s, t) => s + t.amount, 0);

  if (nearThresholdCount >= BEHAVIOUR.NEAR_THRESHOLD_MIN_COUNT) {
    const stdDev = coefficientOfVariation(nearThresholdTxs.map(t => t.amount));
    const isRepeated = stdDev < 0.02; // very low variance means intentional repetition

    contribution += MODIFIERS.NEAR_THRESHOLD_PATTERN;
    flags.push('NEAR_THRESHOLD_PATTERN');
    reasons.push(
      `${nearThresholdCount} transactions clustered between ₹${Math.round(nearThresholdMin).toLocaleString('en-IN')} ` +
      `and ₹${THRESHOLD.toLocaleString('en-IN')} within 1 hour. ` +
      `Total: ₹${Math.round(nearThresholdTotal).toLocaleString('en-IN')}.` +
      (isRepeated ? ' Amounts show suspiciously low variance.' : '')
    );
  }

  // ── High Frequency in Short Window ──────────────────────────────────────────
  const countRecent30m = recent30m.length;
  if (countRecent30m >= 5) {
    contribution += MODIFIERS.HIGH_FREQUENCY_SHORT_WINDOW;
    flags.push('HIGH_FREQUENCY_SHORT_WINDOW');
    reasons.push(
      `${countRecent30m} transactions within 30 minutes ` +
      `totalling ₹${Math.round(aggregate30m).toLocaleString('en-IN')}.`
    );
  }

  // ── Historical Baseline Deviation ────────────────────────────────────────────
  if (baseline.hasHistory) {
    const countDeviation   = deviationFactor(count1h, baseline.avgDailyCount);
    const amountDeviation  = deviationFactor(aggregate1h, baseline.avgDailyAmount);

    if (countDeviation > BEHAVIOUR.BASELINE_DEVIATION_MULTIPLIER ||
        amountDeviation > BEHAVIOUR.BASELINE_DEVIATION_MULTIPLIER) {
      contribution += MODIFIERS.HISTORICAL_DEVIATION;
      flags.push('HISTORICAL_DEVIATION');
      reasons.push(
        `Transaction count is ${countDeviation.toFixed(1)}× and ` +
        `value is ${amountDeviation.toFixed(1)}× above historical daily average ` +
        `(avg: ${Math.round(baseline.avgDailyCount)} txns / ₹${Math.round(baseline.avgDailyAmount).toLocaleString('en-IN')}).`
      );
    }
  }

  // ── New Beneficiaries ────────────────────────────────────────────────────────
  const receivers1h = [...new Set(recent1h.map(t => t.receiver))];
  const newReceivers = receivers1h.filter(r => !baseline.knownBeneficiaries.has(r));
  const newBeneficiaryRatio = receivers1h.length > 0 ? newReceivers.length / receivers1h.length : 0;

  if (newBeneficiaryRatio >= BEHAVIOUR.FAN_OUT_NEW_BENEFICIARY_RATIO && receivers1h.length >= 5) {
    contribution += MODIFIERS.MULTIPLE_NEW_BENEFICIARIES;
    flags.push('MULTIPLE_NEW_BENEFICIARIES');
    reasons.push(
      `${newReceivers.length} of ${receivers1h.length} receivers (${Math.round(newBeneficiaryRatio * 100)}%) ` +
      `were never transacted with before.`
    );
  }

  // ── Many-to-One Convergence (Structuring from multiple senders to this receiver) ──
  const receiversInTx = allTx.filter(
    t => t.receiver === tx.receiver &&
         t.tx_id !== tx.tx_id &&
         now - new Date(t.timestamp).getTime() <= windows['1h'] &&
         t.amount >= nearThresholdMin && t.amount < THRESHOLD
  );
  const convergenceSenders = new Set(receiversInTx.map(t => t.sender));
  if (convergenceSenders.size >= 3) {
    contribution += MODIFIERS.MANY_TO_ONE_CONVERGENCE;
    flags.push('MANY_TO_ONE_CONVERGENCE');
    reasons.push(
      `${convergenceSenders.size} different senders transferred near-threshold amounts ` +
      `to the same receiver (${tx.receiver}) within 1 hour. Possible coordinated structuring.`
    );

    // Cross-rule amplification: if the convergence target is also a probable mule,
    // this is consistent with a coordinated mule collection network — significantly higher risk.
    const receiverMuleScore = computeMuleScore(tx.receiver, allTx, allAccounts, allAlerts);
    if (receiverMuleScore >= 55) {
      contribution += 15;
      flags.push('CONVERGENCE_TO_MULE_HIGH');
      reasons.push(
        `Convergence target ${tx.receiver} has a HIGH behavioural mule score (${receiverMuleScore}/95). ` +
        `Multiple senders structuring funds directly into a mule account — coordinated mule network pattern.`
      );
    } else if (receiverMuleScore >= 25) {
      contribution += 8;
      flags.push('CONVERGENCE_TO_MULE_MEDIUM');
      reasons.push(
        `Convergence target ${tx.receiver} has a MEDIUM behavioural mule score (${receiverMuleScore}/95). ` +
        `Structuring pattern combined with mule-like receiver behaviour elevates risk.`
      );
    }
  }

  // ── False Positive Reducers ──────────────────────────────────────────────────
  // Salary pattern: large round amount, same day monthly, same receiver
  if (isSalaryPattern(tx, allTx)) {
    contribution += MODIFIERS.SALARY_PATTERN;
    flags.push('SALARY_PATTERN');
    reasons.push('Transaction matches historical salary disbursement pattern (same day, similar amount, known receiver). Risk reduced.');
  }

  // Utility payment (small amount, known utility-type receiver)
  if (isUtilityPattern(tx)) {
    contribution += MODIFIERS.UTILITY_PAYMENT;
    flags.push('UTILITY_PAYMENT');
    reasons.push('Transaction resembles utility or recurring bill payment. Risk reduced.');
  }

  // Known beneficiary (receiver in historical baseline)
  if (baseline.knownBeneficiaries.has(tx.receiver)) {
    contribution += MODIFIERS.KNOWN_BENEFICIARY;
    flags.push('KNOWN_BENEFICIARY');
    reasons.push(`Receiver ${tx.receiver} has been transacted with previously. Risk reduced.`);
  }

  // ── Features for ML Layer ────────────────────────────────────────────────────
  const receiverMuleScoreForFeature = computeMuleScore(tx.receiver, allTx, allAccounts, allAlerts);

  const features = {
    structuring_risk_score:        contribution,
    near_threshold_count:          nearThresholdCount,
    near_threshold_total_inr:      Math.round(nearThresholdTotal),
    near_threshold_ratio:          count1h > 0 ? nearThresholdCount / count1h : 0,
    aggregate_amount_30m:          Math.round(aggregate30m),
    aggregate_amount_1h:           Math.round(aggregate1h),
    tx_count_30m:                  countRecent30m,
    tx_count_1h:                   count1h,
    new_beneficiary_count:         newReceivers.length,
    new_beneficiary_ratio:         parseFloat(newBeneficiaryRatio.toFixed(3)),
    convergence_sender_count:      convergenceSenders.size,
    receiver_mule_score:           receiverMuleScoreForFeature,   // cross-rule mule signal
    count_deviation_from_baseline: baseline.hasHistory ? deviationFactor(count1h, baseline.avgDailyCount) : 0,
    amount_deviation_from_baseline:baseline.hasHistory ? deviationFactor(aggregate1h, baseline.avgDailyAmount) : 0,
  };

  return {
    ruleName: 'STRUCTURING',
    riskContribution: contribution,
    flags,
    reasons,
    features,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

/** Coefficient of variation (stdDev / mean) — low value = highly uniform amounts */
function coefficientOfVariation(amounts) {
  if (amounts.length < 2) return 0;
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  if (mean === 0) return 0;
  const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
  return Math.sqrt(variance) / mean;
}

/** Simple heuristic: same weekday-of-month, ±10% amount, same receiver in prior months */
function isSalaryPattern(tx, allTx) {
  const txDate = new Date(tx.timestamp);
  const dayOfMonth = txDate.getDate();
  const monthsBack = [1, 2, 3];

  const matches = monthsBack.every(m => {
    const target = new Date(txDate);
    target.setMonth(target.getMonth() - m);
    const found = allTx.find(t =>
      t.sender === tx.sender &&
      t.receiver === tx.receiver &&
      Math.abs(new Date(t.timestamp).getDate() - dayOfMonth) <= 3 &&
      Math.abs(new Date(t.timestamp).getMonth() - target.getMonth()) === 0 &&
      Math.abs(t.amount - tx.amount) / tx.amount < 0.10
    );
    return !!found;
  });

  return matches;
}

/** Utility heuristic: very small amount or known utility descriptions */
function isUtilityPattern(tx) {
  const utilityKeywords = ['electricity', 'water', 'gas', 'broadband', 'mobile', 'bill', 'recharge', 'insurance', 'emi'];
  const desc = (tx.description || '').toLowerCase();
  return utilityKeywords.some(k => desc.includes(k));
}

module.exports = { checkStructuring };
