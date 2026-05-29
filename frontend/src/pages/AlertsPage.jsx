import { useQuery, useQueryClient } from '@tanstack/react-query';
import { alertApi, investigationApi } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, CheckCircle, Clock, Shield, ChevronRight, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const SEVERITY_CONFIG = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: '🔴' },
  HIGH: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '🟡' },
  MEDIUM: { color: '#00d4ff', bg: 'rgba(0,212,255,0.1)', border: 'rgba(0,212,255,0.3)', icon: '🔵' },
  LOW: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', icon: '🟢' },
};

const ALERT_TYPE_DESC = {
  STRUCTURING: 'Multiple transactions structured below reporting threshold',
  LAYERING: 'Funds traced through suspicious account chain',
  ROUND_TRIP: 'Circular fund movement detected',
  DORMANT_ACTIVATION: 'Dormant account received large transfer',
  FAN_OUT: 'Rapid distribution to multiple accounts',
  MULE_BEHAVIOUR: 'Pass-through account with near-zero balance retention',
  HIGH_VELOCITY: 'Abnormal transaction frequency detected',
  GEO_ANOMALY: 'Geographic transaction anomaly',
};

function AlertCard({ alert, onAction }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.MEDIUM;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: '#111f2e', border: `1px solid ${cfg.border}`,
        borderRadius: 12, padding: 16, marginBottom: 12, cursor: 'pointer',
        transition: 'all 0.2s ease',
        ...(alert.severity === 'CRITICAL' ? { animation: 'alertPulse 2s ease-in-out infinite' } : {})
      }}
      onClick={() => setExpanded(!expanded)}
      className="animate-in"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Severity indicator */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0
        }}>
          <AlertTriangle size={18} color={cfg.color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
              {alert.alert_type?.replace(/_/g, ' ')}
            </span>
            <span className={`badge badge-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>
              {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>

          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            {ALERT_TYPE_DESC[alert.alert_type] || alert.description?.slice(0, 100)}
          </p>

          {/* Risk score bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#475569', width: 60 }}>Risk Score</span>
            <div className="risk-bar" style={{ flex: 1 }}>
              <div className="risk-bar-fill" style={{ width: `${alert.risk_score}%`, background: cfg.color }} />
            </div>
            <span style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>{alert.risk_score}</span>
          </div>

          {/* Account refs */}
          {alert.account_references?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {alert.account_references.slice(0, 3).map(acc => (
                <span key={acc} style={{
                  fontSize: 10, color: '#94a3b8', fontFamily: 'monospace',
                  background: 'rgba(0,212,255,0.08)', padding: '2px 8px', borderRadius: 4
                }}>{acc}</span>
              ))}
              {alert.account_references.length > 3 && (
                <span style={{ fontSize: 10, color: '#475569' }}>+{alert.account_references.length - 3} more</span>
              )}
            </div>
          )}

          {/* Expanded description */}
          {expanded && alert.description && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: '#94a3b8' }}>{alert.description}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
            {alert.status === 'OPEN' && (
              <>
                <button
                  onClick={() => onAction(alert, 'INVESTIGATING')}
                  className="btn-ghost"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                >
                  <Clock size={12} />Investigate
                </button>
                <button
                  onClick={() => onAction(alert, 'create_case')}
                  className="btn-primary"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                >
                  <Shield size={12} />Create Case
                </button>
                <button
                  onClick={() => onAction(alert, 'FALSE_POSITIVE')}
                  className="btn-ghost"
                  style={{ padding: '5px 12px', fontSize: 12, color: '#475569' }}
                >
                  Dismiss
                </button>
              </>
            )}
            {alert.status !== 'OPEN' && (
              <span className={`badge badge-${alert.status === 'RESOLVED' ? 'success' : alert.status === 'FALSE_POSITIVE' ? 'low' : 'medium'}`}>
                {alert.status}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={16} color="#475569" style={{ transform: expanded ? 'rotate(90deg)' : '', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { liveAlerts } = useSocket();
  const [filter, setFilter] = useState({ status: 'OPEN', severity: '' });

  const { data, refetch } = useQuery({
    queryKey: ['alerts', filter],
    queryFn: () => alertApi.getAll({ status: filter.status || undefined, severity: filter.severity || undefined, limit: 200 }),
  });

  const { data: stats } = useQuery({ queryKey: ['alert-stats'], queryFn: alertApi.getStats });

  const allAlerts = data?.alerts || [];
  // Merge live alerts
  const merged = [...liveAlerts.filter(la => !allAlerts.find(a => a.alert_id === la.alert_id)), ...allAlerts];

  const handleAction = async (alert, action) => {
    if (action === 'create_case') {
      try {
        await investigationApi.create({
          title: `${alert.alert_type?.replace(/_/g, ' ')} Investigation`,
          description: alert.description,
          investigator: 'Admin Investigator',
          severity: alert.severity,
          linked_accounts: alert.account_references || [],
          linked_transactions: alert.tx_references || [],
          linked_alerts: [alert.alert_id],
          fraud_type: alert.alert_type,
          total_amount_involved: 0,
        });
        await alertApi.updateStatus(alert.alert_id, { status: 'INVESTIGATING' });
        toast.success('Investigation case created successfully');
        refetch();
        queryClient.invalidateQueries(['alerts']);
      } catch (err) {
        toast.error('Failed to create case');
      }
    } else {
      try {
        await alertApi.updateStatus(alert.alert_id, { status: action });
        refetch();
        queryClient.invalidateQueries(['alerts']);
        toast.success(`Alert marked as ${action.toLowerCase().replace('_', ' ')}`);
      } catch (err) {
        toast.error('Failed to update alert');
      }
    }
  };

  const displayed = merged.filter(a => {
    if (filter.status && a.status !== filter.status) return false;
    if (filter.severity && a.severity !== filter.severity) return false;
    return true;
  });

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>Alert Center</h1>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {stats?.open || 0} open alerts • {stats?.critical || 0} critical
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stats?.critical > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8
            }}>
              <div className="pulse-dot danger" style={{ width: 8, height: 8 }} />
              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>{stats.critical} CRITICAL</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: stats?.total || 0, color: '#94a3b8' },
          { label: 'Open', value: stats?.open || 0, color: '#f59e0b' },
          { label: 'Critical', value: stats?.critical || 0, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '8px 18px', borderRadius: 8, background: '#111f2e', border: '1px solid #1a3a52', fontSize: 13
          }}>
            <span style={{ color: '#475569' }}>{label}: </span>
            <span style={{ color, fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { s: 'OPEN', label: 'Open' },
          { s: 'INVESTIGATING', label: 'Investigating' },
          { s: 'RESOLVED', label: 'Resolved' },
          { s: 'FALSE_POSITIVE', label: 'False Positive' },
          { s: '', label: 'All Statuses' },
        ].map(({ s, label }) => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(f => ({...f, status: s}))}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: filter.status === s ? 'rgba(0,212,255,0.15)' : '#111f2e',
              border: filter.status === s ? '1px solid rgba(0,212,255,0.4)' : '1px solid #1a3a52',
              color: filter.status === s ? '#00d4ff' : '#64748b',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {displayed.length === 0 ? (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <Bell size={40} color="#1a3a52" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#475569', fontSize: 14 }}>No alerts found. System is monitoring...</p>
        </div>
      ) : (
        displayed.map((alert, i) => (
          <AlertCard key={alert.alert_id || alert._id || i} alert={alert} onAction={handleAction} />
        ))
      )}
    </div>
  );
}
