import { http, HttpResponse } from 'msw';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import type {
  AddressDto,
  EmployeeDto,
  EmployeePatchRequest,
} from '../types/api';

const ORGANIZATION_ID = currentUserContext.organization_id;

export const INITIAL_EMPLOYEES: readonly EmployeeDto[] = [
  {
    employee_id: 'a1111111-1111-4111-8111-111111111101',
    organization_id: ORGANIZATION_ID,
    branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
    employee_no: 'EMP-001',
    full_name: 'Omar Khaled',
    email: 'omar.khaled@pharmaplus.eg',
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
    created_at: '2024-03-01T09:00:00.000Z',
    updated_at: '2024-03-01T09:00:00.000Z',
  },
  {
    employee_id: 'a1111111-1111-4111-8111-111111111102',
    organization_id: ORGANIZATION_ID,
    branch_id: 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
    employee_no: 'EMP-002',
    full_name: 'Mona Adel',
    email: 'mona.adel@pharmaplus.eg',
    phone: '+20 122 333 4455',
    job_title: 'Senior Cashier',
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
    employee_id: 'a1111111-1111-4111-8111-111111111103',
    organization_id: ORGANIZATION_ID,
    branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
    employee_no: 'EMP-003',
    full_name: 'Youssef Tarek',
    email: 'youssef.tarek@pharmaplus.eg',
    phone: '+20 111 555 6677',
    job_title: 'Inventory Pharmacist',
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
    employee_id: 'a1111111-1111-4111-8111-111111111104',
    organization_id: ORGANIZATION_ID,
    branch_id: 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
    employee_no: 'EMP-004',
    full_name: 'Salma Hassan',
    email: null,
    phone: '+20 109 777 8899',
    job_title: 'Cashier',
    address: {
      line1: '18 Stanley Bridge St',
      line2: null,
      city: 'Alexandria',
      region: 'Alexandria Governorate',
      postal_code: '21532',
      country_code: 'EG',
    },
    hired_on: '2025-02-20',
    is_active: false,
    created_at: '2025-02-20T09:15:00.000Z',
    updated_at: '2025-03-01T14:00:00.000Z',
  },
];

interface ValidationDetail {
  field: string;
  issue: string;
}

function cloneEmployee(employee: EmployeeDto): EmployeeDto {
  return {
    ...employee,
    address: { ...employee.address },
  };
}

let mockEmployees: EmployeeDto[] = INITIAL_EMPLOYEES.map(cloneEmployee);
let createdEmployeeCounter = 0;

export function resetMockEmployees(): void {
  mockEmployees = INITIAL_EMPLOYEES.map(cloneEmployee);
  createdEmployeeCounter = 0;
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

function parseAddress(
  value: unknown,
  details: ValidationDetail[]
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
  field: keyof Pick<EmployeePatchRequest, 'email' | 'phone' | 'job_title'>,
  maxLength: number,
  label: string,
  details: ValidationDetail[]
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

function createMockEmployeeId(): string {
  createdEmployeeCounter += 1;
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `a1111111-1111-4111-8111-${String(createdEmployeeCounter + 4).padStart(12, '0')}`;
}

function malformedRequestResponse(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'MALFORMED_REQUEST',
        message,
        trace_id: 'mock-trace-employee-malformed',
      },
    },
    { status: 400 }
  );
}

function notFoundResponse() {
  return HttpResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Employee was not found.',
        trace_id: 'mock-trace-employee-not-found',
      },
    },
    { status: 404 }
  );
}

function validationErrorResponse(message: string, details: ValidationDetail[]) {
  return HttpResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        trace_id: 'mock-trace-employee-validation',
        details,
      },
    },
    { status: 422 }
  );
}

function conflictResponse(employeeNo: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'CONFLICT',
        message: `Employee number "${employeeNo}" already exists in this branch.`,
        trace_id: 'mock-trace-employee-conflict',
        details: [
          {
            field: 'employee_no',
            issue: 'Employee number must be unique within the branch.',
          },
        ],
      },
    },
    { status: 409 }
  );
}

export const employeeHandlers = [
  http.get('*/api/v1/employees', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId')?.trim() ?? '';
    const rawLimit = Number(url.searchParams.get('limit') ?? '20');
    const parsedLimit = Math.floor(rawLimit);
    const limit =
      Number.isFinite(rawLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 20;
    const rawCursor = Number(url.searchParams.get('cursor') ?? '0');
    const parsedCursor = Math.floor(rawCursor);
    const start =
      Number.isFinite(rawCursor) && parsedCursor >= 0 ? parsedCursor : 0;

    const filtered = branchId
      ? mockEmployees.filter((employee) => employee.branch_id === branchId)
      : mockEmployees;
    const items = filtered.slice(start, start + limit).map(cloneEmployee);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
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

    const details: ValidationDetail[] = [];
    const branchId = readTrimmedString(body.branch_id);
    const employeeNo = readTrimmedString(body.employee_no);
    const fullName = readTrimmedString(body.full_name);
    const hiredOn = readTrimmedString(body.hired_on);
    const address = parseAddress(body.address, details);

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'Home branch is required.' });
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
    if (!hiredOn) {
      details.push({ field: 'hired_on', issue: 'Hire date is required.' });
    } else if (!isValidIsoDate(hiredOn)) {
      details.push({
        field: 'hired_on',
        issue: 'Hire date must be a valid YYYY-MM-DD date.',
      });
    }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      details.push({
        field: 'is_active',
        issue: 'Active status must be a boolean.',
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
    const jobTitle = validateOptionalField(
      body.job_title,
      'job_title',
      80,
      'Job title',
      details
    );

    if (details.length > 0 || !address) {
      return validationErrorResponse('Invalid employee details.', details);
    }

    const normalizedEmployeeNo = employeeNo.toUpperCase();
    const duplicate = mockEmployees.some(
      (item) =>
        item.branch_id === branchId &&
        item.employee_no.trim().toUpperCase() === normalizedEmployeeNo
    );

    if (duplicate) {
      return conflictResponse(employeeNo);
    }

    const now = new Date().toISOString();
    const created: EmployeeDto = {
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
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
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
    const details: ValidationDetail[] = [];

    let nextBranchId = current.branch_id;
    if ('branch_id' in body) {
      const candidate = readTrimmedString(body.branch_id);
      if (!candidate) {
        details.push({ field: 'branch_id', issue: 'Home branch is required.' });
      } else {
        nextBranchId = candidate;
      }
    }

    let nextEmployeeNo = current.employee_no;
    if ('employee_no' in body) {
      const candidate = readTrimmedString(body.employee_no);
      if (!candidate) {
        details.push({
          field: 'employee_no',
          issue: 'Employee number is required.',
        });
      } else if (candidate.length > 30) {
        details.push({
          field: 'employee_no',
          issue: 'Employee number must be at most 30 characters.',
        });
      } else {
        nextEmployeeNo = candidate;
      }
    }

    let nextFullName = current.full_name;
    if ('full_name' in body) {
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

    let nextHiredOn = current.hired_on;
    if ('hired_on' in body) {
      const candidate = readTrimmedString(body.hired_on);
      if (!candidate) {
        details.push({ field: 'hired_on', issue: 'Hire date is required.' });
      } else if (!isValidIsoDate(candidate)) {
        details.push({
          field: 'hired_on',
          issue: 'Hire date must be a valid YYYY-MM-DD date.',
        });
      } else {
        nextHiredOn = candidate;
      }
    }

    let nextIsActive = current.is_active;
    if ('is_active' in body) {
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
        : (current.email ?? null);
    const nextPhone =
      'phone' in body
        ? validateOptionalField(body.phone, 'phone', 30, 'Phone', details)
        : (current.phone ?? null);
    const nextJobTitle =
      'job_title' in body
        ? validateOptionalField(
            body.job_title,
            'job_title',
            80,
            'Job title',
            details
          )
        : (current.job_title ?? null);

    const nextAddress =
      'address' in body ? parseAddress(body.address, details) : current.address;

    if (details.length > 0 || !nextAddress) {
      return validationErrorResponse(
        'Invalid employee update details.',
        details
      );
    }

    const duplicate = mockEmployees.some(
      (item) =>
        item.employee_id !== current.employee_id &&
        item.branch_id === nextBranchId &&
        item.employee_no.trim().toUpperCase() === nextEmployeeNo.toUpperCase()
    );

    if (duplicate) {
      return conflictResponse(nextEmployeeNo);
    }

    const updated: EmployeeDto = {
      ...current,
      branch_id: nextBranchId,
      employee_no: nextEmployeeNo,
      full_name: nextFullName,
      email: nextEmail,
      phone: nextPhone,
      job_title: nextJobTitle,
      address: nextAddress,
      hired_on: nextHiredOn,
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    };

    mockEmployees = mockEmployees.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(cloneEmployee(updated), { status: 200 });
  }),
];
