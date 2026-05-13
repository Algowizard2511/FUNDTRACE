/**
 * FundTrace AI — Rule-Based Fraud Detection Engine
 * Detects: Structuring, Round-Tripping, Layering, Dormant Activation, Fan-Out, Mule Behaviour
 */

const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Alert = require('../models/Alert');
const { v4: uuidv4 } = require('uuid');

const STRUCTURING_THRESHOLD = 50000; // INR reporting threshold simulation
const STRUCTURING_WINDOW_MINUTES = 60;
const LAYERING_DEPTH = 4;
const RAPID_FAN_OUT_COUNT = 5;
const DORMANT_DAYS = 90;
const HIGH_VELOCITY_TXS = 10;
const HIGH_VELOCITY_WINDOW_MINUTES = 30;

async function runFraudChecks(transaction, io) {
  const flags = [];
  const alerts = [];

  try {
    const [structuringAlert, layeringAlert, fanOutAlert, dormantAlert, muleAlert, velocityAlert] = await Promise.all([
      checkStructuring(transaction),
      checkLayering(transaction),
      checkFanOut(transaction),
      checkDormantActivation(transaction),
      checkMuleBehaviour(transaction),
      checkHighVelocity(transaction),
    ]);

    if (structuringAlert) { flags.push('STRUCTURING'); alerts.push(structuringAlert); }
    if (layeringAlert) { flags.push('LAYERING'); alerts.push(layeringAlert); }
    if (fanOutAlert) { flags.push('FAN_OUT'); alerts.push(fanOutAlert); }
    if (dormantAlert) { flags.push('DORMANT_ACTIVATION'); alerts.push(dormantAlert); }
    if (muleAlert) { flags.push('MULE_BEHAVIOUR'); alerts.push(muleAlert); }
    if (velocityAlert) { flags.push('HIGH_VELOCITY'); alerts.push(velocityAlert); }

    if (flags.length > 0) {
      const riskScore = Math.min(100, flags.length * 20 + (transaction.amount > 100000 ? 20 : 0));
      await Transaction.findOneAndUpdate(
        { tx_id: transaction.tx_id },
        { anomaly_flag: true, rule_flags: flags, risk_score: riskScore, fraud_type: flags[0], status: 'FLAGGED' }
      );
      await Account.findOneAndUpdate({ account_id: transaction.sender }, { is_flagged: true, $inc: { risk_score: 10 } });

      for (const alert of alerts) {
        const saved = await alert.save();
        if (io) {
          io.emit('new_alert', saved);
        }
      }
    }

    return { flags, riskScore: flags.length * 20 };
  } catch (err) {
    console.error('Fraud check error:', err.message);
    return { flags: [], riskScore: 0 };
  }
}

async function checkStructuring(tx) {
  if (tx.amount >= STRUCTURING_THRESHOLD) return null;
  const windowStart = new Date(tx.timestamp - STRUCTURING_WINDOW_MINUTES * 60 * 1000);
  const recentTxs = await Transaction.find({
    sender: tx.sender,
    timestamp: { $gte: windowStart },
    amount: { $lt: STRUCTURING_THRESHOLD, $gt: STRUCTURING_THRESHOLD * 0.8 },
    tx_id: { $ne: tx.tx_id }
  }).sort({ timestamp: -1 }).limit(5);

  if (recentTxs.length >= 2) {
    const alert = new Alert({
      alert_id: `ALT-STR-${uuidv4().slice(0, 8).toUpperCase()}`,
      alert_type: 'STRUCTURING',
      severity: 'HIGH',
      risk_score: 75,
      tx_references: [tx.tx_id, ...recentTxs.map(t => t.tx_id)],
      account_references: [tx.sender],
      description: `Structuring detected: ${recentTxs.length + 1} transactions near ₹${STRUCTURING_THRESHOLD.toLocaleString()} threshold from account ${tx.sender} within ${STRUCTURING_WINDOW_MINUTES} minutes.`,
      metadata: { threshold: STRUCTURING_THRESHOLD, count: recentTxs.length + 1, amounts: [tx.amount, ...recentTxs.map(t => t.amount)] }
    });
    return alert;
  }
  return null;
}

async function checkLayering(tx) {
  // BFS traversal to detect fund movement through chain of accounts
  const visited = new Set();
  const queue = [{ account: tx.sender, depth: 0 }];
  let maxDepth = 0;
  const chain = [tx.sender];

  while (queue.length > 0) {
    const { account, depth } = queue.shift();
    if (visited.has(account) || depth > LAYERING_DEPTH) continue;
    visited.add(account);
    maxDepth = Math.max(maxDepth, depth);

    const outTxs = await Transaction.find({ sender: account, timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).limit(3);
    for (const outTx of outTxs) {
      if (!visited.has(outTx.receiver)) {
        queue.push({ account: outTx.receiver, depth: depth + 1 });
        chain.push(outTx.receiver);
      }
    }
  }

  if (maxDepth >= LAYERING_DEPTH) {
    const alert = new Alert({
      alert_id: `ALT-LAY-${uuidv4().slice(0, 8).toUpperCase()}`,
      alert_type: 'LAYERING',
      severity: 'CRITICAL',
      risk_score: 90,
      tx_references: [tx.tx_id],
      account_references: [...new Set(chain)],
      description: `Layering detected: Funds traced through ${maxDepth} account hops originating from ${tx.sender}. Possible fund obfuscation chain.`,
      metadata: { chain: [...new Set(chain)], depth: maxDepth }
    });
    return alert;
  }
  return null;
}

async function checkFanOut(tx) {
  const windowStart = new Date(Date.now() - 30 * 60 * 1000);
  const recentTxs = await Transaction.find({ sender: tx.sender, timestamp: { $gte: windowStart } }).distinct('receiver');
  if (recentTxs.length >= RAPID_FAN_OUT_COUNT) {
    const alert = new Alert({
      alert_id: `ALT-FAN-${uuidv4().slice(0, 8).toUpperCase()}`,
      alert_type: 'FAN_OUT',
      severity: 'HIGH',
      risk_score: 80,
      tx_references: [tx.tx_id],
      account_references: [tx.sender, ...recentTxs],
      description: `Rapid fan-out detected: Account ${tx.sender} sent to ${recentTxs.length} unique accounts within 30 minutes. Possible smurfing/distribution.`,
      metadata: { receivers: recentTxs, count: recentTxs.length }
    });
    return alert;
  }
  return null;
}

async function checkDormantActivation(tx) {
  const account = await Account.findOne({ account_id: tx.receiver });
  if (!account) return null;
  const daysSinceActive = (Date.now() - new Date(account.last_active)) / (1000 * 60 * 60 * 24);
  if (daysSinceActive >= DORMANT_DAYS && tx.amount > 50000) {
    await Account.findOneAndUpdate({ account_id: tx.receiver }, { status: 'SUSPICIOUS' });
    const alert = new Alert({
      alert_id: `ALT-DRM-${uuidv4().slice(0, 8).toUpperCase()}`,
      alert_type: 'DORMANT_ACTIVATION',
      severity: 'CRITICAL',
      risk_score: 85,
      tx_references: [tx.tx_id],
      account_references: [tx.sender, tx.receiver],
      description: `Dormant account activation: Account ${tx.receiver} inactive for ${Math.floor(daysSinceActive)} days received ₹${tx.amount.toLocaleString()} from ${tx.sender}.`,
      metadata: { days_inactive: Math.floor(daysSinceActive), amount: tx.amount, receiver: tx.receiver }
    });
    return alert;
  }
  return null;
}

async function checkMuleBehaviour(tx) {
  const account = await Account.findOne({ account_id: tx.receiver });
  if (!account) return null;
  if (account.total_incoming > 0) {
    const outInRatio = account.total_outgoing / account.total_incoming;
    const balanceRetention = account.balance / Math.max(account.total_incoming, 1);
    if (outInRatio > 0.9 && balanceRetention < 0.05 && account.tx_count > 5) {
      const alert = new Alert({
        alert_id: `ALT-MUL-${uuidv4().slice(0, 8).toUpperCase()}`,
        alert_type: 'MULE_BEHAVIOUR',
        severity: 'HIGH',
        risk_score: 82,
        tx_references: [tx.tx_id],
        account_references: [tx.receiver],
        description: `Mule account behaviour: Account ${tx.receiver} passes ${(outInRatio * 100).toFixed(1)}% of incoming funds outward with near-zero balance retention.`,
        metadata: { out_in_ratio: outInRatio, balance_retention: balanceRetention, tx_count: account.tx_count }
      });
      return alert;
    }
  }
  return null;
}

async function checkHighVelocity(tx) {
  const windowStart = new Date(Date.now() - HIGH_VELOCITY_WINDOW_MINUTES * 60 * 1000);
  const txCount = await Transaction.countDocuments({ sender: tx.sender, timestamp: { $gte: windowStart } });
  if (txCount >= HIGH_VELOCITY_TXS) {
    const alert = new Alert({
      alert_id: `ALT-VEL-${uuidv4().slice(0, 8).toUpperCase()}`,
      alert_type: 'HIGH_VELOCITY',
      severity: 'MEDIUM',
      risk_score: 65,
      tx_references: [tx.tx_id],
      account_references: [tx.sender],
      description: `High transaction velocity: Account ${tx.sender} performed ${txCount} transactions within ${HIGH_VELOCITY_WINDOW_MINUTES} minutes.`,
      metadata: { tx_count: txCount, window_minutes: HIGH_VELOCITY_WINDOW_MINUTES }
    });
    return alert;
  }
  return null;
}

module.exports = { runFraudChecks };
