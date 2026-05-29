import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Shield, Users, TrendingUp, Zap,
  ArrowUpRight, ArrowDownRight, Clock, Eye
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#ef4444', '#f59e0b', '#00d4ff', '#10b981', '#7c3aed'];
const FRAUD_TYPE_LABELS = {
  STRUCTURING: 'Structuring',
  LAYERING: 'Layering',
  ROUND_TRIP: 'Round Trip',
  DORMANT_ACTIVATION: 'Dormant Acct',
  FAN_OUT: 'Fan-Out',
  MULE: 'Mule Acct',
  NONE: 'Clean',
};

function StatCard({ label, value, icon: Icon, color, subLabel, change }) {
  return (
    <div className="stat-card animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${color}18`, border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon size={18} color={color} />
        </div>
        {change !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            color: change >= 0 ? '#ef4444' : '#10b981', fontSize: 12, fontWeight: 600
          }}>
            {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.03em', marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</div>
      {subLabel && <div style={{ fontSize: 11, color: color, marginTop: 4 }}>{subLabel}</div>}
    </div>
  );
}

function AlertRow({ alert }) {
  const severityColor = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#00d4ff', LOW: '#10b981' };
  const color = severityColor[alert.severity] || '#64748b';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: '1px solid rgba(26,58,82,0.4)'
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
          {alert.alert_type?.replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
          {alert.description?.slice(0, 60)}...
        </div>
      </div>
      <span className={`badge badge-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
    </div>
  );
}

function TxRow({ tx }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
      borderBottom: '1px solid rgba(26,58,82,0.4)',
      ...(tx.anomaly_flag ? { background: 'rgba(239,68,68,0.03)' } : {})
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
          {tx.sender?.slice(0, 10)} → {tx.receiver?.slice(0, 10)}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
        ₹{Number(tx.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
      {tx.anomaly_flag && <span className="badge badge-critical" style={{ fontSize: 9 }}>FLAGGED</span>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getStats });
  const { liveTransactions, liveAlerts, connected } = useSocket();
  const [txCount, setTxCount] = useState(0);

  useEffect(() => {
    setTxCount(prev => prev + 1);
    const timer = setTimeout(() => refetch(), 3000);
    return () => clearTimeout(timer);
  }, [liveTransactions.length]);

  const stats = data || {};
  const txByHour = (stats.tx_by_hour || []).map(d => ({
    hour: `${d._id}:00`, count: d.count, amount: d.total_amount
  }));

  const fraudPieData = (stats.tx?.fraud_types || []).map((d, i) => ({
    name: FRAUD_TYPE_LABELS[d._id] || d._id, value: d.count
  }));

  const recentAlerts = liveAlerts.length > 0 ? liveAlerts.slice(0, 5) : (stats.recent_alerts || []);
  const recentTxs = liveTransactions.length > 0 ? liveTransactions.slice(0, 8) : (stats.recent_transactions || []);

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            Intelligence Dashboard
          </h1>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            Real-time AML monitoring • {new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
            <div className="pulse-dot" />
            <span style={{ fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Total Transactions"
          value={((stats.tx?.total || 0) + liveTransactions.length).toLocaleString()}
          icon={Activity}
          color="#00d4ff"
          subLabel={`+${stats.tx?.today || 0} today`}
          change={12}
        />
        <StatCard
          label="Flagged Transactions"
          value={stats.tx?.flagged || 0}
          icon={AlertTriangle}
          color="#ef4444"
          subLabel="Requires investigation"
          change={8}
        />
        <StatCard
          label="Open Alerts"
          value={stats.alerts?.open || 0}
          icon={Zap}
          color="#f59e0b"
          subLabel={`${stats.alerts?.critical || 0} critical`}
        />
        <StatCard
          label="Flagged Accounts"
          value={stats.accounts?.flagged || 0}
          icon={Users}
          color="#7c3aed"
          subLabel="Under monitoring"
        />
        <StatCard
          label="Active Cases"
          value={stats.cases?.open || 0}
          icon={Shield}
          color="#10b981"
          subLabel="Investigations open"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Transaction volume chart */}
        <div className="glass-card p-5">
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Transaction Volume (24h)</h3>
            <p style={{ fontSize: 12, color: '#475569' }}>Hourly transaction flow</p>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={txByHour.length ? txByHour : Array.from({length:12},(_,i)=>({hour:`${i*2}:00`,count:0}))}>
                <defs>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a52" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1a3a52', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#00d4ff" fill="url(#txGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fraud type pie */}
        <div className="glass-card p-5">
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Fraud Type Distribution</h3>
            <p style={{ fontSize: 12, color: '#475569' }}>Detected patterns</p>
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fraudPieData.length ? fraudPieData : [
                    {name:'Layering',value:35},{name:'Structuring',value:25},
                    {name:'Fan-Out',value:20},{name:'Dormant',value:12},{name:'Mule',value:8}
                  ]}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  dataKey="value" paddingAngle={3}
                >
                  {(fraudPieData.length ? fraudPieData : [{},{},{},{},{}]).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1a3a52', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Layering','Structuring','Fan-Out','Dormant','Mule'].map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i] }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent alerts */}
        <div className="glass-card p-5">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Recent Alerts</h3>
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
              {recentAlerts.filter(a=>a.severity==='CRITICAL').length} CRITICAL
            </span>
          </div>
          {recentAlerts.length === 0 ? (
            <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>No alerts yet...</p>
          ) : (
            recentAlerts.map((a, i) => <AlertRow key={a._id || i} alert={a} />)
          )}
        </div>

        {/* Live transactions */}
        <div className="glass-card p-5">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Live Transactions</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="pulse-dot" style={{ width: 6, height: 6 }} />
              <span style={{ fontSize: 11, color: '#00d4ff' }}>STREAMING</span>
            </div>
          </div>
          {recentTxs.length === 0 ? (
            <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>Waiting for transactions...</p>
          ) : (
            recentTxs.map((tx, i) => <TxRow key={tx._id || i} tx={tx} />)
          )}
        </div>
      </div>
    </div>
  );
}
