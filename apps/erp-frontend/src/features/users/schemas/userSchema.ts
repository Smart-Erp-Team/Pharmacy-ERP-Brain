import { z } from 'zod';
import type {
  BranchScope,
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  User,
  UserRole,
} from '../../../types/api';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_USERNAME_LENGTH = 80;

export const USER_ROLES = [
  'Admin',
  'Pharmacist',
  'Cashier',
] as const satisfies readonly UserRole[];

export const BRANCH_SCOPES = [
  'ALL',
  'ASSIGNED',
] as const satisfies readonly BranchScope[];

export function normalizeBranchIds(branchIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const branchId of branchIds) {
    const trimmed = branchId.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }

  return normalized;
}

function validateRoleAndBranchScope(
  values: {
    readonly role: UserRole;
    readonly branch_scope: BranchScope;
    readonly branch_ids: readonly string[];
  },
  ctx: z.RefinementCtx
): void {
  if (values.role !== 'Admin' && values.branch_scope !== 'ASSIGNED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branch_scope'],
      message: 'Only Admin accounts can use ALL branch scope',
    });
  }

  if (
    (values.branch_scope === 'ASSIGNED' || values.role !== 'Admin') &&
    normalizeBranchIds(values.branch_ids).length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branch_ids'],
      message: 'Select at least one branch for ASSIGNED scope',
    });
  }
}

export const createUserFormSchema = z
  .object({
    employee_id: z.string().trim().min(1, 'Employee is required'),
    username: z
      .string()
      .trim()
      .min(1, 'Username is required')
      .max(
        MAX_USERNAME_LENGTH,
        `Username must be at most ${MAX_USERNAME_LENGTH} characters`
      ),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Password must be at most ${MAX_PASSWORD_LENGTH} characters`
      ),
    role: z.enum(USER_ROLES),
    branch_scope: z.enum(BRANCH_SCOPES),
    branch_ids: z.array(z.string()),
  })
  .superRefine(validateRoleAndBranchScope);

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const DEFAULT_CREATE_USER_FORM_VALUES: CreateUserFormValues = {
  employee_id: '',
  username: '',
  password: '',
  role: 'Pharmacist',
  branch_scope: 'ASSIGNED',
  branch_ids: [],
};

export const editUserFormSchema = z
  .object({
    role: z.enum(USER_ROLES),
    branch_scope: z.enum(BRANCH_SCOPES),
    branch_ids: z.array(z.string()),
    is_active: z.boolean(),
  })
  .superRefine(validateRoleAndBranchScope);

export type EditUserFormValues = z.infer<typeof editUserFormSchema>;

export function createEditUserFormSchema() {
  return editUserFormSchema;
}

export const passwordResetSchema = z
  .object({
    new_password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Password must be at most ${MAX_PASSWORD_LENGTH} characters`
      ),
    confirm_password: z.string().min(1, 'Please confirm the new password'),
  })
  .refine((values) => values.confirm_password === values.new_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

export type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;

export const DEFAULT_PASSWORD_RESET_VALUES: PasswordResetFormValues = {
  new_password: '',
  confirm_password: '',
};

export function toCreateUserPayload(
  values: CreateUserFormValues
): CreateUserRequest {
  return {
    employee_id: values.employee_id.trim(),
    username: values.username.trim(),
    password: values.password,
    role: values.role,
    branch_scope: values.branch_scope,
    branch_ids:
      values.branch_scope === 'ALL'
        ? []
        : normalizeBranchIds(values.branch_ids),
  };
}

export function userDtoToEditFormValues(user: User): EditUserFormValues {
  return {
    role: user.role,
    branch_scope: user.branch_scope,
    branch_ids: [...user.branch_ids],
    is_active: user.is_active,
  };
}

export function toUserPatchPayload(
  values: EditUserFormValues
): UpdateUserRequest;
export function toUserPatchPayload(
  values: EditUserFormValues,
  original: User
): UpdateUserRequest;
export function toUserPatchPayload(
  values: EditUserFormValues
): UpdateUserRequest {
  return {
    role: values.role,
    branch_scope: values.branch_scope,
    branch_ids:
      values.branch_scope === 'ALL'
        ? []
        : normalizeBranchIds(values.branch_ids),
    is_active: values.is_active,
  };
}

export function toPasswordResetPayload(
  values: PasswordResetFormValues
): ResetPasswordRequest {
  return {
    new_password: values.new_password,
  };
}
