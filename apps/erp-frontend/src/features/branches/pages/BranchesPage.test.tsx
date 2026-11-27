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
import { handlers } from '../../../mocks/handlers';
import {
  MOCK_BRANCH_IDS,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser } from '../../../types/api';
import { BranchesPage } from './BranchesPage';

const ORG_ADMIN_CLOUD: CurrentUser = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setSignedInUser(currentUser: CurrentUser | null) {
  useAuthStore.setState({
    currentUser,
    organizationCode: currentUser ? 'MEDCARE' : null,
    activeBranchId: currentUser?.branch_ids[0] ?? null,
    isAuthenticated: currentUser !== null,
    isInitializing: false,
  });
}

const server = setupServer(...handlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  setSignedInUser(ORG_ADMIN_CLOUD);
});
afterEach(() => {
  server.resetHandlers();
  setSignedInUser(null);
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('BranchesPage', () => {
  it('loads active MEDCARE branches, filters via server-side search/include_inactive, and shows no delete button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);

    expect(
      await screen.findByText('MedCare - Downtown Flagship')
    ).toBeDefined();
    expect(screen.getByText('MED-DT')).toBeDefined();
    expect(screen.getByText('MedCare - Alexandria Corniche')).toBeDefined();
    expect(screen.getByText('MED-ALX')).toBeDefined();
    expect(screen.queryByText('MedCare - Giza Storage')).toBeNull();
    expect(screen.queryByText('MED-GZ')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    expect(await screen.findByText('MedCare - Giza Storage')).toBeDefined();
    expect(screen.getByText('MED-GZ')).toBeDefined();

    await user.type(screen.getByLabelText('Search branches'), 'MED-ALX');
    expect(
      await screen.findByText('MedCare - Alexandria Corniche')
    ).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText('MedCare - Downtown Flagship')).toBeNull();
    });

    await user.clear(screen.getByLabelText('Search branches'));
    await user.type(screen.getByLabelText('Search branches'), 'NoSuchBranch');
    expect(
      await screen.findByText('No branches match your filters')
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(
      await screen.findByText('MedCare - Downtown Flagship')
    ).toBeDefined();
    expect(screen.queryByText('MedCare - Giza Storage')).toBeNull();
  });

  it('validates and creates a branch without is_active toggle, and surfaces 409 conflict errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');

    expect(
      within(dialog).queryByRole('switch', { name: 'Active branch' })
    ).toBeNull();

    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );
    expect(
      await within(dialog).findByText('Branch code is required')
    ).toBeDefined();

    await user.type(within(dialog).getByLabelText('Branch code'), 'MED-DT');
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'Duplicate Downtown'
    );
    await user.type(
      within(dialog).getByLabelText('Address line 1'),
      '10 Nile St'
    );
    await user.type(within(dialog).getByLabelText('City'), 'Cairo');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );
    expect(
      await within(dialog).findByText(/already exists in this organization/i)
    ).toBeDefined();

    await user.clear(within(dialog).getByLabelText('Branch code'));
    await user.type(within(dialog).getByLabelText('Branch code'), 'MED-MAN');
    await user.clear(within(dialog).getByLabelText('Branch name'));
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'MedCare - Mansoura'
    );
    await user.clear(within(dialog).getByLabelText('City'));
    await user.type(within(dialog).getByLabelText('City'), 'Mansoura');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('MedCare - Mansoura')).toBeDefined();
    expect(screen.getByText('MED-MAN')).toBeDefined();
  });

  it('edits an existing branch with immutable branch_code and is_active toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const dialog = screen.getByRole('dialog');
    const codeInput = within(dialog).getByLabelText('Branch code');
    expect(codeInput.hasAttribute('disabled')).toBe(true);
    expect(
      within(dialog).getByRole('switch', { name: 'Active branch' })
    ).toBeDefined();

    const nameInput = within(dialog).getByLabelText('Branch name');
    await user.clear(nameInput);
    await user.type(nameInput, 'MedCare - Downtown Renovated');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      await screen.findByText('MedCare - Downtown Renovated')
    ).toBeDefined();
  });

  it('toggles branch active status softly without deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for MedCare - Downtown Flagship',
      })
    );

    await waitFor(() => {
      expect(screen.queryByText('MedCare - Downtown Flagship')).toBeNull();
    });
  });

  it('generates and copies a single-use enrollment token without enrollment_id', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    const tokenButtons = screen.getAllByRole('button', {
      name: 'Enrollment token',
    });
    await user.click(tokenButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText(/enr_live_med-dt_0001/i)
    ).toBeDefined();
    expect(within(dialog).getByText(/MED-DT/)).toBeDefined();

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeTextMock).toHaveBeenCalledWith('enr_live_med-dt_0001');
    expect(
      await within(dialog).findByRole('button', { name: 'Copied' })
    ).toBeDefined();
  });

  it('supports server-side pagination, resets page on filter changes, and retries on server failure', async () => {
    const user = userEvent.setup();
    let shouldFail = true;
    const seenRequests: Array<{
      page: string | null;
      pageSize: string | null;
      includeInactive: string | null;
      search: string | null;
    }> = [];

    server.use(
      http.get('*/api/v1/branches', ({ request }) => {
        if (shouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary branch directory error',
                details: [],
                trace_id: 'trace-err-1',
              },
            },
            { status: 500 }
          );
        }
        const searchParams = new URL(request.url).searchParams;
        const pageParam = searchParams.get('page');
        const pageSizeParam = searchParams.get('page_size');
        const includeInactiveParam = searchParams.get('include_inactive');
        const searchParam = searchParams.get('search');
        seenRequests.push({
          page: pageParam,
          pageSize: pageSizeParam,
          includeInactive: includeInactiveParam,
          search: searchParam,
        });

        if (searchParam === 'Aswan') {
          return HttpResponse.json({
            items: [
              {
                branch_id: '11111111-2222-4111-8111-000000000099',
                organization_id: currentUserContext.organization_id,
                branch_code: 'MED-ASW',
                name: 'MedCare - Aswan Branch',
                is_active: true,
                address: {
                  line1: '1 Nile Corniche',
                  line2: null,
                  city: 'Aswan',
                  region: null,
                  postal_code: null,
                  country_code: 'EG',
                },
                created_at: '2026-01-19T08:00:00+00:00',
                updated_at: '2026-11-25T10:00:00+00:00',
              },
            ],
            page: 1,
            page_size: 25,
            total_count: 1,
            next_cursor: null,
          });
        }

        if (pageParam === '2') {
          return HttpResponse.json({
            items: [
              {
                branch_id: '11111111-2222-4111-8111-000000000099',
                organization_id: currentUserContext.organization_id,
                branch_code: 'MED-ASW',
                name: 'MedCare - Aswan Branch',
                is_active: true,
                address: {
                  line1: '1 Nile Corniche',
                  line2: null,
                  city: 'Aswan',
                  region: null,
                  postal_code: null,
                  country_code: 'EG',
                },
                created_at: '2026-01-19T08:00:00+00:00',
                updated_at: '2026-11-25T10:00:00+00:00',
              },
            ],
            page: 2,
            page_size: 25,
            total_count: 26,
            next_cursor: null,
          });
        }

        return HttpResponse.json({
          items: [
            {
              branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
              organization_id: currentUserContext.organization_id,
              branch_code: 'MED-DT',
              name: 'MedCare - Downtown Flagship',
              is_active: true,
              address: {
                line1: '24 Talaat Harb Street',
                line2: 'Ground Floor',
                city: 'Cairo',
                region: 'Downtown',
                postal_code: '11511',
                country_code: 'EG',
              },
              created_at: '2026-01-15T08:00:00+00:00',
              updated_at: '2026-11-25T10:00:00+00:00',
            },
          ],
          page: 1,
          page_size: 25,
          total_count: 26,
          next_cursor: '2',
        });
      })
    );

    renderWithProviders(<BranchesPage />);
    expect(
      await screen.findByText('Temporary branch directory error')
    ).toBeDefined();

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('MedCare - Downtown Flagship')
    ).toBeDefined();
    expect(screen.getByText('Showing 1–25 of 26')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('MedCare - Aswan Branch')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();

    // Changing search resets page back to 1
    await user.type(screen.getByLabelText('Search branches'), 'Aswan');
    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeDefined();
    });

    await user.clear(screen.getByLabelText('Search branches'));
    expect(
      await screen.findByText('MedCare - Downtown Flagship')
    ).toBeDefined();

    // Navigate to page 2 again, then verify include_inactive resets page to 1
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Page 2')).toBeDefined();

    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeDefined();
    });

    const lastRequest = seenRequests[seenRequests.length - 1];
    expect(lastRequest).toEqual({
      page: '1',
      pageSize: '25',
      includeInactive: 'true',
      search: null,
    });
  });

  it('maps 422 backend field errors onto the branch form inputs', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/branches', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              trace_id: 'trace-val-1',
              details: [
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

    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText('Branch code'), 'MED-LUX');
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'MedCare - Luxor'
    );
    await user.type(
      within(dialog).getByLabelText('Address line 1'),
      '22 Karnak Rd'
    );
    await user.type(within(dialog).getByLabelText('City'), 'Luxor');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );

    expect(
      await within(dialog).findByText('City is not supported in this region')
    ).toBeDefined();
  });

  it('guards pristine edit form and stabilizes Idempotency-Key across retries', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    let attempt = 0;

    server.use(
      http.patch('*/api/v1/branches/*', ({ request }) => {
        attempt += 1;
        seenKeys.push(request.headers.get('Idempotency-Key'));
        if (attempt === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary save error',
                details: [],
                trace_id: 'trace-patch-500',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          organization_id: currentUserContext.organization_id,
          branch_code: 'MED-DT',
          name: 'MedCare - Downtown Updated',
          is_active: true,
          address: {
            line1: '24 Talaat Harb Street',
            line2: 'Ground Floor',
            city: 'Cairo',
            region: 'Downtown',
            postal_code: '11511',
            country_code: 'EG',
          },
          created_at: '2026-01-15T08:00:00+00:00',
          updated_at: '2026-11-26T10:00:00+00:00',
        });
      })
    );

    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    const row = screen.getByText('MedCare - Downtown Flagship').closest('tr');
    if (!row) {
      throw new Error('Expected MedCare - Downtown Flagship row');
    }
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    const nameInput = within(dialog).getByLabelText('Branch name');
    await user.clear(nameInput);
    await user.type(nameInput, 'MedCare - Downtown Updated');
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    await user.click(saveButton);
    expect(
      await within(dialog).findByText(/Temporary save error/)
    ).toBeDefined();

    await user.click(saveButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
  });

  it('supports retrying enrollment token generation and handles clipboard errors', async () => {
    const user = userEvent.setup();
    let tokenCalls = 0;

    server.use(
      http.post('*/api/v1/branches/*/enrollment-tokens', () => {
        tokenCalls += 1;
        if (tokenCalls === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Token service busy',
                details: [],
                trace_id: 'trace-token-500',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          {
            token: 'enr_retry_secret_99',
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
          { status: 201 }
        );
      })
    );

    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderWithProviders(<BranchesPage />);
    await screen.findByText('MedCare - Downtown Flagship');

    const row = screen.getByText('MedCare - Downtown Flagship').closest('tr');
    if (!row) {
      throw new Error('Expected MedCare - Downtown Flagship row');
    }
    await user.click(
      within(row).getByRole('button', { name: 'Enrollment token' })
    );

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Token service busy')).toBeDefined();

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(
      await within(dialog).findByText('enr_retry_secret_99')
    ).toBeDefined();

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('enr_retry_secret_99');
    expect(
      await within(dialog).findByText(/Clipboard access was blocked/i)
    ).toBeDefined();
  });

  it('restricts Admin with ASSIGNED scope on Cloud to Edit & Enrollment token for assigned branches only and hides Add branch and active toggles', async () => {
    const user = userEvent.setup();
    const seenPatchBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.patch('*/api/v1/branches/:branchId', async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        if (isRecord(body)) {
          seenPatchBodies.push(body);
        }
        return HttpResponse.json({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          organization_id: currentUserContext.organization_id,
          branch_code: 'MED-DT',
          name: 'MedCare - Downtown Scoped',
          is_active: true,
          address: {
            line1: '24 Talaat Harb Street',
            line2: 'Ground Floor',
            city: 'Cairo',
            region: 'Downtown',
            postal_code: '11511',
            country_code: 'EG',
          },
          created_at: '2026-01-15T08:00:00+00:00',
          updated_at: '2026-11-26T10:00:00+00:00',
        });
      })
    );

    setSignedInUser({
      ...ORG_ADMIN_CLOUD,
      branch_scope: 'ASSIGNED',
      branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
    });

    renderWithProviders(<BranchesPage />);
    expect(
      await screen.findByText('MedCare - Downtown Flagship')
    ).toBeDefined();
    expect(screen.getByText('MedCare - Alexandria Corniche')).toBeDefined();

    // Hides Add branch & active status toggles; shows assigned scope alert
    expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Assigned branch scope')).toBeDefined();

    const downtownRow = screen
      .getByText('MedCare - Downtown Flagship')
      .closest('tr');
    const alexRow = screen
      .getByText('MedCare - Alexandria Corniche')
      .closest('tr');
    if (!downtownRow || !alexRow) {
      throw new Error('Expected Downtown and Alexandria rows');
    }

    // Assigned branch keeps Edit & Enrollment token
    expect(
      within(downtownRow).getByRole('button', { name: 'Edit' })
    ).toBeDefined();
    expect(
      within(downtownRow).getByRole('button', { name: 'Enrollment token' })
    ).toBeDefined();

    // Unassigned branch blocks Edit & Enrollment token
    expect(within(alexRow).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(
      within(alexRow).queryByRole('button', { name: 'Enrollment token' })
    ).toBeNull();

    // Edit modal hides Active branch toggle and omits is_active from PATCH payload
    await user.click(within(downtownRow).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('switch', { name: 'Active branch' })
    ).toBeNull();

    const nameInput = within(dialog).getByLabelText('Branch name');
    await user.clear(nameInput);
    await user.type(nameInput, 'MedCare - Downtown Scoped');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seenPatchBodies).toHaveLength(1);
    expect('is_active' in (seenPatchBodies[0] ?? {})).toBe(false);
  });

  it('renders a read-only table without Actions column or write buttons for Pharmacist, Cashier, and BranchLocal', async () => {
    const readOnlyCases: Array<{ label: string; user: CurrentUser }> = [
      {
        label: 'Pharmacist on Cloud',
        user: {
          ...ORG_ADMIN_CLOUD,
          role: 'Pharmacist',
          branch_scope: 'ASSIGNED',
          branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
          scopes: ['inventory:read', 'inventory:write', 'sales:read'],
          runtime_mode: 'Cloud',
        },
      },
      {
        label: 'Cashier on Cloud',
        user: {
          ...ORG_ADMIN_CLOUD,
          role: 'Cashier',
          branch_scope: 'ASSIGNED',
          branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
          scopes: ['inventory:read', 'sales:read', 'sales:write'],
          runtime_mode: 'Cloud',
        },
      },
      {
        label: 'Admin on BranchLocal',
        user: {
          ...ORG_ADMIN_CLOUD,
          role: 'Admin',
          branch_scope: 'ASSIGNED',
          branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
          runtime_mode: 'BranchLocal',
        },
      },
    ];

    for (const testCase of readOnlyCases) {
      setSignedInUser(testCase.user);
      renderWithProviders(<BranchesPage />);

      expect(
        await screen.findByText('MedCare - Downtown Flagship')
      ).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Enrollment token' })
      ).toBeNull();
      expect(
        screen.queryByRole('columnheader', { name: 'Actions' })
      ).toBeNull();

      if (testCase.user.runtime_mode === 'BranchLocal') {
        expect(
          screen.getByText(
            'Branch changes and enrollment tokens require the Cloud deployment.'
          )
        ).toBeDefined();
      } else {
        expect(
          screen.getByText(
            'Only administrators can create, edit, or issue enrollment tokens for branches.'
          )
        ).toBeDefined();
      }

      cleanup();
    }
  });
});
