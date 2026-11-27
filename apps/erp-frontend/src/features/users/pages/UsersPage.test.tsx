/** @vitest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { handlers } from '../../../mocks/handlers';
import {
  MOCK_BRANCH_IDS,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  INITIAL_EMPLOYEES,
  resetMockEmployees,
} from '../../../mocks/employeeHandlers';
import {
  INITIAL_USERS,
  ORGANIZATION_ID,
  resetMockUsers,
} from '../../../mocks/userHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser, PagedResult, User } from '../../../types/api';
import { UsersPage } from './UsersPage';

const MED_DT_ID = MOCK_BRANCH_IDS.DOWNTOWN;
const MED_ALX_ID = MOCK_BRANCH_IDS.ALEXANDRIA;
const KARIM_EMPLOYEE_ID = '11111111-3333-4111-8111-000000000003';
const ADMIN_USER_ID = '11111111-4444-4111-8111-000000000001';
const OTHER_ADMIN_USER_ID = '11111111-4444-4111-8111-000000000099';

const SELF_ADMIN_CONTEXT: CurrentUser = {
  user_id: ADMIN_USER_ID,
  employee_id: '11111111-3333-4111-8111-000000000001',
  organization_id: ORGANIZATION_ID,
  username: 'admin@medcare.test',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function makePagedUsers(
  items: readonly User[],
  overrides: Partial<PagedResult<User>> = {}
): PagedResult<User> {
  return {
    items: [...items],
    page: overrides.page ?? 1,
    page_size: overrides.page_size ?? 25,
    total_count: overrides.total_count ?? items.length,
    next_cursor:
      overrides.next_cursor !== undefined ? overrides.next_cursor : null,
  };
}

function setSignedInUser(currentUser: CurrentUser | null) {
  useAuthStore.setState({
    currentUser,
    organizationCode: currentUser ? 'MEDCARE' : null,
    activeBranchId: null,
    isAuthenticated: currentUser !== null,
    isInitializing: false,
  });
}

const server = setupServer(...handlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
  resetMockUsers();
  setSignedInUser(SELF_ADMIN_CONTEXT);
});
afterEach(() => {
  server.events.removeAllListeners();
  server.resetHandlers();
  setSignedInUser(null);
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('UsersPage', () => {
  it('shows loading state, renders active MEDCARE users with employee info, resolved branch_code access, locked badge on ph.mona@medcare.test, self-toggle lock on admin@medcare.test, and no delete button', async () => {
    let resolveUsers: (() => void) | undefined;
    const usersGate = new Promise<void>((resolve) => {
      resolveUsers = resolve;
    });

    server.use(
      http.get('*/api/v1/users', async () => {
        await usersGate;
        return HttpResponse.json(
          makePagedUsers([INITIAL_USERS[0], INITIAL_USERS[1]])
        );
      })
    );

    renderWithProviders(<UsersPage />);

    const loadingRegion = screen.getByRole('status', {
      name: 'Loading user accounts',
    });
    expect(loadingRegion.getAttribute('aria-busy')).toBe('true');

    resolveUsers?.();

    expect(await screen.findByText('admin@medcare.test')).toBeDefined();
    expect(screen.getByText('ph.mona@medcare.test')).toBeDefined();
    expect(screen.queryByText('cashier.salma@medcare.test')).toBeNull();

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('EMP-001')).toBeDefined();
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.getByText('EMP-002')).toBeDefined();

    const adminRow = screen.getByText('admin@medcare.test').closest('tr');
    const monaRow = screen.getByText('ph.mona@medcare.test').closest('tr');
    if (!adminRow || !monaRow) {
      throw new Error('Expected admin and mona rows');
    }

    // Branch access resolved from user.branch_ids & branch.branch_code
    expect(within(adminRow).getByText('ALL')).toBeDefined();
    expect(within(adminRow).getByText('All branches')).toBeDefined();
    await waitFor(() => {
      expect(within(monaRow).getByText('MED-DT')).toBeDefined();
    });

    // Lockout badge only on ph.mona@medcare.test
    expect(within(monaRow).getByText('Temporarily locked')).toBeDefined();
    expect(within(monaRow).getByText('Failed login attempts')).toBeDefined();
    expect(within(adminRow).queryByText('Temporarily locked')).toBeNull();

    // Self status toggle disabled on admin@medcare.test, enabled on ph.mona@medcare.test
    expect(
      within(adminRow)
        .getByRole('switch', { name: 'Toggle status for admin@medcare.test' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(
      within(monaRow)
        .getByRole('switch', { name: 'Toggle status for ph.mona@medcare.test' })
        .hasAttribute('disabled')
    ).toBe(false);

    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('supports server-side role, branch_id, and include_inactive filters, client-side search without sending search param, and PagedResult pagination with filter page reset', async () => {
    const user = userEvent.setup();
    const seenUrls: URL[] = [];

    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/api/v1/users')) {
        seenUrls.push(url);
      }
    });

    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('admin@medcare.test')).toBeDefined();
    await screen.findByText('Mona Adel');

    // Client-side search filters loaded page without sending `search` query param
    const searchInput = screen.getByLabelText('Search users');
    await user.type(searchInput, 'Mona Adel');
    expect(screen.getByText('ph.mona@medcare.test')).toBeDefined();
    expect(screen.queryByText('admin@medcare.test')).toBeNull();
    expect(seenUrls.every((u) => !u.searchParams.has('search'))).toBe(true);

    await user.clear(searchInput);
    await user.type(searchInput, 'EMP-001');
    expect(screen.getByText('admin@medcare.test')).toBeDefined();
    expect(screen.queryByText('ph.mona@medcare.test')).toBeNull();
    await user.clear(searchInput);

    // Server-side include_inactive filter reveals cashier.salma@medcare.test assigned to MED-ALX
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    const salmaCell = await screen.findByText('cashier.salma@medcare.test');
    const salmaRow = salmaCell.closest('tr');
    if (!salmaRow) {
      throw new Error('Expected cashier.salma@medcare.test row');
    }
    expect(within(salmaRow).getByText('Salma Nabil')).toBeDefined();
    expect(within(salmaRow).getByText('EMP-004')).toBeDefined();
    expect(within(salmaRow).getByText('MED-ALX')).toBeDefined();
    expect(within(salmaRow).getByText('Inactive')).toBeDefined();

    // Server-side branch_id filter (`MED-ALX`) returns ALL-scope admin + MED-ALX cashier, excluding MED-DT pharmacist
    const branchSelect = screen.getByLabelText('Branch filter');
    await waitFor(() => {
      expect(
        within(branchSelect).getByRole('option', { name: /MED-ALX/i })
      ).toBeDefined();
    });
    await user.selectOptions(branchSelect, MED_ALX_ID);
    await waitFor(() => {
      expect(screen.queryByText('ph.mona@medcare.test')).toBeNull();
    });
    expect(screen.getByText('admin@medcare.test')).toBeDefined();
    expect(screen.getByText('cashier.salma@medcare.test')).toBeDefined();

    // Server-side role filter (`Cashier`) narrows to cashier.salma@medcare.test
    await user.selectOptions(screen.getByLabelText('Role filter'), 'Cashier');
    await waitFor(() => {
      expect(screen.queryByText('admin@medcare.test')).toBeNull();
    });
    expect(screen.getByText('cashier.salma@medcare.test')).toBeDefined();

    // Clear filters resets role, branch_id, statusFilter ('active'), and searchTerm
    await user.selectOptions(
      screen.getByLabelText('Role filter'),
      'Pharmacist'
    );
    expect(
      await screen.findByText('No user accounts match your filters')
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('ph.mona@medcare.test')).toBeDefined();
    expect(screen.queryByText('cashier.salma@medcare.test')).toBeNull();

    // Multi-page PagedResult navigation + filter change resets page to 1
    const requestedPages: number[] = [];
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        const role = url.searchParams.get('role');
        requestedPages.push(page);

        if (role === 'Pharmacist') {
          return HttpResponse.json(
            makePagedUsers([INITIAL_USERS[1]], {
              page,
              page_size: 1,
              total_count: 1,
              next_cursor: null,
            })
          );
        }

        if (page === 2) {
          return HttpResponse.json(
            makePagedUsers([INITIAL_USERS[1]], {
              page: 2,
              page_size: 1,
              total_count: 2,
              next_cursor: null,
            })
          );
        }

        return HttpResponse.json(
          makePagedUsers([INITIAL_USERS[0]], {
            page: 1,
            page_size: 1,
            total_count: 2,
            next_cursor: '2',
          })
        );
      })
    );

    // Trigger refetch onto paginated handler via Status filter toggle -> All -> Active
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    await screen.findByText('Showing 1–1 of 2');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Showing 2–2 of 2')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();

    // Changing role filter while on Page 2 resets page back to 1
    await user.selectOptions(
      screen.getByLabelText('Role filter'),
      'Pharmacist'
    );
    expect(await screen.findByText('Showing 1–1 of 1')).toBeDefined();
    expect(screen.getByText('Page 1')).toBeDefined();
    expect(requestedPages[requestedPages.length - 1]).toBe(1);
  });

  it('recovers from list error via Retry, shows fallbacks when employee/branch directories fail, and handles status toggle error cleanly', async () => {
    const user = userEvent.setup();
    let failUsers = true;

    server.use(
      http.get('*/api/v1/users', () => {
        if (failUsers) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary user directory error',
                details: [],
                trace_id: 'trace-users-err',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          makePagedUsers([
            INITIAL_USERS[0],
            { ...INITIAL_USERS[1], lockout_end: '2020-01-01T00:00:00.000Z' },
          ])
        );
      }),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Employee directory unavailable',
              details: [],
              trace_id: 'trace-emp-err',
            },
          },
          { status: 500 }
        )
      ),
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Branch directory unavailable',
              details: [],
              trace_id: 'trace-branch-err',
            },
          },
          { status: 500 }
        )
      ),
      http.patch(
        '*/api/v1/users/:id',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'User status update failed',
                details: [],
                trace_id: 'trace-toggle-500',
              },
            },
            { status: 500 }
          ),
        { once: true }
      )
    );

    renderWithProviders(<UsersPage />);

    expect(
      await screen.findByText('Temporary user directory error')
    ).toBeDefined();

    failUsers = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('ph.mona@medcare.test')).toBeDefined();
    expect(await screen.findAllByText('Employee unavailable')).toHaveLength(2);
    expect(await screen.findByText('1 branch')).toBeDefined();

    // Past lockout_end does not render locked badge
    expect(screen.queryByText('Temporarily locked')).toBeNull();

    // Toggle status error keeps switch checked and shows error toast with trace_id
    const monaSwitch = screen.getByRole('switch', {
      name: 'Toggle status for ph.mona@medcare.test',
    });
    expect(monaSwitch.getAttribute('aria-checked')).toBe('true');
    await user.click(monaSwitch);
    expect(
      await screen.findByText(
        /User status update failed \(Trace: trace-toggle-500\)/i
      )
    ).toBeDefined();
    expect(monaSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('creates a user account: excludes employees with active or inactive accounts, enforces 12-char password & branch_ids, and maps 409/422 errors', async () => {
    const user = userEvent.setup();

    // Make EMP-004 (Salma Nabil) active in employee directory while her user account (cashier.salma@medcare.test) is inactive:
    // proves useAllUsersQuery({ include_inactive: true }) still excludes EMP-004!
    server.use(
      http.get('*/api/v1/employees', () =>
        HttpResponse.json({
          items: INITIAL_EMPLOYEES.map((emp) =>
            emp.employee_no === 'EMP-004' ? { ...emp, is_active: true } : emp
          ),
          page: 1,
          page_size: 200,
          total_count: INITIAL_EMPLOYEES.length,
          next_cursor: null,
        })
      )
    );

    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('admin@medcare.test')).toBeDefined();
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');

    const employeeSelect = within(dialog).getByLabelText('Employee');
    await waitFor(() => {
      expect(employeeSelect.hasAttribute('disabled')).toBe(false);
    });

    const optionTexts = Array.from(
      employeeSelect.querySelectorAll('option')
    ).map((option) => option.textContent ?? '');
    expect(optionTexts).toContain('EMP-003 — Karim Hassan');
    expect(optionTexts.some((text) => text.includes('EMP-001'))).toBe(false);
    expect(optionTexts.some((text) => text.includes('EMP-002'))).toBe(false);
    expect(optionTexts.some((text) => text.includes('EMP-004'))).toBe(false);

    // Role/scope transition: Admin -> ALL -> Pharmacist forces ASSIGNED
    const roleSelect = within(dialog).getByLabelText('Role');
    const scopeSelect = within(dialog).getByLabelText('Branch scope');
    if (!(scopeSelect instanceof HTMLSelectElement)) {
      throw new Error('Expected Branch scope select');
    }

    await user.selectOptions(roleSelect, 'Admin');
    await user.selectOptions(scopeSelect, 'ALL');
    expect(scopeSelect.value).toBe('ALL');
    expect(within(dialog).queryByText('Permitted branches')).toBeNull();

    await user.selectOptions(roleSelect, 'Pharmacist');
    expect(scopeSelect.value).toBe('ASSIGNED');
    expect(within(dialog).getByText('Permitted branches')).toBeDefined();

    // 11-character password fails Stage 1 12-char minimum validation
    const passwordInput = within(dialog).getByLabelText('Password');
    expect(passwordInput.getAttribute('placeholder')).toBe(
      'Minimum 12 characters'
    );
    await user.type(passwordInput, '11charsPass');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );

    expect(
      await within(dialog).findByText('Employee is required')
    ).toBeDefined();
    expect(within(dialog).getByText('Username is required')).toBeDefined();
    expect(
      within(dialog).getByText('Password must be at least 12 characters')
    ).toBeDefined();
    expect(
      within(dialog).getByText('Select at least one branch for ASSIGNED scope')
    ).toBeDefined();

    // BranchAccessSelector renders active MED-DT & MED-ALX with branch_code and excludes inactive MED-GZ
    const dtChip = await within(dialog).findByRole('button', {
      name: /MED-DT/i,
    });
    expect(
      within(dialog).getByRole('button', { name: /MED-ALX/i })
    ).toBeDefined();
    expect(
      within(dialog).queryByRole('button', { name: /MED-GZ/i })
    ).toBeNull();

    // Duplicate username -> 409 CONFLICT
    await user.selectOptions(employeeSelect, KARIM_EMPLOYEE_ID);
    await user.type(
      within(dialog).getByLabelText('Username'),
      'admin@medcare.test'
    );
    await user.clear(passwordInput);
    await user.type(passwordInput, 'StrongPass12!');
    await user.click(dtChip);
    expect(dtChip.getAttribute('aria-pressed')).toBe('true');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );
    expect(
      await within(dialog).findByText(
        /Username "admin@medcare\.test" is already taken/i
      )
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        'Username must be unique within the organization.'
      )
    ).toBeDefined();

    // 422 field error maps onto field without duplicate banner/toast
    server.use(
      http.post(
        '*/api/v1/users',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Server rejected user creation',
                trace_id: 'trace-create-422',
                details: [
                  {
                    field: 'username',
                    issue: 'Username contains reserved word',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    const usernameInput = within(dialog).getByLabelText('Username');
    await user.clear(usernameInput);
    await user.type(usernameInput, 'ph.karim@medcare.test');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );

    expect(
      await within(dialog).findByText('Username contains reserved word')
    ).toBeDefined();
    expect(screen.queryByText(/Server rejected user creation/i)).toBeNull();

    // Retry succeeds with 201 Created and branch_ids: [MED_DT_ID]
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('ph.karim@medcare.test')).toBeDefined();

    // All active employees now have user accounts -> Create modal disables submit with No eligible employees alert
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const nextDialog = screen.getByRole('dialog');
    expect(
      await within(nextDialog).findByText('No eligible employees')
    ).toBeDefined();
    expect(
      within(nextDialog)
        .getByRole('button', { name: 'Create user' })
        .hasAttribute('disabled')
    ).toBe(true);
  });

  it('blocks employee selection while multi-page user accounts load, retries directory errors, and excludes page 2 accounts once loaded', async () => {
    const user = userEvent.setup();
    let releaseSecondPage: (() => void) | undefined;
    let secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    let failSecondPage = true;
    let failBranches = true;

    server.use(
      http.get('*/api/v1/users', async ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        if (page === 2) {
          await secondPageGate;
          if (failSecondPage) {
            return HttpResponse.json(
              {
                error: {
                  code: 'INTERNAL_SERVER_ERROR',
                  message: 'Second users page failed',
                  details: [],
                  trace_id: 'trace-users-p2',
                },
              },
              { status: 500 }
            );
          }
          return HttpResponse.json(
            makePagedUsers([INITIAL_USERS[1], INITIAL_USERS[2]], {
              page: 2,
              page_size: 1,
              total_count: 3,
              next_cursor: null,
            })
          );
        }

        return HttpResponse.json(
          makePagedUsers([INITIAL_USERS[0]], {
            page: 1,
            page_size: 1,
            total_count: 3,
            next_cursor: '2',
          })
        );
      }),
      http.get('*/api/v1/branches', () => {
        if (failBranches) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Branches failed',
                details: [],
                trace_id: 'trace-branches-500',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('admin@medcare.test')).toBeDefined();
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');
    const employeeSelect = within(dialog).getByLabelText('Employee');
    const submitButton = within(dialog).getByRole('button', {
      name: 'Create user',
    });

    // 1. While page 2 of users is in flight, Employee select & Submit are disabled
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);
    expect(submitButton.hasAttribute('disabled')).toBe(true);
    expect(
      Array.from(employeeSelect.querySelectorAll('option')).map(
        (opt) => opt.textContent ?? ''
      )
    ).toEqual(['Loading employees...']);

    // 2. Page 2 fails + branches failed -> shows both directory warning alerts with Retry buttons
    releaseSecondPage?.();
    expect(
      await within(dialog).findByText('Employees unavailable')
    ).toBeDefined();
    expect(within(dialog).getByText('Branches unavailable')).toBeDefined();
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);
    expect(submitButton.hasAttribute('disabled')).toBe(true);

    // 3. Retry both directories -> resolves page 2 and excludes EMP-001, EMP-002, EMP-004
    failSecondPage = false;
    failBranches = false;
    secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });

    const retryButtons = within(dialog).getAllByRole('button', {
      name: 'Retry',
    });
    await user.click(retryButtons[0]);
    await user.click(retryButtons[1]);
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);

    releaseSecondPage?.();
    await waitFor(() => {
      expect(within(dialog).queryByText('Employees unavailable')).toBeNull();
      expect(within(dialog).queryByText('Branches unavailable')).toBeNull();
      expect(employeeSelect.hasAttribute('disabled')).toBe(false);
    });

    const readyOptionTexts = Array.from(
      employeeSelect.querySelectorAll('option')
    ).map((opt) => opt.textContent ?? '');
    expect(readyOptionTexts).toContain('EMP-003 — Karim Hassan');
    expect(readyOptionTexts.some((text) => text.includes('EMP-001'))).toBe(
      false
    );
    expect(readyOptionTexts.some((text) => text.includes('EMP-002'))).toBe(
      false
    );
    expect(
      await within(dialog).findByRole('button', { name: /MED-DT/i })
    ).toBeDefined();
  });

  it('pre-populates branch_ids on ph.mona@medcare.test, tracks effective changes, sends branch_ids in PATCH, maps 422 errors, and stabilizes Idempotency-Key on retry', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    const seenBodies: Array<Record<string, unknown>> = [];
    let attempt = 0;

    server.use(
      http.patch('*/api/v1/users/:id', async ({ request }) => {
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
                code: 'VALIDATION_ERROR',
                message: 'Edit rejected by server',
                trace_id: 'trace-edit-422',
                details: [
                  {
                    field: 'branch_ids[1]',
                    issue: 'Branch cannot be assigned',
                  },
                ],
              },
            },
            { status: 422 }
          );
        }
        if (attempt === 2) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary user save failure',
                details: [],
                trace_id: 'trace-patch-retry',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          ...INITIAL_USERS[1],
          role: 'Cashier',
          branch_ids: [MED_DT_ID, MED_ALX_ID],
        });
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona@medcare.test');
    await screen.findByText('Mona Adel');

    const monaRow = screen.getByText('ph.mona@medcare.test').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona@medcare.test row');
    }
    await user.click(within(monaRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const usernameInput = within(dialog).getByLabelText('Username');
    expect(usernameInput.hasAttribute('disabled')).toBe(true);
    expect(usernameInput.hasAttribute('readonly')).toBe(true);
    expect(within(dialog).queryByLabelText(/password/i)).toBeNull();
    expect(
      within(dialog).queryByText(/Current branch grants are unavailable/i)
    ).toBeNull();

    // MED-DT is pre-selected from user.branch_ids, MED-ALX is unselected
    const dtChip = await within(dialog).findByRole('button', {
      name: /MED-DT/i,
    });
    const alxChip = within(dialog).getByRole('button', { name: /MED-ALX/i });
    expect(dtChip.getAttribute('aria-pressed')).toBe('true');
    expect(alxChip.getAttribute('aria-pressed')).toBe('false');

    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    // Toggling MED-ALX on enables Save; toggling it back off disables Save (!hasEffectiveChanges)
    await user.click(alxChip);
    expect(saveButton.hasAttribute('disabled')).toBe(false);
    await user.click(alxChip);
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    // Unselecting MED-DT leaves 0 branches -> client-side validation blocks submit
    await user.click(dtChip);
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(
        'Select at least one branch for ASSIGNED scope'
      )
    ).toBeDefined();
    expect(seenBodies).toHaveLength(0);

    // Select both MED-DT and MED-ALX + change role to Cashier
    await user.click(dtChip);
    await user.click(alxChip);
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'Cashier');

    // Attempt 1 -> 422 branch_ids[1] maps onto branch_ids field without duplicate toast
    await user.click(saveButton);
    expect(
      await within(dialog).findByText('Branch cannot be assigned')
    ).toBeDefined();
    expect(screen.queryByText(/Edit rejected by server/i)).toBeNull();

    // Attempt 2 -> 500 error banner; Attempt 3 -> 200 OK with identical Idempotency-Key
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(/Temporary user save failure/i)
    ).toBeDefined();

    await user.click(saveButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(seenKeys).toHaveLength(3);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(seenKeys[1]).toBe(seenKeys[2]);
    expect(seenBodies[0]).toEqual({
      role: 'Cashier',
      branch_scope: 'ASSIGNED',
      branch_ids: [MED_DT_ID, MED_ALX_ID],
      is_active: true,
    });
    expect('branch_access' in (seenBodies[0] ?? {})).toBe(false);
  });

  it('enforces self-edit hierarchical protection on admin@medcare.test and allows editing ALL <-> ASSIGNED when signed in as another Admin', async () => {
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);
    await screen.findByText('admin@medcare.test');

    const adminRow = screen.getByText('admin@medcare.test').closest('tr');
    if (!adminRow) {
      throw new Error('Expected admin@medcare.test row');
    }

    // 1. Signed in as admin@medcare.test (self): role, branch_scope, and is_active are locked with clear notice
    await user.click(within(adminRow).getByRole('button', { name: 'Edit' }));
    const selfDialog = screen.getByRole('dialog');

    expect(
      within(selfDialog).getByText(
        'You cannot change your own role, branch scope, or active status.'
      )
    ).toBeDefined();
    expect(
      within(selfDialog).getByLabelText('Role').hasAttribute('disabled')
    ).toBe(true);
    expect(
      within(selfDialog).getByLabelText('Branch scope').hasAttribute('disabled')
    ).toBe(true);
    expect(
      within(selfDialog)
        .getByRole('switch', { name: 'Active account' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(
      within(selfDialog)
        .getByRole('button', { name: 'Save changes' })
        .hasAttribute('disabled')
    ).toBe(true);

    await user.click(
      within(selfDialog).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    // 2. Signed in as a different Admin: editing admin@medcare.test allows ALL <-> ASSIGNED and maps 422 is_active
    setSignedInUser({
      ...SELF_ADMIN_CONTEXT,
      user_id: OTHER_ADMIN_USER_ID,
      username: 'root.admin@medcare.test',
    });

    const seenBodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch(
        '*/api/v1/users/:id',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Deactivation blocked',
                trace_id: 'trace-is-active-422',
                details: [
                  {
                    field: 'is_active',
                    issue: 'Cannot deactivate primary organization admin',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    await user.click(within(adminRow).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByText(
        'You cannot change your own role, branch scope, or active status.'
      )
    ).toBeNull();

    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });

    // Switching ALL -> ASSIGNED -> clicking MED-DT -> switching back to ALL clears effective changes
    await user.selectOptions(
      within(dialog).getByLabelText('Branch scope'),
      'ASSIGNED'
    );
    await user.click(
      await within(dialog).findByRole('button', { name: /MED-DT/i })
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Branch scope'),
      'ALL'
    );
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    // Toggle Active account off -> 422 on is_active renders inline and clears when toggled back
    const activeSwitch = within(dialog).getByRole('switch', {
      name: 'Active account',
    });
    await user.click(activeSwitch);
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(
        'Cannot deactivate primary organization admin'
      )
    ).toBeDefined();
    await user.click(activeSwitch);
    await waitFor(() => {
      expect(
        within(dialog).queryByText(
          'Cannot deactivate primary organization admin'
        )
      ).toBeNull();
    });

    // Switch Admin (ALL) -> Pharmacist (ASSIGNED) with MED-ALX and save
    server.use(
      http.patch('*/api/v1/users/:id', async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        if (isRecord(body)) {
          seenBodies.push(body);
        }
        return HttpResponse.json({
          ...INITIAL_USERS[0],
          role: 'Pharmacist',
          branch_scope: 'ASSIGNED',
          branch_ids: [MED_ALX_ID],
        });
      })
    );

    await user.selectOptions(
      within(dialog).getByLabelText('Role'),
      'Pharmacist'
    );
    await user.click(
      await within(dialog).findByRole('button', { name: /MED-ALX/i })
    );
    await user.click(saveButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(seenBodies[0]).toEqual({
      role: 'Pharmacist',
      branch_scope: 'ASSIGNED',
      branch_ids: [MED_ALX_ID],
      is_active: true,
    });
  });

  it('validates 12-char minimum & password match, resets state on Cancel, locks while pending, and clears locked badge on ph.mona@medcare.test after password reset', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona@medcare.test');

    const getMonaRow = () => {
      const row = screen.getByText('ph.mona@medcare.test').closest('tr');
      if (!row) {
        throw new Error('Expected ph.mona@medcare.test row');
      }
      return row;
    };

    expect(within(getMonaRow()).getByText('Temporarily locked')).toBeDefined();

    // 1. Open ResetPasswordModal, verify 12-char copy & validation, then Cancel -> resets state
    await user.click(
      within(getMonaRow()).getByRole('button', { name: 'Reset password' })
    );
    const firstDialog = screen.getByRole('dialog');
    expect(within(firstDialog).getByText(/12–128 characters/i)).toBeDefined();
    const firstNewPass = within(firstDialog).getByLabelText('New password');
    expect(firstNewPass.getAttribute('placeholder')).toBe(
      'Minimum 12 characters'
    );

    await user.type(firstNewPass, '11charsPass');
    await user.type(
      within(firstDialog).getByLabelText('Confirm password'),
      '11charsPass'
    );
    await user.click(
      within(firstDialog).getByRole('button', { name: 'Reset password' })
    );
    expect(
      await within(firstDialog).findByText(
        'Password must be at least 12 characters'
      )
    ).toBeDefined();

    await user.click(
      within(firstDialog).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    // 2. Reopen -> cleared; test mismatch + 422 field error + pending lock + unlock on success
    server.use(
      http.post(
        '*/api/v1/users/:id/password-reset',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Password policy failure',
                details: [
                  {
                    field: 'new_password',
                    issue: 'Password cannot match recent history',
                  },
                ],
                trace_id: 'trace-reset-422',
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    await user.click(
      within(getMonaRow()).getByRole('button', { name: 'Reset password' })
    );
    const secondDialog = screen.getByRole('dialog');
    expect(
      within(secondDialog).queryByText(
        'Password must be at least 12 characters'
      )
    ).toBeNull();

    const newPassInput = within(secondDialog).getByLabelText('New password');
    const confirmInput =
      within(secondDialog).getByLabelText('Confirm password');
    await user.type(newPassInput, 'ValidPass123!');
    await user.type(confirmInput, 'DifferentPass123!');
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Reset password' })
    );
    expect(
      await within(secondDialog).findByText('Passwords do not match')
    ).toBeDefined();

    await user.clear(confirmInput);
    await user.type(confirmInput, 'ValidPass123!');
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Reset password' })
    );
    expect(
      await within(secondDialog).findByText(
        'Password cannot match recent history'
      )
    ).toBeDefined();
    expect(screen.queryByText(/Password policy failure/i)).toBeNull();

    // Successful password reset clears lockout_end on ph.mona@medcare.test in MSW and refetches list
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Reset password' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      await screen.findByText('Password reset for ph.mona@medcare.test')
    ).toBeDefined();
    await waitFor(() => {
      expect(within(getMonaRow()).queryByText('Temporarily locked')).toBeNull();
    });
  });

  it('revokes active sessions with pending guard & stable Idempotency-Key on retry, and guards double submit from empty state', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    let attempt = 0;
    let resolvePending: (() => void) | undefined;
    const pendingGate = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });

    server.use(
      http.post('*/api/v1/users/:id/revoke-sessions', async ({ request }) => {
        attempt += 1;
        seenKeys.push(request.headers.get('Idempotency-Key'));
        if (attempt === 1) {
          await pendingGate;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Session revocation service unavailable',
                details: [],
                trace_id: 'trace-revoke-500',
              },
            },
            { status: 500 }
          );
        }
        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona@medcare.test');

    const monaRow = screen.getByText('ph.mona@medcare.test').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona@medcare.test row');
    }
    await user.click(
      within(monaRow).getByRole('button', { name: 'Revoke sessions' })
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/invalidates all refresh tokens/i)
    ).toBeDefined();

    const revokeButton = within(dialog).getByRole('button', {
      name: 'Revoke sessions',
    });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });

    await user.click(revokeButton);
    await waitFor(() => {
      expect(revokeButton.hasAttribute('disabled')).toBe(true);
      expect(cancelButton.hasAttribute('disabled')).toBe(true);
    });

    resolvePending?.();
    expect(
      await within(dialog).findByText(
        /Session revocation service unavailable \(Trace: trace-revoke-500\)/i
      )
    ).toBeDefined();

    await user.click(revokeButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(
      await screen.findByText(
        'Active sessions revoked for ph.mona@medcare.test'
      )
    ).toBeDefined();

    // Empty state + double-submit lock on Create
    cleanup();
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json(makePagedUsers([], { total_count: 0 }))
      )
    );

    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('No user accounts yet')).toBeDefined();

    const addButtons = screen.getAllByRole('button', { name: 'Add user' });
    await user.click(addButtons[addButtons.length - 1]);
    const createDialog = screen.getByRole('dialog');

    let postCalls = 0;
    let resolveCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    server.use(
      http.post('*/api/v1/users', async () => {
        postCalls += 1;
        await createGate;
        return HttpResponse.json(INITIAL_USERS[0], { status: 201 });
      })
    );

    const empSelect = within(createDialog).getByLabelText('Employee');
    await waitFor(() => {
      expect(empSelect.hasAttribute('disabled')).toBe(false);
    });
    await user.selectOptions(empSelect, KARIM_EMPLOYEE_ID);
    await user.type(
      within(createDialog).getByLabelText('Username'),
      'admin.karim@medcare.test'
    );
    await user.type(
      within(createDialog).getByLabelText('Password'),
      'StrongPass12!'
    );
    await user.selectOptions(
      within(createDialog).getByLabelText('Role'),
      'Admin'
    );
    await user.selectOptions(
      within(createDialog).getByLabelText('Branch scope'),
      'ALL'
    );

    const createSubmit = within(createDialog).getByRole('button', {
      name: 'Create user',
    });
    await user.click(createSubmit);
    await waitFor(() => {
      expect(createSubmit.hasAttribute('disabled')).toBe(true);
    });
    await user.click(createSubmit);
    expect(postCalls).toBe(1);

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
