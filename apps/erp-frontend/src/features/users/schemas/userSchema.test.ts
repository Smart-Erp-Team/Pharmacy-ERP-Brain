/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useForm } from 'react-hook-form';
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
import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  INITIAL_USERS,
  ORGANIZATION_ID,
  resetMockUsers,
  userHandlers,
} from '../../../mocks/userHandlers';
import type { User } from '../../../types/api';
import {
  createUser,
  getUser,
  listUsers,
  patchUser,
  resetUserPassword,
  revokeUserSessions,
} from '../api/usersApi';
import { usersKeys } from '../hooks/usersKeys';
import {
  useAllUsersQuery,
  useCreateUserMutation,
  usePatchUserMutation,
  useResetUserPasswordMutation,
  useRevokeUserSessionsMutation,
  useUserQuery,
  useUsersQuery,
} from '../hooks/useUsers';
import {
  applyCreateUserFormApiError,
  applyEditUserFormApiError,
  applyPasswordResetFormApiError,
} from './userErrorMapper';
import {
  BRANCH_SCOPES,
  createEditUserFormSchema,
  createUserFormSchema,
  DEFAULT_CREATE_USER_FORM_VALUES,
  DEFAULT_PASSWORD_RESET_VALUES,
  editUserFormSchema,
  MIN_PASSWORD_LENGTH,
  normalizeBranchIds,
  passwordResetSchema,
  toCreateUserPayload,
  toPasswordResetPayload,
  toUserPatchPayload,
  USER_ROLES,
  userDtoToEditFormValues,
} from './userSchema';

const BRANCH_1_ID = '11111111-2222-4111-8111-000000000001';
const BRANCH_2_ID = '11111111-2222-4111-8111-000000000002';
const ADMIN_USER_ID = '11111111-4444-4111-8111-000000000001';
const MONA_USER_ID = '11111111-4444-4111-8111-000000000002';
const SALMA_USER_ID = '11111111-4444-4111-8111-000000000003';
const UNASSIGNED_EMPLOYEE_ID = '11111111-3333-4111-8111-000000000003';

const server = setupServer(...userHandlers);

let activeQueryClient: QueryClient | null = null;

function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  activeQueryClient = client;
  return client;
}

function getSeededUser(index: number): User {
  const user = INITIAL_USERS[index];
  if (!user) {
    throw new Error(`Expected seeded user at index ${index}`);
  }
  return user;
}

function createQueryWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children?: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockUsers();
});
afterEach(() => {
  server.resetHandlers();
  if (activeQueryClient) {
    activeQueryClient.clear();
    activeQueryClient = null;
  }
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('userSchema', () => {
  it('exposes Stage 1 MIN_PASSWORD_LENGTH = 12, role tuples, branch scope tuples, and normalizeBranchIds', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(USER_ROLES).toEqual(['Admin', 'Pharmacist', 'Cashier']);
    expect(BRANCH_SCOPES).toEqual(['ALL', 'ASSIGNED']);
    expect(normalizeBranchIds([' b1 ', 'b2', 'b1', '  '])).toEqual([
      'b1',
      'b2',
    ]);
  });

  describe('createUserFormSchema & toCreateUserPayload', () => {
    it('accepts Admin with ALL scope and sends branch_ids: [] without legacy branch_access', () => {
      const parsed = createUserFormSchema.parse({
        employee_id: `  ${UNASSIGNED_EMPLOYEE_ID}  `,
        username: '  admin.karim@medcare.test  ',
        password: ' SecurePass!9 ',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [BRANCH_1_ID],
      });

      const payload = toCreateUserPayload(parsed);

      expect(payload).toEqual({
        employee_id: UNASSIGNED_EMPLOYEE_ID,
        username: 'admin.karim@medcare.test',
        password: ' SecurePass!9 ',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });
      expect('branch_access' in payload).toBe(false);
    });

    it('accepts Admin, Pharmacist, and Cashier with ASSIGNED scope and deduplicates trimmed branch_ids', () => {
      for (const role of USER_ROLES) {
        const parsed = createUserFormSchema.parse({
          employee_id: UNASSIGNED_EMPLOYEE_ID,
          username: `${role.toLowerCase()}.nour@medcare.test`,
          password: 'ValidPassword12!',
          role,
          branch_scope: 'ASSIGNED',
          branch_ids: [` ${BRANCH_1_ID} `, BRANCH_2_ID, BRANCH_1_ID, '   '],
        });

        const payload = toCreateUserPayload(parsed);
        expect(payload).toEqual({
          employee_id: UNASSIGNED_EMPLOYEE_ID,
          username: `${role.toLowerCase()}.nour@medcare.test`,
          password: 'ValidPassword12!',
          role,
          branch_scope: 'ASSIGNED',
          branch_ids: [BRANCH_1_ID, BRANCH_2_ID],
        });
        expect('branch_access' in payload).toBe(false);
      }
    });

    it('rejects non-Admin accounts using ALL branch scope and requires >= 1 branch', () => {
      for (const role of ['Pharmacist', 'Cashier'] as const) {
        const result = createUserFormSchema.safeParse({
          employee_id: UNASSIGNED_EMPLOYEE_ID,
          username: 'user.three@medcare.test',
          password: 'ValidPassword12!',
          role,
          branch_scope: 'ALL',
          branch_ids: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                path: ['branch_scope'],
                message: 'Only Admin accounts can use ALL branch scope',
              }),
              expect.objectContaining({
                path: ['branch_ids'],
                message: 'Select at least one branch for ASSIGNED scope',
              }),
            ])
          );
        }
      }
    });

    it('rejects ASSIGNED scope with zero valid branches for both Admin and non-Admin', () => {
      for (const role of USER_ROLES) {
        const result = createUserFormSchema.safeParse({
          ...DEFAULT_CREATE_USER_FORM_VALUES,
          employee_id: UNASSIGNED_EMPLOYEE_ID,
          username: 'ph.ali@medcare.test',
          password: 'ValidPassword12!',
          role,
          branch_scope: 'ASSIGNED',
          branch_ids: ['   '],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                path: ['branch_ids'],
                message: 'Select at least one branch for ASSIGNED scope',
              }),
            ])
          );
        }
      }
    });

    it('enforces 12-character minimum password, allows 129-character passwords, and enforces username bounds', () => {
      const elevenCharResult = createUserFormSchema.safeParse({
        employee_id: '   ',
        username: '   ',
        password: '11charsPass',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });

      expect(elevenCharResult.success).toBe(false);
      if (!elevenCharResult.success) {
        const messages = elevenCharResult.error.issues.map(
          (issue) => issue.message
        );
        expect(messages).toContain('Employee is required');
        expect(messages).toContain('Username is required');
        expect(messages).toContain('Password must be at least 12 characters');
      }

      const exactTwelveResult = createUserFormSchema.safeParse({
        employee_id: UNASSIGNED_EMPLOYEE_ID,
        username: 'exact.twelve@medcare.test',
        password: '12charsPass!',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });
      expect(exactTwelveResult.success).toBe(true);

      const longPasswordResult = createUserFormSchema.safeParse({
        employee_id: UNASSIGNED_EMPLOYEE_ID,
        username: 'long.pass@medcare.test',
        password: 'p'.repeat(129),
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });
      expect(longPasswordResult.success).toBe(true);

      const longUsernameResult = createUserFormSchema.safeParse({
        employee_id: UNASSIGNED_EMPLOYEE_ID,
        username: 'u'.repeat(81),
        password: 'p'.repeat(129),
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });

      expect(longUsernameResult.success).toBe(false);
      if (!longUsernameResult.success) {
        const paths = longUsernameResult.error.issues.map((issue) =>
          issue.path.join('.')
        );
        expect(paths).toContain('username');
        expect(paths).not.toContain('password');
      }
    });

    it('integrates createUserFormSchema with React Hook Form zodResolver', async () => {
      const { result: createForm } = renderHook(() => {
        const form = useForm({
          resolver: zodResolver(createUserFormSchema),
          defaultValues: DEFAULT_CREATE_USER_FORM_VALUES,
        });
        return {
          trigger: form.trigger,
          employeeError: form.formState.errors.employee_id?.message,
          passwordError: form.formState.errors.password?.message,
          branchIdsError: form.formState.errors.branch_ids?.message,
        };
      });

      let createValid = true;
      await act(async () => {
        createValid = await createForm.current.trigger();
      });
      expect(createValid).toBe(false);
      await waitFor(() => {
        expect(createForm.current.employeeError).toBe('Employee is required');
        expect(createForm.current.passwordError).toBe(
          'Password must be at least 12 characters'
        );
        expect(createForm.current.branchIdsError).toBe(
          'Select at least one branch for ASSIGNED scope'
        );
      });
    });
  });

  describe('editUserFormSchema, userDtoToEditFormValues, and toUserPatchPayload', () => {
    const allScopeAdmin = getSeededUser(0);
    const assignedUser = getSeededUser(1);

    it('pre-populates branch_ids directly from User without legacy has_branch_access_edit', () => {
      const editValues = userDtoToEditFormValues(assignedUser);
      expect(editValues).toEqual({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_1_ID],
        is_active: true,
      });
      expect('has_branch_access_edit' in editValues).toBe(false);
      expect(editValues.branch_ids).not.toBe(assignedUser.branch_ids);
    });

    it('sends clean UpdateUserRequest with branch_ids for ASSIGNED and [] for ALL', () => {
      const assignedFormValues = {
        ...userDtoToEditFormValues(assignedUser),
        role: 'Cashier' as const,
        branch_ids: [` ${BRANCH_1_ID} `, BRANCH_2_ID, BRANCH_1_ID],
        is_active: false,
      };

      const parsedAssigned = editUserFormSchema.parse(assignedFormValues);
      expect(createEditUserFormSchema().parse(assignedFormValues)).toEqual(
        parsedAssigned
      );

      const patchPayload = toUserPatchPayload(parsedAssigned, assignedUser);
      expect(patchPayload).toEqual({
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_1_ID, BRANCH_2_ID],
        is_active: false,
      });
      expect('branch_access' in patchPayload).toBe(false);

      const adminAllValues = editUserFormSchema.parse({
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [BRANCH_1_ID],
        is_active: true,
      });

      const allPayload = toUserPatchPayload(adminAllValues, allScopeAdmin);
      expect(allPayload).toEqual({
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
        is_active: true,
      });
      expect('branch_access' in allPayload).toBe(false);
    });

    it('rejects empty branch_ids for ASSIGNED scope and blocks non-Admin ALL scope', () => {
      const emptyAssigned = editUserFormSchema.safeParse({
        role: 'Admin',
        branch_scope: 'ASSIGNED',
        branch_ids: ['   '],
        is_active: true,
      });
      expect(emptyAssigned.success).toBe(false);
      if (!emptyAssigned.success) {
        expect(emptyAssigned.error.issues[0]).toMatchObject({
          path: ['branch_ids'],
          message: 'Select at least one branch for ASSIGNED scope',
        });
      }

      const invalidNonAdminAll = editUserFormSchema.safeParse({
        role: 'Cashier',
        branch_scope: 'ALL',
        branch_ids: [BRANCH_1_ID],
        is_active: true,
      });
      expect(invalidNonAdminAll.success).toBe(false);
      if (!invalidNonAdminAll.success) {
        expect(invalidNonAdminAll.error.issues[0]).toMatchObject({
          path: ['branch_scope'],
          message: 'Only Admin accounts can use ALL branch scope',
        });
      }
    });

    it('integrates editUserFormSchema with React Hook Form zodResolver and isDirty tracking', async () => {
      const { result } = renderHook(() => {
        const form = useForm({
          resolver: zodResolver(editUserFormSchema),
          defaultValues: userDtoToEditFormValues(assignedUser),
        });
        return {
          setValue: form.setValue,
          trigger: form.trigger,
          isDirty: form.formState.isDirty,
          branchIdsError: form.formState.errors.branch_ids?.message,
        };
      });

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setValue('is_active', false, { shouldDirty: true });
      });
      expect(result.current.isDirty).toBe(true);

      let isValid = false;
      await act(async () => {
        isValid = await result.current.trigger();
      });
      expect(isValid).toBe(true);

      act(() => {
        result.current.setValue('branch_ids', [], { shouldDirty: true });
      });
      await act(async () => {
        isValid = await result.current.trigger();
      });
      expect(isValid).toBe(false);
      await waitFor(() => {
        expect(result.current.branchIdsError).toBe(
          'Select at least one branch for ASSIGNED scope'
        );
      });
    });
  });

  describe('passwordResetSchema & toPasswordResetPayload', () => {
    it('accepts matching passwords >= 12 chars including 129-char passwords without trimming', () => {
      const parsed = passwordResetSchema.parse({
        new_password: ' ResetPass!23 ',
        confirm_password: ' ResetPass!23 ',
      });

      expect(toPasswordResetPayload(parsed)).toEqual({
        new_password: ' ResetPass!23 ',
      });

      const longPassword = 'x'.repeat(129);
      const longResult = passwordResetSchema.safeParse({
        new_password: longPassword,
        confirm_password: longPassword,
      });
      expect(longResult.success).toBe(true);
    });

    it('rejects <12 char passwords, empty confirmation, and mismatches', () => {
      const emptyResult = passwordResetSchema.safeParse(
        DEFAULT_PASSWORD_RESET_VALUES
      );
      expect(emptyResult.success).toBe(false);

      const elevenCharResult = passwordResetSchema.safeParse({
        new_password: '11charsPass',
        confirm_password: '11charsPass',
      });
      expect(elevenCharResult.success).toBe(false);
      if (!elevenCharResult.success) {
        expect(elevenCharResult.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['new_password'],
              message: 'Password must be at least 12 characters',
            }),
          ])
        );
      }

      const mismatchResult = passwordResetSchema.safeParse({
        new_password: 'ValidPassword12!',
        confirm_password: 'DifferentPassword12!',
      });
      expect(mismatchResult.success).toBe(false);
      if (!mismatchResult.success) {
        expect(mismatchResult.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['confirm_password'],
              message: 'Passwords do not match',
            }),
          ])
        );
      }
    });

    it('integrates passwordResetSchema with React Hook Form zodResolver', async () => {
      const { result: resetForm } = renderHook(() => {
        const form = useForm({
          resolver: zodResolver(passwordResetSchema),
          defaultValues: {
            new_password: 'ValidPassword12!',
            confirm_password: 'MismatchPassword12!',
          },
        });
        return {
          trigger: form.trigger,
          confirmError: form.formState.errors.confirm_password?.message,
        };
      });

      let resetValid = true;
      await act(async () => {
        resetValid = await resetForm.current.trigger();
      });
      expect(resetValid).toBe(false);
      await waitFor(() => {
        expect(resetForm.current.confirmError).toBe('Passwords do not match');
      });
    });
  });
});

describe('userErrorMapper', () => {
  it('maps 422 create fields including branch_ids and returns null', () => {
    const setError = vi.fn();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        trace_id: 'trace-create-422',
        details: [
          { field: 'employee_id', issue: 'Employee is invalid' },
          { field: 'username', issue: 'Username invalid' },
          { field: 'password', issue: 'Password must be at least 12 chars' },
          { field: 'role', issue: 'Role unsupported' },
          { field: 'branch_scope', issue: 'Scope unsupported' },
          { field: 'branch_ids', issue: 'Select at least one branch' },
        ],
      },
      422
    );

    const banner = applyCreateUserFormApiError(error, setError);

    expect(banner).toBeNull();
    expect(setError).toHaveBeenCalledWith('employee_id', {
      type: 'server',
      message: 'Employee is invalid',
    });
    expect(setError).toHaveBeenCalledWith('username', {
      type: 'server',
      message: 'Username invalid',
    });
    expect(setError).toHaveBeenCalledWith('password', {
      type: 'server',
      message: 'Password must be at least 12 chars',
    });
    expect(setError).toHaveBeenCalledWith('role', {
      type: 'server',
      message: 'Role unsupported',
    });
    expect(setError).toHaveBeenCalledWith('branch_scope', {
      type: 'server',
      message: 'Scope unsupported',
    });
    expect(setError).toHaveBeenCalledWith('branch_ids', {
      type: 'server',
      message: 'Select at least one branch',
    });
  });

  it('handles 409 CONFLICT, 403 FORBIDDEN, and 400 MALFORMED_REQUEST with banner and trace_id', () => {
    const setError = vi.fn();

    const conflictErr = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Username "admin@medcare.test" is already taken.',
        trace_id: 'trace-409',
        details: [{ field: 'username', issue: 'Username must be unique.' }],
      },
      409
    );
    expect(applyCreateUserFormApiError(conflictErr, setError)).toBe(
      'Username "admin@medcare.test" is already taken. (Trace: trace-409)'
    );
    expect(setError).toHaveBeenCalledWith('username', {
      type: 'server',
      message: 'Username must be unique.',
    });

    const forbiddenErr = new ApiClientError(
      {
        code: 'FORBIDDEN',
        message: 'Cannot modify your own administrative role.',
        trace_id: 'trace-403',
        details: [{ field: 'role', issue: 'Self role change forbidden.' }],
      },
      403
    );
    expect(applyEditUserFormApiError(forbiddenErr, setError)).toBe(
      'Cannot modify your own administrative role. (Trace: trace-403)'
    );
    expect(setError).toHaveBeenCalledWith('role', {
      type: 'server',
      message: 'Self role change forbidden.',
    });

    const malformedErr = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'Missing Idempotency-Key header.',
        trace_id: 'trace-400',
        details: [
          {
            field: 'Idempotency-Key',
            issue: 'The idempotency key is required.',
          },
        ],
      },
      400
    );
    expect(applyCreateUserFormApiError(malformedErr, setError)).toBe(
      'Missing Idempotency-Key header. (Trace: trace-400)'
    );
  });

  it('maps edit user 422 indexed branch_ids[0] and password reset new_password, returning fallback for unknown errors', () => {
    const setError = vi.fn();
    const editErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid update',
        trace_id: 'trace-edit-422',
        details: [
          { field: 'branch_ids[0]', issue: 'Branch inactive' },
          { field: 'is_active', issue: 'Cannot deactivate self' },
        ],
      },
      422
    );

    expect(applyEditUserFormApiError(editErr, setError)).toBeNull();
    expect(setError).toHaveBeenCalledWith('branch_ids', {
      type: 'server',
      message: 'Branch inactive',
    });
    expect(setError).toHaveBeenCalledWith('is_active', {
      type: 'server',
      message: 'Cannot deactivate self',
    });

    const resetErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid password',
        details: [{ field: 'new_password', issue: 'Password too short' }],
      },
      422
    );
    expect(applyPasswordResetFormApiError(resetErr, setError)).toBeNull();
    expect(setError).toHaveBeenCalledWith('new_password', {
      type: 'server',
      message: 'Password too short',
    });

    expect(applyCreateUserFormApiError(new Error('network'), setError)).toBe(
      'Unable to create user account. Please try again.'
    );
    expect(applyEditUserFormApiError(new Error('network'), setError)).toBe(
      'Unable to update user account. Please try again.'
    );
    expect(applyPasswordResetFormApiError(new Error('network'), setError)).toBe(
      'Unable to reset user password. Please try again.'
    );
  });
});

describe('usersApi, usersKeys, useUsers, and userHandlers integration', () => {
  it('seeds MEDCARE users matching current-user-context.json', () => {
    expect(ORGANIZATION_ID).toBe(currentUserContext.organization_id);
    expect(INITIAL_USERS).toHaveLength(3);
    expect(INITIAL_USERS[0]).toMatchObject({
      user_id: currentUserContext.user_id,
      employee_id: currentUserContext.employee_id,
      organization_id: currentUserContext.organization_id,
      username: currentUserContext.username,
      role: currentUserContext.role,
      branch_scope: currentUserContext.branch_scope,
      branch_ids: currentUserContext.branch_ids,
      is_active: true,
    });
  });

  it('lists users with Stage 1 page/page_size pagination, branch_id, role, and include_inactive filters', async () => {
    // Default excludes inactive user #3
    const activeOnly = await listUsers({ branch_id: '   ' });
    expect(activeOnly.total_count).toBe(2);
    expect(activeOnly.page).toBe(1);
    expect(activeOnly.page_size).toBe(25);
    expect(activeOnly.next_cursor).toBeNull();
    expect(activeOnly.items.map((u) => u.username)).toEqual([
      'admin@medcare.test',
      'ph.mona@medcare.test',
    ]);

    // include_inactive: true includes cashier.salma@medcare.test
    const page1 = await listUsers({
      include_inactive: true,
      page: 1,
      page_size: 2,
    });
    expect(page1.total_count).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2');

    const page2 = await listUsers({
      include_inactive: true,
      page: 2,
      page_size: 2,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.username).toBe('cashier.salma@medcare.test');
    expect(page2.next_cursor).toBeNull();

    // branch_id filter matches ALL-scope Admin + assigned users for that branch
    const branch2Users = await listUsers({
      branch_id: ` ${BRANCH_2_ID} `,
      include_inactive: true,
    });
    expect(branch2Users.items.map((u) => u.username)).toEqual([
      'admin@medcare.test',
      'cashier.salma@medcare.test',
    ]);

    // role filter
    const pharmacists = await listUsers({
      role: 'Pharmacist',
      include_inactive: true,
    });
    expect(pharmacists.items.map((u) => u.username)).toEqual([
      'ph.mona@medcare.test',
    ]);
  });

  it('fetches single user detail, handles 404, and wraps malformed payloads in INVALID_RESPONSE', async () => {
    const mona = await getUser(MONA_USER_ID);
    expect(mona.username).toBe('ph.mona@medcare.test');
    expect(mona.branch_ids).toEqual([BRANCH_1_ID]);

    await expect(getUser('missing-user-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    server.use(
      http.get('*/api/v1/users/:id', () =>
        HttpResponse.json({ broken: true }, { status: 200 })
      )
    );
    await expect(getUser(MONA_USER_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('creates users, enforces 12-char password, branch_ids rules, 409 uniqueness, and 400 malformed body', async () => {
    const created = await createUser({
      employee_id: UNASSIGNED_EMPLOYEE_ID,
      username: 'cashier.tarek@medcare.test',
      password: 'StrongPassword12!',
      role: 'Cashier',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_1_ID],
    });

    expect(created.username).toBe('cashier.tarek@medcare.test');
    expect(created.organization_id).toBe(ORGANIZATION_ID);
    expect(created.branch_ids).toEqual([BRANCH_1_ID]);

    // Short (<12) password -> 422
    await expect(
      createUser({
        employee_id: '11111111-3333-4111-8111-000000000099',
        username: 'short.pass@medcare.test',
        password: '11charsPass',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // Case-insensitive duplicate employee_id (including inactive user's employee) -> 409
    await expect(
      createUser({
        employee_id: '11111111-3333-4111-8111-000000000004'.toUpperCase(),
        username: 'fresh.username@medcare.test',
        password: 'StrongPassword12!',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Case-insensitive duplicate username -> 409
    await expect(
      createUser({
        employee_id: '11111111-3333-4111-8111-000000000099',
        username: 'ADMIN@MEDCARE.TEST',
        password: 'StrongPassword12!',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Non-Admin with ALL -> 422
    await expect(
      createUser({
        employee_id: '11111111-3333-4111-8111-000000000099',
        username: 'bad.pharmacist@medcare.test',
        password: 'StrongPassword12!',
        role: 'Pharmacist',
        branch_scope: 'ALL',
        branch_ids: [],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // ASSIGNED with empty branch_ids -> 422
    await expect(
      createUser({
        employee_id: '11111111-3333-4111-8111-000000000099',
        username: 'bad.cashier@medcare.test',
        password: 'StrongPassword12!',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // Missing Idempotency-Key -> 400 MALFORMED_REQUEST
    const missingKeyResponse = await fetch('http://localhost/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'missing.key@medcare.test' }),
    });
    expect(missingKeyResponse.status).toBe(400);
    await expect(missingKeyResponse.json()).resolves.toMatchObject({
      error: { code: 'MALFORMED_REQUEST' },
    });

    // Non-object body -> 400 MALFORMED_REQUEST
    await expect(
      apiClient.post('/users', ['not-object'], {
        headers: { 'Idempotency-Key': 'test-malformed-user-body' },
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
  });

  it('patches users, updates/clears branch_ids across scope changes, keeps username immutable, and rejects invalid patches', async () => {
    const updated = await patchUser(MONA_USER_ID, {
      is_active: false,
      branch_ids: [BRANCH_1_ID, BRANCH_2_ID],
    });
    expect(updated.is_active).toBe(false);
    expect(updated.branch_ids).toEqual([BRANCH_1_ID, BRANCH_2_ID]);

    const afterImmutableCheck = await apiClient.patch<User>(
      `/users/${MONA_USER_ID}`,
      { username: 'attempted.override' },
      { headers: { 'Idempotency-Key': 'test-immutable-username' } }
    );
    expect(afterImmutableCheck.data.username).toBe('ph.mona@medcare.test');

    await expect(
      patchUser('missing-user-id', { is_active: true })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    await expect(
      patchUser(ADMIN_USER_ID, { role: 'Cashier' })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      patchUser(MONA_USER_ID, { branch_scope: 'ASSIGNED', branch_ids: [] })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      patchUser(ADMIN_USER_ID, { branch_scope: 'ASSIGNED' })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    const downgraded = await patchUser(ADMIN_USER_ID, {
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_1_ID],
    });
    expect(downgraded.branch_scope).toBe('ASSIGNED');
    expect(downgraded.branch_ids).toEqual([BRANCH_1_ID]);

    const restoredAll = await patchUser(ADMIN_USER_ID, {
      branch_scope: 'ALL',
    });
    expect(restoredAll.branch_scope).toBe('ALL');
    expect(restoredAll.branch_ids).toEqual([]);
  });

  it('resets password (>=12 chars), clears lockout_end & access_failed_count, and revokes sessions', async () => {
    const beforeReset = await getUser(MONA_USER_ID);
    expect(beforeReset.access_failed_count).toBe(5);
    expect(beforeReset.lockout_end).toBe('2099-01-01T12:00:00.000Z');

    await expect(
      resetUserPassword(MONA_USER_ID, {
        new_password: '11charsPass',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      resetUserPassword(MONA_USER_ID, {
        new_password: 'NewValidPassword12!',
      })
    ).resolves.toBeUndefined();

    const afterReset = await getUser(MONA_USER_ID);
    expect(afterReset.access_failed_count).toBe(0);
    expect(afterReset.lockout_end).toBeNull();

    await expect(
      resetUserPassword('missing-id', {
        new_password: 'NewValidPassword12!',
      })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    await expect(revokeUserSessions(SALMA_USER_ID)).resolves.toBeUndefined();
    await expect(revokeUserSessions('missing-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('supports useUserQuery, useUsersQuery, and useAllUsersQuery({ include_inactive: true })', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result: disabledUndefined } = renderHook(
      () => useUserQuery(undefined),
      { wrapper }
    );
    expect(disabledUndefined.current.fetchStatus).toBe('idle');

    const { result: enabledResult } = renderHook(
      () => useUserQuery(ADMIN_USER_ID),
      { wrapper }
    );
    await waitFor(() => expect(enabledResult.current.isSuccess).toBe(true));
    expect(enabledResult.current.data?.username).toBe('admin@medcare.test');

    const { result: listResult } = renderHook(() => useUsersQuery(), {
      wrapper,
    });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data?.items).toHaveLength(2);

    const { result: allUsersResult } = renderHook(
      () => useAllUsersQuery({ include_inactive: true }),
      { wrapper }
    );
    await waitFor(() => expect(allUsersResult.current.isSuccess).toBe(true));
    expect(allUsersResult.current.data).toHaveLength(3);
    expect(allUsersResult.current.data?.map((u) => u.user_id)).toEqual([
      ADMIN_USER_ID,
      MONA_USER_ID,
      SALMA_USER_ID,
    ]);
  });

  it('stabilizes Idempotency-Key on retry, rotates on payload change, clears on success, and invalidates queries across all mutations', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const patchKeys: Array<string | null> = [];
    let failFirstPatch = true;
    const createKeys: Array<string | null> = [];
    let failFirstCreate = true;
    const resetKeys: Array<string | null> = [];
    let failFirstReset = true;
    const revokeKeys: Array<string | null> = [];
    let failFirstRevoke = true;

    const monaUser = getSeededUser(1);

    server.use(
      http.patch('*/api/v1/users/:id', ({ request }) => {
        patchKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstPatch) {
          failFirstPatch = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary patch failure',
                details: [],
                trace_id: 'trace-500-patch',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          { ...monaUser, is_active: false },
          { status: 200 }
        );
      }),
      http.post('*/api/v1/users', ({ request }) => {
        createKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstCreate) {
          failFirstCreate = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary create failure',
                details: [],
                trace_id: 'trace-500-create',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          {
            user_id: '11111111-4444-4111-8111-000000000099',
            employee_id: UNASSIGNED_EMPLOYEE_ID,
            organization_id: ORGANIZATION_ID,
            username: 'new.user@medcare.test',
            role: 'Cashier',
            branch_scope: 'ASSIGNED',
            branch_ids: [BRANCH_1_ID],
            is_active: true,
            access_failed_count: 0,
            lockout_end: null,
            last_login_at: null,
          },
          { status: 201 }
        );
      }),
      http.post('*/api/v1/users/:id/password-reset', ({ request }) => {
        resetKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstReset) {
          failFirstReset = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary reset failure',
                details: [],
                trace_id: 'trace-500-reset',
              },
            },
            { status: 500 }
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/users/:id/revoke-sessions', ({ request }) => {
        revokeKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstRevoke) {
          failFirstRevoke = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary revoke failure',
                details: [],
                trace_id: 'trace-500-revoke',
              },
            },
            { status: 500 }
          );
        }
        return new HttpResponse(null, { status: 204 });
      })
    );

    const { result: patchHook } = renderHook(() => usePatchUserMutation(), {
      wrapper,
    });

    await act(async () => {
      await expect(
        patchHook.current.mutateAsync({
          userId: MONA_USER_ID,
          payload: { is_active: false },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });

    await act(async () => {
      await patchHook.current.mutateAsync({
        userId: MONA_USER_ID,
        payload: { is_active: false },
      });
    });

    await act(async () => {
      await patchHook.current.mutateAsync({
        userId: MONA_USER_ID,
        payload: { is_active: true },
      });
    });

    expect(patchKeys).toHaveLength(3);
    expect(patchKeys[0]).not.toBeNull();
    expect(patchKeys[0]).toBe(patchKeys[1]);
    expect(patchKeys[2]).not.toBe(patchKeys[1]);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usersKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usersKeys.detail(MONA_USER_ID),
    });

    const createPayload = {
      employee_id: UNASSIGNED_EMPLOYEE_ID,
      username: 'new.user@medcare.test',
      password: 'ValidPassword12!',
      role: 'Cashier' as const,
      branch_scope: 'ASSIGNED' as const,
      branch_ids: [BRANCH_1_ID],
    };

    const { result: createHook } = renderHook(() => useCreateUserMutation(), {
      wrapper,
    });
    await act(async () => {
      await expect(
        createHook.current.mutateAsync({ payload: createPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await createHook.current.mutateAsync({ payload: createPayload });
    });
    await act(async () => {
      await createHook.current.mutateAsync({ payload: createPayload });
    });
    expect(createKeys).toHaveLength(3);
    expect(createKeys[0]).toBe(createKeys[1]);
    expect(createKeys[2]).not.toBe(createKeys[1]);

    const { result: resetHook } = renderHook(
      () => useResetUserPasswordMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        resetHook.current.mutateAsync({
          userId: MONA_USER_ID,
          payload: { new_password: 'ValidPassword12!' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await resetHook.current.mutateAsync({
        userId: MONA_USER_ID,
        payload: { new_password: 'ValidPassword12!' },
      });
    });
    await act(async () => {
      await resetHook.current.mutateAsync({
        userId: MONA_USER_ID,
        payload: { new_password: 'AnotherPassword12!' },
      });
    });
    expect(resetKeys).toHaveLength(3);
    expect(resetKeys[0]).toBe(resetKeys[1]);
    expect(resetKeys[2]).not.toBe(resetKeys[1]);

    const { result: revokeHook } = renderHook(
      () => useRevokeUserSessionsMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        revokeHook.current.mutateAsync({ userId: MONA_USER_ID })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await revokeHook.current.mutateAsync({ userId: MONA_USER_ID });
    });
    await act(async () => {
      await revokeHook.current.mutateAsync({ userId: MONA_USER_ID });
    });
    expect(revokeKeys).toHaveLength(3);
    expect(revokeKeys[0]).toBe(revokeKeys[1]);
    expect(revokeKeys[2]).not.toBe(revokeKeys[1]);
  });
});
