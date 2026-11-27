import { http, HttpResponse } from 'msw';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../lib/api/pagination';
import type {
  AddressDto,
  Employee,
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  PagedResult,
} from '../types/api';

const ORGANIZATION_ID = currentUserContext.organization_id;

export const INITIAL_EMPLOYEES: readonly Employee[] = [
  {
    employee_id: '11111111-3333-4111-8111-000000000001',
    organization_id: ORGANIZATION_ID,
    branch_id: '11111111-2222-4111-8111-000000000001',
    employee_no: 'EMP-001',
    full_name: 'Omar Khaled',
    email: 'admin@medcare.test',
    phone: '+20 100 111 2233',
    job_title: 'Pharmacy Director',
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
    created_at: '2024-03-01T09:00:00.000Z',
    updated_at: '2024-03-01T09:00:00.000Z',
  },
  {
    employee_id: '11111111-3333-4111-8111-000000000002',
    organization_id: ORGANIZATION_ID,
    branch_id: '11111111-2222-4111-8111-000000000002',
    employee_no: 'EMP-002',
    full_name: 'Mona Adel',
    email: 'mona.adel@medcare.test',
    phone: '+20 122 333 4455',
    job_title: 'Senior Pharmacist',
    address: {
      line1: '240 El Geish Road',
      line2: null,
      city: 'Alexandria',
      region: 'Alexandria Governorate',
      postal_code: '21500',
      country_code: 'EG',
    },
    hired_on: '2024-06-15',
    is_active: true,
    created_at: '2024-06-15T10:00:00.000Z',
    updated_at: '2024-06-15T10:00:00.000Z',
  },
  {
    employee_id: '11111111-3333-4111-8111-000000000003',
    organization_id: ORGANIZATION_ID,
    branch_id: '11111111-2222-4111-8111-000000000001',
    employee_no: 'EMP-003',
    full_name: 'Karim Hassan',
    email: 'karim.hassan@medcare.test',
    phone: '+20 111 444 5566',
    job_title: 'Dispensing Pharmacist',
    address: {
      line1: '42 Zamalek Street',
      line2: null,
      city: 'Cairo',
      region: 'Cairo Governorate',
      postal_code: '11211',
      country_code: 'EG',
    },
    hired_on: '2025-01-10',
    is_active: true,
    created_at: '2025-01-10T08:30:00.000Z',
    updated_at: '2025-01-10T08:30:00.000Z',
  },
  {
    employee_id: '11111111-3333-4111-8111-000000000004',
    organization_id: ORGANIZATION_ID,
    branch_id: '11111111-2222-4111-8111-000000000003',
    employee_no: 'EMP-004',
    full_name: 'Salma Nabil',
    email: null,
    phone: null,
    job_title: 'Former Cashier',
    address: {
      line1: '18 Stanley Bridge St',
      line2: null,
      city: 'Alexandria',
      region: 'Alexandria Governorate',
      postal_code: '21532',
      country_code: 'EG',
    },
    hired_on: '2023-09-01',
    is_active: false,
    created_at: '2023-09-01T09:15:00.000Z',
    updated_at: '2024-01-15T14:00:00.000Z',
  },
];

function cloneEmployee(employee: Employee): Employee {
  return {
    ...employee,
    address: { ...employee.address },
  };
}

let mockEmployees: Employee[] = INITIAL_EMPLOYEES.map(cloneEmployee);
let createdEmployeeCounter = 0;

export function resetMockEmployees(): void {
  mockEmployees = INITIAL_EMPLOYEES.map(cloneEmployee);
  createdEmployeeCounter = 0;
}

function createMockErrorEnvelope(
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      details,
      trace_id: traceId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseAddress(
  value: unknown,
  details: NormalizedApiErrorDetail[]
): AddressDto | null {
  if (!isRecord(value)) {
    details.push({
      field: 'address.line1',
      issue: 'Complete address is required.',
    });
    return null;
  }

  const line1 = readTrimmedString(value.line1);
  const line2 = readNullableString(value.line2);
  const city = readTrimmedString(value.city);
  const region = readNullableString(value.region);
  const postalCode = readNullableString(value.postal_code);
  const countryCode = readTrimmedString(value.country_code).toUpperCase();

  let valid = true;
  if (!line1) {
    details.push({
      field: 'address.line1',
      issue: 'Address line 1 is required.',
    });
    valid = false;
  } else if (line1.length > 200) {
    details.push({
      field: 'address.line1',
      issue: 'Address line 1 must be at most 200 characters.',
    });
    valid = false;
  }

  if (line2 && line2.length > 200) {
    details.push({
      field: 'address.line2',
      issue: 'Address line 2 must be at most 200 characters.',
    });
    valid = false;
  }

  if (!city) {
    details.push({ field: 'address.city', issue: 'City is required.' });
    valid = false;
  } else if (city.length > 100) {
    details.push({
      field: 'address.city',
      issue: 'City must be at most 100 characters.',
    });
    valid = false;
  }

  if (region && region.length > 100) {
    details.push({
      field: 'address.region',
      issue: 'Region must be at most 100 characters.',
    });
    valid = false;
  }

  if (postalCode && postalCode.length > 20) {
    details.push({
      field: 'address.postal_code',
      issue: 'Postal code must be at most 20 characters.',
    });
    valid = false;
  }

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    details.push({
      field: 'address.country_code',
      issue: 'Country code must be a 2-letter ISO code.',
    });
    valid = false;
  }

  if (!valid) {
    return null;
  }

  return {
    line1,
    line2,
    city,
    region,
    postal_code: postalCode,
    country_code: countryCode,
  };
}

function validateOptionalField(
  rawValue: unknown,
  field: 'email' | 'phone',
  maxLength: number,
  label: string,
  details: NormalizedApiErrorDetail[]
): string | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue !== 'string') {
    details.push({ field, issue: `${label} must be a string or null.` });
    return null;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    details.push({
      field,
      issue: `${label} must be at most ${maxLength} characters.`,
    });
    return null;
  }
  if (field === 'email' && !isValidEmail(trimmed)) {
    details.push({
      field: 'email',
      issue: 'Please enter a valid email address.',
    });
    return null;
  }
  return trimmed;
}

function parsePositiveIntegerParam(
  raw: string | null,
  fallback: number,
  field: 'page' | 'page_size',
  max: number | null,
  details: NormalizedApiErrorDetail[]
): number {
  if (raw === null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    (max !== null && parsed > max)
  ) {
    const rangeMessage =
      max !== null
        ? `${field} must be an integer between 1 and ${max}.`
        : `${field} must be an integer of at least 1.`;
    details.push({ field, issue: rangeMessage });
    return fallback;
  }
  return parsed;
}

function createMockEmployeeId(): string {
  createdEmployeeCounter += 1;
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `11111111-3333-4111-8111-${String(createdEmployeeCounter + 4).padStart(12, '0')}`;
}

function malformedRequestResponse(message: string) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'MALFORMED_REQUEST',
      message,
      'mock-trace-employee-malformed'
    ),
    { status: 400 }
  );
}

function notFoundResponse() {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'NOT_FOUND',
      'Employee was not found.',
      'mock-trace-employee-not-found'
    ),
    { status: 404 }
  );
}

function validationErrorResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'VALIDATION_ERROR',
      message,
      'mock-trace-employee-validation',
      details
    ),
    { status: 422 }
  );
}

function conflictResponse(employeeNo: string) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'CONFLICT',
      `Employee number "${employeeNo}" already exists.`,
      'mock-trace-employee-conflict',
      [
        {
          field: 'employee_no',
          issue: 'Employee number must be unique within the organization.',
        },
      ]
    ),
    { status: 409 }
  );
}

export const employeeHandlers = [
  http.get('*/api/v1/employees', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';

    const details: NormalizedApiErrorDetail[] = [];
    const page = parsePositiveIntegerParam(
      url.searchParams.get('page'),
      DEFAULT_PAGE,
      'page',
      null,
      details
    );
    const pageSize = parsePositiveIntegerParam(
      url.searchParams.get('page_size'),
      DEFAULT_PAGE_SIZE,
      'page_size',
      MAX_PAGE_SIZE,
      details
    );

    if (details.length > 0) {
      return validationErrorResponse('Invalid pagination parameters.', details);
    }

    const filtered = mockEmployees.filter((employee) => {
      if (!includeInactive && !employee.is_active) {
        return false;
      }
      if (branchId && employee.branch_id !== branchId) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        employee.full_name.toLowerCase().includes(search) ||
        employee.employee_no.toLowerCase().includes(search) ||
        (employee.email ?? '').toLowerCase().includes(search) ||
        employee.job_title.toLowerCase().includes(search)
      );
    });

    const totalCount = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(cloneEmployee);
    const nextCursor =
      start + items.length < totalCount ? String(page + 1) : null;

    const payload: PagedResult<Employee> = {
      items,
      page,
      page_size: pageSize,
      total_count: totalCount,
      next_cursor: nextCursor,
    };

    return HttpResponse.json(payload, { status: 200 });
  }),

  http.get('*/api/v1/employees/:employeeId', ({ params }) => {
    const employee = mockEmployees.find(
      (item) => item.employee_id === params.employeeId
    );
    if (!employee) {
      return notFoundResponse();
    }
    return HttpResponse.json(cloneEmployee(employee), { status: 200 });
  }),

  http.post('*/api/v1/employees', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const details: NormalizedApiErrorDetail[] = [];
    const branchId = readTrimmedString(body.branch_id);
    const employeeNo = readTrimmedString(body.employee_no);
    const fullName = readTrimmedString(body.full_name);
    const jobTitle = readTrimmedString(body.job_title);
    const hiredOn = readTrimmedString(body.hired_on);
    const address = parseAddress(body.address, details);

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'Home branch is required.' });
    } else if (!isValidUuid(branchId)) {
      details.push({
        field: 'branch_id',
        issue: 'Home branch must be a valid UUID.',
      });
    }

    if (!employeeNo) {
      details.push({
        field: 'employee_no',
        issue: 'Employee number is required.',
      });
    } else if (employeeNo.length > 30) {
      details.push({
        field: 'employee_no',
        issue: 'Employee number must be at most 30 characters.',
      });
    }

    if (!fullName) {
      details.push({ field: 'full_name', issue: 'Full name is required.' });
    } else if (fullName.length > 150) {
      details.push({
        field: 'full_name',
        issue: 'Full name must be at most 150 characters.',
      });
    }

    if (!jobTitle) {
      details.push({ field: 'job_title', issue: 'Job title is required.' });
    } else if (jobTitle.length > 80) {
      details.push({
        field: 'job_title',
        issue: 'Job title must be at most 80 characters.',
      });
    }

    if (!hiredOn) {
      details.push({ field: 'hired_on', issue: 'Hire date is required.' });
    } else if (!isValidIsoDate(hiredOn)) {
      details.push({
        field: 'hired_on',
        issue: 'Hire date must be a valid YYYY-MM-DD date.',
      });
    }

    const email = validateOptionalField(
      body.email,
      'email',
      254,
      'Email',
      details
    );
    const phone = validateOptionalField(
      body.phone,
      'phone',
      30,
      'Phone',
      details
    );

    if (details.length > 0 || !address) {
      return validationErrorResponse('Invalid employee details.', details);
    }

    const normalizedEmployeeNo = employeeNo.toUpperCase();
    const duplicate = mockEmployees.some(
      (item) => item.employee_no.trim().toUpperCase() === normalizedEmployeeNo
    );

    if (duplicate) {
      return conflictResponse(employeeNo);
    }

    const now = new Date().toISOString();
    const created: Employee = {
      employee_id: createMockEmployeeId(),
      organization_id: ORGANIZATION_ID,
      branch_id: branchId,
      employee_no: employeeNo,
      full_name: fullName,
      email,
      phone,
      job_title: jobTitle,
      address,
      hired_on: hiredOn,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    mockEmployees = [created, ...mockEmployees];
    return HttpResponse.json(cloneEmployee(created), { status: 201 });
  }),

  http.patch('*/api/v1/employees/:employeeId', async ({ params, request }) => {
    const index = mockEmployees.findIndex(
      (item) => item.employee_id === params.employeeId
    );
    if (index === -1) {
      return notFoundResponse();
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedRequestResponse('Malformed employee patch payload.');
    }

    const current = mockEmployees[index];
    const details: NormalizedApiErrorDetail[] = [];

    let nextFullName = current.full_name;
    if (
      'full_name' in body &&
      body.full_name !== null &&
      body.full_name !== undefined
    ) {
      const candidate = readTrimmedString(body.full_name);
      if (!candidate) {
        details.push({ field: 'full_name', issue: 'Full name is required.' });
      } else if (candidate.length > 150) {
        details.push({
          field: 'full_name',
          issue: 'Full name must be at most 150 characters.',
        });
      } else {
        nextFullName = candidate;
      }
    }

    let nextJobTitle = current.job_title;
    if (
      'job_title' in body &&
      body.job_title !== null &&
      body.job_title !== undefined
    ) {
      const candidate = readTrimmedString(body.job_title);
      if (!candidate) {
        details.push({ field: 'job_title', issue: 'Job title is required.' });
      } else if (candidate.length > 80) {
        details.push({
          field: 'job_title',
          issue: 'Job title must be at most 80 characters.',
        });
      } else {
        nextJobTitle = candidate;
      }
    }

    let nextIsActive = current.is_active;
    if (
      'is_active' in body &&
      body.is_active !== null &&
      body.is_active !== undefined
    ) {
      if (typeof body.is_active !== 'boolean') {
        details.push({
          field: 'is_active',
          issue: 'Active status must be a boolean.',
        });
      } else {
        nextIsActive = body.is_active;
      }
    }

    const nextEmail =
      'email' in body
        ? validateOptionalField(body.email, 'email', 254, 'Email', details)
        : current.email;

    const nextPhone =
      'phone' in body
        ? validateOptionalField(body.phone, 'phone', 30, 'Phone', details)
        : current.phone;

    const nextAddress =
      'address' in body && body.address !== null && body.address !== undefined
        ? parseAddress(body.address, details)
        : current.address;

    if (details.length > 0 || !nextAddress) {
      return validationErrorResponse(
        'Invalid employee update details.',
        details
      );
    }

    const updated: Employee = {
      ...current,
      full_name: nextFullName,
      email: nextEmail,
      phone: nextPhone,
      job_title: nextJobTitle,
      address: nextAddress,
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    };

    mockEmployees = mockEmployees.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(cloneEmployee(updated), { status: 200 });
  }),
];
