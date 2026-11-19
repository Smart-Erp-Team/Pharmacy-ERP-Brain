import { z } from 'zod';
import type {
  BranchScope,
  CreateUserRequest,
  PasswordResetRequest,
  Role,
  UserDto,
  UserPatchRequest,
} from '../../../types/api';

export const USER_ROLES = [
  'Admin',
  'Pharmacist',
  'Cashier',
] as const satisfies readonly Role[];

export const BRANCH_SCOPES = [
  'ALL',
  'ASSIGNED',
] as const satisfies readonly BranchScope[];

function normalizeBranchIds(branchIds: readonly string[]): string[] {
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

export const createUserFormSchema = z
  .object({
    employee_id: z.string().trim().min(1, 'Employee is required'),
    username: z
      .string()
      .trim()
      .min(1, 'Username is required')
      .max(80, 'Username must be at most 80 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    role: z.enum(USER_ROLES),
    branch_scope: z.enum(BRANCH_SCOPES),
    branch_ids: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.role !== 'Admin' && values.branch_scope === 'ALL') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_scope'],
        message: 'Only Admin accounts can use ALL branch scope',
      });
    }

    if (
      values.branch_scope === 'ASSIGNED' &&
      normalizeBranchIds(values.branch_ids).length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_ids'],
        message: 'Select at least one branch for ASSIGNED scope',
      });
    }
  });

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const DEFAULT_CREATE_USER_FORM_VALUES: CreateUserFormValues = {
  employee_id: '',
  username: '',
  password: '',
  role: 'Pharmacist',
  branch_scope: 'ASSIGNED',
  branch_ids: [],
};

const editUserFormBaseSchema = z.object({
  role: z.enum(USER_ROLES),
  branch_scope: z.enum(BRANCH_SCOPES),
  branch_ids: z.array(z.string()),
  has_branch_access_edit: z.boolean(),
  is_active: z.boolean(),
});

export type EditUserFormValues = z.infer<typeof editUserFormBaseSchema>;

export function createEditUserFormSchema(
  initialBranchScope: BranchScope = 'ASSIGNED'
) {
  return editUserFormBaseSchema.superRefine((values, ctx) => {
    if (values.role !== 'Admin' && values.branch_scope === 'ALL') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_scope'],
        message: 'Only Admin accounts can use ALL branch scope',
      });
    }

    const requiresBranchIds =
      values.branch_scope === 'ASSIGNED' &&
      (initialBranchScope === 'ALL' || values.has_branch_access_edit);

    if (
      requiresBranchIds &&
      normalizeBranchIds(values.branch_ids).length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_ids'],
        message: 'Select at least one branch for ASSIGNED scope',
      });
    }
  });
}

export const editUserFormSchema = createEditUserFormSchema('ASSIGNED');

export const passwordResetSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
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
  const payload: CreateUserRequest = {
    employee_id: values.employee_id.trim(),
    username: values.username.trim(),
    password: values.password,
    role: values.role,
    branch_scope: values.branch_scope,
  };

  if (values.branch_scope === 'ASSIGNED') {
    payload.branch_access = normalizeBranchIds(values.branch_ids).map(
      (branch_id) => ({ branch_id })
    );
  }

  return payload;
}

export function userDtoToEditFormValues(user: UserDto): EditUserFormValues {
  return {
    role: user.role,
    branch_scope: user.branch_scope,
    branch_ids: [],
    has_branch_access_edit: false,
    is_active: user.is_active,
  };
}

export function toUserPatchPayload(
  values: EditUserFormValues,
  initialBranchScope?: BranchScope
): UserPatchRequest {
  const payload: UserPatchRequest = {
    role: values.role,
    branch_scope: values.branch_scope,
    is_active: values.is_active,
  };

  const shouldSendBranchAccess =
    values.branch_scope === 'ASSIGNED' &&
    (values.has_branch_access_edit || initialBranchScope === 'ALL');

  if (shouldSendBranchAccess) {
    payload.branch_access = normalizeBranchIds(values.branch_ids).map(
      (branch_id) => ({ branch_id })
    );
  }

  return payload;
}

export function toPasswordResetPayload(
  values: PasswordResetFormValues
): PasswordResetRequest {
  return {
    new_password: values.new_password,
  };
}
