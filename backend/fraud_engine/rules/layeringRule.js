/**
 * RULE 2 — LAYERING DETECTOR
 *
 * Detects fund obfuscation through chains of accounts.
 * Goes far beyond hop-count:
 *
 *   - Time between hops (fast = suspicious)
 *   - Money preservation ratio (>90% forwarded = suspicious)
 *   - Circular transactions (A→B→C→A cycle)
 *   - Shell/Mule account hops (static account_type check)
 *   - Behavioural mule probability per hop node (v2.1)
 *       Uses computeMuleScore() from muleRiskRule:
 *       score 25–54 → +5 amplification  (MULE_HOP_MEDIUM_PROBABILITY)
 *       score 55+   → +12 amplification (MULE_HOP_HIGH_PROBABILITY)
 *       Catches accounts acting as mules even if not re-classified in DB.
 *   - Chain destination mule check (v2.1)
 *       If the final node of the chain has mule score ≥55 → +10
 *       (LAYERING_DESTINATION_IS_MULE) — funds collected by a mule at end.
 *   - Geographic crossing between hops
 *   - Forwarding behaviour across every node in chain
 *
 * New ML features (v2.1):
 *   destination_mule_score, mule_hop_high_probability, mule_hop_medium_probability
 *
 * Returns: { ruleName, riskContribution, flags, reasons, features }
 */

const { MODIFIERS, BEHAVIOUR } = require('../config/riskWeights');
const { computeMuleScore } = require('./muleRiskRule');

const MAX_DEPTH    = 5;
const HOP_WINDOW_MS = 24 * 60 * 60 * 1000; // look 24h back for chains

/**
 * @param {Object}   tx           - current transaction (the entry point)
 * @param {Object[]} allTx        - all transactions (in-memory)
 * @param {Object[]} allAccounts  - all accounts (in-memory)
 * @param {Object[]} allAlerts    - all alerts (in-memory) — used for mule scoring
 * @returns {{ riskContribution, flags, reasons, features }}
 */
function checkLayering(tx, allTx, allAccounts, allAlerts = []) {
  const flags   = [];
  const reasons = [];
  let contribution = 0;

  const accountMap = {};
  for (const acc of allAccounts) accountMap[acc.account_id] = acc;

  // ── BFS over transaction graph ───────────────────────────────────────────────
  // We model the graph as: nodes = accounts, directed edges = transactions
  // We want to trace from tx.sender forward through receivers

  const visited   = new Set();
  const chain     = []; // array of { from, to, tx, depth }
  const queue     = [{ account: tx.sender, depth: 0, prevTx: null }];
  let   maxDepth  = 0;

  const txByReceiver = {};
  const cutoff = new Date(tx.timestamp).getTime() - HOP_WINDOW_MS;

  // Build index: receiver → [transactions]
  for (const t of allTx) {
    if (new Date(t.timestamp).getTime() >= cutoff) {
      if (!txByReceiver[t.sender]) txByReceiver[t.sender] = [];
      txByReceiver[t.sender].push(t);
    }
  }
  // Also include current tx
  if (!txByReceiver[tx.sender]) txByReceiver[tx.sender] = [];
  txByReceiver[tx.sender].push(tx);

  let circularDetected = false;

  while (queue.length > 0) {
    const { account, depth, prevTx } = queue.shift();

    if (depth > MAX_DEPTH) continue;

    if (visited.has(account)) {
      // Only flag a TRUE cycle: path must return specifically to the original
      // sender AND have traversed at least 2 hops (A→B→A is trivial/noise).
      // This prevents false positives in dense graphs where unrelated paths
      // happen to share a node.
      if (account === tx.sender && depth >= 2 && !circularDetected) {
        circularDetected = true;
        // Don't push the flag yet — wait until after the hop-count guard below.
      }
      continue;
    }

    visited.add(account);
    maxDepth = Math.max(maxDepth, depth);

    const outgoing = txByReceiver[account] || [];
    for (const outTx of outgoing.slice(0, 5)) { // limit fan-out breadth
      chain.push({ from: account, to: outTx.receiver, tx: outTx, depth: depth + 1, prevTx });
      queue.push({ account: outTx.receiver, depth: depth + 1, prevTx: outTx });
    }
  }

  if (maxDepth < BEHAVIOUR.LAYERING_MIN_HOPS) {
    // Not enough hops to be layering — return clean (also suppresses any
    // shallow circular hit that slipped through at depth < MIN_HOPS)
    return {
      ruleName: 'LAYERING',
      riskContribution: 0,
      flags: [],
      reasons: [],
      features: {
        layering_risk_score: 0,
        hop_count: maxDepth,
        circular_detected: 0,
        avg_hop_time_seconds: 0,
        avg_preservation_ratio: 0,
        shell_hop_count: 0,
        geo_crossing_count: 0,
      },
    };
  }

  // Now safe to commit the circular flag (we're past the hop-count gate)
  if (circularDetected) {
    contribution += MODIFIERS.CIRCULAR_DETECTED;
    flags.push('CIRCULAR_TRANSACTION');
    reasons.push(
      `Circular fund flow detected: funds returned to originating account ${tx.sender} ` +
      `after ${maxDepth} hops within 24 hours.`
    );
  }

  // ── At this point we have a chain of >= MIN_HOPS ─────────────────────────────

  // Analyse hop timing
  const hopTimes = [];
  const preservationRatios = [];
  let shellHops = 0;
  let geoCrossings = 0;

  for (let i = 1; i < chain.length; i++) {
    const hop = chain[i];
    const prevHop = chain[i - 1];

    // Time between hops
    if (hop.prevTx && prevHop.tx) {
      const timeDiffSec = (new Date(hop.tx.timestamp) - new Date(prevHop.tx.timestamp)) / 1000;
      if (timeDiffSec > 0) hopTimes.push(timeDiffSec);

      if (timeDiffSec < BEHAVIOUR.LAYERING_HOP_TIME_SUSPICIOUS_SEC) {
        contribution += MODIFIERS.FAST_HOP_TIME;
        flags.push('FAST_HOP_TIME');
        reasons.push(
          `Very fast hop: funds moved from ${prevHop.from} → ${hop.from} in ${Math.round(timeDiffSec)}s ` +
          `(< ${BEHAVIOUR.LAYERING_HOP_TIME_SUSPICIOUS_SEC}s threshold).`
        );
      }
    }

    // Money preservation
    if (prevHop.tx && prevHop.tx.amount > 0) {
      const ratio = hop.tx.amount / prevHop.tx.amount;
      if (ratio <= 1) preservationRatios.push(ratio);
      if (ratio >= BEHAVIOUR.LAYERING_PRESERVATION_RATIO) {
        contribution += MODIFIERS.HIGH_PRESERVATION;
        flags.push('HIGH_PRESERVATION');
        reasons.push(
          `${Math.round(ratio * 100)}% of funds forwarded at hop ${hop.depth} ` +
          `(₹${Math.round(prevHop.tx.amount).toLocaleString('en-IN')} → ₹${Math.round(hop.tx.amount).toLocaleString('en-IN')}). ` +
          `Near-zero value retention.`
        );
      }
    }

    // Shell/Mule account hops — check both static account_type AND computed mule probability
    const fromAcc = accountMap[hop.from];
    const hopMuleScore = computeMuleScore(hop.from, allTx, allAccounts, allAlerts);

    const isStaticMule = fromAcc && ['SHELL', 'MULE'].includes(fromAcc.account_type);
    const isBehaviouralMule = hopMuleScore >= 25; // MULE_SCORE_MEDIUM threshold

    if (isStaticMule || isBehaviouralMule) {
      shellHops++;

      // Amplify based on mule probability band:
      //   Static mule type only           → base SHELL_ACCOUNT_HOP weight
      //   Behavioural score 25–54 (MEDIUM) → base + 5 (confirmed pattern)
      //   Behavioural score 55+ (HIGH)     → base + 12 (strong amplification)
      let hopRisk = MODIFIERS.SHELL_ACCOUNT_HOP;
      if (hopMuleScore >= 55) {
        hopRisk += 12;
        flags.push('MULE_HOP_HIGH_PROBABILITY');
        reasons.push(
          `Hop ${hop.depth}: account ${hop.from} has a HIGH behavioural mule score ` +
          `(${hopMuleScore}/95) — strong pass-through indicator in layering chain.`
        );
      } else if (hopMuleScore >= 25) {
        hopRisk += 5;
        flags.push('MULE_HOP_MEDIUM_PROBABILITY');
        reasons.push(
          `Hop ${hop.depth}: account ${hop.from} has a MEDIUM behavioural mule score ` +
          `(${hopMuleScore}/95) — elevated pass-through risk in layering chain.`
        );
      }

      if (isStaticMule) {
        flags.push('SHELL_ACCOUNT_HOP');
        reasons.push(`Hop ${hop.depth} passes through ${fromAcc.account_type} account ${hop.from} (static type + mule score: ${hopMuleScore}).`);
      }

      contribution += hopRisk;
    }

    // Geographic crossing
    const prevGeo = prevHop.tx?.geo_origin;
    const currGeo = hop.tx?.geo_origin;
    if (prevGeo && currGeo && prevGeo.state && currGeo.state && prevGeo.state !== currGeo.state) {
      geoCrossings++;
      contribution += MODIFIERS.GEO_CROSSING;
      flags.push('GEO_CROSSING');
      reasons.push(
        `Funds crossed state boundary at hop ${hop.depth}: ` +
        `${prevGeo.state} → ${currGeo.state}.`
      );
    }
  }

  // Summary reason for layering depth
  if (maxDepth >= BEHAVIOUR.LAYERING_MIN_HOPS) {
    reasons.unshift(
      `Layering chain detected: funds traced through ${maxDepth} account hops ` +
      `from ${tx.sender} within 24 hours. Chain: ${[...visited].join(' → ')}`
    );
  }

  const avgHopTime = hopTimes.length > 0
    ? hopTimes.reduce((s, v) => s + v, 0) / hopTimes.length
    : 0;
  const avgPreservation = preservationRatios.length > 0
    ? preservationRatios.reduce((s, v) => s + v, 0) / preservationRatios.length
    : 0;

  // Compute mule score for the final destination of the layering chain
  const chainDestination = chain.length > 0 ? chain[chain.length - 1].to : tx.receiver;
  const destinationMuleScore = computeMuleScore(chainDestination, allTx, allAccounts, allAlerts);
  if (destinationMuleScore >= 55) {
    contribution += 10;
    flags.push('LAYERING_DESTINATION_IS_MULE');
    reasons.push(
      `Layering chain terminates at account ${chainDestination} which has a HIGH mule score ` +
      `(${destinationMuleScore}/95). Funds likely collected by a mule at chain end.`
    );
  }

  const features = {
    layering_risk_score:          contribution,
    hop_count:                    maxDepth,
    circular_detected:            flags.includes('CIRCULAR_TRANSACTION') ? 1 : 0,
    avg_hop_time_seconds:         parseFloat(avgHopTime.toFixed(1)),
    avg_preservation_ratio:       parseFloat(avgPreservation.toFixed(3)),
    shell_hop_count:              shellHops,
    geo_crossing_count:           geoCrossings,
    layering_chain_length:        chain.length,
    destination_mule_score:       destinationMuleScore,
    mule_hop_high_probability:    flags.includes('MULE_HOP_HIGH_PROBABILITY') ? 1 : 0,
    mule_hop_medium_probability:  flags.includes('MULE_HOP_MEDIUM_PROBABILITY') ? 1 : 0,
  };

  return {
    ruleName: 'LAYERING',
    riskContribution: contribution,
    flags: [...new Set(flags)],
    reasons,
    features,
  };
}

module.exports = { checkLayering };
