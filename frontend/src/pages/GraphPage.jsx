import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { txApi } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import ForceGraph2D from 'react-force-graph-2d';
import { GitBranch, Filter, ZoomIn, ZoomOut, RefreshCw, Info, X } from 'lucide-react';

const FRAUD_COLORS = {
  NONE: '#10b981',
  STRUCTURING: '#f59e0b',
  LAYERING: '#ef4444',
  ROUND_TRIP: '#ef4444',
  DORMANT_ACTIVATION: '#7c3aed',
  FAN_OUT: '#f59e0b',
  MULE: '#ef4444',
};

const NODE_TYPE_COLORS = {
  SAVINGS: '#00d4ff',
  CURRENT: '#22d3ee',
  SHELL: '#f59e0b',
  MULE: '#ef4444',
};

function NodePanel({ node, onClose }) {
  if (!node) return null;
  const color = NODE_TYPE_COLORS[node.type] || '#00d4ff';
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 280,
      background: '#0d1b2a', border: '1px solid #1a3a52', borderRadius: 12,
      padding: 20, zIndex: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Account Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', flex: 'column', gap: 8 }}>
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
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: mono ? 'monospace' : undefined }}>{value || '-'}</div>
          </div>
        ))}
      </div>
      {node.is_flagged && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>⚠ FLAGGED FOR INVESTIGATION</span>
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edge, onClose }) {
  if (!edge) return null;
  const color = FRAUD_COLORS[edge.fraud_type] || '#10b981';
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16, width: 280,
      background: '#0d1b2a', border: '1px solid #1a3a52', borderRadius: 12,
      padding: 20, zIndex: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Transaction Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', marginBottom: 12 }}>{edge.tx_id}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 12 }}>
        ₹{Number(edge.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, marginBottom: 4 }}>FRAUD TYPE</div>
        <span style={{ fontSize: 12, color, fontWeight: 600, background: `${color}18`, padding: '2px 10px', borderRadius: 4 }}>
          {edge.fraud_type?.replace(/_/g, ' ') || 'CLEAN'}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, marginBottom: 4 }}>RISK SCORE</div>
        <div className="risk-bar"><div className="risk-bar-fill" style={{ width: `${edge.risk_score}%`, background: color }} /></div>
      </div>
      {edge.anomaly_flag && (
        <div style={{ marginTop: 12, padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>FLAGGED TRANSACTION</span>
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
    const color = isFlagged ? '#ef4444' : NODE_TYPE_COLORS[node.type] || '#00d4ff';
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
    ctx.fillStyle = `${color}cc`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Label (only when zoomed in enough)
    if (globalScale >= 1.2) {
      const label = node.id?.slice(0, 9) || '';
      ctx.font = `${Math.max(8, 10 / globalScale)}px Inter`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(label, node.x, node.y + radius + 8);
    }
  }, [selectedNode]);

  const linkColor = useCallback((link) => {
    if (link.anomaly_flag) return FRAUD_COLORS[link.fraud_type] || '#ef4444';
    return '#1a3a52';
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>Fund Flow Graph</h1>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            {graphData.nodes.length} accounts • {graphData.links.length} transactions •{' '}
            <span style={{ color: '#ef4444' }}>{graphData.links.filter(l => l.anomaly_flag).length} flagged</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={filter.flaggedOnly} onChange={e => setFilter(f => ({...f, flaggedOnly: e.target.checked}))} style={{ accentColor: '#ef4444' }} />
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

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { color: '#00d4ff', label: 'Savings Account' },
          { color: '#f59e0b', label: 'Shell Account' },
          { color: '#ef4444', label: 'Mule/Flagged Account' },
          { color: '#7c3aed', label: 'Dormant Account' },
          { color: '#ef4444', label: 'Suspicious Transaction', line: true },
          { color: '#1a3a52', label: 'Clean Transaction', line: true },
        ].map(({ color, label, line }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {line
              ? <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
              : <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            }
            <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div className="graph-container" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isLoading && graphData.nodes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#475569', fontSize: 13 }}>Building fund flow graph...</p>
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
            linkDirectionalParticleColor={link => FRAUD_COLORS[link.fraud_type] || '#ef4444'}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleWidth={2}
            backgroundColor="#060b14"
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            cooldownTicks={100}
            nodeRelSize={1}
          />
        )}

        {/* Info overlays */}
        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        <EdgePanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />

        {/* Click hint */}
        {!selectedNode && !selectedEdge && graphData.nodes.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569',
            background: 'rgba(13,27,42,0.8)', padding: '8px 14px', borderRadius: 8,
            border: '1px solid #1a3a52'
          }}>
            <Info size={14} />Click a node or edge to inspect details
          </div>
        )}
      </div>
    </div>
  );
}
