import type { Page } from '@playwright/test';
import type {
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
} from '../../../src/types/api';

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

export interface RequestHoldHandle {
  waitUntilSeen: () => Promise<void>;
  release: () => Promise<void>;
}

export interface E2eMockErrorEntry {
  method: string;
  path: string;
  status: number;
  code: ErrorCode;
  message: string;
  traceId?: string;
  details?: NormalizedApiErrorDetail[];
}

export function buildApiErrorEnvelope(
  code: ErrorCode,
  message: string,
  traceId = 'e2e-trace-0001',
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope {
  return { error: { code, message, details, trace_id: traceId } };
}

export async function mockApiResponse(
  page: Page,
  entry: E2eMockResponse
): Promise<void> {
  const normalized: E2eMockResponse = {
    ...entry,
    method: entry.method.toUpperCase(),
  };
  const apply = (item: E2eMockResponse) => {
    const mocks = (window.__ERP_E2E_MOCKS__ ??= { responses: [], gates: {} });
    mocks.responses = [
      ...mocks.responses.filter(
        (cur) => !(cur.method === item.method && cur.path === item.path)
      ),
      item,
    ];
  };
  await page.addInitScript(apply, normalized);
  await page.evaluate(apply, normalized);
}

export async function mockApiError(
  page: Page,
  entry: E2eMockErrorEntry
): Promise<void> {
  await mockApiResponse(page, {
    method: entry.method,
    path: entry.path,
    status: entry.status,
    body: buildApiErrorEnvelope(
      entry.code,
      entry.message,
      entry.traceId,
      entry.details
    ),
  });
}

export async function holdNextRequest(
  page: Page,
  method: string,
  path: string
): Promise<RequestHoldHandle> {
  const gateKey = `${method.toUpperCase()} ${path}`;
  await page.evaluate((key: string) => {
    let resolveWait: () => void = () => {};
    const wait = new Promise<void>((resolve) => {
      resolveWait = resolve;
    });
    const mocks = (window.__ERP_E2E_MOCKS__ ??= { responses: [], gates: {} });
    const gate: E2eRequestGate = {
      wait,
      seen: false,
      notifySeen: () => {
        gate.seen = true;
      },
      release: () => {
        delete mocks.gates[key];
        resolveWait();
      },
    };
    mocks.gates[key] = gate;
  }, gateKey);

  return {
    waitUntilSeen: () =>
      page
        .waitForFunction(
          (key: string) => Boolean(window.__ERP_E2E_MOCKS__?.gates[key]?.seen),
          gateKey
        )
        .then(() => undefined),
    release: () =>
      page.evaluate((key: string) => {
        window.__ERP_E2E_MOCKS__?.gates[key]?.release();
      }, gateKey),
  };
}
