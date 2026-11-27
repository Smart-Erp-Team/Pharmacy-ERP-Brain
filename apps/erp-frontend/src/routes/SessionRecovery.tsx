import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';

export function SessionRecovery({ initError }: { initError: string }) {
  const initialize = useAuthStore((state) => state.initialize);
  const resetSession = useAuthStore((state) => state.resetSession);
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
