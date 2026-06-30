import { useState, useEffect } from 'react';
import { Shield, Sliders, Play, Check, AlertTriangle, Eye, Activity, Save, RefreshCw, XCircle } from 'lucide-react';
import { rulesApi, simulatorApi } from '../services/api';
import toast from 'react-hot-toast';

export default function RuleSettingsPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [activeTab, setActiveTab] = useState('tuning');

  // Test form state
  const [testForm, setTestForm] = useState({
    sender: '',
    receiver: '',
    amount: '48500',
    transaction_type: 'NEFT',
    channel: 'MOBILE',
    city: 'Mumbai'
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchAccounts();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await rulesApi.getConfig();
      setConfig(data);
    } catch (err) {
      toast.error('Failed to load rule configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const data = await simulatorApi.getAccounts();
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 1) {
        setTestForm(prev => ({
          ...prev,
          sender: data.accounts[0].account_id,
          receiver: data.accounts[1].account_id
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStateToggle = (ruleKey) => {
    setConfig(prev => {
      const updatedStates = { ...prev.RULE_STATES, [ruleKey]: !prev.RULE_STATES[ruleKey] };
      return { ...prev, RULE_STATES: updatedStates };
    });
  };

  const handleModifierChange = (key, value) => {
    setConfig(prev => {
      const updatedModifiers = { ...prev.MODIFIERS, [key]: Number(value) };
      return { ...prev, MODIFIERS: updatedModifiers };
    });
  };

  const handleBehaviourChange = (key, value) => {
    setConfig(prev => {
      const updatedBehaviour = { ...prev.BEHAVIOUR, [key]: Number(value) };
      return { ...prev, BEHAVIOUR: updatedBehaviour };
    });
  };

  const handleMaxWeightChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: Number(value)
    }));
  };

  const saveConfig = async () => {
    try {
      setSaving(true);
      await rulesApi.updateConfig(config);
      toast.success('AML Rule Configuration updated successfully');
    } catch (err) {
      toast.error('Failed to save configuration');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (e) => {
    e.preventDefault();
    if (!testForm.sender || !testForm.receiver) {
      toast.error('Please select both sender and receiver accounts');
      return;
    }
    if (testForm.sender === testForm.receiver) {
      toast.error('Sender and receiver cannot be the same account');
      return;
    }
    try {
      setTesting(true);
      setTestResult(null);
      const res = await rulesApi.dryRun(testForm);
      setTestResult(res);
      toast.success('Simulation trace generated');
    } catch (err) {
      toast.error(err.error || 'Dry run evaluation failed');
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-gray-400">Loading AML Rule Engine Configuration...</p>
      </div>
    );
  }

  const ruleCards = [
    {
      id: 'STRUCTURING',
      title: 'Structuring Rule (Rule 1)',
      desc: 'Detects artificial split transfers designed to bypass PMLA ₹50,000 reporting threshold.',
      maxKey: 'STRUCTURING_MAX',
      stateKey: 'STRUCTURING',
      params: [
        { key: 'STRUCTURING_THRESHOLD_INR', label: 'PMLA Reporting Threshold (INR)', min: 10000, max: 200000, step: 5000 },
        { key: 'NEAR_THRESHOLD_BAND', label: 'Structuring Band Factor (e.g. 0.86 = 86% of threshold)', min: 0.5, max: 0.99, step: 0.01 },
        { key: 'NEAR_THRESHOLD_MIN_COUNT', label: 'Minimum Repeat Count', min: 2, max: 10, step: 1 }
      ],
      modifiers: [
        { key: 'NEAR_THRESHOLD_PATTERN', label: 'Near Threshold Pattern Match' },
        { key: 'HIGH_FREQUENCY_SHORT_WINDOW', label: 'High Frequency Short Window Burst' },
        { key: 'MULTIPLE_NEW_BENEFICIARIES', label: 'Multiple New Beneficiaries Hit' },
        { key: 'MANY_TO_ONE_CONVERGENCE', label: 'Many-to-One Convergence Hit' },
        { key: 'KNOWN_BENEFICIARY', label: 'Known Beneficiary Mitigator (Negative)', isNegative: true },
        { key: 'SALARY_PATTERN', label: 'Salary Pattern Mitigator (Negative)', isNegative: true },
        { key: 'UTILITY_PAYMENT', label: 'Utility Bill Mitigator (Negative)', isNegative: true }
      ]
    },
    {
      id: 'LAYERING',
      title: 'Layering Rule (Rule 2)',
      desc: 'Traces graph hops forward through shells, mules, and geographical jumps to detect money laundering trails.',
      maxKey: 'LAYERING_MAX',
      stateKey: 'LAYERING',
      params: [
        { key: 'LAYERING_MIN_HOPS', label: 'Minimum Chain Hop Depth', min: 2, max: 6, step: 1 },
        { key: 'LAYERING_HOP_TIME_SUSPICIOUS_SEC', label: 'Suspicious Hop Gap Threshold (seconds)', min: 10, max: 600, step: 10 },
        { key: 'LAYERING_PRESERVATION_RATIO', label: 'Pass-through Preservation Ratio (e.g. 0.90 = 90% forwarded)', min: 0.5, max: 0.99, step: 0.01 }
      ],
      modifiers: [
        { key: 'FAST_HOP_TIME', label: 'Extremely Fast Hop Penalty' },
        { key: 'HIGH_PRESERVATION', label: 'High Fund Preservation Ratio' },
        { key: 'CIRCULAR_DETECTED', label: 'Circular Cycle Found (A→B→C→A)' },
        { key: 'SHELL_ACCOUNT_HOP', label: 'Shell/Mule Intermediate Hop' },
        { key: 'GEO_CROSSING', label: 'Geographic Boundary Crossing' }
      ]
    },
    {
      id: 'FAN_OUT',
      title: 'Fan-Out Rule (Rule 3)',
      desc: 'Detects rapid fund dispersal from one source to many unknown destinations.',
      maxKey: 'FAN_OUT_MAX',
      stateKey: 'FAN_OUT',
      params: [
        { key: 'FAN_OUT_MIN_RECEIVERS', label: 'Minimum Destination Receivers', min: 3, max: 15, step: 1 },
        { key: 'FAN_OUT_NEW_BENEFICIARY_RATIO', label: 'Ratio of First-Time Receivers', min: 0.5, max: 0.95, step: 0.05 }
      ],
      modifiers: [
        { key: 'EQUAL_DISTRIBUTION', label: 'Near-Equal Splits Distribution' },
        { key: 'UNKNOWN_RECEIVERS', label: 'Mostly Unknown Target Receivers' },
        { key: 'RECONVERGENCE', label: 'Reconvergence Flow Detected (Fan-In)' }
      ]
    },
    {
      id: 'DORMANT',
      title: 'Dormant Account Activation (Rule 4)',
      desc: 'Flags long-inactive accounts suddenly receiving large inflows and immediately draining them.',
      maxKey: 'DORMANT_MAX',
      stateKey: 'DORMANT',
      params: [
        { key: 'DORMANT_DAYS', label: 'Inactivity Period (Days)', min: 30, max: 360, step: 10 },
        { key: 'DORMANT_RAPID_FORWARD_MIN', label: 'Post-Activation Outflow Window (Minutes)', min: 5, max: 180, step: 5 },
        { key: 'DORMANT_FORWARD_RATIO', label: 'Outflow Drain Ratio', min: 0.5, max: 0.95, step: 0.05 }
      ],
      modifiers: [
        { key: 'FAST_FORWARD_POST_ACTIVATION', label: 'Immediate Post-Activation Outflow' },
        { key: 'ACTIVATED_BY_SUSPICIOUS', label: 'Source is Flagged/Suspicious' },
        { key: 'MULTIPLE_DORMANT_SAME_SENDER', label: 'Sender Activates Multiple Dormant Accounts' },
        { key: 'DORMANT_SALARY_MATCH', label: 'Salary Pattern Mitigator (Negative)', isNegative: true }
      ]
    },
    {
      id: 'VELOCITY',
      title: 'Velocity Rule (Rule 5)',
      desc: 'Detects sudden bursts of transactions deviating sharply from customer historical averages.',
      maxKey: 'VELOCITY_MAX',
      stateKey: 'VELOCITY',
      params: [
        { key: 'VELOCITY_WINDOW_MS', label: 'Velocity Window (Minutes)', min: 5, max: 120, step: 5, multiplier: 60000 },
        { key: 'VELOCITY_BURST_MULTIPLIER', label: 'Activity Baseline Multiplier (e.g. 3 = 3x avg)', min: 1.5, max: 10, step: 0.5 },
        { key: 'VELOCITY_MAX_INTERVAL_FAST_SEC', label: 'Bot-Like Interval Threshold (Seconds)', min: 5, max: 120, step: 5 }
      ],
      modifiers: [
        { key: 'BURST_HIGH_COUNT', label: 'Count Multiplier Exceeded' },
        { key: 'BURST_HIGH_VALUE', label: 'Value Multiplier Exceeded' },
        { key: 'NIGHT_SESSION', label: 'Unusual Night Hour Activity (11PM-5AM)' },
        { key: 'SESSION_TOO_FAST', label: 'Automated/Bot-Like Interval' }
      ]
    },
    {
      id: 'MULE_RISK',
      title: 'Behavioral Money Mule (Rule 6)',
      desc: 'Runs composite behavioral profiling. Combines balance, inflow structure, and kyc levels to detect mule targets.',
      maxKey: 'MULE_RISK_MAX',
      stateKey: 'MULE_RISK',
      params: [
        { key: 'MIN_UNIQUE_SENDERS', label: 'Minimum Inbound Send Senders', min: 2, max: 10, step: 1, objectPath: 'MULE' },
        { key: 'LOW_BALANCE_THRESHOLD_INR', label: 'Mule Balance Cap Limit (INR)', min: 100, max: 5000, step: 100, objectPath: 'MULE' },
        { key: 'FIRST_TIME_SENDER_RATIO', label: 'One-Time Senders Ratio', min: 0.5, max: 0.95, step: 0.05, objectPath: 'MULE' }
      ],
      modifiers: [
        { key: 'SCORE_MANY_UNRELATED_SENDERS', label: 'Many Unrelated Inbound Senders Penalty', objectPath: 'MULE' },
        { key: 'SCORE_PASS_THROUGH', label: 'Rapid Forwarding Pass-Through Penalty', objectPath: 'MULE' },
        { key: 'SCORE_LOW_BALANCE', label: 'Minimal Balance Draining Penalty', objectPath: 'MULE' },
        { key: 'SCORE_FIRST_TIME_SENDERS', label: 'Mostly One-Time Senders Penalty', objectPath: 'MULE' },
        { key: 'SCORE_PRIOR_ALERTS', label: 'Prior AML Alerts History Penalty', objectPath: 'MULE' },
        { key: 'SCORE_LOW_KYC', label: 'Low Profile KYC Penalty', objectPath: 'MULE' }
      ]
    }
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: 'linear-gradient(135deg, rgba(26,108,188,0.3), rgba(15,122,82,0.2))',
          border: '1px solid rgba(26,108,188,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(26,108,188,0.2)',
        }}>
          <Shield size={22} color="#4a9eff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            AML Rule Engine Settings & Simulator
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 5 }}>
            Fine-tune detection parameters, weights, and simulate transactions step-by-step to minimize false positives.
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
        <button
          onClick={() => setActiveTab('tuning')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'tuning' ? 'rgba(26,108,188,0.18)' : 'transparent',
            color: activeTab === 'tuning' ? 'var(--blue-2)' : 'var(--text-3)',
          }}
        >
          <Sliders size={14} />
          Rule Weights & Threshold Tuning
        </button>
        <button
          onClick={() => setActiveTab('trace')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'trace' ? 'rgba(15,122,82,0.15)' : 'transparent',
            color: activeTab === 'trace' ? '#10b981' : 'var(--text-3)',
          }}
        >
          <Play size={14} />
          Step-by-Step Trace Tester
        </button>
      </div>

      {/* Save Button Bar */}
      {activeTab === 'tuning' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button
            onClick={saveConfig}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, #1a6cbc, #125699)', color: '#fff', border: 'none',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(26,108,188,0.3)',
              transition: 'opacity 0.2s'
            }}
          >
            {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Apply Live Changes'}
          </button>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'tuning' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: 24 }}>
          {ruleCards.map(rule => {
            const isEnabled = config.RULE_STATES[rule.stateKey];
            return (
              <div
                key={rule.id}
                className="glass-card"
                style={{
                  padding: 24,
                  opacity: isEnabled ? 1 : 0.65,
                  border: isEnabled ? '1px solid var(--border)' : '1px dashed var(--border-2)',
                  transition: 'opacity 0.3s, border-color 0.3s'
                }}
              >
                {/* Rule Title Card Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: isEnabled ? 'var(--text-1)' : 'var(--text-3)' }}>
                      {rule.title}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>
                      {rule.desc}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: isEnabled ? 'rgba(15,122,82,0.15)' : 'rgba(200,40,40,0.12)', color: isEnabled ? '#10b981' : '#f87171' }}>
                      {isEnabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                    <button
                      onClick={() => handleStateToggle(rule.stateKey)}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: isEnabled ? 'rgba(200,40,40,0.15)' : 'rgba(26,108,188,0.15)',
                        color: isEnabled ? '#f87171' : '#4a9eff'
                      }}
                    >
                      {isEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>

                {isEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20, borderTop: '1px solid var(--border-2)', paddingTop: 18 }}>
                    {/* Max Weight Sliders */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Maximum Rule Score Contribution Cap</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{config[rule.maxKey]} pts</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={config[rule.maxKey]}
                        onChange={(e) => handleMaxWeightChange(rule.maxKey, e.target.value)}
                        style={{ width: '100%', accentColor: 'var(--gold)' }}
                      />
                    </div>

                    {/* Parameters Settings */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        Trigger Thresholds
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {rule.params.map(param => {
                          const val = param.objectPath === 'MULE'
                            ? config.MULE[param.key]
                            : config.BEHAVIOUR[param.key];
                          const displayVal = param.multiplier ? val / param.multiplier : val;
                          
                          return (
                            <div key={param.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <label style={{ fontSize: 12, color: 'var(--text-2)' }}>{param.label}</label>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#4a9eff' }}>
                                  {param.key.includes('THRESHOLD_INR') ? `₹${displayVal.toLocaleString('en-IN')}` : displayVal}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                value={displayVal}
                                onChange={(e) => {
                                  const realValue = param.multiplier ? Number(e.target.value) * param.multiplier : Number(e.target.value);
                                  if (param.objectPath === 'MULE') {
                                    setConfig(prev => {
                                      const updatedMule = { ...prev.MULE, [param.key]: realValue };
                                      return { ...prev, MULE: updatedMule };
                                    });
                                  } else {
                                    handleBehaviourChange(param.key, realValue);
                                  }
                                }}
                                style={{ width: '100%', accentColor: '#4a9eff' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Score Modifiers */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        Score Modifiers & Multipliers
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {rule.modifiers.map(mod => {
                          const val = mod.objectPath === 'MULE'
                            ? config.MULE[mod.key]
                            : config.MODIFIERS[mod.key];
                          return (
                            <div key={mod.key} style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 11.5, color: 'var(--text-2)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                {mod.label}
                              </span>
                              <input
                                type="number"
                                value={val}
                                onChange={(e) => {
                                  if (mod.objectPath === 'MULE') {
                                    setConfig(prev => {
                                      const updatedMule = { ...prev.MULE, [mod.key]: Number(e.target.value) };
                                      return { ...prev, MULE: updatedMule };
                                    });
                                  } else {
                                    handleModifierChange(mod.key, e.target.value);
                                  }
                                }}
                                style={{
                                  width: 54, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 4,
                                  color: mod.isNegative ? '#f87171' : '#10b981', textAlign: 'center', fontWeight: 600, fontSize: 12, padding: '3px 0'
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Trace Dry Run Tester Tab */
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 28, alignItems: 'start' }}>
          {/* Test Form */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Activity size={16} color="#10b981" />
              Configure Test Case
            </h3>

            <form onSubmit={runTest} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Sender Account</label>
                <select
                  value={testForm.sender}
                  onChange={(e) => setTestForm(p => ({ ...p, sender: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text-1)', fontSize: 12.5 }}
                >
                  <option value="">Select Account</option>
                  {accounts.map(acc => (
                    <option key={acc.account_id} value={acc.account_id}>
                      {acc.account_id} — {acc.customer_name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Receiver Account</label>
                <select
                  value={testForm.receiver}
                  onChange={(e) => setTestForm(p => ({ ...p, receiver: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text-1)', fontSize: 12.5 }}
                >
                  <option value="">Select Account</option>
                  {accounts.map(acc => (
                    <option key={acc.account_id} value={acc.account_id}>
                      {acc.account_id} — {acc.customer_name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Transfer Amount (INR)</label>
                <input
                  type="number"
                  value={testForm.amount}
                  onChange={(e) => setTestForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="e.g. 48500"
                  style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text-1)', fontSize: 12.5 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Tx Type</label>
                  <select
                    value={testForm.transaction_type}
                    onChange={(e) => setTestForm(p => ({ ...p, transaction_type: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 12 }}
                  >
                    {['UPI', 'IMPS', 'NEFT', 'RTGS', 'WIRE'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Channel</label>
                  <select
                    value={testForm.channel}
                    onChange={(e) => setTestForm(p => ({ ...p, channel: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 12 }}
                  >
                    {['MOBILE', 'NET_BANKING', 'API'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={testing}
                style={{
                  width: '100%', padding: '12px 18px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #0f766e)', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 12,
                  boxShadow: '0 4px 12px rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {testing ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />}
                {testing ? 'Analyzing Trace...' : 'Run AML Rule Trace'}
              </button>
            </form>
          </div>

          {/* Test Results Output */}
          <div className="glass-card" style={{ padding: 24, minHeight: 480 }}>
            {testResult ? (
              <div>
                {/* Result Summary Bar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, padding: 18, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-2)', marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Composite Score</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: testResult.result.finalScore >= 60 ? 'var(--danger-2)' : testResult.result.finalScore >= 30 ? 'var(--gold)' : 'var(--success-2)' }}>
                      {testResult.result.finalScore} / 100
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Classification</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 4 }}>
                      {testResult.result.riskLevel}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Investigator Action</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#4a9eff', marginTop: 4 }}>
                      {testResult.result.action}
                    </div>
                  </div>
                </div>

                {/* Explanation text */}
                <div style={{ marginBottom: 28 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Rationale Explanation</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: 14, lineHeight: 1.5 }}>
                    {testResult.result.explanation.summary}
                  </p>
                </div>

                {/* Trace list one-by-one */}
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 14 }}>One-by-One Detection Check Breakdown</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {testResult.result.traces.map(trace => {
                    return (
                      <div key={trace.ruleName} style={{ border: '1px solid var(--border-2)', borderRadius: 8, overflow: 'hidden' }}>
                        {/* Header of Rule Trace */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-2)' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#4a9eff' }}>{trace.ruleName}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: trace.score > 0 ? 'var(--gold)' : 'var(--text-3)' }}>
                            Contribution: +{trace.score} (Raw: {trace.rawScore ?? trace.score})
                          </span>
                        </div>

                        {/* List of subchecks */}
                        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(0,0,0,0.1)' }}>
                          {trace.checks.length > 0 ? (
                            trace.checks.map((chk, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <div style={{ marginTop: 2 }}>
                                  {chk.matched ? (
                                    <AlertTriangle size={14} color={chk.scoreEffect < 0 ? '#4a9eff' : '#ef4444'} />
                                  ) : (
                                    <Check size={14} color="#22c55e" />
                                  )}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: chk.matched ? 'var(--text-1)' : 'var(--text-3)' }}>
                                      {chk.name}
                                    </span>
                                    {chk.matched && (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: chk.scoreEffect < 0 ? '#3b82f6' : '#ef4444' }}>
                                        {chk.scoreEffect < 0 ? '' : '+'}{chk.scoreEffect} pts
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                                    {chk.description}
                                  </div>
                                  <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: chk.matched ? 'var(--gold)' : 'var(--text-3)', marginTop: 4, background: 'rgba(255,255,255,0.01)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                                    {chk.details}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                              Rule was bypassed or no checks triggered.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexcol: 'true', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', minHeight: 400 }}>
                <div style={{ textAlign: 'center' }}>
                  <Eye size={42} color="var(--border)" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13.5 }}>Configure a test transaction and trigger a trace check to view execution telemetry.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
