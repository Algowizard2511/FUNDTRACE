import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Eye, EyeOff, AlertTriangle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@fundtrace.ai');
  const [password, setPassword] = useState('FundTrace@2024');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Access granted. Welcome to FundTrace AI.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen cyber-grid flex items-center justify-center p-4" style={{ background: '#060b14' }}>
      {/* Animated background orbs */}
      <div style={{
        position: 'fixed', top: '10%', left: '10%', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none', animation: 'pulse 4s ease-in-out infinite'
      }} />
      <div style={{
        position: 'fixed', bottom: '10%', right: '10%', width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none', animation: 'pulse 5s ease-in-out infinite reverse'
      }} />

      <div className="w-full max-w-md animate-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(0,212,255,0.4)'
          }}>
            <Shield size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>
            <span className="text-gradient-accent">FundTrace AI</span>
          </h1>
          <p style={{ color: '#475569', fontSize: 14 }}>Intelligent Fund Flow Tracking • Fraud Detection</p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            padding: '4px 12px', borderRadius: 20,
            background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)'
          }}>
            <div className="pulse-dot" style={{ width: 6, height: 6 }} />
            <span style={{ fontSize: 11, color: '#00d4ff', fontWeight: 600 }}>LIVE FRAUD MONITORING</span>
          </div>
        </div>

        {/* Login Form */}
        <div className="glass-card p-8">
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Secure Access</h2>
            <p style={{ fontSize: 13, color: '#475569' }}>Authorized investigators only</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Email Address
              </label>
              <input
                type="email"
                className="cyber-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="investigator@fundtrace.ai"
                required
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="cyber-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#475569'
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full justify-center"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', fontSize: 15 }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />Authenticating...</>
              ) : (
                <><Zap size={16} />Access Intelligence Platform</>
              )}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <p style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Demo Credentials</p>
            <p style={{ fontSize: 12, color: '#00d4ff', fontFamily: 'monospace' }}>admin@fundtrace.ai / FundTrace@2024</p>
          </div>

          {/* Link to Signup */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#475569' }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{ color: '#00d4ff', fontWeight: 600, textDecoration: 'none' }}>
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#334155' }}>
          RBI AML Compliance Platform • Version 1.0 • Hackathon Demo
        </p>
      </div>
    </div>
  );
}
