import { Component } from 'react';
import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';
import { tokenStore } from '../lib/api';

/**
 * ErrorBoundary — the last line of defence for a render-time crash.
 *
 * Every page handles its own fetch failures through ErrorState, but a thrown
 * render error (a bad `.map` over undefined, a chart with malformed data) would
 * otherwise unmount the whole app and show React Router's default developer
 * message. This keeps the failure inside the app chrome, hides the stack trace,
 * and gives the user two real ways out: retry, or sign out.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ui] render error caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleSignOut = () => {
    tokenStore.clear();
    window.location.hash = '/login';
  };

  render() {
    const { error } = this.state;
    const { children } = this.props;
    if (!error) return children;

    return (
      <div className="dot-pattern flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-7 w-7" />
          </span>

          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">
            This screen could not be displayed
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Something went wrong while rendering this page. Your data has not been
            changed — retrying usually clears it.
          </p>

          {/* The message is shown because it helps support, but never the stack. */}
          <p className="mt-4 break-words rounded-xl bg-slate-50 px-3.5 py-2.5 text-left font-mono text-[11px] leading-relaxed text-slate-500">
            {error.message || 'Unknown rendering error'}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={this.handleRetry}>
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
            <Button variant="secondary" onClick={this.handleReload}>
              <RotateCcw className="h-4 w-4" /> Reload the app
            </Button>
            <Button variant="ghost" onClick={this.handleSignOut}>
              Sign out
            </Button>
          </div>

          <button
            onClick={() => { window.location.hash = '/dashboard'; }}
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
          >
            <Home className="h-3.5 w-3.5" /> Back to the dashboard
          </button>
        </div>
      </div>
    );
  }
}
