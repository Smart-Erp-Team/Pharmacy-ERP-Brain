import type { ReactNode } from 'react';
import { ForbiddenPage } from '../features/errors/pages/ForbiddenPage';
import { useAuth } from '../hooks/useAuth';
import { hasAllPermissions } from '../lib/auth/permissions';
import { PATHS } from './paths';
import type { PermissionScope } from '../types/api';

interface ScopeGateProps {
  requiredScopes: readonly PermissionScope[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Scope gate (skill `routing-auth`): enforces the contract permission scopes
 * alongside RoleGate and RuntimeGate so direct URL navigation matches sidebar
 * visibility in `layouts/navItems.ts`.
 */
export function ScopeGate({
  requiredScopes,
  children,
  fallback,
}: ScopeGateProps) {
  const { scopes } = useAuth();

  if (!hasAllPermissions(scopes, requiredScopes)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    return (
      <ForbiddenPage
        homePath={PATHS.HOME}
        reason={`Required permissions: ${requiredScopes.join(', ')}`}
      />
    );
  }

  return <>{children}</>;
}
