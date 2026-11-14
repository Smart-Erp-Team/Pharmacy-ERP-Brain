import type { ReactNode } from 'react';
import { ForbiddenPage } from '../features/errors/pages/ForbiddenPage';
import { useAuth } from '../hooks/useAuth';
import { PATHS } from './paths';
import type { RuntimeMode } from '../types/api';

interface RuntimeGateProps {
  allowedRuntimes: readonly RuntimeMode[];
  children: ReactNode;
}

/**
 * Runtime gate (contracts/FRONTEND.md §1): a route the current runtime does not
 * own answers 404/405 on the server, so the UI never offers it.
 */
export function RuntimeGate({ allowedRuntimes, children }: RuntimeGateProps) {
  const { runtime } = useAuth();

  if (!runtime || !allowedRuntimes.includes(runtime)) {
    return (
      <ForbiddenPage
        homePath={PATHS.HOME}
        reason={`This screen belongs to the ${allowedRuntimes.join(' / ')} runtime. The current runtime is ${
          runtime ?? 'unavailable'
        }.`}
      />
    );
  }

  return <>{children}</>;
}
