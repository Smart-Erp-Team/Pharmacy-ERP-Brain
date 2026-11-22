# PharmacyERP Stage 1 Audit Rules
# Override Root Frontend Rules
- **Ignore `00-router.md` & `MEMORY.md`:** Do NOT ask to read `MEMORY.md` and do NOT treat `apps/erp-backend/` as read-only. Those rules apply strictly to `apps/erp-frontend/`. Proceed immediately with backend tasks.

1. **Scope Isolation:** Focus strictly on **Stage 1** (Identity, Catalog, Inventory Ledger). Never flag features belonging to Stage 2 (Sales) or Stage 3 (Purchasing) as missing bugs.
2. **Respect Developer Decisions (The 5% Rule):** The 4 developers made minor intentional adjustments (~5%) documented in `apps/erp-backend/_audit_docs/03_actual_docs/`. Do NOT revert or delete their design choices just because they differ from `apps/erp-backend/_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md`. Only flag them if they cause runtime exceptions, security vulnerabilities, or break integration between the 4 modules.
3. **Database Context:** The project uses a single database (`erp_db`) and a single `PharmacyDbContext`. Ensure no developer accidentally created a separate DbContext or conflicting entity configurations.
4. **Read-Only Discovery:** During audit phases, NEVER modify source code files until an Artifact plan is explicitly reviewed and approved by the user.
