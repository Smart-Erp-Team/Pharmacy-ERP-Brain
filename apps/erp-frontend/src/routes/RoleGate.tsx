import type { ReactNode } from 'react';
import { ForbiddenPage } from '../features/errors/pages/ForbiddenPage';
import { useAuth } from '../hooks/useAuth';
import { hasAnyRole } from '../lib/auth/permissions';
import { PATHS } from './paths';
import type { Role } from '../types/api';

interface RoleGateProps {
  allowedRoles: readonly Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Role gate (skill `routing-auth`): role checks are for UX only, the backend
 * stays the real security. A user without the role sees the 403 screen.
 */
export function RoleGate({ allowedRoles, children, fallback }: RoleGateProps) {
  const { roles } = useAuth();

  if (!hasAnyRole(roles, allowedRoles)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    return (
      <ForbiddenPage
        homePath={PATHS.HOME}
        reason={`Allowed roles: ${allowedRoles.join(', ')}`}
      />
    );
  }

  return <>{children}</>;
}
