/**
 * Pharmacy ERP — Identity & Branch Enrollment Contract (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/identity.json.
 *
 * organization_id is ALWAYS derived from the JWT — FE never submits it.
 * Soft deactivation only (is_active); no hard deletes.
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

// Organization provisioning
export type OrganizationDto = Schemas['OrganizationDto'];
export type CreateOrganizationRequest = Schemas['CreateOrganizationRequest'];

// Branches
export type BranchDto = Schemas['BranchDto'];
export type BranchDtoPagedResult = Schemas['BranchDtoPagedResult'];
export type CreateBranchRequest = Schemas['CreateBranchRequest'];
export type UpdateBranchRequest = Schemas['UpdateBranchRequest'];

// Branch runtime enrollment (single-use token)
export type EnrollmentTokenResponse = Schemas['EnrollmentTokenResponse'];
export type RedeemBranchEnrollmentRequest =
  Schemas['RedeemBranchEnrollmentRequest'];
export type RedeemBranchEnrollmentResponse =
  Schemas['RedeemBranchEnrollmentResponse'];

// Employees (AdminOnly)
export type EmployeeDto = Schemas['EmployeeDto'];
export type EmployeeDtoPagedResult = Schemas['EmployeeDtoPagedResult'];
export type CreateEmployeeRequest = Schemas['CreateEmployeeRequest'];
export type UpdateEmployeeRequest = Schemas['UpdateEmployeeRequest'];

// Users (AdminOnly + hierarchical rules)
export type UserDto = Schemas['UserDto'];
export type UserDtoPagedResult = Schemas['UserDtoPagedResult'];
export type CreateUserRequest = Schemas['CreateUserRequest'];
export type UpdateUserRequest = Schemas['UpdateUserRequest'];
export type ResetPasswordRequest = Schemas['ResetPasswordRequest'];

/** There is NO customer CRM entity in the MVP */
export type Customer = never;
