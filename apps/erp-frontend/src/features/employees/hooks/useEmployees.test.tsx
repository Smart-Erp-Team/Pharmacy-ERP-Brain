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
  INITIAL_EMPLOYEES,
  resetMockEmployees,
} from '../../../mocks/employeeHandlers';
import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  createEmployee,
  getEmployee,
  listEmployees,
  patchEmployee,
} from '../api/employeesApi';
import {
  useAllEmployeesQuery,
  useCreateEmployeeMutation,
  useEmployeeQuery,
  useEmployeesQuery,
  usePatchEmployeeMutation,
} from './useEmployees';

const server = setupServer(...employeeHandlers);

const DOWNTOWN_BRANCH_ID = '11111111-2222-4111-8111-000000000001';
const OMAR_EMPLOYEE_ID = '11111111-3333-4111-8111-000000000001';

let activeQueryClients: QueryClient[] = [];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeQueryClients.push(queryClient);

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockEmployees();
  activeQueryClients = [];
});
afterEach(() => {
  for (const client of activeQueryClients) {
    client.clear();
  }
  server.resetHandlers();
});
afterAll(() => server.close());

describe('employeesApi & useEmployees hooks', () => {
  it('omits blank branch_id and search params and forwards Stage 1 pagination params', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 2,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        });
      })
    );

    await listEmployees({
      page: 2,
      page_size: 25,
      branch_id: '   ',
      include_inactive: true,
      search: '   ',
    });

    expect(requestedUrls).toHaveLength(1);
    const url = new URL(requestedUrls[0]);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('25');
    expect(url.searchParams.get('include_inactive')).toBe('true');
    expect(url.searchParams.has('branch_id')).toBe(false);
    expect(url.searchParams.has('search')).toBe(false);
  });

  it('filters by include_inactive, branch_id, search, and paginates via employeeHandlers', async () => {
    const activeOnly = await listEmployees();
    expect(activeOnly.items).toHaveLength(3);
    expect(activeOnly.total_count).toBe(3);
    expect(activeOnly.page).toBe(1);
    expect(activeOnly.page_size).toBe(25);
    expect(activeOnly.next_cursor).toBeNull();
    expect(activeOnly.items.every((item) => item.is_active)).toBe(true);

    const allWithInactive = await listEmployees({ include_inactive: true });
    expect(allWithInactive.items).toHaveLength(INITIAL_EMPLOYEES.length);
    expect(allWithInactive.total_count).toBe(4);

    const downtownOnly = await listEmployees({
      branch_id: DOWNTOWN_BRANCH_ID,
      include_inactive: true,
    });
    expect(downtownOnly.items.map((item) => item.employee_no)).toEqual([
      'EMP-001',
      'EMP-003',
    ]);

    const searchByJobTitle = await listEmployees({
      search: '  dispensing  ',
    });
    expect(searchByJobTitle.items).toHaveLength(1);
    expect(searchByJobTitle.items[0]?.full_name).toBe('Karim Hassan');

    const page1 = await listEmployees({
      include_inactive: true,
      page: 1,
      page_size: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.total_count).toBe(4);
    expect(page1.next_cursor).toBe('2');

    const page2 = await listEmployees({
      include_inactive: true,
      page: 2,
      page_size: 2,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.total_count).toBe(4);
    expect(page2.next_cursor).toBeNull();
  });

  it('fetches all pages through useAllEmployeesQuery', async () => {
    const { result } = renderHook(
      () => useAllEmployeesQuery({ include_inactive: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(4);
    expect(result.current.data?.map((item) => item.employee_no)).toEqual([
      'EMP-001',
      'EMP-002',
      'EMP-003',
      'EMP-004',
    ]);
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
      () => useEmployeeQuery(OMAR_EMPLOYEE_ID),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(foundResult.current.isSuccess).toBe(true));
    expect(foundResult.current.data?.full_name).toBe('Omar Khaled');
    expect(foundResult.current.data?.job_title).toBe('Pharmacy Director');
    expect(foundResult.current.data?.email).toBe('admin@medcare.test');

    const { result: missingResult } = renderHook(
      () => useEmployeeQuery('missing-employee-id'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(missingResult.current.isError).toBe(true));
    expect(missingResult.current.error).toBeInstanceOf(ApiClientError);
    expect(missingResult.current.error?.message).toBe(
      'Employee was not found.'
    );
  });

  it('respects options.enabled=false on useEmployeesQuery, encodes employeeId, and rejects malformed DTO responses', async () => {
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
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Not found',
              details: [],
              trace_id: 'trace-custom-404',
            },
          },
          { status: 404 }
        );
      })
    );

    await expect(getEmployee(' emp/123 ')).rejects.toThrow('Not found');
    expect(capturedPath).toBe('/api/v1/employees/emp%2F123');

    server.use(
      http.get('*/api/v1/employees/:employeeId', () => {
        return HttpResponse.json(
          { employee_id: 'incomplete' },
          { status: 200 }
        );
      })
    );

    await expect(getEmployee(OMAR_EMPLOYEE_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('creates an active employee via useCreateEmployeeMutation and rejects duplicate employee_no or blank job_title', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateEmployeeMutation(), {
      wrapper,
    });

    const created = await result.current.mutateAsync({
      payload: {
        branch_id: DOWNTOWN_BRANCH_ID,
        employee_no: 'EMP-005',
        full_name: 'Nour El-Din',
        job_title: 'Inventory Specialist',
        email: 'nour@medcare.test',
        phone: '+20 101 222 3344',
        hired_on: '2026-03-01',
        address: {
          line1: '55 Maadi Road',
          line2: null,
          city: 'Cairo',
          region: 'Cairo Governorate',
          postal_code: '11728',
          country_code: 'EG',
        },
      },
    });

    expect(created.employee_no).toBe('EMP-005');
    expect(created.is_active).toBe(true);
    expect(created.job_title).toBe('Inventory Specialist');

    await expect(
      createEmployee({
        branch_id: DOWNTOWN_BRANCH_ID,
        employee_no: 'EMP-001',
        full_name: 'Duplicate Staff',
        job_title: 'Cashier',
        email: null,
        phone: null,
        hired_on: '2026-03-02',
        address: {
          line1: '10 Nile St',
          line2: null,
          city: 'Cairo',
          region: null,
          postal_code: null,
          country_code: 'EG',
        },
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });

    await expect(
      createEmployee({
        branch_id: DOWNTOWN_BRANCH_ID,
        employee_no: 'EMP-006',
        full_name: 'Missing Title',
        job_title: '   ',
        email: null,
        phone: null,
        hired_on: '2026-03-02',
        address: {
          line1: '10 Nile St',
          line2: null,
          city: 'Cairo',
          region: null,
          postal_code: null,
          country_code: 'EG',
        },
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  });

  it('patches mutable fields via usePatchEmployeeMutation and validates malformed/empty payloads', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => usePatchEmployeeMutation(), {
      wrapper,
    });

    const updated = await result.current.mutateAsync({
      employeeId: OMAR_EMPLOYEE_ID,
      payload: {
        full_name: 'Omar Khaled Updated',
        job_title: 'Chief Pharmacy Officer',
        is_active: false,
      },
    });

    expect(updated.full_name).toBe('Omar Khaled Updated');
    expect(updated.job_title).toBe('Chief Pharmacy Officer');
    expect(updated.is_active).toBe(false);
    expect(updated.branch_id).toBe(DOWNTOWN_BRANCH_ID);
    expect(updated.employee_no).toBe('EMP-001');
    expect(updated.hired_on).toBe('2024-03-01');

    const missingKeyResponse = await fetch(
      'http://localhost/api/v1/employees',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: 'Missing key' }),
      }
    );
    expect(missingKeyResponse.status).toBe(400);
    await expect(missingKeyResponse.json()).resolves.toMatchObject({
      error: { code: 'MALFORMED_REQUEST' },
    });

    await expect(
      apiClient.post('/employees', 'not-an-object', {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-malformed-employee-body',
        },
      })
    ).rejects.toMatchObject({
      code: 'MALFORMED_REQUEST',
      status: 400,
    });

    let capturedError: unknown;
    try {
      await patchEmployee(OMAR_EMPLOYEE_ID, {
        full_name: '',
        job_title: '   ',
      });
    } catch (error: unknown) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(ApiClientError);
    if (capturedError instanceof ApiClientError) {
      expect(capturedError.code).toBe('VALIDATION_ERROR');
      expect(capturedError.status).toBe(422);
      expect(capturedError.details.map((d) => d.field)).toEqual(
        expect.arrayContaining(['full_name', 'job_title'])
      );
    }
  });
});
