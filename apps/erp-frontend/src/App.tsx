import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ToastHost } from './components/ui/ToastHost';
import { PATHS, router } from './routes';
import { queryClient } from './lib/queryClient';
import { registerSessionEndHandler } from './lib/auth/sessionEvents';
import { useAuthStore } from './stores/authStore';

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    // The Axios client lives outside React, so it announces the end of a session
    // here and this handler reacts to it: reset the session, clear the cached
    // server data, tell the user and go back to the login page.
    registerSessionEndHandler((reason) => {
      useAuthStore.getState().resetSession();

      if (reason === 'expired') {
        toast.error('Your session has expired. Please sign in again.');
      }

      void router.navigate(PATHS.LOGIN, { replace: true });
    });

    return () => registerSessionEndHandler(null);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <>
        <RouterProvider router={router} />
        <ToastHost />
      </>
    </QueryClientProvider>
  );
}
