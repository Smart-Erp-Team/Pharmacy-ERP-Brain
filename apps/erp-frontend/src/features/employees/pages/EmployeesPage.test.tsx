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
import {
  branchHandlers,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  employeeHandlers,
  resetMockEmployees,
} from '../../../mocks/employeeHandlers';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { EmployeesPage } from './EmployeesPage';

const CAIRO_BRANCH_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const server = setupServer(...branchHandlers, ...employeeHandlers);

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('EmployeesPage', () => {
  it('shows loading state, renders active employees with branch labels, and has no delete button', async () => {
    let resolveEmployees: (() => void) | undefined;
    const employeesGate = new Promise<void>((resolve) => {
      resolveEmployees = resolve;
    });

    server.use(
      http.get('*/api/v1/employees', async () => {
        await employeesGate;
        return HttpResponse.json({
          items: [
            {
              employee_id: 'a1111111-1111-4111-8111-111111111101',
              organization_id: 'org-1',
              branch_id: CAIRO_BRANCH_ID,
              employee_no: 'EMP-001',
              full_name: 'Omar Khaled',
              email: 'omar.khaled@pharmaplus.eg',
              phone: '+20 100 111 2233',
              job_title: 'Lead Pharmacist',
              address: {
                line1: '15 Tahrir Square',
                city: 'Cairo',
                country_code: 'EG',
              },
              hired_on: '2024-03-01',
              is_active: true,
            },
          ],
          nextCursor: null,
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
    const table = screen.getByRole('table');
    expect(
      await within(table).findByText('CAI-01 — Cairo Main Branch')
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('filters by branch, status, and search fields, and resets filters cleanly', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.getByText('Youssef Tarek')).toBeDefined();
    expect(screen.queryByText('Salma Hassan')).toBeNull();

    // Branch filter (server branchId query param)
    await user.selectOptions(
      screen.getByLabelText('Home branch'),
      CAIRO_BRANCH_ID
    );
    await waitFor(() => {
      expect(screen.queryByText('Mona Adel')).toBeNull();
    });
    expect(screen.getByText('Omar Khaled')).toBeDefined();
    expect(screen.getByText('Youssef Tarek')).toBeDefined();

    // Reset branch back to All branches and switch status to all
    await user.selectOptions(screen.getByLabelText('Home branch'), '');
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    expect(await screen.findByText('Salma Hassan')).toBeDefined();

    // Inactive only
    await user.selectOptions(
      screen.getByLabelText('Status filter'),
      'inactive'
    );
    expect(screen.getByText('Salma Hassan')).toBeDefined();
    expect(screen.queryByText('Omar Khaled')).toBeNull();

    // Search by phone, email, job_title, employee_no, full_name
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    const searchInput = screen.getByLabelText('Search employees');

    await user.type(searchInput, '+20 122 333');
    expect(screen.getByText('Mona Adel')).toBeDefined();
    expect(screen.queryByText('Omar Khaled')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'omar.khaled@');
    expect(screen.getByText('Omar Khaled')).toBeDefined();
    expect(screen.queryByText('Mona Adel')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'EMP-004');
    expect(screen.getByText('Salma Hassan')).toBeDefined();
    expect(screen.queryByText('Omar Khaled')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'Inventory Pharmacist');
    expect(screen.getByText('Youssef Tarek')).toBeDefined();
    expect(screen.queryByText('Mona Adel')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'NoSuchEmployee');
    expect(screen.getByText('No employees match your filters')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
    expect(screen.queryByText('Salma Hassan')).toBeNull();
  });

  it('shows Branch unavailable when branches endpoint fails and never renders 0', async () => {
    server.use(
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Branch service unavailable',
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

  it('creates an employee, rejects 409 duplicate employee_no in same branch, and allows same employee_no in another branch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    const dialog = screen.getByRole('dialog');

    // Client-side validation check
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
    expect(within(dialog).getByText('Hire date is required')).toBeDefined();

    // Duplicate EMP-001 in Cairo branch -> 409 conflict
    await user.selectOptions(
      within(dialog).getByLabelText('Home branch'),
      CAIRO_BRANCH_ID
    );
    await user.type(
      within(dialog).getByLabelText('Employee number'),
      'EMP-001'
    );
    await user.type(
      within(dialog).getByLabelText('Full name'),
      'Duplicate Cairo Emp'
    );
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
      await within(dialog).findByText(/already exists in this branch/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText(/Trace: mock-trace-employee-conflict/i)
    ).toBeDefined();

    // Same EMP-001 in Alexandria branch succeeds
    await user.selectOptions(
      within(dialog).getByLabelText('Home branch'),
      ALEX_BRANCH_ID
    );
    await user.clear(within(dialog).getByLabelText('Full name'));
    await user.type(within(dialog).getByLabelText('Full name'), 'Nadia Samir');
    await user.clear(within(dialog).getByLabelText('City'));
    await user.type(within(dialog).getByLabelText('City'), 'Alexandria');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create employee' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Nadia Samir')).toBeDefined();
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
      CAIRO_BRANCH_ID
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

  it('edits employee with !isDirty guard, normalizes cleared optional fields, and stabilizes Idempotency-Key on retry', async () => {
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
                code: 'INTERNAL_ERROR',
                message: 'Temporary employee save failure',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          employee_id: 'a1111111-1111-4111-8111-111111111101',
          organization_id: 'org-1',
          branch_id: CAIRO_BRANCH_ID,
          employee_no: 'EMP-001',
          full_name: 'Omar Khaled Updated',
          email: null,
          phone: '+20 100 111 2233',
          job_title: 'Lead Pharmacist',
          address: {
            line1: '15 Tahrir Square',
            line2: 'Apt 4',
            city: 'Cairo',
            region: 'Cairo Governorate',
            postal_code: '11511',
            country_code: 'EG',
          },
          hired_on: '2024-03-01',
          is_active: true,
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
      await within(dialog).findByText('Temporary employee save failure')
    ).toBeDefined();

    // Retry identical payload -> identical Idempotency-Key
    await user.click(saveButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(seenBodies[0]?.email).toBeNull();
  });

  it('surfaces 409 conflict when editing employee_no to collide in the same branch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Omar Khaled');

    const row = screen.getByText('Omar Khaled').closest('tr');
    if (!row) {
      throw new Error('Expected Omar Khaled row');
    }
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    const empNoInput = within(dialog).getByLabelText('Employee number');
    await user.clear(empNoInput);
    await user.type(empNoInput, 'EMP-003');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    expect(
      await within(dialog).findByText(/already exists in this branch/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        'Employee number must be unique within the branch.'
      )
    ).toBeDefined();
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

    await user.selectOptions(
      screen.getByLabelText('Status filter'),
      'inactive'
    );
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
  });

  it('supports error retry, cursor pagination, and keeps pagination visible when page 2 search has zero matches', async () => {
    const user = userEvent.setup();
    let shouldFail = true;

    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        if (shouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary employee directory error',
                trace_id: 'trace-emp-list-err',
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
                employee_id: 'emp-page-2',
                organization_id: 'org-1',
                branch_id: ALEX_BRANCH_ID,
                employee_no: 'EMP-021',
                full_name: 'Rana Gamal',
                email: null,
                phone: null,
                job_title: 'Pharmacist',
                address: {
                  line1: '1 Corniche Rd',
                  city: 'Alexandria',
                  country_code: 'EG',
                },
                hired_on: '2025-07-01',
                is_active: true,
              },
            ],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              employee_id: 'emp-page-1',
              organization_id: 'org-1',
              branch_id: CAIRO_BRANCH_ID,
              employee_no: 'EMP-001',
              full_name: 'Omar Khaled',
              email: 'omar.khaled@pharmaplus.eg',
              phone: '+20 100 111 2233',
              job_title: 'Lead Pharmacist',
              address: {
                line1: '15 Tahrir Square',
                city: 'Cairo',
                country_code: 'EG',
              },
              hired_on: '2024-03-01',
              is_active: true,
            },
          ],
          nextCursor: 'page-2',
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

    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Rana Gamal')).toBeDefined();

    await user.type(screen.getByLabelText('Search employees'), 'NoMatchHere');
    expect(screen.getByText('No employees match your filters')).toBeDefined();

    // Pagination remains visible on page 2 even with 0 filtered matches
    await user.click(screen.getByRole('button', { name: /Previous/i }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Omar Khaled')).toBeDefined();

    // Changing branch filter from page 2 resets cursor back to page 1
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Rana Gamal')).toBeDefined();
    await user.selectOptions(
      screen.getByLabelText('Home branch'),
      CAIRO_BRANCH_ID
    );
    expect(await screen.findByText('Omar Khaled')).toBeDefined();
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
            employee_id: 'emp-created-lock',
            organization_id: 'org-1',
            branch_id: CAIRO_BRANCH_ID,
            employee_no: 'EMP-050',
            full_name: 'Heba Nabil',
            email: null,
            phone: null,
            job_title: null,
            address: {
              line1: '12 Nile St',
              city: 'Cairo',
              country_code: 'EG',
            },
            hired_on: '2026-05-01',
            is_active: true,
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
      CAIRO_BRANCH_ID
    );
    await user.type(
      within(dialog).getByLabelText('Employee number'),
      'EMP-050'
    );
    await user.type(within(dialog).getByLabelText('Full name'), 'Heba Nabil');
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

    // Attempting a second click or Escape while pending does nothing
    await user.click(submitButton);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(postCalls).toBe(1);

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows empty state when no employees exist and preserves current branch on edit when branches fail, retry, or omit the branch', async () => {
    const user = userEvent.setup();
    let branchesShouldFail = true;

    server.use(
      http.get('*/api/v1/branches', () => {
        if (branchesShouldFail) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Branch service down',
                trace_id: 'trace-b-down',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          items: [
            {
              branch_id: ALEX_BRANCH_ID,
              organization_id: 'org-1',
              code: 'ALX-01',
              name: 'Alexandria Corniche Branch',
              is_active: true,
              address: {
                line1: '240 El Geish Road',
                city: 'Alexandria',
                country_code: 'EG',
              },
            },
          ],
          nextCursor: null,
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
    if (!(branchSelect instanceof HTMLSelectElement)) {
      throw new Error('Expected Home branch select element');
    }
    expect(branchSelect.value).toBe(CAIRO_BRANCH_ID);
    expect(within(dialog).getByText('Branches unavailable')).toBeDefined();

    // Retry inside modal succeeds, even though returned branches omit CAIRO_BRANCH_ID
    branchesShouldFail = false;
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(within(dialog).queryByText('Branches unavailable')).toBeNull();
    });

    // Current employee branch_id must remain preserved as an option instead of resetting to ""
    expect(branchSelect.value).toBe(CAIRO_BRANCH_ID);

    const nameInput = within(dialog).getByLabelText('Full name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Omar Khaled Preserved');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Omar Khaled Preserved')).toBeDefined();
  });

  it('shows No employees yet empty state when server has zero employees and opens modal from CTA', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/employees', () =>
        HttpResponse.json({ items: [], nextCursor: null })
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

  it('shows No active employees with Show all employees CTA when page only contains inactive employees', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/employees', () =>
        HttpResponse.json({
          items: [
            {
              employee_id: 'a1111111-1111-4111-8111-111111111104',
              organization_id: 'org-1',
              branch_id: ALEX_BRANCH_ID,
              employee_no: 'EMP-004',
              full_name: 'Salma Hassan',
              email: null,
              phone: '+20 109 777 8899',
              job_title: 'Cashier',
              address: {
                line1: '18 Stanley Bridge St',
                city: 'Alexandria',
                country_code: 'EG',
              },
              hired_on: '2025-02-20',
              is_active: false,
            },
          ],
          nextCursor: null,
        })
      )
    );

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('No active employees')).toBeDefined();
    await user.click(
      screen.getByRole('button', { name: 'Show all employees' })
    );
    expect(await screen.findByText('Salma Hassan')).toBeDefined();
  });

  it('preserves selected home branch when Edit modal opens before branches finish loading', async () => {
    const user = userEvent.setup();
    let resolveBranches: (() => void) | undefined;
    const branchesGate = new Promise<void>((resolve) => {
      resolveBranches = resolve;
    });

    server.use(
      http.get('*/api/v1/branches', async () => {
        await branchesGate;
        return HttpResponse.json({
          items: [
            {
              branch_id: CAIRO_BRANCH_ID,
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
            {
              branch_id: ALEX_BRANCH_ID,
              organization_id: 'org-1',
              code: 'ALX-01',
              name: 'Alexandria Corniche Branch',
              is_active: true,
              address: {
                line1: '240 El Geish Road',
                city: 'Alexandria',
                country_code: 'EG',
              },
            },
          ],
          nextCursor: null,
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
    expect(branchSelect.value).toBe(ALEX_BRANCH_ID);

    resolveBranches?.();

    await waitFor(() => {
      expect(branchSelect.disabled).toBe(false);
    });
    expect(branchSelect.value).toBe(ALEX_BRANCH_ID);
  });
});
