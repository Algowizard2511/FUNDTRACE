/**
 * FundTrace AI — Risk Scoring Configuration
 * All weights are configurable. No hardcoded scores inside rules.
 * Positive = increases risk. Negative = reduces risk.
 */

module.exports = {

  // ─── RULE WEIGHTS (max contribution per rule) ──────────────────────────────
  STRUCTURING_MAX: 40,
  LAYERING_MAX: 45,
  FAN_OUT_MAX: 35,
  DORMANT_MAX: 30,
  VELOCITY_MAX: 25,
  GEO_RISK_MAX: 20,
  RECEIVER_RISK_MAX: 20,
  MULE_RISK_MAX: 95,    // 6 signals × cumulative max — capped at 95

  // ─── RISK MODIFIERS (positive = raise risk, negative = lower risk) ─────────
  MODIFIERS: {
    // Structuring
    NEAR_THRESHOLD_PATTERN:     +12,   // Repeated values clustering near ₹49k–₹50k
    HIGH_FREQUENCY_SHORT_WINDOW:+10,   // >5 txns in 10 min
    MULTIPLE_NEW_BENEFICIARIES: +8,    // >50% receivers are first-timers
    MANY_TO_ONE_CONVERGENCE:    +10,   // Multiple senders → same receiver
    HISTORICAL_DEVIATION:       +8,    // Amount/freq 3× above baseline
    KNOWN_BENEFICIARY:          -10,   // Receiver in historical trusted list
    SALARY_PATTERN:             -12,   // Matches salary calendar and amount
    UTILITY_PAYMENT:            -8,    // Recognised utility/merchant
    RECURRING_BUSINESS:         -6,    // Recurs on same day monthly

    // Layering
    FAST_HOP_TIME:              +15,   // Hops < 2 min apart
    HIGH_PRESERVATION:          +12,   // >90% of amount forwarded each hop
    CIRCULAR_DETECTED:          +20,   // A→B→C→A cycle found
    SHELL_ACCOUNT_HOP:          +10,   // Hop through SHELL/MULE account
    GEO_CROSSING:               +8,    // Hop crosses state/country boundary
    KNOWN_BUSINESS_CHAIN:       -10,   // Recognised supply chain relationship

    // Fan-Out
    EQUAL_DISTRIBUTION:         +12,   // Variance in amounts < 5%
    UNKNOWN_RECEIVERS:          +8,    // >70% are new beneficiaries
    RECONVERGENCE:              +15,   // Fan-out then fan-in to single receiver
    TRUSTED_RECEIVER:           -8,    // Gov / utility / employer
    HISTORICAL_RECEIVER:        -10,   // Paid before, multiple months

    // Dormant
    FAST_FORWARD_POST_ACTIVATION:+15,  // >80% forwarded within 30 min
    ACTIVATED_BY_SUSPICIOUS:    +12,   // Sender already flagged
    MULTIPLE_DORMANT_SAME_SENDER:+15,  // 1 sender activates 2+ dormant accs
    DORMANT_SALARY_MATCH:       -15,   // Activation looks like salary return
    NORMAL_POST_ACTIVATION:     -10,   // Post-activation: bills, ATM, grocery

    // Velocity
    BURST_HIGH_COUNT:           +10,   // >3× historical daily average count
    BURST_HIGH_VALUE:           +8,    // >3× historical daily average value
    NIGHT_SESSION:              +5,    // Activity between 11PM–5AM
    SESSION_TOO_FAST:           +7,    // Average interval < 30 seconds

    // Geographic
    NEW_COUNTRY:                +15,
    SANCTIONED_COUNTRY:         +20,
    HIGH_RISK_COUNTRY:          +12,
    NEW_CITY_FIRST_TIME:        +5,
    IMPOSSIBLE_TRAVEL:          +15,   // Same account, 2 cities, 10 min apart
    SAME_GEO_AS_HISTORY:        -5,

    // Receiver reputation
    RECEIVER_PREVIOUSLY_FLAGGED:+15,
    RECEIVER_IS_MULE:           +12,
    RECEIVER_LOW_KYC:           +5,
    RECEIVER_NEW_ACCOUNT:       +5,    // Opened < 30 days ago
    RECEIVER_HIGH_KYC:          -5,
    RECEIVER_KNOWN_EMPLOYER:    -8,
  },

  // ─── RISK LEVEL BANDS ──────────────────────────────────────────────────────
  RISK_LEVELS: {
    LOW:      { min: 0,  max: 29, label: 'LOW',      action: 'No Action Required' },
    MEDIUM:   { min: 30, max: 59, label: 'MEDIUM',   action: 'Enhanced Monitoring' },
    HIGH:     { min: 60, max: 79, label: 'HIGH',     action: 'Manual AML Review' },
    CRITICAL: { min: 80, max: 100,label: 'CRITICAL', action: 'Immediate Investigation + SAR Filing' },
  },

  // ─── BEHAVIOURAL THRESHOLDS ────────────────────────────────────────────────
  BEHAVIOUR: {
    STRUCTURING_THRESHOLD_INR:      50000,
    NEAR_THRESHOLD_BAND:            0.86,    // 86%–100% of threshold = suspicious
    NEAR_THRESHOLD_REPEAT_WINDOW_MS:60 * 60 * 1000,   // 1 hour
    NEAR_THRESHOLD_MIN_COUNT:       2,

    VELOCITY_WINDOW_MS:             30 * 60 * 1000,    // 30 min
    VELOCITY_BURST_MULTIPLIER:      3.0,               // 3× daily average
    VELOCITY_MAX_INTERVAL_FAST_SEC: 30,                // avg gap <30s = suspicious

    LAYERING_HOP_TIME_SUSPICIOUS_SEC:120,              // < 2 min = fast hop
    LAYERING_MIN_HOPS:              3,
    LAYERING_PRESERVATION_RATIO:    0.90,              // >90% forwarded

    FAN_OUT_WINDOW_MS:              30 * 60 * 1000,
    FAN_OUT_MIN_RECEIVERS:          5,
    FAN_OUT_NEW_BENEFICIARY_RATIO:  0.70,              // >70% new = suspicious
    FAN_OUT_EQUAL_DISTRIBUTION_CV:  0.05,              // CoeffVariation <5% = equal

    DORMANT_DAYS:                   90,
    DORMANT_RAPID_FORWARD_MIN:      30,                // min to forward post-activation
    DORMANT_FORWARD_RATIO:          0.80,

    GEO_IMPOSSIBLE_TRAVEL_KM:       500,               // 500km in < 60 min = suspicious
    GEO_IMPOSSIBLE_TRAVEL_MIN:      60,

    BASELINE_WINDOW_DAYS:           30,                // Last 30 days for baseline
    BASELINE_DEVIATION_MULTIPLIER:  3.0,               // 3× baseline = anomaly
  },
};
