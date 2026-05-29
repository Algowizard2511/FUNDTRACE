import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { txApi } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import ForceGraph2D from 'react-force-graph-2d';
import { GitBranch, Filter, ZoomIn, RefreshCw, Info, X } from 'lucide-react';

// Banking colors
const FRAUD_COLORS = {
  NONE: '#16a870',
  STRUCTURING: '#c98520',
  LAYERING: '#c82828',
  ROUND_TRIP: '#c82828',
  DORMANT_ACTIVATION: '#c9a84c',
  FAN_OUT: '#c98520',
  MULE: '#c82828',
};

const NODE_TYPE_COLORS = {
  SAVINGS: '#1a6cbc',
  CURRENT: '#2d85d8',
  SHELL: '#c98520',
  MULE: '#c82828',
};

function NodePanel({ node, onClose }) {
  if (!node) return null;
  const color = NODE_TYPE_COLORS[node.type] || '#1a6cbc';
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 280,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
      padding: 20, zIndex: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Account Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['Account ID', node.id, true],
          ['Name', node.name],
          ['Type', node.type],
          ['KYC Level', node.kyc_level],
          ['Status', node.status],
          ['Branch', node.branch],
          ['Risk Score', node.risk_score],
          ['Balance', node.balance ? `₹${Number(node.balance).toLocaleString('en-IN')}` : '-'],
        ].map(([label, value, mono]) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>{value || '-'}</div>
          </div>
        ))}
      </div>
      {node.is_flagged && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(200,40,40,0.1)', border: '1px solid rgba(200,40,40,0.3)' }}>
          <span style={{ fontSize: 11, color: 'var(--danger-2)', fontWeight: 700 }}>⚠ FLAGGED FOR INVESTIGATION</span>
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edge, onClose }) {
  if (!edge) return null;
  const color = FRAUD_COLORS[edge.fraud_type] || '#16a870';
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16, width: 280,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
      padding: 20, zIndex: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Transaction Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 12 }}>{edge.tx_id}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 12 }}>
        ₹{Number(edge.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 5 }}>FRAUD TYPE</div>
        <span style={{ fontSize: 11, color, fontWeight: 700, background: `${color}18`, padding: '4px 10px', borderRadius: 4, border: `1px solid ${color}40` }}>
          {edge.fraud_type?.replace(/_/g, ' ') || 'CLEAN'}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 5 }}>RISK SCORE ({edge.risk_score})</div>
        <div className="risk-bar" style={{ height: 6, borderRadius: 3, background: 'var(--surface)' }}>
          <div className="risk-bar-fill" style={{ width: `${edge.risk_score}%`, background: color, borderRadius: 3 }} />
        </div>
      </div>
      {edge.anomaly_flag && (
        <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(200,40,40,0.1)', border: '1px solid rgba(200,40,40,0.3)' }}>
          <span style={{ fontSize: 11, color: 'var(--danger-2)', fontWeight: 700 }}>FLAGGED TRANSACTION</span>
        </div>
      )}
    </div>
  );
}

export default function GraphPage() {
  const graphRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [filter, setFilter] = useState({ flaggedOnly: false, hours: 24 });
  const { liveTransactions } = useSocket();

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['graph', filter],
    queryFn: () => txApi.getGraph({ flaggedOnly: filter.flaggedOnly, hours: filter.hours }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (data) setGraphData(data);
  }, [data]);

  // Refresh graph when new suspicious transaction arrives
  useEffect(() => {
    const flagged = liveTransactions.filter(t => t.anomaly_flag);
    if (flagged.length > 0) {
      const timer = setTimeout(() => refetch(), 2000);
      return () => clearTimeout(timer);
    }
  }, [liveTransactions]);

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const isFlagged = node.is_flagged;
    const isSelected = selectedNode?.id === node.id;
    const color = isFlagged ? '#e03434' : NODE_TYPE_COLORS[node.type] || '#1a6cbc';
    const radius = Math.max(4, (node.risk_score || 0) / 12) + (isSelected ? 3 : 0);

    // Outer glow ring for flagged
    if (isFlagged || isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = `${color}e6`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Label (only when zoomed in enough)
    if (globalScale >= 1.2) {
      const label = node.id?.slice(0, 9) || '';
      ctx.font = `${Math.max(8, 10 / globalScale)}px Inter`;
      ctx.fillStyle = 'var(--text-2)';
      ctx.textAlign = 'center';
      ctx.fillText(label, node.x, node.y + radius + 8);
    }
  }, [selectedNode]);

  const linkColor = useCallback((link) => {
    if (link.anomaly_flag) return FRAUD_COLORS[link.fraud_type] || '#e03434';
    return 'var(--border-2)';
  }, []);

  const linkWidth = useCallback((link) => {
    return link.anomaly_flag ? Math.max(1.5, link.amount / 200000) : 1;
  }, []);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    graphRef.current?.centerAt(node.x, node.y, 500);
    graphRef.current?.zoom(2, 500);
  }, []);

  const handleLinkClick = useCallback((link) => {
    setSelectedEdge(link);
    setSelectedNode(null);
  }, []);

  return (
    <div style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Fund Flow Graph</h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
            {graphData.nodes.length} accounts • {graphData.links.length} transactions •{' '}
            <span style={{ color: 'var(--danger-2)', fontWeight: 600 }}>{graphData.links.filter(l => l.anomaly_flag).length} flagged</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', fontWeight: 500 }}>
            <input type="checkbox" checked={filter.flaggedOnly} onChange={e => setFilter(f => ({...f, flaggedOnly: e.target.checked}))} style={{ accentColor: 'var(--danger-2)' }} />
            Suspicious Only
          </label>
          <select value={filter.hours} onChange={e => setFilter(f => ({...f, hours: Number(e.target.value)}))} className="cyber-input" style={{ width: 130 }}>
            <option value={1}>Last 1 Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
            <option value={168}>Last 7 Days</option>
          </select>
          <button onClick={() => refetch()} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
          <button onClick={() => graphRef.current?.zoomToFit(500)} className="btn-ghost"><ZoomIn size={14} />Fit</button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { color: '#1a6cbc', label: 'Savings Account' },
          { color: '#c98520', label: 'Shell Account' },
          { color: '#e03434', label: 'Mule/Flagged Account' },
          { color: '#c9a84c', label: 'Dormant Account' },
          { color: '#e03434', label: 'Suspicious Transaction', line: true },
          { color: '#1c4468', label: 'Clean Transaction', line: true },
        ].map(({ color, label, line }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {line
              ? <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
              : <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            }
            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Graph ── */}
      <div className="graph-container" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isLoading && graphData.nodes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Building fund flow graph...</p>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => 'replace'}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalParticles={link => link.anomaly_flag ? 3 : 0}
            linkDirectionalParticleColor={link => FRAUD_COLORS[link.fraud_type] || '#e03434'}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleWidth={2}
            backgroundColor="#030c18"
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            cooldownTicks={100}
            nodeRelSize={1}
          />
        )}

        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        <EdgePanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />

        {!selectedNode && !selectedEdge && graphData.nodes.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)',
            background: 'rgba(10,28,48,0.85)', padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--border)', backdropFilter: 'blur(4px)'
          }}>
            <Info size={14} color="var(--blue-2)" />Click a node or edge to inspect details
          </div>
        )}
      </div>
    </div>
  );
}
