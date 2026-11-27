import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';
import { PATHS } from './paths';

interface ProtectedRouteProps {
  children?: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const initError = useAuthStore((state) => state.initError);
  const initialize = useAuthStore((state) => state.initialize);
  const resetSession = useAuthStore((state) => state.resetSession);
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
      return (
        <div
          data-testid="session-init-error"
          className="bg-background text-text flex min-h-screen items-center justify-center p-6"
        >
          <Card className="w-full max-w-md">
            <CardHeader
              title="Unable to restore your session"
              description="Your saved session is still intact, but the server could not be reached."
            />
            <div className="flex flex-col gap-4 p-4">
              <Alert variant="danger" title="Connection error">
                {initError}
              </Alert>
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => resetSession()}>
                  Sign in again
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    void initialize();
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return <Navigate to={PATHS.LOGIN} state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
