# STRUCTURE.md

Single source of truth for where files go in the frontend.
Frontend only. Stack: Vite + React + TypeScript + react-router. No Next.js anywhere in the project (the backend is .NET).
Unless stated otherwise, every path below is relative to `src/`.
Note: Shared API contracts live at the repo root (`../../contracts/`) and are accessed via the `@contracts/*` alias.

## 1. Folder tree

```
src/
├── main.tsx
├── App.tsx                        QueryClientProvider + RouterProvider + session initialize (useAuthStore)
├── styles/
│   └── main.css                   the Tailwind entry (Tailwind v4) + the DESIGN.md tokens as @theme
│
├── routes/                        routing
│   ├── router.tsx                 ALL routes are defined here
│   ├── paths.ts                   path constants
│   ├── ProtectedRoute.tsx
│   ├── PublicOnlyRoute.tsx        sends an already-authenticated user away from /login
│   ├── RoleGate.tsx               role gate → renders the 403 screen
│   └── RuntimeGate.tsx            runtime gate (Cloud / BranchLocal) → renders the 403 screen
│
├── layouts/                       the application shell
│   ├── AppShell.tsx               sidebar + topbar + <Outlet />
│   ├── Sidebar.tsx                fixed dark navigation rail + user card
│   ├── Topbar.tsx                 66px bar: current screen and workspace context
│   ├── BranchContextControl.tsx   active-branch selector/badge in topbar
│   └── navItems.ts                the navigation model + the role/scope/runtime rules
│
├── features/                      one folder per domain module
│   ├── auth/                      login, token refresh lifecycle, user context & branch selection
│   │   ├── pages/LoginPage.tsx
│   │   ├── components/LoginForm.tsx
│   │   ├── schemas/loginSchema.ts
│   │   └── api/authService.ts
│   ├── dashboard/                 home / overview after login
│   │   └── pages/DashboardPage.tsx
│   ├── branches/                  Stage 1: branch directory + branch device enrollment
│   │   ├── index.ts               public read-only barrel (`useBranchesQuery`)
│   │   ├── api/branchesApi.ts
│   │   ├── hooks/                 `branchesKeys.ts`, `useBranches.ts`, `useBranchesPageState.ts`
│   │   ├── schemas/               `branchSchema.ts`, `branchErrorMapper.ts`
│   │   ├── components/            `BranchesFilterBar`, `BranchesTable`, `BranchTableRow`, `BranchFormFields`, `BranchFormModal`, `EnrollmentTokenModal`, `BranchEnrollmentForm`
│   │   ├── pages/BranchesPage.tsx
│   │   └── pages/BranchEnrollmentPage.tsx
│   ├── employees/                 Stage 1: employee register
│   │   ├── index.ts               public read-only barrel (`useEmployeesQuery`, `EmployeeDto`)
│   │   ├── api/employeesApi.ts
│   │   ├── hooks/                 `employeesKeys.ts`, `useEmployees.ts`, `useEmployeeForm.ts`, `useEmployeesPageState.ts`
│   │   ├── schemas/               `employeeSchema.ts`, `employeeErrorMapper.ts`
│   │   ├── components/            `EmployeesFilterBar`, `EmployeesTable`, `EmployeesTableEmptyState`, `EmployeeTableRow`, `EmployeeFormFields`, `EmployeeFormModal`
│   │   └── pages/EmployeesPage.tsx
│   ├── users/                     Stage 1: user accounts, roles, branch scope
│   │   ├── api/usersApi.ts
│   │   ├── hooks/                 `usersKeys.ts`, `useUsers.ts`, `useUsersPageState.ts`
│   │   ├── schemas/               `userSchema.ts`, `userErrorMapper.ts`
│   │   ├── components/            `UsersFilterBar`, `UsersTable`, `UsersTableEmptyState`, `UserTableRow`, `BranchAccessSelector`, `UserFormFields`, `UserDirectoryAlerts`, `UserFormModalShell`, `CreateUserIdentityFields`, `CreateUserFormModal`, `EditUserIdentityFields`, `EditUserStatusField`, `EditUserFormFields`, `EditUserFormModal`, `UserFormModal`, `ResetPasswordModal`, `RevokeSessionsModal`
│   │   └── pages/UsersPage.tsx
│   ├── errors/                    the 403 and 404 screens
│   │   └── pages/ForbiddenPage.tsx, NotFoundPage.tsx
│   ├── sales/                     (planned) Stage 2: POS cashier checkout, invoices, sales returns & refunds
│   ├── purchasing/                (planned) Stage 3: suppliers, purchase orders, one-step receiving, payments & vendor returns
│   ├── products/                  Stage 1: catalog, categories, pricing, barcodes, UOMs, reorder rules
│   │   ├── index.ts               (planned) public read-only barrel (products, categories, UOMs)
│   │   ├── api/, hooks/, schemas/, components/   (planned) Slice 3 catalog & reorder modules
│   │   └── pages/ProductsPage.tsx
│   ├── inventory/                 Stage 1: inventory ledger, batch tracking (FEFO), balances & adjustments
│   │   └── pages/InventoryPage.tsx
│   └── ai/                        (planned) pages: insights, assistant, approvals (Brain service)
│       └── <each feature contains only the subfolders it requires>
│           ├── pages/
│           ├── components/
│           ├── hooks/             TanStack Query hooks and query keys
│           ├── api/               one API file per feature
│           └── schemas/           Zod validation schemas
│
├── components/                    shared across features
│   ├── ui/                        design system primitives (DESIGN.md): Button, Input, Textarea,
│   │                              Select, Toggle, Card, Badge, Alert, Table, Tabs, Modal, Pagination,
│   │                              PageHeading, EmptyState, Skeleton, AddressFields, ToastHost
│   └── ai/                        (planned) InsightCard, ForecastChart, AssistantChatPanel, ApprovalModal
│
├── lib/
│   ├── api/
│   │   ├── client.ts              the single Axios instance and interceptors
│   │   └── idempotency.ts         the Idempotency-Key generator, attempt-key tracking, and mutation rules
│   ├── queryClient.ts             the single QueryClient and its defaults
│   ├── schemas/
│   │   └── addressSchema.ts       shared 6-field AddressDto Zod schema and DTO normalizers
│   └── auth/
│       ├── tokenStorage.ts        the only file that touches browser storage
│       ├── permissions.ts         role/scope map, runtime gating, branch gating
│       └── sessionEvents.ts       the session-end registry (transport → app shell)
│
├── test/                          shared tests + Phase 0 fixture conformance
│   ├── contract-fixtures.test.ts  Phase 0 fixture conformance test (tests @contracts/fixtures)
│   ├── authService.test.ts, authStore.test.ts
│   ├── routingGuards.test.tsx, runtimeGate.test.tsx, appRouter.test.tsx
│   ├── permissions.test.ts, idempotency.test.ts, queryClient.test.ts, apiClientRefresh.test.ts
│   └── renderWithProviders.tsx    shared render helper (QueryClientProvider + Router + MSW)
│
├── mocks/                         MSW for dev and tests
│   ├── handlers.ts                the shared mock handlers
│   ├── branchHandlers.ts          Stage 1 mock handlers for branches & enrollment
│   ├── employeeHandlers.ts        Stage 1 mock handlers for employees
│   ├── userHandlers.ts            Stage 1 mock handlers for user accounts & security actions
│   ├── productHandlers.ts         (planned) Stage 1 Slice 3 mock handlers for categories, products, UOMs & reorder rules
│   └── browser.ts                 the dev worker started in main.tsx
│
├── hooks/                         generic custom hooks, shared by several features
│   ├── useAuth.ts                 the session entry point (roles, scopes, runtime, branch)
│   └── useDebounce.ts             (example of a generic hook)
│
├── stores/                        Zustand
│   ├── authStore.ts               the only store today
│   └── cartStore.ts               (planned) POS cart
│
├── types/
│   ├── generated/                 mirrors the repo-root contracts (read-only)
│   │   ├── api-paths.ts           openapi-typescript output (`npm run codegen:paths`)
│   │   ├── auth.ts, catalog.ts, common.ts, identity.ts
│   │   ├── inventory.ts, purchasing.ts, sales.ts, index.ts
│   │   └── tsconfig.json
│   ├── api.ts                     short aliases of generated contract types
│   └── ui.ts                      frontend-only types
│
└── assets/
```

Anything marked **(planned)** does not exist yet — do not assume the file is there, and create it only when you have the code for it.
Create subfolders only when you have a file to put in them. No empty folders.

**Regenerating the API types:** run `npm run codegen:paths` (writes `types/generated/api-paths.ts` from `../../contracts/openapi.erp.yaml`) **and then `npm run format`** — the generator emits its own formatting, and Prettier is what keeps the committed file stable. Skip the format step and the diff will be full of noise.
`types/generated/` is never hand-edited; if a shape is wrong, fix the contract and regenerate (skill `contracts-types`).

Playwright E2E lives outside `src/`: `tests/e2e/` at the app root (`apps/erp-frontend/tests/e2e/`).

## 2. Where each kind of file goes

| What                                                             | Where                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A screen                                                         | `features/<feature>/pages/<Name>Page.tsx`                                                                     |
| A component used by one feature                                  | `features/<feature>/components/`                                                                              |
| A component used by several features                             | A generic building block → `components/ui/` (follow `DESIGN.md`); otherwise ask the developer (see section 5) |
| A generic building block                                         | `components/ui/` (design system — follow `DESIGN.md`, skill `design-system`)                                  |
| An AI surface component                                          | `components/ai/` (follow `DESIGN.md`, skill `design-system`)                                                  |
| A query or mutation hook and its query keys                      | `features/<feature>/hooks/`                                                                                   |
| A hook used by one feature only                                  | `features/<feature>/hooks/`                                                                                   |
| An API function                                                  | `features/<feature>/api/<feature>Api.ts`                                                                      |
| A Zod validation schema                                          | `features/<feature>/schemas/<name>Schema.ts`                                                                  |
| The Axios instance                                               | `lib/api/client.ts`                                                                                           |
| The `Idempotency-Key` helper                                     | `lib/api/idempotency.ts`                                                                                      |
| The QueryClient                                                  | `lib/queryClient.ts`                                                                                          |
| Token storage and permissions                                    | `lib/auth/`                                                                                                   |
| The session-end registry (transport → app shell)                 | `lib/auth/sessionEvents.ts`                                                                                   |
| `useAuth`                                                        | `hooks/useAuth.ts`                                                                                            |
| A generic custom hook (shared by several features, no API calls) | `hooks/use<Name>.ts`                                                                                          |
| A Zustand store                                                  | `stores/<name>Store.ts`                                                                                       |
| A route, a protected route, a path constant                      | `routes/`                                                                                                     |
| A route guard (role or runtime)                                  | `routes/RoleGate.tsx`, `routes/RuntimeGate.tsx`                                                               |
| The 403 and 404 screens                                          | `features/errors/pages/ForbiddenPage.tsx`, `NotFoundPage.tsx`                                                 |
| A layout                                                         | `layouts/`                                                                                                    |
| A frontend-only type                                             | `types/ui.ts`, or next to the component that uses it                                                          |
| Contracts & OpenAPI spec (read-only; frontend slice = ask first) | `../../contracts/` at repo root (accessed in app via `@contracts/*` alias)                                    |
| Generated API domain types (read-only)                           | `types/generated/` (mirroring repo-root contracts/schemas)                                                    |
| Generated path/operation types (read-only)                       | `types/generated/api-paths.ts` — regenerate with `npm run codegen:paths`, then `npm run format`               |
| A component or hook unit test                                    | Next to the file it tests: `Name.test.tsx`                                                                    |
| Shared test harness (custom render helper)                       | `src/test/renderWithProviders.tsx` (exists — wraps QueryClientProvider + Router)                              |
| Shared mock handlers (MSW)                                       | `src/mocks/handlers.ts`, `src/mocks/browser.ts`                                                               |
| A Playwright E2E test                                            | `tests/e2e/` inside the frontend app: `apps/erp-frontend/tests/e2e/`                                          |

**Hooks:** a hook used by one feature stays inside that feature's `hooks/` folder. `hooks/` at the top level is only for generic hooks shared by several features (`useAuth`, `useDebounce`, `useMediaQuery`...). Hooks in `hooks/` never call the API and never hold server data.

Each AI page lives in `features/ai/pages/`. The routes are plain react-router routes (for example `/insights`, `/assistant`, `/approvals`), registered in `routes/router.tsx`. There are no route groups.

## 3. Ownership map

The frontend team owns `apps/erp-frontend/` as ONE unit — any member may edit any folder below (skill `ownership`). Only these entries are special:

| Folder / path                         | Rule                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Everything under `apps/erp-frontend/` | Frontend team — editable, following the skills                                                                         |
| `features/customers/`                 | **EXCLUDED FROM MVP** (Walk-in Cashier sales only; no customer CRM)                                                    |
| `types/generated/`                    | Read-only: mirrors repo-root `contracts/schemas` — never edited by hand                                                |
| `../../contracts/` (repo root)        | Outside the app: read-only System of Record (multi-team). The frontend-owned slice needs ask-first (router Scope rule) |

## 4. Naming

| Kind                  | Rule                                    | Example             |
| --------------------- | --------------------------------------- | ------------------- |
| Component file        | PascalCase, same name as the component  | `SaleRow.tsx`       |
| Page file             | PascalCase ending in `Page`             | `PosPage.tsx`       |
| Hook file             | camelCase starting with `use`           | `useSales.ts`       |
| Query keys file       | `<feature>Keys.ts`                      | `salesKeys.ts`      |
| API file              | `<feature>Api.ts`                       | `salesApi.ts`       |
| Store file            | `<name>Store.ts`; hook `use<Name>Store` | `cartStore.ts`      |
| Test file             | Same name plus `.test`                  | `SaleRow.test.tsx`  |
| Folders               | lowercase                               | `features/sales/`   |
| Constants             | `UPPER_SNAKE_CASE`                      | `DEFAULT_PAGE_SIZE` |
| Types and interfaces  | PascalCase, no `I` prefix               | `SaleFilters`       |
| Environment variables | Start with `VITE_`                      | `VITE_API_BASE_URL` |

One component per file. Use named exports unless a file already follows a different convention.

## 5. Import direction

A folder may import only from the folders listed next to it. No circular imports.

| Folder          | May import from                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/<x>`  | `components/ui`, `components/ai`, `hooks`, `lib`, `stores`, `types`. **Never** from another feature, except the exception below                                                                                                  |
| `components/ui` | `types`, `lib` (helpers only). **Never** from `features`, `components/ai`, or `stores`                                                                                                                                           |
| `components/ai` | `components/ui`, `types`                                                                                                                                                                                                         |
| `lib`           | `types`                                                                                                                                                                                                                          |
| `stores`        | `types`, `lib`, `features/auth/api` (auth session actions — documented exception)                                                                                                                                                |
| `hooks`         | `lib`, `stores`, `types`. **Never** from `features` or `components`                                                                                                                                                              |
| `routes`        | `features/*/pages`, `layouts`, `hooks`, `lib/auth`, `stores`                                                                                                                                                                     |
| `layouts`       | `components`, `hooks`, `lib/auth`, `routes/paths` (the path constants only — never `routes/router.tsx`, which would be a cycle), and read-only `features/branches` barrel (`useBranchesQuery` + types for Topbar branch context) |
| `types`         | Nothing                                                                                                                                                                                                                          |

**Paths inside a feature page:** a page never imports `routes/paths` — that would close the cycle `features → routes → features`. The router passes the paths a page needs as props (`homePath`, `loginPath`), and the page renders them as links.

**Cross-feature exception (read-only data only):**
A feature may import from another feature ONLY through that feature's public barrel (`features/<x>/index.ts`), and ONLY the items allowed below.

- Allowed: read-only query hooks (`useQuery` based) and types.
- Forbidden: mutation hooks, API functions, stores, components, pages, and deep imports such as `features/products/hooks/...`. Always import from the barrel (`features/products`).
- The barrel is the exporting feature's public interface. The importing feature only reads it — never edit another feature's files just to export something. If a hook you need is not exported through the barrel, ask the developer.

| Importing feature | May import from |
| ----------------- | --------------- |
| `employees`       | `branches`      |
| `users`           | `employees`     |
| `users`           | `branches`      |
| `products`        | `branches`      |
| `sales`           | `products`      |
| `purchasing`      | `products`      |

Any other pair needs the developer's approval and a new row in this table.

Apart from this exception, hooks and API files inside a feature are imported by that feature's own pages and components only.
If two features need the same piece and it is not covered by the exception, do not import across features and do not copy it. Ask the developer how to share it.

## 6. Environment

- Values are read only through `import.meta.env.VITE_*`.
- `.env.example` belongs to infrastructure (Ali). Real `.env` files are never committed.
- Anything with the `VITE_` prefix is public in the browser bundle. No secrets.

## 7. Scope Boundaries & MVP Invariants

1. **Excluded from MVP (Out of Scope per ERP-Backend-Blueprint-v1.1.md):**
   - **Customer CRM / Accounts Receivable:** Retail POS is strictly walk-in cashier transactions. No `features/customers/` folder is to be created.
   - **Multi-step Goods Receipt:** Stage 3 strictly enforces atomic **One-Step Receiving** (`PURCHASE_RECEIPT` directly creates batches and ledger rows).
   - **General Ledger / Double-Entry:** Accounting is ledger-backed stock movements only, not full GL.
   - **Controlled Substances / Prescriptions:** Standard retail pharmacy inventory only.

2. **Runtime Deployment Topology (Cloud vs. BranchLocal):**
   - The POS cashier flow (`features/sales`) is designed to operate against a **Branch-Local API** instance to ensure continuous offline capability.
   - Administrative, catalog, purchasing, and reporting views operate against the central **Cloud ERP API**.

3. **External Brain / AI Client:**
   - As recorded in §13 of the Blueprint, Brain endpoints (`/api/v1/brain/*`) are separate from the core Pharmacy ERP backend. The ERP frontend interacts with the core ERP API via `lib/api/client.ts`. A dedicated Brain client configuration will be introduced when Brain endpoints are provisioned.
