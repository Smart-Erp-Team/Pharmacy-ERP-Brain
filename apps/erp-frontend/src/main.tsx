import './styles/main.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

async function prepareApp() {
  const isMswEnabled =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW !== 'false';
  if (isMswEnabled) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
    });
  }
}

prepareApp().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
