import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { SessionRecovery } from './SessionRecovery';
import { useAuthStore } from '../stores/authStore';
import { PATHS } from './paths';

interface ProtectedRouteProps {
  children?: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const initError = useAuthStore((state) => state.initError);
  const location = useLocation();

  if (isInitializing) {
    return (
      <div
        data-testid="loading-spinner"
        className="flex min-h-screen items-center justify-center bg-slate-900 text-white"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader className="h-8 w-8 animate-spin text-emerald-400" />
          <span className="text-sm font-medium text-slate-400">
            Loading session...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (initError) {
      return <SessionRecovery initError={initError} />;
    }

    return <Navigate to={PATHS.LOGIN} state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
