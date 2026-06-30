/**
 * RULE 5 — VELOCITY DETECTOR
 *
 * Detects sudden bursts of activity from an account.
 * Compares current session activity against the customer's historical baseline.
 *
 * Suspicious signals:
 *   - Transaction count > 3× historical daily average in 30 minutes
 *   - Total value > 3× historical daily average in 30 minutes
 *   - Average interval between transactions < 30 seconds
 *   - Activity during unusual hours (11PM–5AM)
 *
 * Returns: { riskContribution, flags, reasons, features }
 */

const { MODIFIERS, BEHAVIOUR } = require('../config/riskWeights');
const { deviationFactor } = require('../services/behaviourBaseline');

/**
 * @param {Object}   tx       - current transaction
 * @param {Object[]} allTx    - all transactions in memory
 * @param {Object}   baseline - from behaviourBaseline.buildBaseline()
 * @returns {{ riskContribution, flags, reasons, features }}
 */
function checkVelocity(tx, allTx, baseline) {
  const flags   = [];
  const reasons = [];
  let contribution = 0;

  const now = new Date(tx.timestamp).getTime();

  // All transactions from this sender in the velocity window
  const windowTxs = allTx.filter(
    t => t.sender === tx.sender &&
         t.tx_id !== tx.tx_id &&
         now - new Date(t.timestamp).getTime() <= BEHAVIOUR.VELOCITY_WINDOW_MS
  );
  const sessionTxs = [...windowTxs, tx].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const sessionCount  = sessionTxs.length;
  const sessionValue  = sessionTxs.reduce((s, t) => s + t.amount, 0);
  const sessionMinutes = BEHAVIOUR.VELOCITY_WINDOW_MS / 60000;

  // ── Count Deviation ──────────────────────────────────────────────────────────
  if (baseline.hasHistory) {
    const countDev = deviationFactor(sessionCount, baseline.avgDailyCount);
    if (countDev >= BEHAVIOUR.VELOCITY_BURST_MULTIPLIER) {
      contribution += MODIFIERS.BURST_HIGH_COUNT;
      flags.push('VELOCITY_BURST_COUNT');
      reasons.push(
        `${sessionCount} transactions in ${sessionMinutes} minutes — ` +
        `${countDev.toFixed(1)}× above historical daily average ` +
        `(avg: ${baseline.avgDailyCount.toFixed(1)}/day).`
      );
    }

    // ── Value Deviation ────────────────────────────────────────────────────────
    const valueDev = deviationFactor(sessionValue, baseline.avgDailyAmount);
    if (valueDev >= BEHAVIOUR.VELOCITY_BURST_MULTIPLIER) {
      contribution += MODIFIERS.BURST_HIGH_VALUE;
      flags.push('VELOCITY_BURST_VALUE');
      reasons.push(
        `₹${Math.round(sessionValue).toLocaleString('en-IN')} transferred in ${sessionMinutes} minutes — ` +
        `${valueDev.toFixed(1)}× above historical daily average ` +
        `(avg: ₹${Math.round(baseline.avgDailyAmount).toLocaleString('en-IN')}/day).`
      );
    }
  } else {
    // No baseline: use absolute minimum threshold for completely new accounts
    if (sessionCount >= 10) {
      contribution += MODIFIERS.BURST_HIGH_COUNT;
      flags.push('VELOCITY_BURST_COUNT_NEW_ACCOUNT');
      reasons.push(
        `${sessionCount} transactions in ${sessionMinutes} minutes from an account with no history.`
      );
    }
  }

  // ── Average Interval (too-fast = bot-like) ───────────────────────────────────
  let avgIntervalSec = Infinity;
  if (sessionTxs.length >= 2) {
    const intervals = [];
    for (let i = 1; i < sessionTxs.length; i++) {
      const diff = new Date(sessionTxs[i].timestamp) - new Date(sessionTxs[i - 1].timestamp);
      intervals.push(diff / 1000);
    }
    avgIntervalSec = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    if (avgIntervalSec < BEHAVIOUR.VELOCITY_MAX_INTERVAL_FAST_SEC) {
      contribution += MODIFIERS.SESSION_TOO_FAST;
      flags.push('SESSION_TOO_FAST');
      reasons.push(
        `Average interval between transactions is ${avgIntervalSec.toFixed(1)}s ` +
        `(< ${BEHAVIOUR.VELOCITY_MAX_INTERVAL_FAST_SEC}s threshold). Possible automated activity.`
      );
    }
  }

  // ── Late-Night Activity ──────────────────────────────────────────────────────
  const txHour = new Date(tx.timestamp).getHours();
  const isNight = txHour >= 23 || txHour <= 5;

  if (isNight && sessionCount >= 3) {
    contribution += MODIFIERS.NIGHT_SESSION;
    flags.push('NIGHT_SESSION_BURST');
    reasons.push(
      `High-velocity activity between 11PM–5AM: ${sessionCount} transactions at ${txHour}:00h.`
    );
  }

  const features = {
    velocity_risk_score:      contribution,
    session_tx_count:         sessionCount,
    session_total_value:      Math.round(sessionValue),
    session_avg_interval_sec: avgIntervalSec === Infinity ? 0 : parseFloat(avgIntervalSec.toFixed(1)),
    is_night_session:         isNight ? 1 : 0,
    count_deviation:          baseline.hasHistory ? parseFloat(deviationFactor(sessionCount, baseline.avgDailyCount).toFixed(2)) : 0,
    value_deviation:          baseline.hasHistory ? parseFloat(deviationFactor(sessionValue, baseline.avgDailyAmount).toFixed(2)) : 0,
  };

  return {
    ruleName: 'VELOCITY',
    riskContribution: contribution,
    flags: [...new Set(flags)],
    reasons,
    features,
  };
}

module.exports = { checkVelocity };
