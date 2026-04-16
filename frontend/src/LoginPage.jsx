import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, ArrowLeft, Loader2, User, Lock, Mail, ChevronRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginPage = ({ onBack, initialMode = 'login' }) => {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const [view, setView] = useState('auth'); // auth, forgot, reset, verify-signup
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reset code');
      setView('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: resetCode, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      toast.success('Password reset successful! Please log in.');
      setView('auth');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister ? { email, password, name } : { email, password, rememberMe };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (isRegister) {
        setView('verify-signup');
      } else {
        login(data.token, data.user);
        if (data.user.email === 'admin@gmail.com') {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      if (err.message.includes('verify your email')) {
        setView('verify-signup');
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col overflow-hidden relative font-montserrat bg-white text-black">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)]" style={{ backgroundSize: '32px 32px' }} />
      <nav className="flex items-center justify-between px-12 py-8 relative z-10">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onBack}>
          <div className="w-8 h-8 rounded-lg bg-premium-accent flex items-center justify-center shadow-lg shadow-premium-accent/20 transition-transform group-hover:scale-110">
            <Video size={18} className="text-white" />
          </div>
          <span className="text-xl font-medium tracking-tight">smart<span className="font-black">Meet</span></span>
        </div>
        <button onClick={onBack} className="flex items-center gap-2 font-bold text-sm transition-all hover:opacity-70 active:scale-95 bg-transparent border-none cursor-pointer text-black">
          <ArrowLeft size={16} /> Back
        </button>
      </nav>

      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-[440px] p-12 rounded-[2.5rem] border shadow-2xl relative overflow-hidden bg-white border-black/5">
          {view === 'auth' && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-black tracking-tighter m-0 mb-2">{isRegister ? 'Join the Future' : 'Welcome Back'}</h1>
                <p className="text-sm font-medium text-black/50">{isRegister ? 'Create your smartMeet account' : 'Sign in to your dashboard'}</p>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <AnimatePresence mode="wait">
                  {isRegister && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <label className="text-xs font-semibold mb-2 block ml-1 text-black/60">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                        <input required type="text" placeholder="Full Name" className="w-full pl-12 pr-4 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100" value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <label className="text-xs font-semibold mb-2 block ml-1 text-black/60">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                    <input required type="email" placeholder="username@email.com" className="w-full pl-12 pr-4 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold ml-1 text-black/60">Password</label>
                    {!isRegister && <button type="button" onClick={() => setView('forgot')} className="text-xs font-bold text-black/40 hover:text-black transition-colors bg-transparent border-none cursor-pointer">Forgot Password?</button>}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                    <input required type={showPassword ? 'text' : 'password'} placeholder="Password" className="w-full pl-12 pr-12 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">{error}</div>}
                <button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-premium-accent text-black font-bold text-sm transition-all flex items-center justify-center gap-3 border-none cursor-pointer">{loading ? <Loader2 className="animate-spin" size={20} /> : <>{isRegister ? 'Register' : 'Sign In'} <ChevronRight size={18} /></>}</button>
              </form>
              <button onClick={() => setIsRegister(!isRegister)} className="w-full mt-8 text-xs font-bold text-black/50 hover:text-black transition-colors bg-transparent border-none cursor-pointer">{isRegister ? 'Already have an account? Sign In' : 'New to smartMeet? Create Account'}</button>
            </>
          )}

          {view === 'verify-signup' && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-3xl font-black tracking-tighter m-0 mb-2">Verify Email</h1>
                <p className="text-xs font-bold uppercase tracking-widest opacity-40">Enter the code sent to {email}</p>
              </div>
              <form onSubmit={handleVerifySignup} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-semibold mb-2 block ml-1 text-black/60">Verification Code</label>
                  <input required type="text" placeholder="000 000" className="w-full px-6 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100 text-center text-2xl tracking-[0.5em]" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} maxLength={6} />
                </div>
                {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">{error}</div>}
                <button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-premium-accent text-black font-bold text-sm transition-all flex items-center justify-center gap-3 border-none cursor-pointer">{loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify Account'}</button>
                <div className="flex flex-col gap-3 text-center">
                  <button type="button" disabled={loading} onClick={() => handleSubmit()} className="text-[10px] font-black uppercase tracking-widest text-premium-accent border-none bg-transparent cursor-pointer">Resend Code</button>
                  <button type="button" onClick={() => { setView('auth'); setIsRegister(true); }} className="text-[10px] font-black uppercase tracking-widest opacity-40 border-none bg-transparent cursor-pointer">Back to Signup</button>
                </div>
              </form>
            </div>
          )}

          {view === 'forgot' && (
            <div className="flex flex-col gap-6">
              <div><h1 className="text-3xl font-black tracking-tighter m-0 mb-2">Reset Password</h1><p className="text-xs font-bold uppercase tracking-widest opacity-40">Enter email for reset code</p></div>
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <input required type="email" placeholder="Email" className="w-full px-6 py-4 rounded-2xl border outline-none bg-gray-50" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-premium-accent text-black font-bold text-sm transition-all">{loading ? <Loader2 className="animate-spin" /> : 'Send Code'}</button>
                <button type="button" onClick={() => setView('auth')} className="text-xs font-bold text-black/40 hover:text-black transition-colors bg-transparent border-none cursor-pointer">Back to Login</button>
              </form>
            </div>
          )}

          {view === 'reset' && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-3xl font-black tracking-tighter m-0 mb-2">New Password</h1>
                <p className="text-sm font-medium text-black/50">Enter the code and your new password</p>
              </div>
              <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-semibold mb-2 block ml-1 text-black/60">Reset Code</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                    <input required type="text" placeholder="000000" className="w-full pl-12 pr-4 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100" value={resetCode} onChange={(e) => setResetCode(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-2 block ml-1 text-black/60">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                    <input required type={showPassword ? 'text' : 'password'} placeholder="New Password" className="w-full pl-12 pr-12 py-4 rounded-2xl border outline-none font-medium transition-all focus:ring-2 focus:ring-premium-accent/20 bg-gray-50 border-gray-100" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">{error}</div>}
                <button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-premium-accent text-black font-bold text-sm transition-all flex items-center justify-center gap-3 border-none cursor-pointer">{loading ? <Loader2 className="animate-spin" size={20} /> : 'Update Password'}</button>
              </form>
            </div>
          )}
        </motion.div>
      </main>
      <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-premium-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-[500px] h-[500px] bg-premium-danger/5 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
};

export default LoginPage;
