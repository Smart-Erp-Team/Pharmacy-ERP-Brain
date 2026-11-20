/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
  resetMockUsers,
  userHandlers,
} from '../../../mocks/userHandlers';
import type { UserDto } from '../../../types/api';
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
  passwordResetSchema,
  toCreateUserPayload,
  toPasswordResetPayload,
  toUserPatchPayload,
  USER_ROLES,
  userDtoToEditFormValues,
} from './userSchema';

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
  it('exposes exact contract role and branch scope tuples', () => {
    expect(USER_ROLES).toEqual(['Admin', 'Pharmacist', 'Cashier']);
    expect(BRANCH_SCOPES).toEqual(['ALL', 'ASSIGNED']);
  });

  describe('createUserFormSchema & toCreateUserPayload', () => {
    it('accepts Admin with ALL scope and omits branch_access from CreateUserRequest', () => {
      const parsed = createUserFormSchema.parse({
        employee_id: '  a1111111-1111-4111-8111-111111111103  ',
        username: '  admin.karim  ',
        password: ' SecurePass!9 ',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: ['branch-ignored-when-all'],
      });

      const payload = toCreateUserPayload(parsed);

      expect(payload).toEqual({
        employee_id: 'a1111111-1111-4111-8111-111111111103',
        username: 'admin.karim',
        password: ' SecurePass!9 ',
        role: 'Admin',
        branch_scope: 'ALL',
      });
      expect('branch_access' in payload).toBe(false);
    });

    it('accepts Pharmacist/Cashier with ASSIGNED scope and deduplicates trimmed branch_ids', () => {
      const parsed = createUserFormSchema.parse({
        employee_id: 'a1111111-1111-4111-8111-111111111103',
        username: 'cashier.nour',
        password: 'password123',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [' branch-1 ', 'branch-2', 'branch-1', '   '],
      });

      expect(toCreateUserPayload(parsed)).toEqual({
        employee_id: 'a1111111-1111-4111-8111-111111111103',
        username: 'cashier.nour',
        password: 'password123',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_access: [{ branch_id: 'branch-1' }, { branch_id: 'branch-2' }],
      });
    });

    it('rejects non-Admin accounts using ALL branch scope', () => {
      for (const role of ['Pharmacist', 'Cashier'] as const) {
        const result = createUserFormSchema.safeParse({
          employee_id: 'emp-3',
          username: 'user.three',
          password: 'password123',
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
            ])
          );
        }
      }
    });

    it('rejects ASSIGNED scope with zero valid branches', () => {
      const result = createUserFormSchema.safeParse({
        ...DEFAULT_CREATE_USER_FORM_VALUES,
        employee_id: 'emp-3',
        username: 'ph.ali',
        password: 'password123',
        role: 'Pharmacist',
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
    });

    it('enforces required employee, username bounds, and password bounds', () => {
      const shortResult = createUserFormSchema.safeParse({
        employee_id: '   ',
        username: '   ',
        password: 'short',
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });

      expect(shortResult.success).toBe(false);
      if (!shortResult.success) {
        const messages = shortResult.error.issues.map((issue) => issue.message);
        expect(messages).toContain('Employee is required');
        expect(messages).toContain('Username is required');
        expect(messages).toContain('Password must be at least 8 characters');
      }

      const longResult = createUserFormSchema.safeParse({
        employee_id: 'emp-1',
        username: 'u'.repeat(81),
        password: 'p'.repeat(129),
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: [],
      });

      expect(longResult.success).toBe(false);
      if (!longResult.success) {
        const paths = longResult.error.issues.map((issue) =>
          issue.path.join('.')
        );
        expect(paths).toContain('username');
        expect(paths).toContain('password');
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
        expect(createForm.current.branchIdsError).toBe(
          'Select at least one branch for ASSIGNED scope'
        );
      });
    });
  });

  describe('editUserFormSchema, createEditUserFormSchema, and toUserPatchPayload', () => {
    const assignedUser: UserDto = INITIAL_USERS[1];
    const allScopeAdmin: UserDto = INITIAL_USERS[0];

    it('converts UserDto cleanly with untouched branch access flag', () => {
      expect(userDtoToEditFormValues(assignedUser)).toEqual({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [],
        has_branch_access_edit: false,
        is_active: true,
      });
    });

    it('passes validation and omits branch_access when existing ASSIGNED user has untouched branch grants', () => {
      const formValues = {
        ...userDtoToEditFormValues(assignedUser),
        role: 'Cashier' as const,
        is_active: false,
      };

      const parsed = createEditUserFormSchema(assignedUser.branch_scope).parse(
        formValues
      );
      expect(editUserFormSchema.safeParse(formValues).success).toBe(true);

      const payload = toUserPatchPayload(parsed, assignedUser.branch_scope);
      expect(payload).toEqual({
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        is_active: false,
      });
      expect('branch_access' in payload).toBe(false);
    });

    it('requires branch_ids and sends branch_access when ASSIGNED branch grants are edited', () => {
      const emptyEditResult = createEditUserFormSchema('ASSIGNED').safeParse({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [],
        has_branch_access_edit: true,
        is_active: true,
      });

      expect(emptyEditResult.success).toBe(false);
      if (!emptyEditResult.success) {
        expect(emptyEditResult.error.issues[0]).toMatchObject({
          path: ['branch_ids'],
          message: 'Select at least one branch for ASSIGNED scope',
        });
      }

      const validParsed = editUserFormSchema.parse({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: ['branch-a', 'branch-b'],
        has_branch_access_edit: true,
        is_active: true,
      });

      expect(toUserPatchPayload(validParsed, 'ASSIGNED')).toEqual({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        is_active: true,
        branch_access: [{ branch_id: 'branch-a' }, { branch_id: 'branch-b' }],
      });
    });

    it('requires branch_ids and emits branch_access when switching from ALL to ASSIGNED even without manual checkbox flag', () => {
      const schema = createEditUserFormSchema(allScopeAdmin.branch_scope);

      const missingBranches = schema.safeParse({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [],
        has_branch_access_edit: false,
        is_active: true,
      });

      expect(missingBranches.success).toBe(false);
      if (!missingBranches.success) {
        expect(missingBranches.error.issues[0]).toMatchObject({
          path: ['branch_ids'],
          message: 'Select at least one branch for ASSIGNED scope',
        });
      }

      const withBranch = schema.parse({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: ['branch-1'],
        has_branch_access_edit: false,
        is_active: true,
      });

      expect(
        toUserPatchPayload(withBranch, allScopeAdmin.branch_scope)
      ).toEqual({
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        is_active: true,
        branch_access: [{ branch_id: 'branch-1' }],
      });
    });

    it('omits branch_access when switching to ALL scope and blocks non-Admin ALL scope', () => {
      const invalidNonAdminAll = createEditUserFormSchema('ASSIGNED').safeParse(
        {
          role: 'Cashier',
          branch_scope: 'ALL',
          branch_ids: [],
          has_branch_access_edit: false,
          is_active: true,
        }
      );

      expect(invalidNonAdminAll.success).toBe(false);
      if (!invalidNonAdminAll.success) {
        expect(invalidNonAdminAll.error.issues[0]).toMatchObject({
          path: ['branch_scope'],
          message: 'Only Admin accounts can use ALL branch scope',
        });
      }

      const adminAll = createEditUserFormSchema('ASSIGNED').parse({
        role: 'Admin',
        branch_scope: 'ALL',
        branch_ids: ['branch-1'],
        has_branch_access_edit: true,
        is_active: true,
      });

      const payload = toUserPatchPayload(adminAll, 'ASSIGNED');
      expect(payload).toEqual({
        role: 'Admin',
        branch_scope: 'ALL',
        is_active: true,
      });
      expect('branch_access' in payload).toBe(false);
    });

    it('integrates with React Hook Form zodResolver and isDirty tracking', async () => {
      const { result } = renderHook(() => {
        const form = useForm({
          resolver: zodResolver(
            createEditUserFormSchema(assignedUser.branch_scope)
          ),
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
        result.current.setValue('has_branch_access_edit', true, {
          shouldDirty: true,
        });
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
    it('accepts matching passwords within 8-128 chars without trimming', () => {
      const parsed = passwordResetSchema.parse({
        new_password: ' ResetPass!23 ',
        confirm_password: ' ResetPass!23 ',
      });

      expect(toPasswordResetPayload(parsed)).toEqual({
        new_password: ' ResetPass!23 ',
      });
    });

    it('rejects empty confirmation, short/long passwords, and mismatches', () => {
      const emptyResult = passwordResetSchema.safeParse(
        DEFAULT_PASSWORD_RESET_VALUES
      );
      expect(emptyResult.success).toBe(false);

      const mismatchResult = passwordResetSchema.safeParse({
        new_password: 'ValidPassword1',
        confirm_password: 'DifferentPassword2',
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

      const tooLongResult = passwordResetSchema.safeParse({
        new_password: 'x'.repeat(129),
        confirm_password: 'x'.repeat(129),
      });
      expect(tooLongResult.success).toBe(false);
    });

    it('integrates passwordResetSchema with React Hook Form zodResolver', async () => {
      const { result: resetForm } = renderHook(() => {
        const form = useForm({
          resolver: zodResolver(passwordResetSchema),
          defaultValues: {
            new_password: 'Password123',
            confirm_password: 'Mismatch123',
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
  it('maps 422 create fields including branch_access -> branch_ids and returns null', () => {
    const setError = vi.fn();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        trace_id: 'trace-create-422',
        details: [
          { field: 'employee_id', issue: 'Employee is invalid' },
          { field: 'username', issue: 'Username invalid' },
          { field: 'password', issue: 'Password too weak' },
          { field: 'role', issue: 'Role unsupported' },
          { field: 'branch_scope', issue: 'Scope unsupported' },
          { field: 'branch_access', issue: 'Select at least one branch' },
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
      message: 'Password too weak',
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

  it('returns message with trace_id on 409 conflict even when field error is mapped', () => {
    const setError = vi.fn();
    const error = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Username "admin.omar" is already taken.',
        trace_id: 'trace-409',
        details: [{ field: 'username', issue: 'Username must be unique.' }],
      },
      409
    );

    const banner = applyCreateUserFormApiError(error, setError);

    expect(setError).toHaveBeenCalledWith('username', {
      type: 'server',
      message: 'Username must be unique.',
    });
    expect(banner).toBe(
      'Username "admin.omar" is already taken. (Trace: trace-409)'
    );
  });

  it('maps edit user 422 errors including indexed branch_access paths', () => {
    const setError = vi.fn();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid update',
        trace_id: 'trace-edit-422',
        details: [
          { field: 'branch_access[0].branch_id', issue: 'Branch inactive' },
          { field: 'is_active', issue: 'Cannot deactivate self' },
        ],
      },
      422
    );

    const banner = applyEditUserFormApiError(error, setError);

    expect(banner).toBeNull();
    expect(setError).toHaveBeenCalledWith('branch_ids', {
      type: 'server',
      message: 'Branch inactive',
    });
    expect(setError).toHaveBeenCalledWith('is_active', {
      type: 'server',
      message: 'Cannot deactivate self',
    });
  });

  it('maps password reset 422 new_password and returns banner for unmapped/unknown errors', () => {
    const setError = vi.fn();
    const validationErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid password',
        details: [{ field: 'new_password', issue: 'Password too short' }],
      },
      422
    );

    expect(applyPasswordResetFormApiError(validationErr, setError)).toBeNull();
    expect(setError).toHaveBeenCalledWith('new_password', {
      type: 'server',
      message: 'Password too short',
    });

    const unmappedErr = new ApiClientError(
      {
        code: 'NOT_FOUND',
        message: 'User account was not found.',
        trace_id: 'trace-404',
      },
      404
    );
    expect(applyPasswordResetFormApiError(unmappedErr, setError)).toBe(
      'User account was not found. (Trace: trace-404)'
    );

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
  it('lists users with cursor pagination, omits empty cursor, floors fractional limit, and never attaches branch_access', async () => {
    let seenCursorParam: string | null = 'unset';
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        seenCursorParam = new URL(request.url).searchParams.get('cursor');
        return undefined;
      })
    );

    const page1 = await listUsers({ cursor: '   ', limit: 1.8 });
    expect(seenCursorParam).toBeNull();
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0].username).toBe('admin.omar');
    expect(page1.nextCursor).toBe('1');
    expect('branch_access' in page1.items[0]).toBe(false);

    const page2 = await listUsers({
      cursor: page1.nextCursor ?? undefined,
      limit: 1,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].username).toBe('ph.mona');
    expect(page2.items[0].access_failed_count).toBe(5);
    expect(page2.items[0].lockout_end).toBe('2099-01-01T12:00:00.000Z');
    expect(page2.nextCursor).toBeNull();
    expect('branch_access' in page2.items[0]).toBe(false);
  });

  it('fetches single user detail and returns 404 when missing', async () => {
    const user = await getUser('b2222222-2222-4222-8222-222222222202');
    expect(user.username).toBe('ph.mona');

    await expect(getUser('missing-user-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('creates users, enforces 409 employee/username conflicts, 400 malformed body, and 422 scope/grant rules', async () => {
    const created = await createUser({
      employee_id: 'a1111111-1111-4111-8111-111111111103',
      username: 'cashier.tarek',
      password: 'Password123',
      role: 'Cashier',
      branch_scope: 'ASSIGNED',
      branch_access: [{ branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa' }],
    });

    expect(created.username).toBe('cashier.tarek');
    expect(created.branch_scope).toBe('ASSIGNED');
    expect('branch_access' in created).toBe(false);

    // Case-insensitive duplicate employee_id UUID -> 409
    await expect(
      createUser({
        employee_id: 'A1111111-1111-4111-8111-111111111101',
        username: 'fresh.username',
        password: 'Password123',
        role: 'Admin',
        branch_scope: 'ALL',
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Case-insensitive duplicate username -> 409
    await expect(
      createUser({
        employee_id: 'a1111111-1111-4111-8111-111111111199',
        username: 'ADMIN.OMAR',
        password: 'Password123',
        role: 'Admin',
        branch_scope: 'ALL',
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Non-Admin with ALL -> 422
    await expect(
      createUser({
        employee_id: 'a1111111-1111-4111-8111-111111111199',
        username: 'bad.pharmacist',
        password: 'Password123',
        role: 'Pharmacist',
        branch_scope: 'ALL',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // ASSIGNED with empty branch_access -> 422
    await expect(
      createUser({
        employee_id: 'a1111111-1111-4111-8111-111111111199',
        username: 'bad.cashier',
        password: 'Password123',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_access: [],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // ASSIGNED with invalid non-array branch_access -> 422 specific grant array message
    await expect(
      apiClient.post('/users', {
        employee_id: 'a1111111-1111-4111-8111-111111111199',
        username: 'bad.grants',
        password: 'Password123',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_access: 'not-an-array',
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'branch_access',
          issue: 'Branch access grants must be a valid array.',
        },
      ],
    });

    // Non-object body -> 400 MALFORMED_REQUEST
    await expect(
      apiClient.post('/users', ['not-object'])
    ).rejects.toMatchObject({
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
  });

  it('patches users, preserves/clears ASSIGNED grants across scope changes, keeps username immutable, and rejects invalid patches', async () => {
    const updated = await patchUser('b2222222-2222-4222-8222-222222222202', {
      is_active: false,
    });
    expect(updated.is_active).toBe(false);
    expect(updated.branch_scope).toBe('ASSIGNED');

    // Attempted username mutation via raw PATCH keeps username immutable
    const afterImmutableCheck = await apiClient.patch<UserDto>(
      '/users/b2222222-2222-4222-8222-222222222202',
      { username: 'attempted.override' }
    );
    expect(afterImmutableCheck.data.username).toBe('ph.mona');

    // Missing user -> 404
    await expect(
      patchUser('missing-user-id', { is_active: true })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    // Non-Admin with ALL -> 422
    await expect(
      patchUser('b2222222-2222-4222-8222-222222222201', {
        role: 'Cashier',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // ASSIGNED with empty branch_access -> 422
    await expect(
      patchUser('b2222222-2222-4222-8222-222222222202', {
        branch_scope: 'ASSIGNED',
        branch_access: [],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // Switching ALL -> ASSIGNED without grants -> 422
    await expect(
      patchUser('b2222222-2222-4222-8222-222222222201', {
        branch_scope: 'ASSIGNED',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    // Switching ALL -> ASSIGNED with grants succeeds; switching back to ALL clears grants
    const downgraded = await patchUser('b2222222-2222-4222-8222-222222222201', {
      branch_scope: 'ASSIGNED',
      branch_access: [{ branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa' }],
    });
    expect(downgraded.branch_scope).toBe('ASSIGNED');

    const restoredAll = await patchUser(
      'b2222222-2222-4222-8222-222222222201',
      {
        branch_scope: 'ALL',
      }
    );
    expect(restoredAll.branch_scope).toBe('ALL');

    await expect(
      patchUser('b2222222-2222-4222-8222-222222222201', {
        branch_scope: 'ASSIGNED',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  it('supports password reset and session revocation endpoints including 404 and length errors', async () => {
    await expect(
      resetUserPassword('b2222222-2222-4222-8222-222222222202', {
        new_password: 'NewPassword123',
      })
    ).resolves.toBeUndefined();

    await expect(
      resetUserPassword('b2222222-2222-4222-8222-222222222202', {
        new_password: 'short',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      resetUserPassword('b2222222-2222-4222-8222-222222222202', {
        new_password: 'x'.repeat(129),
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      resetUserPassword('missing-id', {
        new_password: 'NewPassword123',
      })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    await expect(
      revokeUserSessions('b2222222-2222-4222-8222-222222222202')
    ).resolves.toBeUndefined();

    await expect(revokeUserSessions('missing-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('keeps useUserQuery disabled when userId is missing or whitespace and loads when defined', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result: disabledUndefined } = renderHook(
      () => useUserQuery(undefined),
      { wrapper }
    );
    expect(disabledUndefined.current.fetchStatus).toBe('idle');

    const { result: disabledBlank } = renderHook(() => useUserQuery('   '), {
      wrapper,
    });
    expect(disabledBlank.current.fetchStatus).toBe('idle');

    const { result: enabledResult } = renderHook(
      () => useUserQuery('b2222222-2222-4222-8222-222222222201'),
      { wrapper }
    );
    await waitFor(() => expect(enabledResult.current.isSuccess).toBe(true));
    expect(enabledResult.current.data?.username).toBe('admin.omar');

    const { result: listResult } = renderHook(() => useUsersQuery(), {
      wrapper,
    });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data?.items).toHaveLength(2);
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

    server.use(
      http.patch('*/api/v1/users/:userId', ({ request }) => {
        patchKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstPatch) {
          failFirstPatch = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary patch failure',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          { ...INITIAL_USERS[1], is_active: false },
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
                code: 'INTERNAL_ERROR',
                message: 'Temporary create failure',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          {
            user_id: 'b2222222-2222-4222-8222-222222222299',
            employee_id: 'a1111111-1111-4111-8111-111111111103',
            username: 'new.user',
            role: 'Cashier',
            branch_scope: 'ASSIGNED',
            is_active: true,
          },
          { status: 201 }
        );
      }),
      http.post('*/api/v1/users/:userId/password-reset', ({ request }) => {
        resetKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstReset) {
          failFirstReset = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary reset failure',
              },
            },
            { status: 500 }
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/users/:userId/revoke-sessions', ({ request }) => {
        revokeKeys.push(request.headers.get('Idempotency-Key'));
        if (failFirstRevoke) {
          failFirstRevoke = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary revoke failure',
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

    const userId = 'b2222222-2222-4222-8222-222222222202';

    await act(async () => {
      await expect(
        patchHook.current.mutateAsync({
          userId,
          payload: { is_active: false },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });

    await act(async () => {
      await patchHook.current.mutateAsync({
        userId,
        payload: { is_active: false },
      });
    });

    // Different payload after success should get a fresh key
    await act(async () => {
      await patchHook.current.mutateAsync({
        userId,
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
      queryKey: usersKeys.detail(userId),
    });

    const createPayload = {
      employee_id: 'a1111111-1111-4111-8111-111111111103',
      username: 'new.user',
      password: 'Password123',
      role: 'Cashier' as const,
      branch_scope: 'ASSIGNED' as const,
      branch_access: [{ branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa' }],
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
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usersKeys.lists(),
    });

    const { result: resetHook } = renderHook(
      () => useResetUserPasswordMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        resetHook.current.mutateAsync({
          userId,
          payload: { new_password: 'Password123' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await resetHook.current.mutateAsync({
        userId,
        payload: { new_password: 'Password123' },
      });
    });
    await act(async () => {
      await resetHook.current.mutateAsync({
        userId,
        payload: { new_password: 'Password456' },
      });
    });
    expect(resetKeys).toHaveLength(3);
    expect(resetKeys[0]).toBe(resetKeys[1]);
    expect(resetKeys[2]).not.toBe(resetKeys[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usersKeys.detail(userId),
    });

    const { result: revokeHook } = renderHook(
      () => useRevokeUserSessionsMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        revokeHook.current.mutateAsync({ userId })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await revokeHook.current.mutateAsync({ userId });
    });
    await act(async () => {
      await revokeHook.current.mutateAsync({ userId });
    });
    expect(revokeKeys).toHaveLength(3);
    expect(revokeKeys[0]).toBe(revokeKeys[1]);
    expect(revokeKeys[2]).not.toBe(revokeKeys[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usersKeys.detail(userId),
    });
  });
});
