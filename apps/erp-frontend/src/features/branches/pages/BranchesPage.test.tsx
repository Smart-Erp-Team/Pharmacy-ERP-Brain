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
import { renderWithProviders } from '../../../test/renderWithProviders';
import { BranchesPage } from './BranchesPage';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('BranchesPage', () => {
  it('loads active branches, filters by search/status, and shows no delete button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);

    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();
    expect(screen.getByText('Alexandria Corniche Branch')).toBeDefined();
    expect(screen.queryByText('Giza Dokki Branch')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    expect(await screen.findByText('Giza Dokki Branch')).toBeDefined();

    await user.type(screen.getByLabelText('Search branches'), 'Alexandria');
    expect(screen.getByText('Alexandria Corniche Branch')).toBeDefined();
    expect(screen.queryByText('Cairo Main Branch')).toBeNull();

    await user.clear(screen.getByLabelText('Search branches'));
    await user.type(screen.getByLabelText('Search branches'), 'NoSuchCity');
    expect(screen.getByText('No branches match your filters')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();
  });

  it('validates and creates a branch, and surfaces 409 conflict errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('Cairo Main Branch');

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );
    expect(
      await within(dialog).findByText('Branch code is required')
    ).toBeDefined();

    await user.type(within(dialog).getByLabelText('Branch code'), 'CAI-01');
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'Duplicate Cairo'
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
    await user.type(within(dialog).getByLabelText('Branch code'), 'MAN-01');
    await user.clear(within(dialog).getByLabelText('Branch name'));
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'Mansoura Branch'
    );
    await user.clear(within(dialog).getByLabelText('City'));
    await user.type(within(dialog).getByLabelText('City'), 'Mansoura');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create branch' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Mansoura Branch')).toBeDefined();
  });

  it('edits an existing branch with immutable branch code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('Cairo Main Branch');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const dialog = screen.getByRole('dialog');
    const codeInput = within(dialog).getByLabelText(
      'Branch code'
    ) as HTMLInputElement;
    expect(codeInput.disabled).toBe(true);

    const nameInput = within(dialog).getByLabelText('Branch name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Cairo Downtown Flagship');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Cairo Downtown Flagship')).toBeDefined();
  });

  it('toggles branch active status softly without deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />);
    await screen.findByText('Cairo Main Branch');

    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for Cairo Main Branch',
      })
    );

    await waitFor(() => {
      expect(screen.queryByText('Cairo Main Branch')).toBeNull();
    });
  });

  it('generates and copies a single-use enrollment token', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    renderWithProviders(<BranchesPage />);
    await screen.findByText('Cairo Main Branch');

    const tokenButtons = screen.getAllByRole('button', {
      name: 'Enrollment token',
    });
    await user.click(tokenButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText(/enr_live_cai-01_9f8c7d6e/i)
    ).toBeDefined();

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeTextMock).toHaveBeenCalledWith('enr_live_cai-01_9f8c7d6e');
    expect(
      await within(dialog).findByRole('button', { name: 'Copied' })
    ).toBeDefined();
  });

  it('supports cursor pagination and retries on server failure', async () => {
    const user = userEvent.setup();
    let shouldFail = true;

    server.use(
      http.get('*/api/v1/branches', ({ request }) => {
        if (shouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary branch directory error',
                trace_id: 'trace-err-1',
              },
            },
            { status: 500 }
          );
        }
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'page-2') {
          return HttpResponse.json({
            items: [
              {
                branch_id: 'branch-page-2',
                organization_id: 'org-1',
                code: 'ASW-01',
                name: 'Aswan Branch',
                is_active: true,
                address: {
                  line1: '1 Nile Corniche',
                  city: 'Aswan',
                  country_code: 'EG',
                },
              },
            ],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              branch_id: 'branch-page-1',
              organization_id: 'org-1',
              code: 'CAI-01',
              name: 'Cairo Main Branch',
              is_active: true,
              address: {
                line1: '15 Tahrir Square',
                city: 'Cairo',
                country_code: 'EG',
              },
            },
          ],
          nextCursor: 'page-2',
        });
      })
    );

    renderWithProviders(<BranchesPage />);
    expect(
      await screen.findByText('Temporary branch directory error')
    ).toBeDefined();

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Aswan Branch')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Previous/i }));
    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();
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
    await screen.findByText('Cairo Main Branch');

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText('Branch code'), 'LUX-01');
    await user.type(
      within(dialog).getByLabelText('Branch name'),
      'Luxor Branch'
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

  it('keeps pagination visible when search filters page 2 down to zero matches', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/branches', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'page-2') {
          return HttpResponse.json({
            items: [
              {
                branch_id: 'branch-page-2',
                organization_id: 'org-1',
                code: 'ASW-01',
                name: 'Aswan Branch',
                is_active: true,
                address: {
                  line1: '1 Nile Corniche',
                  city: 'Aswan',
                  country_code: 'EG',
                },
              },
            ],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              branch_id: 'branch-page-1',
              organization_id: 'org-1',
              code: 'CAI-01',
              name: 'Cairo Main Branch',
              is_active: true,
              address: {
                line1: '15 Tahrir Square',
                city: 'Cairo',
                country_code: 'EG',
              },
            },
          ],
          nextCursor: 'page-2',
        });
      })
    );

    renderWithProviders(<BranchesPage />);
    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Aswan Branch')).toBeDefined();

    await user.type(screen.getByLabelText('Search branches'), 'NoMatchHere');
    expect(screen.getByText('No branches match your filters')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Previous/i }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Cairo Main Branch')).toBeDefined();
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
                code: 'INTERNAL_ERROR',
                message: 'Temporary save error',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
          organization_id: 'b1c2d3e4-2222-4b33-8c44-aabbccddeeff',
          code: 'CAI-01',
          name: 'Cairo Main Updated',
          is_active: true,
          address: {
            line1: '15 Tahrir Square',
            city: 'Cairo',
            country_code: 'EG',
          },
        });
      })
    );

    renderWithProviders(<BranchesPage />);
    await screen.findByText('Cairo Main Branch');

    const row = screen.getByText('Cairo Main Branch').closest('tr');
    if (!row) {
      throw new Error('Expected Cairo Main Branch row');
    }
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const saveButton = within(dialog).getByRole('button', {
      name: 'Save changes',
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const nameInput = within(dialog).getByLabelText('Branch name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Cairo Main Updated');
    expect(saveButton.disabled).toBe(false);

    // First save fails 500
    await user.click(saveButton);
    expect(
      await within(dialog).findByText('Temporary save error')
    ).toBeDefined();

    // Retry identical payload -> same Idempotency-Key
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
                code: 'INTERNAL_ERROR',
                message: 'Token service busy',
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
    await screen.findByText('Cairo Main Branch');

    const row = screen.getByText('Cairo Main Branch').closest('tr');
    if (!row) {
      throw new Error('Expected Cairo Main Branch row');
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
  });
});
