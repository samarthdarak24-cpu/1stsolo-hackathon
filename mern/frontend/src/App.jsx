import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import LandingLink from './pages/LandingLink';

// user pages
import UserDashboard from './pages/UserDashboard';
import SearchPage from './pages/Search';
import CreateOrganization from './pages/CreateOrganization';
import ReportCase from './pages/ReportCase';
import Recovery from './pages/Recovery';
import AIMatches from './pages/AIMatches';
import MatchDetail from './pages/MatchDetail';
import ReportDetail from './pages/ReportDetail';
import NotificationsPage from './pages/Notifications';
import ReturnQr from './pages/ReturnQr';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import VerifyOwnership from './pages/VerifyOwnership';

// org pages
import OrgDashboard from './pages/OrgDashboard';
import OrgRecoveryQueue from './pages/organization/OrgRecoveryQueue';
import OrgMatchDetail from './pages/organization/OrgMatchDetail';
import OrgVerification from './pages/organization/OrgVerification';
import OrgOperations from './pages/organization/OrgOperations';
import OrgInsights from './pages/organization/OrgInsights';
import OrgPeopleSettings from './pages/organization/OrgPeopleSettings';

/**
 * Full-page states that render before the shell can decide what to show.
 * Both are exported so the router and the auth guard share one implementation.
 */
export function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" />
        <p className="text-sm font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/**
 * Gate for authenticated areas.
 *
 * `orgOnly` requires an organization role (staff, security, admin, owner) and
 * `adminOnly` narrows that further to admin/owner. A denied org route sends the
 * user to the dashboard their role actually works rather than bouncing them to
 * /login, which used to make the portal look broken to staff accounts.
 */
function RequireAuth({ children, orgOnly = false, adminOnly = false }) {
  const { isAuthenticated, loading, isOrgAdmin, canAccessOrg } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if ((orgOnly || adminOnly) && !canAccessOrg) return <Navigate to="/dashboard" replace />;
  if (adminOnly && !isOrgAdmin) return <Navigate to="/organization/overview" replace />;
  return children;
}

function RootRedirect() {
  const { isAuthenticated, loading, canAccessOrg } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <LandingLink />;
  return <Navigate to={canAccessOrg ? '/organization/overview' : '/dashboard'} replace />;
}

/**
 * A detail URL that moved keeps its id.
 *
 * These four are trivial redirectors rather than one clever pattern match because
 * each old prefix maps to a DIFFERENT new prefix, and dropping the id would send
 * someone who clicked "match 42" to an unrelated list. Reads the params from the
 * route rather than the pathname so it cannot depend on the old syntax.
 */
function LegacyMatchRedirect({ suffix = '' }) {
  const { id } = useParams();
  return <Navigate to={`/matches/${id}${suffix}`} replace />;
}

function OrgMatchRedirect() {
  const { id } = useParams();
  return <Navigate to={`/organization/recovery/${id}`} replace />;
}

function ReportRedirect() {
  const { id } = useParams();
  return <Navigate to={`/recovery/${id}`} replace />;
}

function ReturnRedirect() {
  const { id } = useParams();
  return <Navigate to={`/recovery/${id}/qr`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signin" element={<Navigate to="/login" replace />} />

      {/* The five member destinations. Each one is a shell that owns the sub-
          features; the individual pages are still reachable at their own paths
          because detail screens (a match, a case, a QR) are addressed by id. */}
      <Route element={<RequireAuth><AppLayout variant="user" /></RequireAuth>}>
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/report" element={<ReportCase />} />
        <Route path="/matches" element={<AIMatches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/matches/:id/verify" element={<VerifyOwnership />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/recovery/:id" element={<ReportDetail />} />
        <Route path="/recovery/:id/qr" element={<ReturnQr />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />

        {/* Old URLs stay alive: bookmarks, notifications already sent, and other
            screens that still link to the pre-consolidation paths land on the
            right tab instead of a 404. */}
        <Route path="/report-lost" element={<Navigate to="/report?type=lost" replace />} />
        <Route path="/report-found" element={<Navigate to="/report?type=found" replace />} />
        <Route path="/ai-matches" element={<Navigate to="/matches" replace />} />
        <Route path="/ai-matches/:id" element={<LegacyMatchRedirect />} />
        <Route path="/ai-matches/:id/verify" element={<LegacyMatchRedirect suffix="/verify" />} />
        <Route path="/my-reports" element={<Navigate to="/recovery?tab=cases" replace />} />
        <Route path="/my-reports/:id" element={<ReportRedirect />} />
        <Route path="/track-return" element={<Navigate to="/recovery?tab=returns" replace />} />
        <Route path="/track-return/:id/qr" element={<ReturnRedirect />} />
      </Route>

      {/* Working the queue: staff, security, admin and owner all belong here. */}
      <Route element={<RequireAuth orgOnly><AppLayout variant="org" /></RequireAuth>}>
        <Route path="/organization/overview" element={<OrgDashboard />} />
        <Route path="/organization/recovery" element={<OrgRecoveryQueue />} />
        <Route path="/organization/recovery/:id" element={<OrgMatchDetail />} />
        <Route path="/organization/verification" element={<OrgVerification />} />
        <Route path="/organization/verification/:id" element={<OrgVerification />} />
        <Route path="/organization/operations" element={<OrgOperations />} />
        <Route path="/organization/people" element={<OrgPeopleSettings />} />

        {/* Analytics, audit and the model inventory are manager-only on the API,
            so Insights is gated the same way. Keeping the guard on the shell
            means a staff account cannot reach a tab through a deep link. */}
        <Route path="/organization/insights" element={<RequireAuth adminOnly><OrgInsights /></RequireAuth>} />

        {/* Old organization URLs, redirected into the consolidated sections. */}
        <Route path="/organization/dashboard" element={<Navigate to="/organization/overview" replace />} />
        <Route path="/organization/lost-found" element={<Navigate to="/organization/recovery?tab=reports" replace />} />
        <Route path="/organization/ai-matching" element={<Navigate to="/organization/recovery?tab=matches" replace />} />
        <Route path="/organization/ai-matching/:id" element={<OrgMatchRedirect />} />
        <Route path="/organization/items" element={<Navigate to="/organization/operations?tab=items" replace />} />
        <Route path="/organization/chain-of-custody" element={<Navigate to="/organization/operations?tab=custody" replace />} />
        <Route path="/organization/cctv" element={<Navigate to="/organization/operations?tab=last-seen" replace />} />
        <Route path="/organization/analytics" element={<Navigate to="/organization/insights" replace />} />
        <Route path="/organization/audit-logs" element={<Navigate to="/organization/insights?tab=audit" replace />} />
        <Route path="/organization/users" element={<Navigate to="/organization/people" replace />} />
        <Route path="/organization/settings" element={<Navigate to="/organization/people?tab=settings" replace />} />
      </Route>

      {/* Organization onboarding is its own full-screen flow: a brand-new
          account has no organization yet, so it cannot render inside a shell
          that requires one. */}
      <Route path="/organizations/new" element={<RequireAuth><CreateOrganization /></RequireAuth>} />

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <ToastProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ToastProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}
