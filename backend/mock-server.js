/**
 * FundTrace AI — Standalone Demo Server (No MongoDB Required)
 * Uses in-memory data store — perfect for hackathon demos
 * Run: node mock-server.js
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = 'FundTraceAI_SecretKey_2024_Hackathon';

// ==================== IN-MEMORY STORE ====================
const db = {
  users: [{
    _id: 'u1', name: 'Admin Investigator', email: 'admin@fundtrace.ai',
    password: bcrypt.hashSync('FundTrace@2024', 10), role: 'ADMIN'
  }],
  accounts: [],
  transactions: [],
  alerts: [],
  investigations: [],
};

// ==================== SEED ACCOUNTS ====================
const CITIES = [
  { city: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.877 },
  { city: 'Delhi', state: 'Delhi', lat: 28.704, lng: 77.102 },
  { city: 'Bangalore', state: 'Karnataka', lat: 12.971, lng: 77.594 },
  { city: 'Chennai', state: 'Tamil Nadu', lat: 13.082, lng: 80.270 },
  { city: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.486 },
  { city: 'Pune', state: 'Maharashtra', lat: 18.520, lng: 73.856 },
  { city: 'Kolkata', state: 'West Bengal', lat: 22.572, lng: 88.363 },
  { city: 'Ahmedabad', state: 'Gujarat', lat: 23.022, lng: 72.571 },
];
const BRANCHES = ['SBI Main', 'HDFC Andheri', 'ICICI Kurla', 'Axis Bandra', 'PNB CP', 'Canara MG Road'];

function seedAccounts() {
  // 70 normal
  for (let i = 0; i < 70; i++) {
    const city = faker.helpers.arrayElement(CITIES);
    db.accounts.push({
      _id: `acc-${i}`, account_id: `ACC${String(i + 1).padStart(6, '0')}`,
      customer_name: faker.person.fullName(), kyc_level: faker.helpers.arrayElement(['LOW','MEDIUM','HIGH']),
      branch: faker.helpers.arrayElement(BRANCHES), status: 'ACTIVE', account_type: 'SAVINGS',
      balance: faker.number.float({ min: 10000, max: 500000, fractionDigits: 0 }),
      last_active: faker.date.recent({ days: 30 }), geo_location: city,
      risk_score: faker.number.int({ min: 0, max: 20 }), is_flagged: false,
      total_incoming: 0, total_outgoing: 0, tx_count: 0,
      createdAt: new Date(), updatedAt: new Date()
    });
  }
  // 10 dormant
  for (let i = 70; i < 80; i++) {
    const city = faker.helpers.arrayElement(CITIES);
    db.accounts.push({
      _id: `acc-${i}`, account_id: `ACC${String(i + 1).padStart(6, '0')}`,
      customer_name: faker.person.fullName(), kyc_level: 'LOW',
      branch: faker.helpers.arrayElement(BRANCHES), status: 'DORMANT', account_type: 'SAVINGS',
      balance: faker.number.float({ min: 100, max: 2000, fractionDigits: 0 }),
      last_active: faker.date.past({ years: 1 }), geo_location: city,
      risk_score: 0, is_flagged: false,
      total_incoming: 0, total_outgoing: 0, tx_count: 0,
      createdAt: new Date(), updatedAt: new Date()
    });
  }
  // 20 shell/mule
  for (let i = 80; i < 100; i++) {
    const city = faker.helpers.arrayElement(CITIES);
    db.accounts.push({
      _id: `acc-${i}`, account_id: `ACC${String(i + 1).padStart(6, '0')}`,
      customer_name: faker.company.name() + ' Ltd', kyc_level: 'LOW',
      branch: faker.helpers.arrayElement(BRANCHES), status: 'ACTIVE',
      account_type: i < 90 ? 'SHELL' : 'MULE',
      balance: faker.number.float({ min: 0, max: 500, fractionDigits: 0 }),
      last_active: faker.date.recent({ days: 7 }), geo_location: city,
      risk_score: faker.number.int({ min: 40, max: 65 }), is_flagged: false,
      total_incoming: 0, total_outgoing: 0, tx_count: 0,
      createdAt: new Date(), updatedAt: new Date()
    });
  }
  console.log(`✅ ${db.accounts.length} accounts seeded`);
}

// ==================== FRAUD DETECTION ====================
const THRESHOLD = 50000;
const alertCooldown = new Map(); // accountId -> lastAlertTime (prevents alert spam)

function isOnCooldown(accountId, type, cooldownMs = 120000) {
  const key = `${accountId}:${type}`;
  const last = alertCooldown.get(key);
  if (last && Date.now() - last < cooldownMs) return true;
  alertCooldown.set(key, Date.now());
  return false;
}

function detectFraud(tx) {
  const flags = [];
  const senderAccount = db.accounts.find(a => a.account_id === tx.sender);
  const receiverAccount = db.accounts.find(a => a.account_id === tx.receiver);

  // ONLY run velocity/fan-out checks on SHELL or MULE accounts (not normal savings)
  const isSuspiciousAccount = senderAccount && ['SHELL', 'MULE'].includes(senderAccount.account_type);

  const recentFromSender = db.transactions
    .filter(t => t.sender === tx.sender && Date.now() - new Date(t.timestamp) < 60 * 60 * 1000);

  // 1. Structuring — only on amounts actually near threshold
  if (tx.amount >= THRESHOLD * 0.86 && tx.amount < THRESHOLD) {
    const structuringTxs = recentFromSender.filter(t => t.amount >= THRESHOLD * 0.86 && t.amount < THRESHOLD);
    if (structuringTxs.length >= 2 && !isOnCooldown(tx.sender, 'STRUCTURING')) {
      flags.push('STRUCTURING');
      createAlert('STRUCTURING', 'HIGH', 75, [tx.tx_id, ...structuringTxs.slice(0,2).map(t=>t.tx_id)], [tx.sender],
        `Structuring detected: ${structuringTxs.length + 1} transactions near ₹${THRESHOLD.toLocaleString()} reporting threshold from ${tx.sender} within 60 min`);
    }
  }

  // 2. Fan-out — ONLY for shell/mule accounts, needs 5+ unique in 10 min
  if (isSuspiciousAccount) {
    const last10min = recentFromSender.filter(t => Date.now() - new Date(t.timestamp) < 10 * 60 * 1000);
    const uniqueReceivers = new Set(last10min.map(t => t.receiver));
    uniqueReceivers.add(tx.receiver);
    if (uniqueReceivers.size >= 5 && !isOnCooldown(tx.sender, 'FAN_OUT')) {
      flags.push('FAN_OUT');
      createAlert('FAN_OUT', 'HIGH', 80, [tx.tx_id], [tx.sender, ...Array.from(uniqueReceivers).slice(0,5)],
        `Rapid fan-out: ${tx.sender} distributed funds to ${uniqueReceivers.size} accounts in 10 minutes`);
    }
  }

  // 3. Dormant activation — account inactive > 90 days receives large transfer
  if (receiverAccount && receiverAccount.status === 'DORMANT' && tx.amount > 50000) {
    const daysSince = Math.floor((Date.now() - new Date(receiverAccount.last_active)) / 86400000);
    if (!isOnCooldown(tx.receiver, 'DORMANT_ACTIVATION', 300000)) {
      flags.push('DORMANT_ACTIVATION');
      receiverAccount.status = 'SUSPICIOUS';
      createAlert('DORMANT_ACTIVATION', 'CRITICAL', 90, [tx.tx_id], [tx.sender, tx.receiver],
        `Dormant account ${tx.receiver} (inactive ${daysSince} days) received ₹${tx.amount.toLocaleString()} from ${tx.sender}`);
    }
  }

  // 4. High velocity — ONLY for shell/mule, needs 10+ in 10 min
  if (isSuspiciousAccount) {
    const last10min = recentFromSender.filter(t => Date.now() - new Date(t.timestamp) < 10 * 60 * 1000);
    if (last10min.length >= 10 && !isOnCooldown(tx.sender, 'HIGH_VELOCITY')) {
      flags.push('HIGH_VELOCITY');
      createAlert('HIGH_VELOCITY', 'MEDIUM', 65, [tx.tx_id], [tx.sender],
        `High velocity: ${last10min.length + 1} transactions from ${tx.sender} in 10 minutes`);
    }
  }

  // 5. Large round amount to shell/mule
  if (tx.amount >= 100000 && receiverAccount && ['SHELL','MULE'].includes(receiverAccount.account_type)) {
    if (!isOnCooldown(tx.receiver, 'MULE_TRANSFER', 180000)) {
      flags.push('MULE_TRANSFER');
      createAlert('MULE_TRANSFER', 'HIGH', 72, [tx.tx_id], [tx.sender, tx.receiver],
        `Large transfer ₹${tx.amount.toLocaleString()} to ${receiverAccount.account_type.toLowerCase()} account ${tx.receiver}`);
    }
  }

  return flags;
}

function createAlert(type, severity, risk_score, tx_refs, acc_refs, description) {
  const alert = {
    _id: uuidv4(), alert_id: `ALT-${type.slice(0,3)}-${uuidv4().slice(0,6).toUpperCase()}`,
    alert_type: type, severity, risk_score, status: 'OPEN',
    tx_references: tx_refs, account_references: acc_refs, description,
    metadata: {}, createdAt: new Date(), updatedAt: new Date()
  };
  db.alerts.unshift(alert);
  if (db.alerts.length > 500) db.alerts.pop();
  io.emit('new_alert', alert);
  return alert;
}

// ==================== SIMULATOR ====================
function emitTransaction(txData) {
  txData._id = uuidv4();
  txData.createdAt = new Date();
  db.transactions.unshift(txData);
  if (db.transactions.length > 2000) db.transactions.pop();

  const sender = db.accounts.find(a => a.account_id === txData.sender);
  const receiver = db.accounts.find(a => a.account_id === txData.receiver);
  if (sender) { sender.balance -= txData.amount; sender.total_outgoing += txData.amount; sender.tx_count++; sender.last_active = new Date(); }
  if (receiver) { receiver.balance += txData.amount; receiver.total_incoming += txData.amount; receiver.tx_count++; receiver.last_active = new Date(); }

  io.emit('new_transaction', txData);

  // Fraud detection — only run on non-normal transactions OR randomly on normal
  const flags = detectFraud(txData);
  if (flags.length > 0) {
    txData.anomaly_flag = true;
    txData.rule_flags = flags;
    txData.fraud_type = flags[0];
    txData.risk_score = Math.min(95, 50 + flags.length * 15 + (txData.amount > 100000 ? 10 : 0));
    txData.status = 'FLAGGED';
    if (sender) { sender.is_flagged = true; sender.risk_score = Math.min(100, (sender.risk_score || 0) + 8); }
    io.emit('transaction_flagged', txData);
  }
  return txData;
}

function makeTx(sender, receiver, amount, type = 'UPI', isFraud = false) {
  const city = faker.helpers.arrayElement(CITIES);
  return {
    tx_id: `TXN-${uuidv4().slice(0, 12).toUpperCase()}`,
    sender, receiver, amount,
    timestamp: new Date(),
    transaction_type: type,
    channel: faker.helpers.arrayElement(['MOBILE', 'NET_BANKING', 'API']),
    geo_origin: city,
    risk_score: isFraud ? faker.number.int({ min: 55, max: 85 }) : faker.number.int({ min: 0, max: 20 }),
    anomaly_flag: false, fraud_type: 'NONE', status: 'COMPLETED',
    description: isFraud
      ? faker.helpers.arrayElement(['Wire Transfer', 'Account Transfer', 'Funds Movement'])
      : faker.helpers.arrayElement(['Salary Credit', 'Rent Payment', 'Shopping', 'EMI', 'UPI Transfer', 'Bill Payment', 'Recharge', 'Grocery']),
    rule_flags: []
  };
}

function getNormal() { return db.accounts.filter(a => a.account_type === 'SAVINGS' && a.status === 'ACTIVE'); }
function getShell() { return db.accounts.filter(a => a.account_type === 'SHELL'); }
function getMule() { return db.accounts.filter(a => a.account_type === 'MULE'); }
function getDormant() { return db.accounts.filter(a => a.status === 'DORMANT'); }

function replenishDormant() {
  // Keep at least 3 dormant accounts available for scenarios
  const dormantCount = getDormant().length;
  if (dormantCount < 3) {
    const needed = 3 - dormantCount;
    for (let i = 0; i < needed; i++) {
      const idx = db.accounts.length;
      const city = faker.helpers.arrayElement(CITIES);
      db.accounts.push({
        _id: `acc-${idx}`, account_id: `ACC${String(idx + 1).padStart(6, '0')}`,
        customer_name: faker.person.fullName(), kyc_level: 'LOW',
        branch: faker.helpers.arrayElement(BRANCHES), status: 'DORMANT', account_type: 'SAVINGS',
        balance: faker.number.float({ min: 50, max: 1000, fractionDigits: 0 }),
        last_active: faker.date.past({ years: 1 }), geo_location: city,
        risk_score: 0, is_flagged: false,
        total_incoming: 0, total_outgoing: 0, tx_count: 0,
        createdAt: new Date(), updatedAt: new Date()
      });
    }
  }
}

function simulateNormal() {
  const accs = getNormal();
  if (accs.length < 2) return;
  const s = faker.helpers.arrayElement(accs);
  const r = faker.helpers.arrayElement(accs.filter(a => a.account_id !== s.account_id));
  const amount = faker.number.float({ min: 200, max: 25000, fractionDigits: 0 });
  emitTransaction(makeTx(s.account_id, r.account_id, amount, faker.helpers.arrayElement(['UPI','IMPS','NEFT'])));
}

async function simulateLayering() {
  console.log('🚨 FRAUD: Layering chain');
  const shells = getShell();
  if (shells.length < 4) return;
  const chain = faker.helpers.arrayElements(shells, Math.min(5, shells.length));
  let amount = faker.number.float({ min: 200000, max: 800000, fractionDigits: 0 });
  for (let i = 0; i < chain.length - 1; i++) {
    amount = Math.floor(amount * 0.85);
    emitTransaction(makeTx(chain[i].account_id, chain[i+1].account_id, amount, 'WIRE', true));
    await new Promise(r => setTimeout(r, 800));
  }
}

async function simulateStructuring() {
  console.log('🚨 FRAUD: Structuring');
  const shells = getShell();
  const normals = getNormal();
  if (!shells.length || normals.length < 4) return;
  const shell = faker.helpers.arrayElement(shells);
  const targets = faker.helpers.arrayElements(normals, 4);
  for (const t of targets) {
    const amt = faker.number.float({ min: 43000, max: 49800, fractionDigits: 0 });
    emitTransaction(makeTx(shell.account_id, t.account_id, amt, 'NEFT', true));
    await new Promise(r => setTimeout(r, 800));
  }
}

async function simulateFanOut() {
  console.log('🚨 FRAUD: Fan-Out');
  const shells = getShell();
  const normals = getNormal();
  if (!shells.length || normals.length < 8) return;
  const shell = faker.helpers.arrayElement(shells);
  const targets = faker.helpers.arrayElements(normals, 8);
  const total = faker.number.float({ min: 500000, max: 1500000, fractionDigits: 0 });
  for (const t of targets) {
    emitTransaction(makeTx(shell.account_id, t.account_id, Math.floor(total / targets.length), 'IMPS', true));
    await new Promise(r => setTimeout(r, 400));
  }
}

async function simulateDormant() {
  replenishDormant();
  const dormant = getDormant();
  const shells = getShell();
  if (!dormant.length || !shells.length) return;
  console.log('🚨 FRAUD: Dormant activation');
  const d = faker.helpers.arrayElement(dormant);
  const s = faker.helpers.arrayElement(shells);
  emitTransaction(makeTx(s.account_id, d.account_id, faker.number.float({ min: 100000, max: 500000, fractionDigits: 0 }), 'NEFT', true));
}

const fraudScenarios = [simulateLayering, simulateStructuring, simulateFanOut, simulateDormant];
let fraudIndex = 0;

function startSimulator() {
  seedAccounts();
  console.log('🚀 Transaction simulator started');
  // Normal transactions every 3 seconds (was 2s — less noise)
  setInterval(simulateNormal, 3000);
  // First fraud scenario after 10 seconds
  setTimeout(() => simulateLayering(), 10000);
  // Cycle through fraud scenarios every 45 seconds (was 25s — more realistic)
  setInterval(async () => {
    const fn = fraudScenarios[fraudIndex % fraudScenarios.length];
    fraudIndex++;
    await fn();
  }, 45000);
}

// ==================== REST API ====================

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
});

// DASHBOARD
app.get('/api/dashboard/stats', (req, res) => {
  const since24h = Date.now() - 86400000;
  const txToday = db.transactions.filter(t => new Date(t.timestamp) >= since24h);
  const hourMap = {};
  txToday.forEach(t => {
    const h = new Date(t.timestamp).getHours();
    if (!hourMap[h]) hourMap[h] = { _id: h, count: 0, total_amount: 0 };
    hourMap[h].count++; hourMap[h].total_amount += t.amount;
  });
  res.json({
    tx: { total: db.transactions.length, flagged: db.transactions.filter(t => t.anomaly_flag).length, today: txToday.length },
    alerts: { open: db.alerts.filter(a => a.status === 'OPEN').length, critical: db.alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'OPEN').length },
    accounts: { flagged: db.accounts.filter(a => a.is_flagged).length },
    cases: { open: db.investigations.filter(i => ['OPEN', 'IN_PROGRESS'].includes(i.status)).length },
    recent_transactions: db.transactions.slice(0, 10),
    recent_alerts: db.alerts.filter(a => a.status === 'OPEN').slice(0, 5),
    tx_by_hour: Object.values(hourMap).sort((a, b) => a._id - b._id),
  });
});

// TRANSACTIONS
app.get('/api/transactions', (req, res) => {
  let txs = [...db.transactions];
  if (req.query.flagged === 'true') txs = txs.filter(t => t.anomaly_flag);
  if (req.query.fraud_type && req.query.fraud_type !== 'ALL') txs = txs.filter(t => t.fraud_type === req.query.fraud_type);
  const limit = parseInt(req.query.limit) || 100;
  res.json({ transactions: txs.slice(0, limit), total: txs.length });
});

app.get('/api/transactions/graph', (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const since = Date.now() - hours * 3600000;
  const flaggedOnly = req.query.flaggedOnly === 'true';
  let txs = db.transactions.filter(t => new Date(t.timestamp) >= since);
  if (flaggedOnly) txs = txs.filter(t => t.anomaly_flag);
  txs = txs.slice(0, 300);
  const accIds = new Set([...txs.map(t => t.sender), ...txs.map(t => t.receiver)]);
  const nodes = db.accounts.filter(a => accIds.has(a.account_id)).map(a => ({
    id: a.account_id, name: a.customer_name, type: a.account_type,
    risk_score: a.risk_score, is_flagged: a.is_flagged, status: a.status,
    balance: a.balance, kyc_level: a.kyc_level, branch: a.branch, geo_location: a.geo_location,
    val: Math.max(2, (a.risk_score || 0) / 10)
  }));
  const links = txs.map(t => ({
    source: t.sender, target: t.receiver, amount: t.amount, tx_id: t.tx_id,
    fraud_type: t.fraud_type, risk_score: t.risk_score, anomaly_flag: t.anomaly_flag,
    timestamp: t.timestamp, transaction_type: t.transaction_type
  }));
  res.json({ nodes, links });
});

app.get('/api/transactions/stats/summary', (req, res) => {
  const fraudTypes = {};
  db.transactions.filter(t => t.anomaly_flag).forEach(t => {
    fraudTypes[t.fraud_type] = (fraudTypes[t.fraud_type] || 0) + 1;
  });
  res.json({
    total: db.transactions.length,
    flagged: db.transactions.filter(t => t.anomaly_flag).length,
    total_amount: db.transactions.reduce((s, t) => s + t.amount, 0),
    fraud_types: Object.entries(fraudTypes).map(([_id, count]) => ({ _id, count }))
  });
});

app.get('/api/transactions/:tx_id', (req, res) => {
  const tx = db.transactions.find(t => t.tx_id === req.params.tx_id);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  res.json(tx);
});

// ALERTS
app.get('/api/alerts', (req, res) => {
  let alerts = [...db.alerts];
  if (req.query.status) alerts = alerts.filter(a => a.status === req.query.status);
  if (req.query.severity) alerts = alerts.filter(a => a.severity === req.query.severity);
  res.json({ alerts: alerts.slice(0, parseInt(req.query.limit) || 100), total: alerts.length });
});

app.get('/api/alerts/stats', (req, res) => {
  const byType = {}, bySev = {};
  db.alerts.forEach(a => {
    byType[a.alert_type] = (byType[a.alert_type] || 0) + 1;
    bySev[a.severity] = (bySev[a.severity] || 0) + 1;
  });
  res.json({
    total: db.alerts.length,
    open: db.alerts.filter(a => a.status === 'OPEN').length,
    critical: db.alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'OPEN').length,
    by_type: Object.entries(byType).map(([_id, count]) => ({ _id, count })),
    by_severity: Object.entries(bySev).map(([_id, count]) => ({ _id, count })),
  });
});

app.patch('/api/alerts/:alert_id/status', (req, res) => {
  const alert = db.alerts.find(a => a.alert_id === req.params.alert_id);
  if (!alert) return res.status(404).json({ error: 'Not found' });
  Object.assign(alert, req.body, { updatedAt: new Date() });
  res.json(alert);
});

// ACCOUNTS
app.get('/api/accounts', (req, res) => {
  let accounts = [...db.accounts];
  if (req.query.flagged === 'true') accounts = accounts.filter(a => a.is_flagged);
  if (req.query.type) accounts = accounts.filter(a => a.account_type === req.query.type);
  if (req.query.status) accounts = accounts.filter(a => a.status === req.query.status);
  accounts.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  res.json({ accounts: accounts.slice(0, parseInt(req.query.limit) || 100), total: accounts.length });
});

app.get('/api/accounts/stats/summary', (req, res) => {
  const byType = {};
  db.accounts.forEach(a => { byType[a.account_type] = (byType[a.account_type] || 0) + 1; });
  res.json({
    total: db.accounts.length,
    flagged: db.accounts.filter(a => a.is_flagged).length,
    dormant: db.accounts.filter(a => a.status === 'DORMANT').length,
    suspicious: db.accounts.filter(a => a.status === 'SUSPICIOUS').length,
    by_type: Object.entries(byType).map(([_id, count]) => ({ _id, count })),
  });
});

app.get('/api/accounts/:account_id', (req, res) => {
  const account = db.accounts.find(a => a.account_id === req.params.account_id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  const recentTxs = db.transactions.filter(t => t.sender === account.account_id || t.receiver === account.account_id).slice(0, 20);
  res.json({ ...account, recent_transactions: recentTxs });
});

// INVESTIGATIONS
app.get('/api/investigations', (req, res) => {
  let cases = [...db.investigations];
  if (req.query.status) cases = cases.filter(c => c.status === req.query.status);
  res.json({ cases, total: cases.length });
});

app.post('/api/investigations', (req, res) => {
  const inv = {
    _id: uuidv4(),
    case_id: `CASE-${uuidv4().slice(0, 8).toUpperCase()}`,
    ...req.body,
    notes: [], evidence_timeline: [],
    str_generated: false,
    createdAt: new Date(), updatedAt: new Date()
  };
  db.investigations.unshift(inv);
  res.status(201).json(inv);
});

app.get('/api/investigations/:case_id', (req, res) => {
  const inv = db.investigations.find(i => i.case_id === req.params.case_id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

app.patch('/api/investigations/:case_id', (req, res) => {
  const inv = db.investigations.find(i => i.case_id === req.params.case_id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  Object.assign(inv, req.body, { updatedAt: new Date() });
  res.json(inv);
});

app.post('/api/investigations/:case_id/notes', (req, res) => {
  const inv = db.investigations.find(i => i.case_id === req.params.case_id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.notes.push({ ...req.body, timestamp: new Date() });
  inv.updatedAt = new Date();
  res.json(inv);
});

app.post('/api/investigations/:case_id/str', (req, res) => {
  const inv = db.investigations.find(i => i.case_id === req.params.case_id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.str_generated = true;
  inv.str_generated_at = new Date();
  inv.status = 'ESCALATED';
  res.json({ message: 'STR report generated', case: inv });
});

// HEALTH
app.get('/health', (req, res) => {
  res.json({ status: 'operational', mode: 'in-memory-demo', accounts: db.accounts.length, transactions: db.transactions.length, alerts: db.alerts.length });
});

// Socket
io.on('connection', (socket) => {
  console.log(`🔌 Client: ${socket.id}`);
  socket.on('trigger_fraud_scenario', async (type) => {
    const map = { layering: simulateLayering, structuring: simulateStructuring, fanout: simulateFanOut, dormant: simulateDormant };
    if (map[type]) await map[type]();
    socket.emit('scenario_triggered', { type, timestamp: new Date() });
  });
  socket.on('disconnect', () => console.log(`🔌 Disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 FundTrace AI DEMO Server (In-Memory Mode)`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🌐 Open frontend: http://localhost:5173`);
  console.log(`🔑 Login: admin@fundtrace.ai / FundTrace@2024\n`);
  startSimulator();
});
