/**
 * OrganizationContext — active organization + its membership role.
 * Thin wrapper over AuthContext so pages can depend on one clear concept.
 */
import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const OrganizationContext = createContext(null);

export function OrganizationProvider({ children }) {
  const auth = useAuth();

  const value = useMemo(() => {
    const activeId = auth.activeOrganizationId;
    const membership = (auth.user?.memberships || []).find(m => m.orgId === activeId) || null;
    return {
      activeOrganization: auth.activeOrganization,
      activeOrganizationId: activeId,
      organizations: auth.organizations,
      role: membership?.role || auth.role,
      permissions: auth.permissions,
      isStaff: ['staff', 'security', 'admin', 'owner'].includes(auth.role),
      isManager: ['admin', 'owner'].includes(auth.role),
      switchOrganization: auth.switchOrg,
      hasOrganization: Boolean(activeId)
    };
  }, [auth]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization must be used inside <OrganizationProvider>');
  return ctx;
}
