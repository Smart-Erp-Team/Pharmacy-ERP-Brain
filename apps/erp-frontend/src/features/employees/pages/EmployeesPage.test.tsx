/** @vitest-environment jsdom */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import {
  branchHandlers,
  MOCK_BRANCH_IDS,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  employeeHandlers,
  INITIAL_EMPLOYEES,
  resetMockEmployees,
} from '../../../mocks/employeeHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser } from '../../../types/api';
import { EmployeesPage } from './EmployeesPage';

const ADMIN_CLOUD_USER: CurrentUser = {
  user_id: currentUserContext.user_id,
  employee_id: currentUserContext.employee_id,
  organization_id: currentUserContext.organization_id,
  username: currentUserContext.username,
  role: 'Admin',
  branch_scope: 'ALL',
  branch_ids: [],
  scopes: [
    'user:admin',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:write',
  ],
  runtime_mode: 'Cloud',
};

function setSignedInUser(currentUser: CurrentUser | null) {
  useAuthStore.setState({
    currentUser,
    organizationCode: currentUser ? 'MEDCARE' : null,
    activeBranchId: currentUser?.branch_ids[0] ?? null,
    isAuthenticated: currentUser !== null,
    isInitializing: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const server = setupServer(...branchHandlers, ...employeeHandlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
  setSignedInUser(ADMIN_CLOUD_USER);
});
afterEach(() => {
  server.resetHandlers();
  setSignedInUser(null);
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('EmployeesPage', () => {
  it('shows loading state, renders active MEDCARE employees with branch_code labels, shows Pagination counts, and has no delete button', async () => {
    let resolveEmployees: (() => void) | undefined;
    const employeesGate = new Promise<void>((resolve) => {
      resolveEmployees = resolve;
    });

    server.use(
      http.get('*/api/v1/employees', async () => {
        await employeesGate;
        const activeSeeds = INITIAL_EMPLOYEES.filter((item) => item.is_active);
        return HttpResponse.json({
          items: activeSeeds,
          page: 1,
          page_size: 25,
          total_count: activeSeeds.length,
          next_cursor: null,
        });
      })
    );

    renderWithProviders(<EmployeesPage />);

    const loadingRegion = screen.getByRole('status', {
      name: 'Loading employees',
    });
    expect(loadingRegion).toBeDefined();
    expect(loadingRegion.getAttribute('aria-busy')).toBe('true');

    resolveEmployees?.();

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.getByText('Karim Hassan')).toBeDefined();
    expect(screen.queryByText('Salma Nabil')).toBeNull();

    const table = screen.getByRole('table');
    expect(
      await within(table).findAllByText('MED-DT — MedCare - Downtown Flagship')
    ).toHaveLength(2);
    expect(
      await within(table).findByText('MED-ALX — MedCare - Alexandria Corniche')
    ).toBeDefined();
    expect(screen.getByText('Showing 1–3 of 3')).toBeDefined();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('filters via server-side branch_id, include_inactive, and search params, resolves inactive branch labels, and resets filters cleanly', async () => {
    const user = userEvent.setup();
    const seenQueries: URLSearchParams[] = [];

    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/api/v1/employees')) {
        seenQueries.push(url.searchParams);
      }
    });

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.getByText('Karim Hassan')).toBeDefined();
    expect(screen.queryByText('Salma Nabil')).toBeNull();

    // Server-side branch_id filter
    await user.selectOptions(
      screen.getByLabelText('Home branch'),
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    await waitFor(() => {
      expect(screen.queryByText('Mona Adel')).toBeNull();
    });
    expect(screen.getByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Karim Hassan')).toBeDefined();
    expect(seenQueries[seenQueries.length - 1]?.get('branch_id')).toBe(
      MOCK_BRANCH_IDS.DOWNTOWN
    );

    // Reset branch back to All branches and include inactive employees (include_inactive=true)
    await user.selectOptions(screen.getByLabelText('Home branch'), '');
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    expect(await screen.findByText('Salma Nabil')).toBeDefined();
    expect(
      within(screen.getByRole('table')).getByText(
        'MED-GZ — MedCare - Giza Storage'
      )
    ).toBeDefined();
    expect(seenQueries[seenQueries.length - 1]?.get('include_inactive')).toBe(
      'true'
    );

    // Server-side search by email, employee_no, job_title, and no-match fallback
    const searchInput = screen.getByLabelText('Search employees');

    await user.type(searchInput, 'mona.adel@medcare.test');
    await waitFor(() => {
      expect(screen.queryByText('Omar Khaled')).toBeNull();
    });
    expect(screen.getByText('Mona Adel')).toBeDefined();

    await user.clear(searchInput);
    await user.type(searchInput, 'EMP-004');
    await waitFor(() => {
      expect(screen.queryByText('Mona Adel')).toBeNull();
    });
    expect(screen.getByText('Salma Nabil')).toBeDefined();

    await user.clear(searchInput);
    await user.type(searchInput, 'Dispensing Pharmacist');
    await waitFor(() => {
      expect(screen.queryByText('Salma Nabil')).toBeNull();
    });
    expect(screen.getByText('Karim Hassan')).toBeDefined();

    await user.clear(searchInput);
    await user.type(searchInput, 'NoSuchEmployee');
    expect(
      await screen.findByText('No employees match your filters')
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.queryByText('Salma Nabil')).toBeNull();
  });

  it('shows Branch unavailable when branches endpoint fails and never renders 0', async () => {
    server.use(
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Branch service unavailable',
              details: [],
              trace_id: 'trace-branch-err',
            },
          },
          { status: 500 }
        )
      )
    );

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    const unavailableCells = await screen.findAllByText('Branch unavailable');
    expect(unavailableCells.length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('requires job_title on create, omits is_active toggle on create, handles 409 conflict, and creates an active employee', async () => {
    const user = userEvent.setup();
    const createBodies: Record<string, unknown>[] = [];

    server.events.on('request:start', async ({ request }) => {
      const url = new URL(request.url);
      if (
        request.method === 'POST' &&
        url.pathname.endsWith('/api/v1/employees')
      ) {
        const body: unknown = await request
          .clone()
          .json()
          .catch(() => null);
        if (isRecord(body)) {
          createBodies.push(body);
        }
      }
    });

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    const dialog = screen.getByRole('dialog');

    // No optional hint on Job title and no is_active toggle on Create
    const jobTitleInput = within(dialog).getByLabelText('Job title');
    expect(jobTitleInput.hasAttribute('required')).toBe(true);
    expect(within(dialog).queryByText(/Job title \(optional\)/i)).toBeNull();
    expect(
      within(dialog).queryByRole('switch', { name: /active employee/i })
    ).toBeNull();

    // Inactive branch (MED-GZ) is excluded from Create branch selector
    const branchSelect = within(dialog).getByLabelText('Home branch');
    expect(within(branchSelect).queryByText(/MED-GZ/i)).toBeNull();
    expect(within(branchSelect).getByText(/MED-DT/i)).toBeDefined();
    expect(within(branchSelect).getByText(/MED-ALX/i)).toBeDefined();

    // Client-side validation check including required job_title
    await user.click(
      within(dialog).getByRole('button', { name: 'Create employee' })
    );
    expect(
      await within(dialog).findByText('Home branch is required')
    ).toBeDefined();
    expect(
      within(dialog).getByText('Employee number is required')
    ).toBeDefined();
    expect(within(dialog).getByText('Full name is required')).toBeDefined();
    expect(within(dialog).getByText('Job title is required')).toBeDefined();
    expect(within(dialog).getByText('Hire date is required')).toBeDefined();

    // Duplicate EMP-001 -> 409 conflict
    await user.selectOptions(branchSelect, MOCK_BRANCH_IDS.DOWNTOWN);
    await user.type(
      within(dialog).getByLabelText('Employee number'),
      'EMP-001'
    );
    await user.type(within(dialog).getByLabelText('Full name'), 'Nadia Samir');
    await user.type(jobTitleInput, 'Clinical Pharmacist');
    await user.type(within(dialog).getByLabelText('Hire date'), '2026-03-10');
    await user.type(
      within(dialog).getByLabelText('Address line 1'),
      '10 Nile St'
    );
    await user.type(within(dialog).getByLabelText('City'), 'Cairo');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create employee' })
    );

    expect(
      await within(dialog).findByText(/EMP-001.*already exists/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText(/Trace: mock-trace-employee-conflict/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        'Employee number must be unique within the organization.'
      )
    ).toBeDefined();

    // Unique EMP-010 succeeds and omits is_active from POST body
    const empNoInput = within(dialog).getByLabelText('Employee number');
    await user.clear(empNoInput);
    await user.type(empNoInput, 'EMP-010');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create employee' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Nadia Samir')).toBeDefined();

    const lastPayload = createBodies[createBodies.length - 1];
    expect(lastPayload).toBeDefined();
    expect(lastPayload?.job_title).toBe('Clinical Pharmacist');
    expect('is_active' in (lastPayload ?? {})).toBe(false);
  });

  it('maps 422 field errors onto inputs without showing a duplicate toast', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/employees', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed on server',
              trace_id: 'trace-emp-422',
              details: [
                {
                  field: 'email',
                  issue: 'Email domain is not allowed',
                },
                {
                  field: 'address.city',
                  issue: 'City is not supported in this region',
                },
              ],
            },
          },
          { status: 422 }
        )
      )
    );

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    const dialog = screen.getByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText('Home branch'),
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    await user.type(
      within(dialog).getByLabelText('Employee number'),
      'EMP-099'
    );
    await user.type(
      within(dialog).getByLabelText('Full name'),
      'Karim Mansour'
    );
    await user.type(
      within(dialog).getByLabelText('Job title'),
      'Night Pharmacist'
    );
    await user.type(
      within(dialog).getByLabelText('Email (optional)'),
      'karim@example.com'
    );
    await user.type(within(dialog).getByLabelText('Hire date'), '2026-04-01');
    await user.type(
      within(dialog).getByLabelText('Address line 1'),
      '12 Dokki St'
    );
    await user.type(within(dialog).getByLabelText('City'), 'Giza');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create employee' })
    );

    expect(
      await within(dialog).findByText('Email domain is not allowed')
    ).toBeDefined();
    expect(
      within(dialog).getByText('City is not supported in this region')
    ).toBeDefined();
    expect(screen.queryByText(/Validation failed on server/i)).toBeNull();
  });

  it('edits employee with locked branch_id/employee_no/hired_on, visible is_active toggle, !isDirty guard, mutable-only PATCH, and stable Idempotency-Key', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    const seenBodies: Array<Record<string, unknown>> = [];
    let attempt = 0;

    server.use(
      http.patch('*/api/v1/employees/*', async ({ request }) => {
        attempt += 1;
        seenKeys.push(request.headers.get('Idempotency-Key'));
        const body: unknown = await request.json().catch(() => null);
        if (isRecord(body)) {
          seenBodies.push(body);
        }
        if (attempt === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary employee save failure',
                details: [],
                trace_id: 'trace-emp-patch-500',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          ...INITIAL_EMPLOYEES[0],
          full_name: 'Omar Khaled Updated',
          email: null,
          updated_at: '2026-11-26T12:00:00.000Z',
        });
      })
    );

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    const row = screen.getByText('Omar Khaled').closest('tr');
    if (!row) {
      throw new Error('Expected Omar Khaled row');
    }
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const branchSelect = within(dialog).getByLabelText('Home branch');
    const empNoInput = within(dialog).getByLabelText('Employee number');
    const hireDateInput = within(dialog).getByLabelText('Hire date');
    expect(branchSelect.hasAttribute('disabled')).toBe(true);
    expect(empNoInput.hasAttribute('disabled')).toBe(true);
    expect(hireDateInput.hasAttribute('disabled')).toBe(true);

    const activeSwitch = within(dialog).getByRole('switch', {
      name: 'Active employee',
    });
    expect(activeSwitch.getAttribute('aria-checked')).toBe('true');

    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    const nameInput = within(dialog).getByLabelText('Full name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Omar Khaled Updated');
    await user.clear(within(dialog).getByLabelText('Email (optional)'));
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    // First save fails 500
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(/Temporary employee save failure/i)
    ).toBeDefined();

    // Retry identical payload -> identical Idempotency-Key
    await user.click(saveButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(seenBodies[0]?.email).toBeNull();
    expect('branch_id' in (seenBodies[0] ?? {})).toBe(false);
    expect('employee_no' in (seenBodies[0] ?? {})).toBe(false);
    expect('hired_on' in (seenBodies[0] ?? {})).toBe(false);
  });

  it('toggles employee active status softly without deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for Omar Khaled',
      })
    );

    await waitFor(() => {
      expect(screen.queryByText('Omar Khaled')).toBeNull();
    });

    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
  });

  it('supports error retry, Stage 1 page-based pagination with total_count, and resets page to 1 when filters change', async () => {
    const user = userEvent.setup();
    let shouldFail = true;

    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        if (shouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary employee directory error',
                details: [],
                trace_id: 'trace-emp-list-err',
              },
            },
            { status: 500 }
          );
        }
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        const branchId = url.searchParams.get('branch_id');
        if (branchId === MOCK_BRANCH_IDS.DOWNTOWN) {
          return HttpResponse.json({
            items: [INITIAL_EMPLOYEES[0]],
            page,
            page_size: 25,
            total_count: 1,
            next_cursor: null,
          });
        }
        if (page === 2) {
          return HttpResponse.json({
            items: [
              {
                ...INITIAL_EMPLOYEES[1],
                employee_id: '11111111-3333-4111-8111-000000000026',
                employee_no: 'EMP-026',
                full_name: 'Rana Gamal',
              },
            ],
            page: 2,
            page_size: 25,
            total_count: 26,
            next_cursor: null,
          });
        }
        return HttpResponse.json({
          items: [INITIAL_EMPLOYEES[0]],
          page: 1,
          page_size: 25,
          total_count: 26,
          next_cursor: '2',
        });
      })
    );

    renderWithProviders(<EmployeesPage />);
    expect(
      await screen.findByText('Temporary employee directory error')
    ).toBeDefined();

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Showing 1–25 of 26')).toBeDefined();
    expect(screen.getByText('Page 1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Rana Gamal')).toBeDefined();
    expect(screen.getByText('Showing 26–26 of 26')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')
    ).toBe(true);

    // Changing branch filter from page 2 resets back to page 1
    await user.selectOptions(
      screen.getByLabelText('Home branch'),
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Showing 1–1 of 1')).toBeDefined();
    expect(screen.getByText('Page 1')).toBeDefined();
  });

  it('locks submit and close controls while create mutation is pending (prevents double submission)', async () => {
    const user = userEvent.setup();
    let postCalls = 0;
    let resolveCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });

    server.use(
      http.post('*/api/v1/employees', async () => {
        postCalls += 1;
        await createGate;
        return HttpResponse.json(
          {
            ...INITIAL_EMPLOYEES[0],
            employee_id: '11111111-3333-4111-8111-000000000050',
            employee_no: 'EMP-050',
            full_name: 'Heba Nabil',
            job_title: 'Shift Pharmacist',
            hired_on: '2026-05-01',
          },
          { status: 201 }
        );
      })
    );

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    const dialog = screen.getByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText('Home branch'),
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    await user.type(
      within(dialog).getByLabelText('Employee number'),
      'EMP-050'
    );
    await user.type(within(dialog).getByLabelText('Full name'), 'Heba Nabil');
    await user.type(
      within(dialog).getByLabelText('Job title'),
      'Shift Pharmacist'
    );
    await user.type(within(dialog).getByLabelText('Hire date'), '2026-05-01');
    await user.type(
      within(dialog).getByLabelText('Address line 1'),
      '12 Nile St'
    );
    await user.type(within(dialog).getByLabelText('City'), 'Cairo');

    const submitButton = within(dialog).getByRole('button', {
      name: 'Create employee',
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(submitButton.hasAttribute('disabled')).toBe(true);
    });
    expect(
      within(dialog)
        .getByRole('button', { name: 'Cancel' })
        .hasAttribute('disabled')
    ).toBe(true);

    await user.click(submitButton);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(postCalls).toBe(1);

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows No employees yet empty state when server has zero employees and opens modal from CTA', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/employees', () =>
        HttpResponse.json({
          items: [],
          page: 1,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        })
      )
    );

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('No employees yet')).toBeDefined();
    const emptyStateButtons = screen.getAllByRole('button', {
      name: 'Add employee',
    });
    await user.click(emptyStateButtons[emptyStateButtons.length - 1]);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('preserves locked home branch on Edit when branches fail, retry, or load asynchronously', async () => {
    const user = userEvent.setup();
    let branchesShouldFail = true;
    let resolveBranches: (() => void) | undefined;
    const branchesGate = new Promise<void>((resolve) => {
      resolveBranches = resolve;
    });

    server.use(
      http.get('*/api/v1/branches', async () => {
        if (branchesShouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Branch service down',
                details: [],
                trace_id: 'trace-b-down',
              },
            },
            { status: 500 }
          );
        }
        await branchesGate;
        return HttpResponse.json({
          items: [
            {
              branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
              organization_id: INITIAL_EMPLOYEES[1].organization_id,
              branch_code: 'MED-ALX',
              name: 'MedCare - Alexandria Corniche',
              is_active: true,
              address: {
                line1: '240 El Geish Road',
                line2: null,
                city: 'Alexandria',
                region: 'Alexandria Governorate',
                postal_code: '21500',
                country_code: 'EG',
              },
              created_at: '2026-01-16T10:30:00+00:00',
              updated_at: '2026-11-25T10:00:00+00:00',
            },
          ],
          page: 1,
          page_size: 200,
          total_count: 1,
          next_cursor: null,
        });
      })
    );

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Mona Adel');

    const monaRow = screen.getByText('Mona Adel').closest('tr');
    if (!monaRow) {
      throw new Error('Expected Mona Adel row');
    }
    await user.click(within(monaRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const branchSelect = within(dialog).getByLabelText('Home branch');
    if (!(branchSelect instanceof HTMLSelectElement)) {
      throw new Error('Expected Home branch select element');
    }
    expect(branchSelect.disabled).toBe(true);
    expect(branchSelect.value).toBe(MOCK_BRANCH_IDS.ALEXANDRIA);
    expect(within(dialog).getByText('Branches unavailable')).toBeDefined();

    // Retry inside modal transitions to Loading branch... then resolves to MED-ALX while remaining locked
    branchesShouldFail = false;
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(branchSelect.disabled).toBe(true);
    expect(branchSelect.value).toBe(MOCK_BRANCH_IDS.ALEXANDRIA);

    resolveBranches?.();
    expect(
      await within(branchSelect).findByText(
        'MED-ALX — MedCare - Alexandria Corniche'
      )
    ).toBeDefined();
    expect(within(dialog).queryByText('Branches unavailable')).toBeNull();
    expect(branchSelect.disabled).toBe(true);
    expect(branchSelect.value).toBe(MOCK_BRANCH_IDS.ALEXANDRIA);
  });

  it('renders read-only mode on BranchLocal with info notice and no write controls', async () => {
    setSignedInUser({
      ...ADMIN_CLOUD_USER,
      branch_scope: 'ASSIGNED',
      branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
      runtime_mode: 'BranchLocal',
    });

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(
      screen.getByText('Employee changes require the Cloud deployment.')
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add employee' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });
});
