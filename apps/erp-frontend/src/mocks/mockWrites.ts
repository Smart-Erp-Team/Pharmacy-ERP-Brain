import { http, HttpResponse, type PathParams } from 'msw';

import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../lib/api/idempotency';

type WriteResolver = (args: {
  request: Request;
  params: PathParams;
}) => Response | Promise<Response>;

function canonicalValue(_name: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  );
}

export function mockPayloadSignature(
  payload: Record<string, unknown> | null
): string {
  if (!payload) return 'null';
  const fields = Object.entries(payload).filter(
    ([name]) => name !== 'idempotency_key'
  );
  return JSON.stringify(Object.fromEntries(fields), canonicalValue);
}

export function createMockWrites() {
  const results = new Map<
    string,
    { signature: string; response: Promise<Response> }
  >();
  function register(
    method: 'post' | 'patch' | 'put',
    path: string,
    resolve: WriteResolver
  ) {
    const bodyless =
      path.endsWith('/revoke-sessions') || path.endsWith('/enrollment-tokens');
    return http[method](path, async ({ request, params }) => {
      const body: unknown = bodyless
        ? null
        : await request
            .clone()
            .json()
            .catch(() => null);
      const payload =
        body && typeof body === 'object' && !Array.isArray(body)
          ? Object.fromEntries(Object.entries(body))
          : null;
      const bodyKey = payload?.idempotency_key;
      const key =
        request.headers.get('Idempotency-Key')?.trim() ||
        (typeof bodyKey === 'string' ? bodyKey.trim() : '');
      if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
        const missing = !key;
        const message = missing
          ? 'The idempotency key is required.'
          : 'Idempotency key must be at most 100 characters.';
        return HttpResponse.json(
          {
            error: {
              code: missing ? 'MALFORMED_REQUEST' : 'VALIDATION_ERROR',
              message,
              details: [
                {
                  field: missing ? 'Idempotency-Key' : 'idempotency_key',
                  issue: message,
                },
              ],
              trace_id: 'mock-idempotency-key',
            },
          },
          { status: missing ? 400 : 422 }
        );
      }
      const signature = mockPayloadSignature(payload);
      const scope = JSON.stringify([
        request.method,
        new URL(request.url).pathname,
        key,
      ]);
      const existing = results.get(scope);
      if (existing) {
        if (existing.signature !== signature)
          return HttpResponse.json(
            {
              error: {
                code: 'IDEMPOTENCY_MISMATCH',
                message: 'Key already used with a different payload.',
                details: [],
                trace_id: 'mock-idempotency-mismatch',
              },
            },
            { status: 409 }
          );
        return (await existing.response).clone();
      }
      const promise = Promise.resolve(resolve({ request, params }));
      results.set(scope, { signature, response: promise });
      try {
        const response = await promise;
        if (!response.ok) results.delete(scope);
        return response.clone();
      } catch (error) {
        results.delete(scope);
        throw error;
      }
    });
  }
  return {
    post: (path: string, resolver: WriteResolver) =>
      register('post', path, resolver),
    patch: (path: string, resolver: WriteResolver) =>
      register('patch', path, resolver),
    put: (path: string, resolver: WriteResolver) =>
      register('put', path, resolver),
    reset: () => results.clear(),
  };
}
