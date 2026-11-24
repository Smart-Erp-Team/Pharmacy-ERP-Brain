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
import { handlers } from '../../../mocks/handlers';
import { resetMockBranches } from '../../../mocks/branchHandlers';
import { resetMockEmployees } from '../../../mocks/employeeHandlers';
import { INITIAL_USERS, resetMockUsers } from '../../../mocks/userHandlers';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { UsersPage } from './UsersPage';

const CAIRO_BRANCH_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const server = setupServer(...handlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
  resetMockUsers();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('UsersPage', () => {
  it('shows loading state, renders user accounts with employee info and locked badge on ph.mona, and has no delete button', async () => {
    let resolveUsers: (() => void) | undefined;
    const usersGate = new Promise<void>((resolve) => {
      resolveUsers = resolve;
    });

    server.use(
      http.get('*/api/v1/users', async () => {
        await usersGate;
        return HttpResponse.json({
          items: INITIAL_USERS,
          nextCursor: null,
        });
      })
    );

    renderWithProviders(<UsersPage />);

    const loadingRegion = screen.getByRole('status', {
      name: 'Loading user accounts',
    });
    expect(loadingRegion).toBeDefined();
    expect(loadingRegion.getAttribute('aria-busy')).toBe('true');

    resolveUsers?.();

    expect(await screen.findByText('admin.omar')).toBeDefined();
    expect(screen.getByText('ph.mona')).toBeDefined();
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('EMP-001')).toBeDefined();
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.getByText('EMP-002')).toBeDefined();

    const monaRow = screen.getByText('ph.mona').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona table row');
    }
    expect(within(monaRow).getByText('Temporarily locked')).toBeDefined();
    expect(within(monaRow).getByText('Failed login attempts')).toBeDefined();

    const omarRow = screen.getByText('admin.omar').closest('tr');
    if (!omarRow) {
      throw new Error('Expected admin.omar table row');
    }
    expect(within(omarRow).queryByText('Temporarily locked')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('shows Employee unavailable when employee directory fails and supports list retry and pagination', async () => {
    const user = userEvent.setup();
    let failUsers = true;

    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        if (failUsers) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary user directory error',
                trace_id: 'trace-users-err',
              },
            },
            { status: 500 }
          );
        }

        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'page-2') {
          return HttpResponse.json({
            items: [INITIAL_USERS[1]],
            nextCursor: null,
          });
        }

        return HttpResponse.json({
          items: [INITIAL_USERS[0]],
          nextCursor: 'page-2',
        });
      }),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Employee directory unavailable',
            },
          },
          { status: 500 }
        )
      )
    );

    renderWithProviders(<UsersPage />);

    expect(
      await screen.findByText('Temporary user directory error')
    ).toBeDefined();

    failUsers = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('admin.omar')).toBeDefined();
    expect(await screen.findByText('Employee unavailable')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('ph.mona')).toBeDefined();

    await user.type(screen.getByLabelText('Search users'), 'NoSuchUser');
    expect(
      screen.getByText('No user accounts match your filters')
    ).toBeDefined();

    // Pagination remains visible on page 2 even with zero filtered matches
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('admin.omar')).toBeDefined();
  });

  it('filters by search, role, and status, toggles active softly, and recovers from inactive-only empty state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('admin.omar')).toBeDefined();
    expect(await screen.findByText('Mona Adel')).toBeDefined();

    // Search by employee full name, employee_no, and username
    const searchInput = screen.getByLabelText('Search users');
    await user.type(searchInput, 'Mona Adel');
    expect(screen.getByText('ph.mona')).toBeDefined();
    expect(screen.queryByText('admin.omar')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'EMP-001');
    expect(screen.getByText('admin.omar')).toBeDefined();
    expect(screen.queryByText('ph.mona')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'ph.mona');
    expect(screen.getByText('ph.mona')).toBeDefined();
    expect(screen.queryByText('admin.omar')).toBeNull();

    await user.clear(searchInput);
    await user.selectOptions(screen.getByLabelText('Role filter'), 'Admin');
    expect(screen.getByText('admin.omar')).toBeDefined();
    expect(screen.queryByText('ph.mona')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Role filter'), 'Cashier');
    expect(
      screen.getByText('No user accounts match your filters')
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('ph.mona')).toBeDefined();

    // Soft-deactivate both users to trigger inactive-only recovery empty state
    await user.click(
      screen.getByRole('switch', { name: 'Toggle status for admin.omar' })
    );
    await waitFor(() => {
      expect(screen.queryByText('admin.omar')).toBeNull();
    });

    await user.click(
      screen.getByRole('switch', { name: 'Toggle status for ph.mona' })
    );
    expect(await screen.findByText('No active user accounts')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(await screen.findByText('admin.omar')).toBeDefined();
    expect(screen.getByText('ph.mona')).toBeDefined();

    await user.selectOptions(
      screen.getByLabelText('Status filter'),
      'inactive'
    );
    expect(screen.getByText('admin.omar')).toBeDefined();
  });

  it('creates a user account: excludes EMP-001/EMP-002/inactive, forces non-Admin ASSIGNED, validates >=1 branch, handles 409/422, and disables when no eligible employees remain', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('admin.omar')).toBeDefined();
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');

    // Only EMP-003 (Youssef Tarek) is eligible; EMP-001, EMP-002, and inactive EMP-004 are excluded
    const employeeSelect = within(dialog).getByLabelText('Employee');
    const optionTexts = Array.from(
      employeeSelect.querySelectorAll('option')
    ).map((option) => option.textContent ?? '');
    expect(optionTexts).toContain('EMP-003 — Youssef Tarek');
    expect(optionTexts.some((text) => text.includes('EMP-001'))).toBe(false);
    expect(optionTexts.some((text) => text.includes('EMP-002'))).toBe(false);
    expect(optionTexts.some((text) => text.includes('EMP-004'))).toBe(false);

    // Selecting Admin exposes ALL scope; switching back to Pharmacist forces ASSIGNED
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
    expect(
      Array.from(scopeSelect.querySelectorAll('option')).some(
        (opt) => opt.value === 'ALL'
      )
    ).toBe(false);
    expect(within(dialog).getByText('Permitted branches')).toBeDefined();

    // Client-side validation requires employee, username, password, and >= 1 branch
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );
    expect(
      await within(dialog).findByText('Employee is required')
    ).toBeDefined();
    expect(within(dialog).getByText('Username is required')).toBeDefined();
    expect(
      within(dialog).getByText('Password must be at least 8 characters')
    ).toBeDefined();
    expect(
      within(dialog).getByText('Select at least one branch for ASSIGNED scope')
    ).toBeDefined();

    // Fill valid fields with duplicate username -> 409 conflict from MSW
    await user.selectOptions(
      employeeSelect,
      'a1111111-1111-4111-8111-111111111103'
    );
    await user.type(within(dialog).getByLabelText('Username'), 'admin.omar');
    await user.type(within(dialog).getByLabelText('Password'), 'Password123');

    const cairoChip = await within(dialog).findByRole('button', {
      name: /CAI-01/i,
    });
    await user.click(cairoChip);
    expect(cairoChip.getAttribute('aria-pressed')).toBe('true');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );
    expect(
      await within(dialog).findByText(
        /Username "admin\.omar" is already taken/i
      )
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        'Username must be unique within the organization.'
      )
    ).toBeDefined();

    // 422 field error maps onto field without duplicate toast
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
    await user.type(usernameInput, 'ph.youssef');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );

    expect(
      await within(dialog).findByText('Username contains reserved word')
    ).toBeDefined();
    expect(screen.queryByText(/Server rejected user creation/i)).toBeNull();

    // Successful create
    await user.click(
      within(dialog).getByRole('button', { name: 'Create user' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('ph.youssef')).toBeDefined();

    // Now all active employees have accounts -> Create modal disables submit with helpful Alert
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

  it('shows warning and retry buttons inside Create modal when employees or branches fail to load', async () => {
    const user = userEvent.setup();
    let failDirectories = true;

    server.use(
      http.get('*/api/v1/employees', () => {
        if (failDirectories) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Employees failed',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      }),
      http.get('*/api/v1/branches', () => {
        if (failDirectories) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Branches failed',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('admin.omar');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');

    expect(
      await within(dialog).findByText('Employees unavailable')
    ).toBeDefined();
    expect(
      await within(dialog).findByText('Branches unavailable')
    ).toBeDefined();

    failDirectories = false;
    const retryButtons = within(dialog).getAllByRole('button', {
      name: 'Retry',
    });
    await user.click(retryButtons[0]);
    await user.click(retryButtons[1]);

    await waitFor(() => {
      expect(within(dialog).queryByText('Employees unavailable')).toBeNull();
      expect(within(dialog).queryByText('Branches unavailable')).toBeNull();
    });
    expect(
      await within(dialog).findByRole('button', { name: /CAI-01/i })
    ).toBeDefined();
  });

  it('edits ASSIGNED user with immutable username, preserves untouched branch grants, enforces !isDirty guard, and stabilizes Idempotency-Key on retry', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    const seenBodies: Array<Record<string, unknown>> = [];
    let attempt = 0;

    server.use(
      http.patch('*/api/v1/users/*', async ({ request }) => {
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
                code: 'INTERNAL_ERROR',
                message: 'Temporary user save failure',
                trace_id: 'trace-patch-retry',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          ...INITIAL_USERS[1],
          role: 'Cashier',
        });
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona');

    const monaRow = screen.getByText('ph.mona').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona row');
    }
    await user.click(within(monaRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const usernameInput = within(dialog).getByLabelText('Username');
    expect(usernameInput.hasAttribute('disabled')).toBe(true);
    expect(usernameInput.hasAttribute('readonly')).toBe(true);
    expect(within(dialog).queryByLabelText(/password/i)).toBeNull();

    expect(
      within(dialog).getByText(
        /Current branch grants are unavailable from GET \/users/i
      )
    ).toBeDefined();

    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    // Change role without clicking branch chips -> preserves existing grants (omits branch_access)
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'Cashier');
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    // Attempt 1 fails with 500
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(/Temporary user save failure/i)
    ).toBeDefined();

    // Attempt 2 retries identical payload -> identical Idempotency-Key
    await user.click(saveButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(seenBodies[0]).toEqual({
      role: 'Cashier',
      branch_scope: 'ASSIGNED',
      is_active: true,
    });
    expect('branch_access' in (seenBodies[0] ?? {})).toBe(false);
  });

  it('requires >= 1 branch when editing ALL -> ASSIGNED and sends branch_access when branch chips are clicked', async () => {
    const user = userEvent.setup();
    const seenBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.patch('*/api/v1/users/*', async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        if (isRecord(body)) {
          seenBodies.push(body);
        }
        return HttpResponse.json({
          ...INITIAL_USERS[0],
          role: 'Pharmacist',
          branch_scope: 'ASSIGNED',
        });
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('admin.omar');

    const omarRow = screen.getByText('admin.omar').closest('tr');
    if (!omarRow) {
      throw new Error('Expected admin.omar row');
    }
    await user.click(within(omarRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Role'),
      'Pharmacist'
    );

    // Switching Admin (ALL) -> Pharmacist forces ASSIGNED and requires >= 1 branch
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    expect(
      await within(dialog).findByText(
        'Select at least one branch for ASSIGNED scope'
      )
    ).toBeDefined();
    expect(seenBodies).toHaveLength(0);

    const alexChip = await within(dialog).findByRole('button', {
      name: /ALX-01/i,
    });
    await user.click(alexChip);
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(seenBodies[0]).toEqual({
      role: 'Pharmacist',
      branch_scope: 'ASSIGNED',
      is_active: true,
      branch_access: [{ branch_id: ALEX_BRANCH_ID }],
    });
  });

  it('handles untouched ASSIGNED edit when clicking a branch chip and maps 422 field errors cleanly', async () => {
    const user = userEvent.setup();

    server.use(
      http.patch(
        '*/api/v1/users/*',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Edit rejected by server',
                trace_id: 'trace-edit-422',
                details: [
                  {
                    field: 'branch_access[0].branch_id',
                    issue: 'Branch cannot be assigned',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona');

    const monaRow = screen.getByText('ph.mona').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona row');
    }
    await user.click(within(monaRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const cairoChip = await within(dialog).findByRole('button', {
      name: /CAI-01/i,
    });
    await user.click(cairoChip);

    // Info alert disappears once branch access edit begins
    expect(
      within(dialog).queryByText(
        /Current branch grants are unavailable from GET \/users/i
      )
    ).toBeNull();

    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    expect(
      await within(dialog).findByText('Branch cannot be assigned')
    ).toBeDefined();
    expect(screen.queryByText(/Edit rejected by server/i)).toBeNull();

    // Retrying succeeds without changing branch selection
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('validates password mismatch and resets password cleanly in ResetPasswordModal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona');

    const monaRow = screen.getByText('ph.mona').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona row');
    }
    await user.click(
      within(monaRow).getByRole('button', { name: 'Reset password' })
    );

    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('New password'),
      'ValidPass123'
    );
    await user.type(
      within(dialog).getByLabelText('Confirm password'),
      'Different456'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset password' })
    );

    expect(
      await within(dialog).findByText('Passwords do not match')
    ).toBeDefined();

    const confirmInput = within(dialog).getByLabelText('Confirm password');
    await user.clear(confirmInput);
    await user.type(confirmInput, 'ValidPass123');
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset password' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Password reset for ph.mona')).toBeDefined();
  });

  it('warns in RevokeSessionsModal, disables buttons while pending, and preserves Idempotency-Key across error retry', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    let attempt = 0;
    let resolvePending: (() => void) | undefined;
    const pendingGate = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });

    server.use(
      http.post(
        '*/api/v1/users/:userId/revoke-sessions',
        async ({ request }) => {
          attempt += 1;
          seenKeys.push(request.headers.get('Idempotency-Key'));
          if (attempt === 1) {
            await pendingGate;
            return HttpResponse.json(
              {
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Session revocation service unavailable',
                  trace_id: 'trace-revoke-500',
                },
              },
              { status: 500 }
            );
          }
          return new HttpResponse(null, { status: 204 });
        }
      )
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona');

    const monaRow = screen.getByText('ph.mona').closest('tr');
    if (!monaRow) {
      throw new Error('Expected ph.mona row');
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

    // Retry reuses identical Idempotency-Key
    await user.click(revokeButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(
      await screen.findByText('Active sessions revoked for ph.mona')
    ).toBeDefined();
    expect(CAIRO_BRANCH_ID).toBeTruthy();
  });

  it('shows empty state when no user accounts exist, locks submit while creating, and maps 422 in ResetPasswordModal', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({ items: [], nextCursor: null })
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
        return HttpResponse.json(
          {
            user_id: 'b2222222-2222-4222-8222-222222222299',
            employee_id: 'a1111111-1111-4111-8111-111111111101',
            username: 'admin.omar',
            role: 'Admin',
            branch_scope: 'ALL',
            is_active: true,
          },
          { status: 201 }
        );
      })
    );

    await user.selectOptions(
      within(createDialog).getByLabelText('Employee'),
      'a1111111-1111-4111-8111-111111111101'
    );
    await user.type(
      within(createDialog).getByLabelText('Username'),
      'admin.omar'
    );
    await user.type(
      within(createDialog).getByLabelText('Password'),
      'Password123'
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

    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({
          items: [
            {
              user_id: 'b2222222-2222-4222-8222-222222222299',
              employee_id: 'a1111111-1111-4111-8111-111111111101',
              username: 'admin.omar',
              role: 'Admin',
              branch_scope: 'ALL',
              is_active: true,
              access_failed_count: 0,
              lockout_end: null,
              last_login_at: null,
            },
          ],
          nextCursor: null,
        })
      )
    );
    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // ResetPasswordModal 422 field error mapping without duplicate toast
    server.use(
      http.post(
        '*/api/v1/users/:userId/password-reset',
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
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    await user.click(
      await screen.findByRole('button', { name: 'Reset password' })
    );
    const resetDialog = screen.getByRole('dialog');
    await user.type(
      within(resetDialog).getByLabelText('New password'),
      'Password123'
    );
    await user.type(
      within(resetDialog).getByLabelText('Confirm password'),
      'Password123'
    );
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset password' })
    );

    expect(
      await within(resetDialog).findByText(
        'Password cannot match recent history'
      )
    ).toBeDefined();
    expect(screen.queryByText(/Password policy failure/i)).toBeNull();
  });

  it('displays 422 is_active error inline in EditUserFormModal, clears it on toggle, and handles Admin ALL -> ASSIGNED -> ALL cleanly', async () => {
    const user = userEvent.setup();

    server.use(
      http.patch(
        '*/api/v1/users/*',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Self deactivation blocked',
                trace_id: 'trace-is-active-422',
                details: [
                  {
                    field: 'is_active',
                    issue: 'Cannot deactivate self',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('admin.omar');

    const omarRow = screen.getByText('admin.omar').closest('tr');
    if (!omarRow) {
      throw new Error('Expected admin.omar row');
    }
    await user.click(within(omarRow).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });

    // Direct Admin ALL -> ASSIGNED requires >= 1 branch
    await user.selectOptions(
      within(dialog).getByLabelText('Branch scope'),
      'ASSIGNED'
    );
    await user.click(saveButton);
    expect(
      await within(dialog).findByText(
        'Select at least one branch for ASSIGNED scope'
      )
    ).toBeDefined();

    // Clicking a branch then switching back to ALL clears hidden branch dirtiness -> !isDirty
    const cairoChip = await within(dialog).findByRole('button', {
      name: /CAI-01/i,
    });
    await user.click(cairoChip);
    await user.selectOptions(
      within(dialog).getByLabelText('Branch scope'),
      'ALL'
    );
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    // Toggle Active account off -> 422 on is_active displays inline without duplicate banner/toast
    const activeSwitch = within(dialog).getByRole('switch', {
      name: 'Active account',
    });
    await user.click(activeSwitch);
    await user.click(saveButton);

    expect(
      await within(dialog).findByText('Cannot deactivate self')
    ).toBeDefined();
    expect(screen.queryByText(/Self deactivation blocked/i)).toBeNull();

    // Toggling back clears the field error
    await user.click(activeSwitch);
    await waitFor(() => {
      expect(within(dialog).queryByText('Cannot deactivate self')).toBeNull();
    });
  });

  it('keeps switch state and shows toast on toggle error, and does not show locked badge for past lockout_end', async () => {
    const user = userEvent.setup();

    server.use(
      http.get('*/api/v1/users', () =>
        HttpResponse.json({
          items: [
            {
              ...INITIAL_USERS[0],
            },
            {
              ...INITIAL_USERS[1],
              lockout_end: '2020-01-01T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        })
      ),
      http.patch(
        '*/api/v1/users/*',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'User status update failed',
                trace_id: 'trace-toggle-500',
              },
            },
            { status: 500 }
          ),
        { once: true }
      )
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('ph.mona');

    expect(screen.queryByText('Temporarily locked')).toBeNull();
    expect(screen.queryByText('Failed login attempts')).toBeNull();

    const omarSwitch = screen.getByRole('switch', {
      name: 'Toggle status for admin.omar',
    });
    expect(omarSwitch.getAttribute('aria-checked')).toBe('true');

    await user.click(omarSwitch);
    expect(
      await screen.findByText(
        /User status update failed \(Trace: trace-toggle-500\)/i
      )
    ).toBeDefined();
    expect(omarSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('locks ResetPasswordModal while pending, resets unsaved state on Cancel, and uses fresh nextCursor after Page 1 mutation', async () => {
    const user = userEvent.setup();
    const seenCursors: Array<string | null> = [];
    let currentNextCursor = 'cursor-v1';

    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        seenCursors.push(cursor);
        if (cursor === 'cursor-v1' || cursor === 'cursor-v2') {
          return HttpResponse.json({
            items: [INITIAL_USERS[1]],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          items: [INITIAL_USERS[0]],
          nextCursor: currentNextCursor,
        });
      })
    );

    renderWithProviders(<UsersPage />);
    await screen.findByText('admin.omar');

    // Visit page 2 with cursor-v1, return to page 1, mutate cursor, then go forward again
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('ph.mona');
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await screen.findByText('admin.omar');

    // Open ResetPasswordModal, trigger mismatch error, Cancel, then reopen -> error/values cleared
    const omarRow = screen.getByText('admin.omar').closest('tr');
    if (!omarRow) {
      throw new Error('Expected admin.omar row');
    }
    await user.click(
      within(omarRow).getByRole('button', { name: 'Reset password' })
    );
    const firstResetDialog = screen.getByRole('dialog');
    await user.type(
      within(firstResetDialog).getByLabelText('New password'),
      'short'
    );
    await user.click(
      within(firstResetDialog).getByRole('button', { name: 'Reset password' })
    );
    expect(
      await within(firstResetDialog).findByText(
        'Password must be at least 8 characters'
      )
    ).toBeDefined();
    await user.click(
      within(firstResetDialog).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    let resolveReset: (() => void) | undefined;
    const resetGate = new Promise<void>((resolve) => {
      resolveReset = resolve;
    });
    let resetCalls = 0;
    server.use(
      http.post('*/api/v1/users/:userId/password-reset', async () => {
        resetCalls += 1;
        await resetGate;
        return new HttpResponse(null, { status: 204 });
      })
    );

    await user.click(
      within(omarRow).getByRole('button', { name: 'Reset password' })
    );
    const secondResetDialog = screen.getByRole('dialog');
    expect(
      within(secondResetDialog).queryByText(
        'Password must be at least 8 characters'
      )
    ).toBeNull();
    const newPassInput =
      within(secondResetDialog).getByLabelText('New password');
    if (!(newPassInput instanceof HTMLInputElement)) {
      throw new Error('Expected password input');
    }
    expect(newPassInput.value).toBe('');

    await user.type(newPassInput, 'FreshPass123');
    await user.type(
      within(secondResetDialog).getByLabelText('Confirm password'),
      'FreshPass123'
    );

    const submitResetBtn = within(secondResetDialog).getByRole('button', {
      name: 'Reset password',
    });
    const cancelResetBtn = within(secondResetDialog).getByRole('button', {
      name: 'Cancel',
    });

    currentNextCursor = 'cursor-v2';
    await user.click(submitResetBtn);
    await waitFor(() => {
      expect(submitResetBtn.hasAttribute('disabled')).toBe(true);
      expect(cancelResetBtn.hasAttribute('disabled')).toBe(true);
    });
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(resetCalls).toBe(1);

    resolveReset?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // After mutation refetched page 1 with cursor-v2, Next page must request cursor-v2
    await waitFor(() => {
      expect(seenCursors).toEqual([null, 'cursor-v1', null, null]);
    });
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('ph.mona');
    expect(seenCursors[seenCursors.length - 1]).toBe('cursor-v2');
  });

  it('blocks employee selection while multi-page user accounts are loading, retries on failure, and excludes accounts from page 2 once loaded', async () => {
    const user = userEvent.setup();
    let releaseSecondPage: (() => void) | undefined;
    let secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    let failSecondPage = true;

    server.use(
      http.get('*/api/v1/users', async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'page-2') {
          await secondPageGate;
          if (failSecondPage) {
            return HttpResponse.json(
              {
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Second users page failed',
                },
              },
              { status: 500 }
            );
          }
          return HttpResponse.json({
            items: [INITIAL_USERS[1]],
            nextCursor: null,
          });
        }

        return HttpResponse.json({
          items: [INITIAL_USERS[0]],
          nextCursor: 'page-2',
        });
      })
    );

    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('admin.omar')).toBeDefined();
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');
    const employeeSelect = within(dialog).getByLabelText('Employee');
    const submitButton = within(dialog).getByRole('button', {
      name: 'Create user',
    });

    // 1. While page 2 (containing EMP-002's account) is still loading, Employee select & Submit are disabled
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);
    expect(submitButton.hasAttribute('disabled')).toBe(true);
    const loadingOptionTexts = Array.from(
      employeeSelect.querySelectorAll('option')
    ).map((option) => option.textContent ?? '');
    expect(loadingOptionTexts).toEqual(['Loading employees...']);
    expect(loadingOptionTexts.some((text) => text.includes('EMP-002'))).toBe(
      false
    );

    // 2. Let page 2 fail -> shows Employees unavailable warning + Retry, keeping Employee select disabled
    releaseSecondPage?.();
    expect(
      await within(dialog).findByText('Employees unavailable')
    ).toBeDefined();
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);
    expect(submitButton.hasAttribute('disabled')).toBe(true);

    // 3. Retry with a fresh gate -> disables while retrying, then resolves and excludes EMP-002 from page 2
    failSecondPage = false;
    secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(employeeSelect.hasAttribute('disabled')).toBe(true);

    releaseSecondPage?.();
    await waitFor(() => {
      expect(within(dialog).queryByText('Employees unavailable')).toBeNull();
      expect(employeeSelect.hasAttribute('disabled')).toBe(false);
    });

    const readyOptionTexts = Array.from(
      employeeSelect.querySelectorAll('option')
    ).map((option) => option.textContent ?? '');
    expect(readyOptionTexts).toContain('EMP-003 — Youssef Tarek');
    expect(readyOptionTexts.some((text) => text.includes('EMP-001'))).toBe(
      false
    );
    expect(readyOptionTexts.some((text) => text.includes('EMP-002'))).toBe(
      false
    );
  });
});
