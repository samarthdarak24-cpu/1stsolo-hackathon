/**
 * AuthContext — current user, session, org memberships, role, permissions.
 * The active organization is persisted server-side (PATCH switch-org) and the
 * cached user is refreshed so role/permissions are always server-authoritative.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { tokenStore } from '../lib/api';

const AuthContext = createContext(null);

const PERMISSIONS = {
  member: ['report:create', 'report:view-own', 'match:view', 'verification:answer', 'return:view-own', 'return:use-qr', 'profile:edit', 'notification:view'],
  staff: ['report:create', 'report:view-own', 'report:view-all', 'report:update-status', 'match:view', 'match:review', 'verification:answer', 'verification:review', 'return:view-own', 'return:view-all', 'return:authorize', 'return:complete', 'custody:view', 'profile:edit', 'notification:view'],
  security: ['report:create', 'report:view-all', 'match:view', 'verification:view', 'return:view-all', 'return:authorize', 'return:complete', 'custody:view', 'profile:edit', 'notification:view'],
  admin: ['report:create', 'report:view-own', 'report:view-all', 'report:update-status', 'match:view', 'match:review', 'verification:answer', 'verification:review', 'return:view-own', 'return:view-all', 'return:authorize', 'return:complete', 'custody:view', 'analytics:view-org', 'audit:view', 'org:settings', 'org:members', 'org:invite', 'profile:edit', 'notification:view'],
  owner: ['report:create', 'report:view-own', 'report:view-all', 'report:update-status', 'match:view', 'match:review', 'verification:answer', 'verification:review', 'return:view-own', 'return:view-all', 'return:authorize', 'return:complete', 'custody:view', 'analytics:view-org', 'audit:view', 'org:settings', 'org:members', 'org:invite', 'org:transfer', 'profile:edit', 'notification:view']
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ token: tokenStore.get(), user: tokenStore.user() });
  const [activeOrg, setActiveOrg] = useState(null);
  const [activeRole, setActiveRole] = useState(session.user?.memberships?.find(m => m.orgId === session.user?.activeOrgId)?.role || null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(Boolean(session.token));
  const qc = useQueryClient();

  const applySession = useCallback((payload) => {
    tokenStore.set(payload.token);
    tokenStore.setUser(payload.user);
    setSession({ token: payload.token, user: payload.user });
    setActiveOrg(payload.activeOrganization || null);
    setActiveRole(payload.activeRole || null);
    setOrganizations(payload.organizations || []);
  }, []);

  // Validate the stored token on boot; a dead token logs the user out cleanly.
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!session.token) { setLoading(false); return; }
      try {
        const payload = await api.me();
        if (!cancelled) applySession(payload);
      } catch {
        if (!cancelled) {
          tokenStore.clear();
          setSession({ token: null, user: null });
          setActiveOrg(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    boot();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const payload = await api.login(email, password);
    applySession(payload);
    return payload;
  }, [applySession]);

  const register = useCallback(async (form) => {
    const payload = await api.register(form);
    applySession(payload);
    return payload;
  }, [applySession]);

  const logout = useCallback(() => {
    tokenStore.clear();
    setSession({ token: null, user: null });
    setActiveOrg(null);
    setActiveRole(null);
    setOrganizations([]);
    qc.clear();
  }, [qc]);

  const switchOrg = useCallback(async (orgId) => {
    const payload = await api.switchOrg(orgId);
    applySession(payload);
    // Force every org-scoped query to refetch under the new tenant.
    qc.invalidateQueries();
    return payload;
  }, [applySession, qc]);

  const refresh = useCallback(async () => {
    if (!session.token) return null;
    const payload = await api.me();
    applySession(payload);
    return payload;
  }, [session.token, applySession]);

  const createOrg = useCallback(async (payload) => {
    const result = await api.createOrg(payload);
    // The create-org endpoint now returns a full auth payload (token + user +
    // organizations + activeRole …) so we can apply it directly without a
    // second /me round-trip.  The old code called api.me() after the fact,
    // which meant there was a brief moment where the session had no org role
    // and the router sent the new owner to /dashboard instead of /organization.
    applySession(result);
    qc.invalidateQueries();
    return result;
  }, [applySession, qc]);

  const user = session.user;
  const permissions = useMemo(() => PERMISSIONS[activeRole] || [], [activeRole]);
  const can = useCallback((permission) => permissions.includes(permission), [permissions]);
  const isOrgAdmin = activeRole === 'owner' || activeRole === 'admin';
  // Staff and security hold org permissions (match:review, return:authorize),
  // so they belong in the organization portal too - mirrors the backend STAFF
  // role group in routes/api.js.
  const isStaff = activeRole === 'staff' || activeRole === 'security';
  const canAccessOrg = isOrgAdmin || isStaff;

  const value = useMemo(() => ({
    user,
    token: session.token,
    activeOrganization: activeOrg,
    activeOrganizationId: user?.activeOrgId || activeOrg?.id || null,
    organizations,
    role: activeRole,
    permissions,
    can,
    isOrgAdmin,
    isStaff,
    canAccessOrg,
    isAuthenticated: Boolean(session.token && user),
    loading,
    login,
    register,
    createOrg,
    logout,
    switchOrg,
    refresh
  }), [user, session.token, activeOrg, organizations, activeRole, permissions, can, isOrgAdmin, isStaff, canAccessOrg, loading, login, register, createOrg, logout, switchOrg, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
