import { z } from 'zod';
import {
  addressDtoToFormValues,
  addressSchema,
  DEFAULT_ADDRESS_VALUES,
  toAddressDto,
} from '../../../lib/schemas/addressSchema';
import type {
  CreateEmployeeRequest,
  Employee,
  UpdateEmployeeRequest,
} from '../../../types/api';

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, 'Email must be at most 254 characters')
  .refine(
    (value) => value === '' || z.string().email().safeParse(value).success,
    'Please enter a valid email address'
  );

export const employeeFormSchema = z.object({
  branch_id: z
    .string()
    .trim()
    .min(1, 'Home branch is required')
    .refine(
      (value) => value === '' || z.string().uuid().safeParse(value).success,
      'Home branch must be a valid UUID'
    ),
  employee_no: z
    .string()
    .trim()
    .min(1, 'Employee number is required')
    .max(30, 'Employee number must be at most 30 characters'),
  full_name: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(150, 'Full name must be at most 150 characters'),
  job_title: z
    .string()
    .trim()
    .min(1, 'Job title is required')
    .max(80, 'Job title must be at most 80 characters'),
  email: optionalEmailSchema,
  phone: z
    .string()
    .trim()
    .max(30, 'Phone number must be at most 30 characters'),
  hired_on: z
    .string()
    .trim()
    .min(1, 'Hire date is required')
    .refine(
      (value) => value === '' || isValidIsoDate(value),
      'Hire date must be a valid YYYY-MM-DD date'
    ),
  is_active: z.boolean(),
  address: addressSchema,
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const DEFAULT_EMPLOYEE_FORM_VALUES: EmployeeFormValues = {
  branch_id: '',
  employee_no: '',
  full_name: '',
  job_title: '',
  email: '',
  phone: '',
  hired_on: '',
  is_active: true,
  address: { ...DEFAULT_ADDRESS_VALUES },
};

export function employeeDtoToFormValues(
  employee: Employee
): EmployeeFormValues {
  return {
    branch_id: employee.branch_id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    job_title: employee.job_title,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    hired_on: employee.hired_on,
    is_active: employee.is_active,
    address: addressDtoToFormValues(employee.address),
  };
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toEmployeeCreatePayload(
  values: EmployeeFormValues
): CreateEmployeeRequest {
  return {
    branch_id: values.branch_id.trim(),
    employee_no: values.employee_no.trim(),
    full_name: values.full_name.trim(),
    job_title: values.job_title.trim(),
    email: normalizeOptionalString(values.email),
    phone: normalizeOptionalString(values.phone),
    hired_on: values.hired_on.trim(),
    address: toAddressDto(values.address),
  };
}

export function toEmployeePatchPayload(
  values: EmployeeFormValues
): UpdateEmployeeRequest {
  return {
    full_name: values.full_name.trim(),
    job_title: values.job_title.trim(),
    email: normalizeOptionalString(values.email),
    phone: normalizeOptionalString(values.phone),
    is_active: values.is_active,
    address: toAddressDto(values.address),
  };
}
