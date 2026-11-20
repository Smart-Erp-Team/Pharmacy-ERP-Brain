/** @vitest-environment jsdom */
import type { PropsWithChildren } from 'react';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  employeeHandlers,
  resetMockEmployees,
} from '../../../mocks/employeeHandlers';
import { ApiClientError, apiClient } from '../../../lib/api/client';
import { getEmployee, listEmployees, patchEmployee } from '../api/employeesApi';
import { useEmployeeQuery, useEmployeesQuery } from './useEmployees';

const server = setupServer(...employeeHandlers);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockEmployees();
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

describe('employeesApi & useEmployees hooks', () => {
  it('omits blank cursor and branchId params when listing employees', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      })
    );

    await listEmployees({ cursor: '   ', branchId: '  ', limit: 25 });

    expect(requestedUrls).toHaveLength(1);
    const url = new URL(requestedUrls[0]);
    expect(url.searchParams.has('cursor')).toBe(false);
    expect(url.searchParams.has('branchId')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('25');
  });

  it('keeps useEmployeeQuery disabled for undefined or whitespace employeeId', () => {
    const { result: undefinedResult } = renderHook(
      () => useEmployeeQuery(undefined),
      { wrapper: createWrapper() }
    );
    const { result: blankResult } = renderHook(() => useEmployeeQuery('   '), {
      wrapper: createWrapper(),
    });

    expect(undefinedResult.current.fetchStatus).toBe('idle');
    expect(blankResult.current.fetchStatus).toBe('idle');
  });

  it('fetches employee detail when employeeId is defined and surfaces 404 errors', async () => {
    const { result: foundResult } = renderHook(
      () => useEmployeeQuery('a1111111-1111-4111-8111-111111111101'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(foundResult.current.isSuccess).toBe(true));
    expect(foundResult.current.data?.full_name).toBe('Omar Khaled');

    const { result: missingResult } = renderHook(
      () => useEmployeeQuery('missing-employee-id'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(missingResult.current.isError).toBe(true));
    expect(missingResult.current.error?.message).toBe(
      'Employee was not found.'
    );
  });

  it('respects options.enabled=false on useEmployeesQuery and encodes employeeId on getEmployee', async () => {
    const { result } = renderHook(
      () => useEmployeesQuery({}, { enabled: false }),
      { wrapper: createWrapper() }
    );
    expect(result.current.fetchStatus).toBe('idle');

    let capturedPath = '';
    server.use(
      http.get('*/api/v1/employees/:employeeId', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Not found' } },
          { status: 404 }
        );
      })
    );

    await expect(getEmployee(' emp/123 ')).rejects.toThrow('Not found');
    expect(capturedPath).toBe('/api/v1/employees/emp%2F123');
  });

  it('enforces 422 validation on empty PATCH required fields and 400 on malformed POST body in employeeHandlers', async () => {
    await expect(
      apiClient.post('/employees', 'not-an-object', {
        headers: { 'Content-Type': 'application/json' },
      })
    ).rejects.toMatchObject({
      code: 'MALFORMED_REQUEST',
      status: 400,
    });

    let capturedError: unknown;
    try {
      await patchEmployee('a1111111-1111-4111-8111-111111111101', {
        employee_no: '   ',
        full_name: '',
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(ApiClientError);
    if (capturedError instanceof ApiClientError) {
      expect(capturedError.status).toBe(422);
      expect(capturedError.details?.map((d) => d.field)).toEqual(
        expect.arrayContaining(['employee_no', 'full_name'])
      );
    }
  });
});
