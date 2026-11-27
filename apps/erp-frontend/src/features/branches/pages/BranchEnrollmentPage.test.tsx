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
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import { normalizeCurrentUser } from '../../../lib/api/normalizers';
import { registerSessionEndHandler } from '../../../lib/auth/sessionEvents';
import {
  MOCK_BRANCH_IDS,
  MOCK_VALID_ENROLLMENT_TOKEN,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import { handlers } from '../../../mocks/handlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser } from '../../../types/api';
import { BranchEnrollmentPage } from './BranchEnrollmentPage';

const server = setupServer(...handlers);

const baseAdminUser = normalizeCurrentUser(
  currentUserContextFixture,
  '@contracts/fixtures/current-user-context.json'
);

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  ...baseAdminUser,
  ...overrides,
});

beforeAll(() => server.listen());

beforeEach(() => {
  resetMockBranches();
  useAuthStore.setState({
    currentUser: null,
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

afterEach(() => {
  server.resetHandlers();
  registerSessionEndHandler(null);
  cleanup();
});

afterAll(() => server.close());

describe('BranchEnrollmentPage', () => {
  it('allows normal usage and shows sign-in link when unauthenticated', () => {
    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(
      screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')
    ).toBe('/login');
    expect(
      screen.queryByRole('link', { name: 'Back to workspace' })
    ).toBeNull();
    expect(screen.queryByText('Wrong deployment')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Activate branch terminal' })
        .hasAttribute('disabled')
    ).toBe(false);
  });

  it('allows normal usage without a warning on Cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime_mode: 'Cloud' }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(
      screen
        .getByRole('link', { name: 'Back to workspace' })
        .getAttribute('href')
    ).toBe('/');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).toBeNull();
    expect(screen.queryByText('Wrong deployment')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Activate branch terminal' })
        .hasAttribute('disabled')
    ).toBe(false);
  });

  it('shows the wrong-deployment warning and disables enrollment when authenticated on BranchLocal', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        runtime_mode: 'BranchLocal',
        branch_scope: 'ASSIGNED',
        branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: MOCK_BRANCH_IDS.DOWNTOWN,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(screen.getByText('Wrong deployment')).toBeDefined();
    expect(
      screen.getByText(/Device enrollment must target the Cloud ERP API/i)
    ).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: 'Activate branch terminal' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(
      screen.getByRole('link', { name: 'Back to workspace' })
    ).toBeDefined();
  });

  it('validates empty input, maps 401 UNAUTHORIZED tokens, and displays Stage 1 RedeemEnrollment details on success', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(
      await screen.findByText('Enrollment token is required')
    ).toBeDefined();

    await user.type(screen.getByLabelText('Enrollment token'), 'expired-token');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(
      await screen.findByText('Invalid or expired enrollment token')
    ).toBeDefined();

    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(screen.getByLabelText('Enrollment token'), 'invalid-token');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(
      await screen.findByText('Invalid or expired enrollment token')
    ).toBeDefined();

    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(
      screen.getByLabelText('Enrollment token'),
      MOCK_VALID_ENROLLMENT_TOKEN
    );
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );

    expect(await screen.findByText('Branch terminal enrolled')).toBeDefined();
    expect(
      screen.getByText(currentUserContextFixture.organization_id)
    ).toBeDefined();
    expect(
      screen.getAllByText(MOCK_BRANCH_IDS.DOWNTOWN).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        `rc_live_branch_device_credential_${MOCK_BRANCH_IDS.DOWNTOWN}`
      )
    ).toBeDefined();
    expect(screen.getByText('Initial sync cursor')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByText('Credential expiry')).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: 'Continue to sign in' })
        .getAttribute('href')
    ).toBe('/login');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).toBeNull();

    // Single-use token: second redemption attempt is rejected with 401
    await user.click(
      screen.getByRole('button', { name: 'Enroll another token' })
    );
    await user.type(
      screen.getByLabelText('Enrollment token'),
      MOCK_VALID_ENROLLMENT_TOKEN
    );
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(
      await screen.findByText('Invalid or expired enrollment token')
    ).toBeDefined();
  });

  it('does not trigger session-end handler on 401 and omits Idempotency-Key header', async () => {
    const user = userEvent.setup();
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    const seenKeys: Array<string | null> = [];
    let attempt = 0;

    server.use(
      http.post('*/api/v1/branch-enrollment', ({ request }) => {
        attempt += 1;
        seenKeys.push(request.headers.get('Idempotency-Key'));

        if (attempt === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Enrollment token invalid',
                details: [],
                trace_id: 'trace-enr-401',
              },
            },
            { status: 401 }
          );
        }

        if (attempt === 2) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Transient server error',
                details: [],
                trace_id: 'trace-enr-500',
              },
            },
            { status: 500 }
          );
        }

        return HttpResponse.json({
          organization_id: currentUserContextFixture.organization_id,
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          runtime_credential: 'rc_live_retry_ok',
          initial_sync_cursor: 42,
          credential_expiry: '2030-01-01T00:00:00Z',
        });
      })
    );

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    await user.type(screen.getByLabelText('Enrollment token'), 'tok_first');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(
      await screen.findByText('Invalid or expired enrollment token')
    ).toBeDefined();
    expect(sessionEndHandler).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(screen.getByLabelText('Enrollment token'), 'tok_retry');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText(/Transient server error/)).toBeDefined();

    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText('Branch terminal enrolled')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();

    expect(seenKeys).toEqual([null, null, null]);
  });
});
