import type { Page } from '@playwright/test';
import type { E2eMockResponse } from '../../../src/mocks/browser';

export interface RequestHoldHandle {
  waitUntilSeen: () => Promise<void>;
  release: () => Promise<void>;
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
    const mocks = (window.__ERP_E2E_MOCKS__ ??= {
      responses: [],
      gates: {},
    });
    mocks.responses = [
      ...mocks.responses.filter(
        (existing) =>
          !(existing.method === item.method && existing.path === item.path)
      ),
      item,
    ];
  };

  await page.addInitScript(apply, normalized);
  await page.evaluate(apply, normalized);
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
    const mocks = (window.__ERP_E2E_MOCKS__ ??= {
      responses: [],
      gates: {},
    });
    const gate = {
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
    waitUntilSeen: async () => {
      await page.waitForFunction(
        (key: string) => Boolean(window.__ERP_E2E_MOCKS__?.gates[key]?.seen),
        gateKey
      );
    },
    release: async () => {
      await page.evaluate((key: string) => {
        window.__ERP_E2E_MOCKS__?.gates[key]?.release();
      }, gateKey);
    },
  };
}
