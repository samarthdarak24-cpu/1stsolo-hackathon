import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import { LogoPicker } from './organization/CreateOrganizationParts';

/* ---------------------------------- pieces --------------------------------- */

function FlowStep({ icon, label, active, done }) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 transition-all duration-500 ${
        active ? 'scale-105' : done ? 'opacity-70' : 'opacity-45'
      }`}
    >
      <span
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border transition-all ${
          done
            ? 'bg-brand-600 text-white border-brand-600'
            : active
              ? 'bg-white text-brand-600 border-2 border-brand-600 shadow-md'
              : 'bg-white text-slate-400 border-slate-200'
        }`}
      >
        {done ? '✓' : icon}
      </span>
      <span className={`text-[10px] font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

function FlowLine() {
  // The connector between recovery stages draws itself from the left, in sync
  // with the demo pipeline: the line "carries" the state from one step to the
  // next instead of being a static dash.
  return (
    <span className="relative my-3 h-[3px] w-8 overflow-hidden rounded-full bg-slate-200 sm:w-10">
      <span className="animate-flow absolute inset-0 rounded-full bg-brand-500" />
    </span>
  );
}

function OrgDetectionBanner({ org, domain, isFree }) {
  if (isFree) {
    return (
      <div className="animate-slide-down rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
        <span className="font-bold">No organization detected.</span> Continue with an invite code below.
      </div>
    );
  }
  if (org) {
    return (
      <div className="animate-slide-down rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm">✓</span>
        <div>
          <div className="text-[12px] text-emerald-900"><span className="font-bold">Organization detected:</span> {org.name}</div>
          <div className="text-[10px] text-emerald-700">@{domain} · members join automatically</div>
        </div>
      </div>
    );
  }
  return (
    <div className="animate-slide-down rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-2.5 text-[12px] text-brand-900">
      <span className="font-bold">No match for @{domain} yet.</span> You can still sign up with an invite code.
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-emerald-100 outline-none transition';

function ErrorBox({ message }) {
  if (!message) return null;
  // `animate-shake` + the key on the call site: the banner drops into the flow
  // and the form shakes ONCE per failed attempt. A shake that cannot be
  // re-triggered reads as "nothing happened".
  return (
    <div className="animate-slide-down rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12px] font-medium text-red-700">
      <div key={message} className="animate-shake">{message}</div>
    </div>
  );
}

/* ------------------------------ sub-form views ----------------------------- */

function SignInView({ onSwitch, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSuccess(email, password); // routing handled by LoginPage
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/*
        * These two fields carry an id, a name and an autocomplete hint on purpose.
        * The restyle dropped all three, which left the label unassociated with its
        * input (so a screen reader announced an unlabelled edit box) and stopped
        * password managers from offering to fill a sign-in form — the one place on
        * the whole product where autofill matters most.
        */}
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-slate-600 mb-1.5">Email</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">✉</span>
          <input
            id="email" name="email" autoComplete="email" inputMode="email"
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organization.com" className={`${inputCls} pl-10 pr-4`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔒</span>
          <input
            id="password" name="password" autoComplete="current-password"
            type={showPw ? 'text' : 'password'} required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password" className={`${inputCls} pl-10 pr-11`}
          />
          <button
            type="button" onClick={() => setShowPw(v => !v)} aria-label="Toggle password visibility"
            className="tappable absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
          >
            {showPw ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 text-slate-600 font-medium cursor-pointer">
          <input type="checkbox" defaultChecked className="rounded border-slate-300 text-brand-600 focus:ring-emerald-200" />
          Remember me
        </label>
        <a href="#/login" onClick={(e) => e.preventDefault()} className="text-brand-600 font-semibold hover:underline">
          Forgot password?
        </a>
      </div>

      <ErrorBox key={error} message={error} />

      <button
        type="submit" disabled={busy}
        className="tappable w-full py-3.5 rounded-full bg-brand-600 text-white font-bold text-sm hover:bg-brand-500 active:scale-[.98] transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy ? 'Signing in…' : <>Sign In <span>→</span></>}
      </button>

      <p className="text-center text-xs text-slate-500 pt-1">
        New here?{' '}
        <button type="button" onClick={() => onSwitch('signup')} className="text-brand-600 font-bold hover:underline">
          Create an account
        </button>
      </p>
    </form>
  );
}

function SignupChoiceView({ onChoice }) {
  return (
    <div className="space-y-3.5">
      <p className="text-sm text-slate-500 -mt-1">How will you use LostLink AI?</p>
      <button
        onClick={() => onChoice('join')}
        className="tappable w-full text-left rounded-2xl border-2 border-slate-200 bg-white p-4 hover:-translate-y-0.5 hover:shadow-soft hover:border-brand-600 hover:bg-emerald-50/40 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-brand-600 flex items-center justify-center text-lg group-hover:scale-105 transition">👥</span>
          <div>
            <div className="text-sm font-bold text-slate-900">Join an Organization</div>
            <div className="text-[12px] text-slate-500">I'm a student / employee / staff / member</div>
          </div>
          <span className="ml-auto text-slate-300 group-hover:text-brand-600 transition">→</span>
        </div>
      </button>
      <button
        onClick={() => onChoice('create')}
        className="tappable w-full text-left rounded-2xl border-2 border-slate-200 bg-white p-4 hover:-translate-y-0.5 hover:shadow-soft hover:border-brand-600 hover:bg-emerald-50/40 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center text-lg group-hover:scale-105 transition">🏫</span>
          <div>
            <div className="text-sm font-bold text-slate-900">Create an Organization</div>
            <div className="text-[12px] text-slate-500">I'm an organization administrator</div>
          </div>
          <span className="ml-auto text-slate-300 group-hover:text-brand-600 transition">→</span>
        </div>
      </button>
      <p className="text-center text-xs text-slate-500 pt-2">
        Already have an account?{' '}
        <button onClick={() => onChoice('signin')} className="text-brand-600 font-bold hover:underline">Sign In</button>
      </p>
    </div>
  );
}

function JoinOrgView({ onBack, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [detection, setDetection] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!email.includes('@') || email.length < 5) { setDetection(null); setNeedCode(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const result = await api.checkDomain(email);
        setDetection(result);
        setNeedCode(result.isFree || !result.organization);
      } catch { setDetection(null); setNeedCode(false); }
    }, 350);
    return () => timer.current && clearTimeout(timer.current);
  }, [email]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (needCode && !inviteCode.trim()) { setError('Invite code is required for this email'); return; }
    setBusy(true);
    try {
      await onSuccess({ name, email, password, inviteCode: needCode ? inviteCode.trim() : undefined });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-500 hover:text-slate-800">← Back</button>

      <div>
        <label htmlFor="join-name" className="block text-xs font-bold text-slate-600 mb-1.5">Full Name</label>
        <input id="join-name" name="name" autoComplete="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Samarth Patil" required />
      </div>

      <div>
        <label htmlFor="join-email" className="block text-xs font-bold text-slate-600 mb-1.5">Email</label>
        <input id="join-email" name="email" autoComplete="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="samarth@school.com" required />
      </div>

      {detection && <OrgDetectionBanner org={detection.organization} domain={detection.domain} isFree={detection.isFree} />}

      {needCode && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Organization Invite Code</label>
          <input className={inputCls} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
            placeholder="e.g. ABCS1234" />
          <p className="text-[11px] text-slate-400 mt-1">Free domains (gmail, yahoo…) can't be auto-matched — ask your organization for a code.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="join-password" className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
          <input id="join-password" name="new-password" autoComplete="new-password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required minLength={6} />
        </div>
        <div>
          <label htmlFor="join-confirm" className="block text-xs font-bold text-slate-600 mb-1.5">Confirm</label>
          <input id="join-confirm" name="confirm-password" autoComplete="new-password" type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••" required minLength={6} />
        </div>
      </div>

      <ErrorBox key={error} message={error} />

      <button type="submit" disabled={busy}
        className="tappable w-full py-3.5 rounded-full bg-brand-600 text-white font-bold text-sm hover:bg-brand-500 active:scale-[.98] transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 flex items-center justify-center gap-2">
        {busy ? 'Creating account…' : <>Create Account <span>→</span></>}
      </button>

      <p className="text-center text-[11px] text-slate-400">
        Your account connects automatically to your verified organization membership.
      </p>
    </form>
  );
}

function CreateOrgView({ onBack, onSuccess }) {
  // Step 1: admin account · Step 2: organization details
  const [step, setStep] = useState(1);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('school');
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  // The real value, not a filename: LogoPicker downscales the pick to a 256px
  // PNG and hands back that, and the API stores it on the tenant.
  const [logoUrl, setLogoUrl] = useState('');
  const [orgError, setOrgError] = useState('');

  const submitAccount = async (e) => {
    e.preventDefault();
    setAccountError('');
    setBusy(true);
    try {
      await onSuccess('account', { name: adminName, email, password });
      setStep(2);
      setBusy(false);
    } catch (err) {
      setAccountError(err.message);
      setBusy(false);
    }
  };

  const submitOrg = async (e) => {
    e.preventDefault();
    setOrgError('');
    setBusy(true);
    try {
      await onSuccess('org', { name, type, emailDomain: domain, location, logoUrl });
    } catch (err) {
      setOrgError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={step === 1 ? onBack : () => setStep(1)}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800">
        ← {step === 1 ? 'Back' : 'Back to account'}
      </button>

      <div className="flex items-center gap-2 text-[11px] font-bold">
        <span className={`px-2 py-0.5 rounded-full ${step === 1 ? 'bg-brand-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>1 · ADMIN ACCOUNT</span>
        <span className={`px-2 py-0.5 rounded-full ${step === 2 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>2 · ORGANIZATION</span>
      </div>

      {step === 1 && (
        <form onSubmit={submitAccount} className="space-y-4">
          <p className="text-sm text-slate-500">Create the administrator account that will own this organization.</p>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Full Name</label>
            <input className={inputCls} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Dana Whitfield" required />
          </div>
          <div>
            <label htmlFor="org-admin-email" className="block text-xs font-bold text-slate-600 mb-1.5">Admin Email</label>
            <input id="org-admin-email" name="email" autoComplete="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@abcschool.com" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
            <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters" required minLength={6} />
          </div>
          <ErrorBox message={accountError} />
          <button type="submit" disabled={busy}
            className="w-full py-3.5 rounded-full bg-brand-600 text-white font-bold text-sm hover:bg-brand-500 transition shadow-lg shadow-emerald-700/20 disabled:opacity-60">
            {busy ? 'Creating account…' : 'Continue →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitOrg} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Organization Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="ABC School" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Organization Type</label>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="school">School</option>
                <option value="college">College / University</option>
                <option value="company">Company</option>
                <option value="hospital">Hospital</option>
                <option value="office">Office</option>
                <option value="event">Event</option>
                <option value="campus">Campus</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Email Domain</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">@</span>
                <input className={`${inputCls} pl-8`} value={domain} onChange={(e) => setDomain(e.target.value)}
                  placeholder="abcschool.com" required />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Location</label>
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pune, Maharashtra" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Logo</label>
            {/* Same picker as the organization wizard, so a logo picked here is
                stored now rather than discarded at the end of signup. */}
            <LogoPicker value={logoUrl} onChange={setLogoUrl} name={name} />
          </div>
          <ErrorBox message={orgError} />
          <button type="submit" disabled={busy}
            className="tappable w-full py-3.5 rounded-full bg-brand-600 text-white font-bold text-sm hover:bg-brand-500 active:scale-[.98] transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? 'Creating organization…' : <>Create Organization <span>→</span></>}
          </button>
          <p className="text-center text-[11px] text-slate-400">
            Anyone with <strong>@{domain || 'your-domain'}</strong> email will join automatically. You become the OWNER.
          </p>
        </form>
      )}
    </div>
  );
}

function VerifyView({ email, onDone }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const verify = async () => {
    setBusy(true);
    try {
      await api.verifyEmail(email);
      setDone(true);
      setTimeout(onDone, 900);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-center py-2 space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl">
        ✉️
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-900">Verify your email</h3>
        <p className="text-xs text-slate-500 mt-1">We sent a verification link to <strong>{email}</strong>.</p>
      </div>
      {done
        ? <div className="animate-pop-in rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-bold text-emerald-700">✓ Email verified!</div>
        : <button onClick={verify} disabled={busy}
            className="w-full py-3 rounded-full bg-brand-950 text-white font-bold text-sm hover:bg-brand-900 transition">
            {busy ? 'Verifying…' : 'I verified — continue'}
          </button>}
      <p className="text-[11px] text-slate-400">(Demo: clicking the button verifies instantly.)</p>
    </div>
  );
}

function DashboardChoiceView({ onChoice, setPreferredDashboard }) {
  const handleChoice = (choice) => {
    if (choice === 'org-dashboard') {
      setPreferredDashboard('/org-dashboard');
      onChoice('signin');
    } else if (choice === 'user-dashboard') {
      setPreferredDashboard('/user-dashboard');
      onChoice('signin');
    } else {
      onChoice(choice);
    }
  };

  return (
    <div className="space-y-3.5">
      <p className="text-sm text-slate-500 -mt-1">How will you use LostLink AI?</p>
      <button
        onClick={() => handleChoice('org-dashboard')}
        className="tappable w-full text-left rounded-2xl border-2 border-slate-200 bg-white p-4 hover:-translate-y-0.5 hover:shadow-soft hover:border-brand-600 hover:bg-emerald-50/40 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-brand-600 flex items-center justify-center text-lg group-hover:scale-105 transition">🏫</span>
          <div>
            <div className="text-sm font-bold text-slate-900">Organization Dashboard</div>
            <div className="text-[12px] text-slate-500">I'm an admin / owner managing an organization</div>
          </div>
          <span className="ml-auto text-slate-300 group-hover:text-brand-600 transition">→</span>
        </div>
      </button>
      <button
        onClick={() => handleChoice('user-dashboard')}
        className="tappable w-full text-left rounded-2xl border-2 border-slate-200 bg-white p-4 hover:-translate-y-0.5 hover:shadow-soft hover:border-brand-600 hover:bg-emerald-50/40 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center text-lg group-hover:scale-105 transition">🎒</span>
          <div>
            <div className="text-sm font-bold text-slate-900">User Dashboard</div>
            <div className="text-[12px] text-slate-500">I'm a student / employee / member reporting lost items</div>
          </div>
          <span className="ml-auto text-slate-300 group-hover:text-brand-600 transition">→</span>
        </div>
      </button>
      <p className="text-center text-xs text-slate-500 pt-2">
        Don't have an account yet?{' '}
        <button onClick={() => handleChoice('signup')} className="text-brand-600 font-bold hover:underline">Create an account</button>
      </p>
    </div>
  );
}

/* -------------------------------- main page -------------------------------- */

export default function LoginPage() {
  const { login, register, createOrg, refresh } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('choose-dashboard'); // choose-dashboard | signin | signup | join | create | verify
  const [flowStep, setFlowStep] = useState(0);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [preferredDashboard, setPreferredDashboard] = useState(null);
  const stepTimer = useRef(null);

  useEffect(() => {
    stepTimer.current = setInterval(() => setFlowStep(s => (s + 1) % 4), 1600);
    return () => clearInterval(stepTimer.current);
  }, []);

  /**
   * Legacy dashboard URLs are translated here rather than at each call site.
   *
   * The chooser and every demo-login button passed '/org-dashboard' or
   * '/user-dashboard', neither of which is a route any more: the redirect only
   * worked because the catch-all happened to send people somewhere sensible.
   * Resolving it in one place keeps a real destination in the address bar — and
   * in the browser history — from the first frame after signing in.
   */
  const LEGACY_DASHBOARDS = {
    '/org-dashboard': '/organization/overview',
    '/user-dashboard': '/dashboard'
  };

  const routeToDashboard = (payload) => {
    const target = LEGACY_DASHBOARDS[preferredDashboard] || preferredDashboard
      || (payload?.dashboardType === 'org' ? '/organization/overview' : '/dashboard');
    navigate(target, { replace: true });
  };

  const handleLogin = async (email, password) => {
    const payload = await login(email, password);
    routeToDashboard(payload);
  };

  const handleDemoLogin = async (email, password, dashboard) => {
    setPreferredDashboard(dashboard);
    const payload = await login(email, password);
    routeToDashboard(payload);
  };

  // Join flow: Sign Up → Verify Email → Organization Found → Membership → Dashboard
  const handleRegister = async (payload) => {
    const result = await register(payload);
    if (result?.user && !result.user.isVerified) {
      setPendingEmail(result.user.email);
      setView('verify');
      return;
    }
    routeToDashboard(result);
  };

  const handleCreateOrg = async (phase, payload) => {
    if (phase === 'account') {
      // Register a new admin account, or sign in if the email already exists.
      try {
        await register({ name: payload.name, email: payload.email, password: payload.password });
      } catch (err) {
        if (err.status === 409) {
          // Email already exists — sign the user in instead so step 2 can proceed.
          await login(payload.email, payload.password);
        } else {
          throw err;
        }
      }
      // Don't route yet — let the two-step wizard advance to step 2 (org details).
      return;
    }
    // phase === 'org' — session exists; create the org and become OWNER.
    // The backend auto-verifies the creator so the email gate won't block navigation.
    // setPreferredDashboard before createOrg so routeToDashboard reads the right value.
    setPreferredDashboard('/organization/overview');
    const result = await createOrg(payload);
    routeToDashboard(result);
  };


  const afterVerify = async () => {
    const result = await refresh();
    routeToDashboard(result);
  };

  // `auth-surface` is the defined token — the root used to reference a class
  // that no longer existed, which left the login screen on a bare white page.
  // The washes are teal; a blue wash is what read as a blue page.
  return (
    <div className="auth-surface min-h-screen relative overflow-x-hidden">
      <header className="relative z-20 max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="#/" className="flex items-center gap-2.5"><Logo /></a>
        <a href="#/" className="hidden sm:inline-flex text-sm font-semibold text-slate-700 hover:text-brand-600 transition">
          ← Back to Home
        </a>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="stagger grid lg:grid-cols-2 gap-10 lg:gap-14 items-center min-h-[calc(100vh-160px)]">
          {/* LEFT — branding, same visual language as the landing page */}
          <section className="animate-fade-up hidden lg:block">
            <p className="font-handwriting text-2xl text-slate-600 mb-1">Lost Today. Found Tomorrow.</p>
            <p className="text-lg text-slate-500 mb-8 max-w-md">AI-powered recovery for every organization.</p>

            <h1 className="animate-fade-up text-4xl xl:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-6" style={{ animationDelay: '80ms' }}>
              Lost items don't have to be lost <span className="gradient-text">forever.</span>
            </h1>

            <div className="animate-fade-up rounded-3xl bg-white/70 backdrop-blur border border-white shadow-card p-6 max-w-lg" style={{ animationDelay: '160ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500">RECOVERY FLOW</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <FlowStep icon="🎒" label="Lost Item" active={flowStep === 0} done={flowStep > 0} />
                <FlowLine />
                <FlowStep icon="🤖" label="AI Match" active={flowStep === 1} done={flowStep > 1} />
                <FlowLine />
                <FlowStep icon="🛡️" label="Verified" active={flowStep === 2} done={flowStep > 2} />
                <FlowLine />
                <FlowStep icon="🤝" label="Returned" active={flowStep === 3} done={false} />
              </div>
              <div className="mt-5 rounded-2xl bg-[#fef9c3] border border-yellow-200/70 p-3.5">
                <p className="font-handwriting text-[19px] leading-snug text-slate-800">
                  Lost my black backpack near the library — blue stripe, laptop inside.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-medium text-slate-700">
                  {['Backpack', 'Library', '2:30 PM'].map(t => (
                    <span key={t} className="bg-yellow-100/70 border border-yellow-200/60 rounded-md px-1.5 py-0.5">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-8 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">✨ AI Matching</span>
              <span className="flex items-center gap-1.5">🛡️ Secure Return</span>
              <span className="flex items-center gap-1.5">👥 For Everyone</span>
            </div>
          </section>

          {/* RIGHT — authentication card */}
          <section className="animate-fade-up w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end" style={{ animationDelay: '120ms' }}>
            {/* Keyed on the view so every step of sign-in/sign-up re-enters
                instead of the card swapping its contents in place. */}
            <div key={view} className="animate-scale-in bg-white rounded-[28px] shadow-card border border-slate-100 p-7 sm:p-9">
              {view !== 'verify' && (
<div className="text-center mb-6">
                   <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome to LostLink AI</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {view === 'choose-dashboard' && 'Choose how you will use LostLink AI'}
                    {view === 'signin' && 'Sign in to your account to continue'}
                    {view === 'signup' && 'Create your LostLink account'}
                    {view === 'join' && 'Join your organization'}
                    {view === 'create' && 'Create your organization'}
                  </p>
                </div>
              )}

              {view === 'signin' && <SignInView onSwitch={setView} onSuccess={handleLogin} />}
              {view === 'choose-dashboard' && <DashboardChoiceView onChoice={setView} setPreferredDashboard={setPreferredDashboard} />}
              {view === 'signup' && <SignupChoiceView onChoice={setView} />}
              {view === 'join' && <JoinOrgView onBack={() => setView('signup')} onSuccess={handleRegister} />}
              {view === 'create' && <CreateOrgView onBack={() => setView('signup')} onSuccess={handleCreateOrg} />}
              {view === 'verify' && pendingEmail && <VerifyView email={pendingEmail} onDone={afterVerify} />}
            </div>

            <div className="animate-fade-up mt-4 rounded-2xl bg-white/70 backdrop-blur border border-white px-4 py-3 flex items-center gap-3" style={{ animationDelay: '260ms' }}>
              <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">🛡️</span>
              <div>
                <div className="text-[11px] font-bold text-slate-800">Your data is secure with us</div>
                <div className="text-[10px] text-slate-500">Industry-standard encryption · organization-isolated data</div>
              </div>
            </div>

            {/* Demo credentials for quick access */}
            <div className="animate-fade-up mt-4 rounded-2xl bg-white/70 backdrop-blur border border-white px-4 py-3" style={{ animationDelay: '320ms' }}>
              <div className="text-[11px] font-bold text-slate-800 mb-2">Demo Credentials <span className="font-medium text-slate-500">(password: lostlink123)</span></div>
              <div className="stagger-fast space-y-2 text-[12px]">
                <Button
                  onClick={() => handleDemoLogin('student@abcschool.com', 'lostlink123', '/dashboard')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">User Dashboard · ABC School</span>
                  <span className="text-sm text-emerald-600 font-mono">student@abcschool.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('admin@abcschool.com', 'lostlink123', '/organization/overview')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">Org Dashboard · ABC School</span>
                  <span className="text-sm text-emerald-600 font-mono">admin@abcschool.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('employee@xyzcompany.com', 'lostlink123', '/dashboard')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">User Dashboard · XYZ Company</span>
                  <span className="text-sm text-emerald-600 font-mono">employee@xyzcompany.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('security@abcschool.com', 'lostlink123', '/organization/overview')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">Security Desk · ABC School</span>
                  <span className="text-sm text-emerald-600 font-mono">security@abcschool.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('admin@techcorp.com', 'lostlink123', '/organization/overview')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">Org Dashboard · TechCorp</span>
                  <span className="text-sm text-emerald-600 font-mono">admin@techcorp.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('student@techcorp.com', 'lostlink123', '/dashboard')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">User Dashboard · TechCorp</span>
                  <span className="text-sm text-emerald-600 font-mono">student@techcorp.com</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('admin@cityhospital.org', 'lostlink123', '/organization/overview')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">Org Dashboard · City Hospital</span>
                  <span className="text-sm text-emerald-600 font-mono">admin@cityhospital.org</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('student@cityhospital.org', 'lostlink123', '/dashboard')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">User Dashboard · City Hospital</span>
                  <span className="text-sm text-emerald-600 font-mono">student@cityhospital.org</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('admin@hackathon.dev', 'lostlink123', '/organization/overview')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">Org Dashboard · Hackathon 2026</span>
                  <span className="text-sm text-emerald-600 font-mono">admin@hackathon.dev</span>
                </Button>
                <Button
                  onClick={() => handleDemoLogin('student@hackathon.dev', 'lostlink123', '/dashboard')}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="font-medium">User Dashboard · Hackathon 2026</span>
                  <span className="text-sm text-emerald-600 font-mono">student@hackathon.dev</span>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
