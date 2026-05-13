import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { txApi } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { Activity, Filter, Download, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const FRAUD_TYPE_COLOR = {
  NONE: '#10b981',
  STRUCTURING: '#f59e0b',
  LAYERING: '#ef4444',
  ROUND_TRIP: '#ef4444',
  DORMANT_ACTIVATION: '#7c3aed',
  FAN_OUT: '#f59e0b',
  MULE: '#ef4444',
  HIGH_VELOCITY: '#f59e0b',
};

const TX_TYPE_COLOR = {
  UPI: '#00d4ff', NEFT: '#7c3aed', RTGS: '#f59e0b', IMPS: '#10b981', CASH: '#94a3b8', WIRE: '#ef4444'
};

function TxBadge({ type, label }) {
  const color = type === 'fraud' ? FRAUD_TYPE_COLOR[label] || '#64748b' : TX_TYPE_COLOR[label] || '#64748b';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}44`, letterSpacing: '0.03em'
    }}>
      {label?.replace(/_/g, ' ')}
    </span>
  );
}

function RiskBar({ score }) {
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="risk-bar" style={{ width: 60 }}>
        <div className="risk-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{score}</span>
    </div>
  );
}

export default function TransactionsPage() {
  const { liveTransactions, connected } = useSocket();
  const [allTxs, setAllTxs] = useState([]);
  const [filter, setFilter] = useState({ flagged: false, fraud_type: 'ALL' });
  const [newIds, setNewIds] = useState(new Set());
  const tableRef = useRef(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', filter],
    queryFn: () => txApi.getAll({ flagged: filter.flagged || undefined, fraud_type: filter.fraud_type !== 'ALL' ? filter.fraud_type : undefined, limit: 100 }),
  });

  useEffect(() => {
    const baseTxs = data?.transactions || [];
    const live = liveTransactions.slice(0, 50);
    const combined = [...live, ...baseTxs.filter(t => !live.find(l => l.tx_id === t.tx_id))];
    setAllTxs(combined.slice(0, 150));
  }, [data, liveTransactions]);

  useEffect(() => {
    if (liveTransactions.length > 0) {
      const latest = liveTransactions[0];
      setNewIds(prev => new Set([...prev, latest.tx_id]));
      setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(latest.tx_id); return n; }), 2000);

      if (latest.anomaly_flag) {
        toast.custom(() => (
          <div className="toast-fraud">
            <AlertTriangle size={18} color="#ef4444" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Transaction Flagged</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{latest.fraud_type?.replace(/_/g,' ')} • ₹{Number(latest.amount).toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
            </div>
          </div>
        ), { duration: 5000 });
      }
    }
  }, [liveTransactions]);

  const displayed = allTxs.filter(tx => {
    if (filter.flagged && !tx.anomaly_flag) return false;
    if (filter.fraud_type !== 'ALL' && tx.fraud_type !== filter.fraud_type) return false;
    return true;
  });

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>Live Transaction Monitor</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div className="pulse-dot" style={{ width: 6, height: 6, background: connected ? '#10b981' : '#ef4444' }} />
            <span style={{ fontSize: 12, color: connected ? '#10b981' : '#ef4444' }}>
              {connected ? 'Real-time stream active' : 'Connecting...'}
            </span>
            <span style={{ fontSize: 12, color: '#475569' }}>• {displayed.length} transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => refetch()} className="btn-ghost">
            <RefreshCw size={14} />Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-4" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={14} color="#475569" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
          <input
            type="checkbox"
            checked={filter.flagged}
            onChange={e => setFilter(f => ({ ...f, flagged: e.target.checked }))}
            style={{ accentColor: '#ef4444' }}
          />
          Flagged Only
        </label>
        <select
          value={filter.fraud_type}
          onChange={e => setFilter(f => ({ ...f, fraud_type: e.target.value }))}
          className="cyber-input"
          style={{ width: 180 }}
        >
          <option value="ALL">All Fraud Types</option>
          <option value="STRUCTURING">Structuring</option>
          <option value="LAYERING">Layering</option>
          <option value="FAN_OUT">Fan-Out</option>
          <option value="DORMANT_ACTIVATION">Dormant Activation</option>
          <option value="MULE">Mule</option>
          <option value="NONE">Clean</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#ef4444', padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {displayed.filter(t => t.anomaly_flag).length} Flagged
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }} ref={tableRef}>
          <table className="cyber-table">
            <thead style={{ position: 'sticky', top: 0, background: '#0d1b2a', zIndex: 5 }}>
              <tr>
                <th>Transaction ID</th>
                <th>Sender</th>
                <th>Receiver</th>
                <th>Amount (INR)</th>
                <th>Type</th>
                <th>Risk Score</th>
                <th>Fraud Type</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && displayed.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
                  No transactions yet. Simulator starting...
                </td></tr>
              ) : displayed.map((tx, i) => (
                <tr
                  key={tx.tx_id || i}
                  className={tx.anomaly_flag ? 'flagged' : ''}
                  style={{ animation: newIds.has(tx.tx_id) ? 'slideInRow 0.5s ease-out' : undefined }}
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#00d4ff' }}>{tx.tx_id?.slice(0, 16)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{tx.sender}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{tx.receiver}</td>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>
                    ₹{Number(tx.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td><TxBadge label={tx.transaction_type} /></td>
                  <td><RiskBar score={tx.risk_score || 0} /></td>
                  <td>
                    <TxBadge type="fraud" label={tx.fraud_type || 'NONE'} />
                  </td>
                  <td>
                    {tx.anomaly_flag
                      ? <span className="badge badge-critical">FLAGGED</span>
                      : <span className="badge badge-success">CLEAN</span>
                    }
                  </td>
                  <td style={{ color: '#475569', fontSize: 11 }}>
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('en-IN') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
