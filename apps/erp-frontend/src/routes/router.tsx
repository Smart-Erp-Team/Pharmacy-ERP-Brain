/**
 * Pharmacy ERP — Central Application Router
 *
 * Configured using React Router v7 createBrowserRouter.
 * Follows STRUCTURE.md: routes/router.tsx.
 *
 * Route gates (contracts/FRONTEND.md §1 and §6):
 * - Organization & Identity screens → Admin role, Cloud runtime.
 * - Catalog and inventory reads → every role, both runtimes.
 * - Branch device enrollment → public (the device has no session before it is
 *   enrolled) and only offered on the BranchLocal runtime.
 */

import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { RoleGate } from './RoleGate';
import { RuntimeGate } from './RuntimeGate';
import { ScopeGate } from './ScopeGate';
import { PATHS } from './paths';
import { AppShell } from '../layouts/AppShell';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { BranchesPage } from '../features/branches/pages/BranchesPage';
import { BranchEnrollmentPage } from '../features/branches/pages/BranchEnrollmentPage';
import { EmployeesPage } from '../features/employees/pages/EmployeesPage';
import { UsersPage } from '../features/users/pages/UsersPage';
import { ProductsPage } from '../features/products/pages/ProductsPage';
import { InventoryPage } from '../features/inventory/pages/InventoryPage';
import { ForbiddenPage } from '../features/errors/pages/ForbiddenPage';
import { NotFoundPage } from '../features/errors/pages/NotFoundPage';
import type { PermissionScope, Role, RuntimeMode } from '../types/api';

const ADMIN_ONLY: readonly Role[] = ['Admin'];
const ALL_ROLES: readonly Role[] = ['Admin', 'Pharmacist', 'Cashier'];
const CLOUD_ONLY: readonly RuntimeMode[] = ['Cloud'];
const BOTH_RUNTIMES: readonly RuntimeMode[] = ['Cloud', 'BranchLocal'];
const USER_ADMIN_SCOPE: readonly PermissionScope[] = ['user:admin'];
const INVENTORY_READ_SCOPE: readonly PermissionScope[] = ['inventory:read'];

export const routes: RouteObject[] = [
  {
    path: PATHS.LOGIN,
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: PATHS.BRANCH_ENROLLMENT,
    element: (
      <BranchEnrollmentPage homePath={PATHS.HOME} loginPath={PATHS.LOGIN} />
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        path: PATHS.HOME,
        element: <DashboardPage />,
      },
      {
        path: PATHS.BRANCHES,
        element: (
          <RoleGate allowedRoles={ADMIN_ONLY}>
            <RuntimeGate allowedRuntimes={CLOUD_ONLY}>
              <BranchesPage />
            </RuntimeGate>
          </RoleGate>
        ),
      },
      {
        path: PATHS.EMPLOYEES,
        element: (
          <RoleGate allowedRoles={ADMIN_ONLY}>
            <RuntimeGate allowedRuntimes={CLOUD_ONLY}>
              <ScopeGate requiredScopes={USER_ADMIN_SCOPE}>
                <EmployeesPage />
              </ScopeGate>
            </RuntimeGate>
          </RoleGate>
        ),
      },
      {
        path: PATHS.USERS,
        element: (
          <RoleGate allowedRoles={ADMIN_ONLY}>
            <RuntimeGate allowedRuntimes={CLOUD_ONLY}>
              <ScopeGate requiredScopes={USER_ADMIN_SCOPE}>
                <UsersPage />
              </ScopeGate>
            </RuntimeGate>
          </RoleGate>
        ),
      },
      {
        path: PATHS.PRODUCTS,
        element: (
          <RoleGate allowedRoles={ALL_ROLES}>
            <RuntimeGate allowedRuntimes={BOTH_RUNTIMES}>
              <ScopeGate requiredScopes={INVENTORY_READ_SCOPE}>
                <ProductsPage />
              </ScopeGate>
            </RuntimeGate>
          </RoleGate>
        ),
      },
      {
        path: PATHS.INVENTORY,
        element: (
          <RoleGate allowedRoles={ALL_ROLES}>
            <RuntimeGate allowedRuntimes={BOTH_RUNTIMES}>
              <ScopeGate requiredScopes={INVENTORY_READ_SCOPE}>
                <InventoryPage />
              </ScopeGate>
            </RuntimeGate>
          </RoleGate>
        ),
      },
      {
        path: PATHS.FORBIDDEN,
        element: <ForbiddenPage homePath={PATHS.HOME} />,
      },
      {
        path: '*',
        element: <NotFoundPage homePath={PATHS.HOME} />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
