import { useQuery } from '@tanstack/react-query';
import { accountApi } from '../services/api';
import { useState } from 'react';
import { Users, Filter, AlertTriangle, CheckCircle } from 'lucide-react';

const TYPE_COLOR = { SAVINGS: '#00d4ff', CURRENT: '#22d3ee', SHELL: '#f59e0b', MULE: '#ef4444' };
const STATUS_COLOR = { ACTIVE: '#10b981', DORMANT: '#475569', FROZEN: '#7c3aed', SUSPICIOUS: '#ef4444' };

function RiskBar({ score }) {
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="risk-bar" style={{ width: 50 }}>
        <div className="risk-bar-fill" style={{ width: `${Math.min(score, 100)}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 24 }}>{score}</span>
    </div>
  );
}

export default function AccountsPage() {
  const [filter, setFilter] = useState({ flagged: false, type: '', status: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', filter],
    queryFn: () => accountApi.getAll({
      flagged: filter.flagged || undefined,
      type: filter.type || undefined,
      status: filter.status || undefined,
      limit: 200
    }),
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery({ queryKey: ['account-stats'], queryFn: accountApi.getStats });

  const accounts = data?.accounts || [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>Account Registry</h1>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {stats?.total || 0} total • {stats?.flagged || 0} flagged • {stats?.dormant || 0} dormant • {stats?.suspicious || 0} suspicious
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Accounts', value: stats?.total || 0, color: '#00d4ff' },
          { label: 'Flagged', value: stats?.flagged || 0, color: '#ef4444' },
          { label: 'Dormant', value: stats?.dormant || 0, color: '#475569' },
          { label: 'Suspicious', value: stats?.suspicious || 0, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: 26, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} color="#475569" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
          <input type="checkbox" checked={filter.flagged} onChange={e => setFilter(f => ({...f, flagged: e.target.checked}))} style={{ accentColor: '#ef4444' }} />
          Flagged Only
        </label>
        <select className="cyber-input" style={{ width: 160 }} value={filter.type} onChange={e => setFilter(f => ({...f, type: e.target.value}))}>
          <option value="">All Types</option>
          {['SAVINGS','CURRENT','SHELL','MULE'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="cyber-input" style={{ width: 160 }} value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))}>
          <option value="">All Statuses</option>
          {['ACTIVE','DORMANT','FROZEN','SUSPICIOUS'].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>{accounts.length} accounts</span>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
          <table className="cyber-table">
            <thead style={{ position: 'sticky', top: 0, background: '#0d1b2a', zIndex: 5 }}>
              <tr>
                <th>Account ID</th>
                <th>Customer Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>KYC</th>
                <th>Branch</th>
                <th>Balance (INR)</th>
                <th>Risk Score</th>
                <th>Flag</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#475569' }}>No accounts found</td></tr>
              ) : accounts.map(acc => (
                <tr key={acc.account_id} className={acc.is_flagged ? 'flagged' : ''}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#00d4ff' }}>{acc.account_id}</td>
                  <td style={{ fontWeight: 500, color: '#e2e8f0' }}>{acc.customer_name}</td>
                  <td>
                    <span style={{ fontSize: 11, color: TYPE_COLOR[acc.account_type] || '#64748b', fontWeight: 600, background: `${TYPE_COLOR[acc.account_type]}18`, padding: '2px 8px', borderRadius: 4 }}>
                      {acc.account_type}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, color: STATUS_COLOR[acc.status] || '#64748b', fontWeight: 600 }}>
                      {acc.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${acc.kyc_level === 'HIGH' ? 'success' : acc.kyc_level === 'MEDIUM' ? 'medium' : 'critical'}`} style={{fontSize:9}}>
                      {acc.kyc_level}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>{acc.branch}</td>
                  <td style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 12 }}>
                    ₹{Number(acc.balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td><RiskBar score={Math.min(acc.risk_score || 0, 100)} /></td>
                  <td>
                    {acc.is_flagged
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ef4444' }}><AlertTriangle size={12} />Flagged</span>
                      : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#10b981' }}><CheckCircle size={12} />Clear</span>
                    }
                  </td>
                  <td style={{ fontSize: 11, color: '#475569' }}>
                    {acc.last_active ? new Date(acc.last_active).toLocaleDateString('en-IN') : '-'}
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
