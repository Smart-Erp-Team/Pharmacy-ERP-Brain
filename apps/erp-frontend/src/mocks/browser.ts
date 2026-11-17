/**
 * Pharmacy ERP — MSW Browser Worker
 *
 * Configures Mock Service Worker for client-side API interception in dev/mock mode.
 */

import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export interface E2eMockResponse {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

export interface E2eRequestGate {
  wait: Promise<void>;
  notifySeen: () => void;
  seen: boolean;
  release: () => void;
}

export interface E2eMockController {
  responses: E2eMockResponse[];
  gates: Record<string, E2eRequestGate>;
}

declare global {
  interface Window {
    __ERP_E2E_MOCKS__?: E2eMockController;
  }
}

const e2eOverrideHandler = http.all('*', async ({ request }) => {
  const controller =
    typeof window !== 'undefined' ? window.__ERP_E2E_MOCKS__ : undefined;
  if (!controller) {
    return;
  }

  const pathname = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  const gateKey = `${method} ${pathname}`;
  const gate = controller.gates[gateKey];
  if (gate) {
    gate.notifySeen();
    await gate.wait;
  }

  const override = controller.responses.find(
    (item) => item.method.toUpperCase() === method && item.path === pathname
  );
  if (override) {
    return HttpResponse.text(JSON.stringify(override.body), {
      status: override.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const worker = setupWorker(e2eOverrideHandler, ...handlers);
