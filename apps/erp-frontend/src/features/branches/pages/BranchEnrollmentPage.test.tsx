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
import { handlers } from '../../../mocks/handlers';
import { registerSessionEndHandler } from '../../../lib/auth/sessionEvents';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { useAuthStore } from '../../../stores/authStore';
import type { CurrentUserContext } from '../../../types/api';
import { BranchEnrollmentPage } from './BranchEnrollmentPage';

const server = setupServer(...handlers);

const mockUserContext = currentUserContextFixture as CurrentUserContext;

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext => ({
  ...mockUserContext,
  ...overrides,
});

beforeAll(() => server.listen());

beforeEach(() => {
  useAuthStore.setState({
    currentUser: null,
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
  it('shows the sign-in link when no session exists', () => {
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
  });

  it('shows the workspace link without a warning on BranchLocal', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'BranchLocal' }),
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
  });

  it('shows the wrong-deployment warning on Cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'Cloud' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(screen.getByText('Wrong deployment')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Back to workspace' })
    ).toBeDefined();
  });

  it('validates empty input, handles 410 GONE / 401 UNAUTHORIZED, and succeeds on valid token', async () => {
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
      await screen.findByText('Token expired or already used')
    ).toBeDefined();

    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(screen.getByLabelText('Enrollment token'), 'invalid-token');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText('Invalid enrollment token')).toBeDefined();

    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(
      screen.getByLabelText('Enrollment token'),
      'enr_valid_token_01'
    );
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText('Branch terminal enrolled')).toBeDefined();
    expect(screen.getByText('cursor_sync_0001')).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: 'Continue to sign in' })
        .getAttribute('href')
    ).toBe('/login');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).toBeNull();
  });

  it('does not trigger session-end handler on 401 and reuses Idempotency-Key across same-payload retries', async () => {
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
              },
            },
            { status: 401 }
          );
        }

        if (attempt === 2) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Transient server error',
              },
            },
            { status: 500 }
          );
        }

        return HttpResponse.json({
          device_credential: 'dev_cred_retry_ok',
          branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
          initial_cursor: 'cursor_sync_retry',
          credential_expires_at: '2030-01-01T00:00:00Z',
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
    expect(await screen.findByText('Invalid enrollment token')).toBeDefined();
    expect(sessionEndHandler).not.toHaveBeenCalled();

    // Change token -> new key, fails with 500
    await user.clear(screen.getByLabelText('Enrollment token'));
    await user.type(screen.getByLabelText('Enrollment token'), 'tok_retry');
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText('Transient server error')).toBeDefined();

    // Retry same token -> same key
    await user.click(
      screen.getByRole('button', { name: 'Activate branch terminal' })
    );
    expect(await screen.findByText('Branch terminal enrolled')).toBeDefined();

    expect(seenKeys).toHaveLength(3);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[1]).not.toBeNull();
    expect(seenKeys[0]).not.toBe(seenKeys[1]);
    expect(seenKeys[1]).toBe(seenKeys[2]);
  });
});
