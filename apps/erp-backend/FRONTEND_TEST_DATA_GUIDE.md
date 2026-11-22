# PharmacyERP — Frontend Test Data & QA Guide (Development Seed)

This guide documents the realistic, English-only multi-tenant dataset automatically seeded into local `erp_db` by `DevDatabaseSeeder` when running the API in `Development` mode (`DevSeed:Enabled = true` in `appsettings.Development.json`).

> **Idempotency & Determinism:** All Organization IDs, Branch IDs, Location IDs, Product IDs, UOM IDs, Batch IDs, and Enrollment Tokens below are deterministic. Running the API multiple times skips re-seeding cleanly once `MEDCARE` exists (`"Development seed data already exists; skipping."`).

---

## 1. Quick Login Credentials (All 3 Tenants)

**Login Endpoint:** `POST /api/v1/auth/login`

```json
{
  "organizationCode": "MEDCARE",
  "username": "admin@medcare.test",
  "password": "MedCare@2026!"
}
```

### Tenant 1 — MedCare Wellness Pharmacies (`MEDCARE`)
- **Organization ID:** `11111111-1111-4111-8111-111111111101`
- **Organization Code:** `MEDCARE`
- **Dataset Size:** 3 Branches · 10 Users (9 active, 1 disabled) · 11 Hierarchical Categories · 32 Products (77 UOMs) · 48 Reorder Rules · 12 Locations · 39 Batches · 11 Posted Ledger Transactions · 142 Stock Balances

| Email (`username`) | Password | Role | Branch Scope | Assigned Branch Name | Assigned Branch ID | Active |
| --- | --- | --- | --- | --- | --- | --- |
| `admin@medcare.test` | `MedCare@2026!` | `Admin` | `ALL` | *(All MedCare Branches)* | — | `true` |
| `downtown.admin@medcare.test` | `MedCare@2026!` | `Admin` | `ASSIGNED` | MedCare - Downtown Flagship | `11111111-2222-4111-8111-000000000001` | `true` |
| `maadi.manager@medcare.test` | `MedCare@2026!` | `Admin` | `ASSIGNED` | MedCare - Maadi Medical Plaza | `11111111-2222-4111-8111-000000000002` | `true` |
| `nasrcity.manager@medcare.test` | `MedCare@2026!` | `Admin` | `ASSIGNED` | MedCare - Nasr City Hub | `11111111-2222-4111-8111-000000000003` | `true` |
| `sarah.pharm@medcare.test` | `MedCare@2026!` | `Pharmacist` | `ASSIGNED` | MedCare - Downtown Flagship | `11111111-2222-4111-8111-000000000001` | `true` |
| `omar.pharm@medcare.test` | `MedCare@2026!` | `Pharmacist` | `ASSIGNED` | MedCare - Maadi Medical Plaza | `11111111-2222-4111-8111-000000000002` | `true` |
| `lina.pharm@medcare.test` | `MedCare@2026!` | `Pharmacist` | `ASSIGNED` | MedCare - Nasr City Hub | `11111111-2222-4111-8111-000000000003` | `true` |
| `cashier.downtown@medcare.test` | `MedCare@2026!` | `Cashier` | `ASSIGNED` | MedCare - Downtown Flagship | `11111111-2222-4111-8111-000000000001` | `true` |
| `cashier.maadi@medcare.test` | `MedCare@2026!` | `Cashier` | `ASSIGNED` | MedCare - Maadi Medical Plaza | `11111111-2222-4111-8111-000000000002` | `true` |
| `inactive.staff@medcare.test` | `MedCare@2026!` | `Pharmacist` | `ASSIGNED` | MedCare - Nasr City Hub | `11111111-2222-4111-8111-000000000003` | `false` *(403 test)* |

### Tenant 2 — Al-Nour Clinical Pharmacy Group (`ALNOUR`)
- **Organization ID:** `22222222-2222-4222-8222-222222222202`
- **Organization Code:** `ALNOUR`
- **Dataset Size:** 2 Branches · 3 Users · 7 Categories · 16 Products (40 UOMs) · 16 Reorder Rules · 8 Locations · 23 Batches · 8 Posted Ledger Transactions · 68 Stock Balances

| Email (`username`) | Password | Role | Branch Scope | Assigned Branch Name | Assigned Branch ID | Active |
| --- | --- | --- | --- | --- | --- | --- |
| `admin@alnour.test` | `AlNour@2026!` | `Admin` | `ALL` | *(All Al-Nour Branches)* | — | `true` |
| `pharmacist@alnour.test` | `AlNour@2026!` | `Pharmacist` | `ASSIGNED` | Al-Nour - Heliopolis Medical Center | `22222222-2222-4222-8222-000000000001` | `true` |
| `cashier@alnour.test` | `AlNour@2026!` | `Cashier` | `ASSIGNED` | Al-Nour - Sheikh Zayed Clinic | `22222222-2222-4222-8222-000000000002` | `true` |

### Tenant 3 — GreenLeaf Family Pharmacy (`GREENLEAF`)
- **Organization ID:** `33333333-3333-4333-8333-333333333303`
- **Organization Code:** `GREENLEAF`
- **Dataset Size:** 1 Branch · 2 Users · 4 Categories · 11 Products (16 UOMs) · 8 Reorder Rules · 4 Locations · 17 Batches · 5 Posted Ledger Transactions · 27 Stock Balances

| Email (`username`) | Password | Role | Branch Scope | Assigned Branch Name | Assigned Branch ID | Active |
| --- | --- | --- | --- | --- | --- | --- |
| `owner@greenleaf.test` | `GreenLeaf@2026!` | `Admin` | `ALL` | *(All GreenLeaf Branches)* | — | `true` |
| `staff@greenleaf.test` | `GreenLeaf@2026!` | `Pharmacist` | `ASSIGNED` | GreenLeaf - Dokki Central | `33333333-2222-4333-8333-000000000001` | `true` |

---

## 2. Branch Enrollment Tokens & `BranchLocal` Runtime Mode Testing

In Stage 1, inventory stock mutations (`POST /api/v1/inventory/adjustments`) are only permitted when the backend runs in `BranchLocal` mode (`Cloud` mode returns `403 FORBIDDEN`).

### How to Start the Backend in `BranchLocal` Mode (e.g., MedCare Downtown)
```powershell
$env:ERP_RUNTIME_MODE = "BranchLocal"
$env:ENROLLED_BRANCH_ID = "11111111-2222-4111-8111-000000000001"
dotnet run --project src/PharmacyERP.Api
```

### Seeded Branches, Enrollment Tokens (`POST /api/v1/branch-enrollment`), and Main Location IDs

| Tenant | Branch Code | Branch Name | Branch ID (`ENROLLED_BRANCH_ID`) | Clear-Text One-Time Enrollment Token | `MAIN-SELLABLE` Location ID | `COLD-CHAIN` Location ID | `MAIN-QUARANTINE` Location ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MEDCARE` | `MED-DT` | MedCare - Downtown Flagship | `11111111-2222-4111-8111-000000000001` | `medcare-downtown-enroll-dev-2026` | `694cb9a9-c19d-3c46-be41-a7fc76fcdc9f` | `0381b7b2-23f9-da48-9ef0-e4d7b50851ee` | `f430db48-6608-4c41-a813-28be7a6d4afe` |
| `MEDCARE` | `MED-MD` | MedCare - Maadi Medical Plaza | `11111111-2222-4111-8111-000000000002` | `medcare-maadi-enroll-dev-2026` | `fc333b43-6599-b44e-9763-51606519c44a` | `2453d5e7-69e8-3945-9433-f7b3913a48db` | `13ed043e-4c08-4748-bbe6-75431c7866fd` |
| `MEDCARE` | `MED-NC` | MedCare - Nasr City Hub | `11111111-2222-4111-8111-000000000003` | `medcare-nasrcity-enroll-dev-2026` | `c27648ab-aec2-954d-b395-1527b653ebca` | `dcbb61f4-18a1-eb4a-abfa-138eae22d1a4` | `f49dedf9-7a6e-5a44-a9b1-8e33a78963ce` |
| `ALNOUR` | `AN-HEL` | Al-Nour - Heliopolis Medical Center | `22222222-2222-4222-8222-000000000001` | `alnour-heliopolis-enroll-dev-2026` | `a941e9a6-8346-6d44-a78d-69256b1ce015` | `ff631980-0833-1042-9643-c92aede66ed3` | `a0518471-7ff2-534e-af96-0e4247223e32` |
| `ALNOUR` | `AN-SZ` | Al-Nour - Sheikh Zayed Clinic | `22222222-2222-4222-8222-000000000002` | `alnour-sheikhzayed-enroll-dev-2026` | `1dcf4d6e-8ad1-924c-98fd-f45080b1b26e` | `b70099b8-8a0c-cb45-9059-2fab82c99f13` | `e23305d0-8a47-0d4a-b09b-0e484f5f9362` |
| `GREENLEAF` | `GL-DK` | GreenLeaf - Dokki Central | `33333333-2222-4333-8333-000000000001` | `greenleaf-dokki-enroll-dev-2026` | `2eceb0e6-b281-3f4a-a5c6-777c524be943` | `9d7abcb8-d849-c54d-b4e1-ed4d11a284cf` | `6ad86ebd-424d-0d44-bd9a-5ca828e41d8f` |

*(Each branch also has a `BACKROOM-BULK` sellable location. One-time enrollment tokens are valid for 365 days from seed time; once redeemed via `POST /api/v1/branch-enrollment`, an Admin can issue fresh tokens via `POST /api/v1/branches/{branchId}/enrollment-tokens`.)*

---

## 3. Sample Catalog SKUs, EAN-13 Barcodes, UOMs & Batches

> **Barcode Search Endpoint:** In Stage 1, barcode and SKU lookups use `GET /api/v1/products?search={barcode_or_sku}` (matches `Name`, `Sku`, and `Barcode` case-insensitively and returns full `uoms[]` conversions & prices).

### MedCare Wellness Pharmacies (`MEDCARE`) — Key Test Products

| SKU | EAN-13 Barcode | Product Name | Product ID | Lot Tracked | UOMs (`Code = Factor`, Price EGP, `productUomId`) | Test Scenario Highlight |
| --- | --- | --- | --- | --- | --- | --- |
| `MED-AUG-1000` | `6221001000019` | Augmentin 1g Film-Coated Tablets | `6dbdb1a7-c723-da4c-8e0e-b067c18bc710` | `true` | `TAB=1` (10.50, `9d28eb00-b850-564b-a237-ea00d077d047`) · `STRIP=7` (70.00, `b554caea-c8f3-f349-902e-8bc2049041bd`) · `BOX=14` (138.00, `db06a376-50a7-224c-b9c5-4f342c45debb`) | Multi-UOM, internal transfer history (DT), **Low Stock** at Maadi, **Near-Expiry** + **Expired** batch in Quarantine (DT) |
| `MED-PAN-500X` | `6221001000026` | Panadol Extra Advance 500mg | `686a214e-cbab-394b-b9df-8be2d07f6da2` | `true` | `TAB=1` (2.75, `d1e85af3-ab2d-eb4c-8fea-7913e8ccd278`) · `STRIP=8` (21.00, `1b18c116-e103-ef41-827a-2fd4fdd22ffe`) · `BOX=24` (60.00, `5d26d24a-9bda-3848-9ea7-0fa5f786451a`) | High-volume OTC, `ADJUSTMENT_IN` surplus history, **Near-Expiry** batch |
| `MED-CON-005` | `6221001000033` | Concor 5mg Tablets | `ccd9b3db-1890-424f-a04a-c3e4fbd4b60a` | `true` | `TAB=1` (3.20, `4911890b-6082-bb41-a614-a375ca40a859`) · `STRIP=10` (30.00, `46c61545-9249-9447-8211-546934b43063`) · `BOX=30` (87.00, `7c85e68f-3f4e-fc4c-b714-62673cd6f0b8`) | Chronic CV, `ADJUSTMENT_OUT` shrinkage history |
| `MED-LAN-100P` | `6221001000064` | Lantus SoloStar 100 U/mL Pen | `8938d660-a3d6-b744-a978-17249c950c1c` | `true` | `PEN=1` (195.00, `5f1b7926-e180-3e40-9d4d-87b59f90cad5`) · `BOX=5` (950.00, `8c0214c4-82ce-2748-b156-84d89d718e00`) | **Cold Chain (2–8°C)** fridge location, **Low Stock** at Downtown, **Near-Expiry** batch |
| `MED-CAT-050` | `6221001000088` | Cataflam 50mg Tablets | `8b232614-03fd-a841-a4d4-58ab9ec216ed` | `true` | `TAB=1` (3.40) · `STRIP=10` (33.00) · `BOX=20` (64.00) | **Expired** batch in Quarantine Bay at Downtown & Maadi |
| `MED-VEN-100I` | `6221001000101` | Ventolin Evohaler 100mcg | `a6f05eea-f1f7-6746-8741-0e00e818f3ca` | `true` | `INH=1` (82.00, `063dec04-204e-a54a-a695-c936cc9d9c71`) | **Out-of-Stock (`0` on-hand)** at Maadi (depleted via `ADJUSTMENT_OUT`) |
| `MED-CLX-040S` | `6221001000118` | Clexane 40mg/0.4mL Pre-Filled Syringes | `8d319479-b9b0-af42-a6ff-ac704434f55e` | `true` | `SYR=1` (105.00) · `BOX=2` (204.00) | **Cold Chain**, **Low Stock** at Nasr City, **Near-Expiry** batch |
| `MED-PLV-075` | `6221001000149` | Plavix 75mg Tablets | `0516e0a1-8862-e745-ae84-e738d078820d` | `true` | `TAB=1` (11.50) · `STRIP=14` (158.00) · `BOX=28` (310.00) | **Out-of-Stock** (zero stock with active reorder rule) at Nasr City |
| `MED-OMR-M3BP` | `6221001000248` | Omron M3 Comfort Blood Pressure Monitor | `b8f60890-97ab-4c45-a312-e6ea002d2790` | `false` | `UNIT=1` (2890.00, `ea266058-4a12-824c-9a66-6cbfc426360d`) | **Non-Lot Tracked** (`NON-LOT` system batch, `expiresOn: null`, 14% VAT) |
| `MED-ACC-STRP` | `6221001000255` | Accu-Chek Instant Blood Glucose Test Strips | `dc3d9bfb-3334-0941-aa88-2c90418ffd20` | `true` | `STRIP=1` (9.00) · `BOX=50` (410.00) | High conversion ratio (`50`), **Near-Expiry** batch, 14% VAT |

### Al-Nour (`ALNOUR`) & GreenLeaf (`GREENLEAF`) — Isolation Verification SKUs

| Tenant | SKU | EAN-13 Barcode | Product Name | Product ID | Lot Tracked |
| --- | --- | --- | --- | --- | --- |
| `ALNOUR` | `AN-ZIT-500` | `6222002000015` | Zithromax 500mg Tablets | `f2a1a641-4687-c946-abe8-6cb5d0008eed` | `true` *(Healthy + Near-Expiry + Expired)* |
| `ALNOUR` | `AN-CRS-010` | `6222002000022` | Crestor 10mg Tablets | `fea26bc6-51ce-a54e-a344-33cf34291234` | `true` *(Low Stock at Heliopolis)* |
| `ALNOUR` | `AN-NOV-100` | `6222002000169` | NovoRapid FlexPen 100 U/mL | `8afaa74d-3594-cf4f-a1f7-9157039fda9d` | `true` *(Cold Chain)* |
| `ALNOUR` | `AN-BRN-IRT` | `6222002000152` | Braun ThermoScan 7 Ear Thermometer | `653f6a61-1b84-1340-a635-82cade1d1479` | `false` (`NON-LOT`) |
| `GREENLEAF` | `GL-CEN-030` | `6223003000011` | Centrum Adults Multivitamin Tablets | `4ac20b46-a752-7441-8f40-173d84dee810` | `true` *(Healthy + Near-Expiry)* |
| `GREENLEAF` | `GL-RDX-100` | `6223003000028` | Redoxon Vitamin C 1000mg Effervescent | `dadc54e2-6351-7645-9af2-ed0070d45194` | `true` *(Low Stock at Dokki)* |
| `GREENLEAF` | `GL-HAN-020` | `6223003000073` | Hansaplast Elastic Fabric Plasters | `a068db0b-823e-934d-b1dc-df3ebaf74172` | `false` (`NON-LOT`) |

### Sample Batch Numbers Ready for Inventory Queries & Adjustments

| Tenant | SKU | Batch Number | Quality Status | Expiry Category |
| --- | --- | --- | --- | --- |
| `MEDCARE` | `MED-AUG-1000` | `MEDCARE-LOT-2601` | `AVAILABLE` | Healthy (long-dated 2027) |
| `MEDCARE` | `MED-AUG-1000` | `MEDCARE-NEAR-2601` | `AVAILABLE` | Near-Expiry (~35 days from seed date) |
| `MEDCARE` | `MED-AUG-1000` | `MEDCARE-EXP-2501` | `EXPIRED` | Expired (stored strictly in `MAIN-QUARANTINE`) |
| `MEDCARE` | `MED-PAN-500X` | `MEDCARE-NEAR-2602` | `AVAILABLE` | Near-Expiry (~42 days from seed date) |
| `MEDCARE` | `MED-LAN-100P` | `MEDCARE-NEAR-2606` | `AVAILABLE` | Near-Expiry (~70 days from seed date, Cold Chain) |
| `MEDCARE` | `MED-CAT-050` | `MEDCARE-EXP-2508` | `EXPIRED` | Expired (stored strictly in `MAIN-QUARANTINE`) |
| `MEDCARE` | `MED-OMR-M3BP` | `NON-LOT` | `AVAILABLE` | Non-Lot (`expiresOn: null`) |
| `ALNOUR` | `AN-ZIT-500` | `ALNOUR-NEAR-2601` | `AVAILABLE` | Near-Expiry (~35 days from seed date) |
| `ALNOUR` | `AN-ZIT-500` | `ALNOUR-EXP-2501` | `EXPIRED` | Expired (stored strictly in `MAIN-QUARANTINE`) |

### Copy-Paste Sample Stock Adjustment Payload (`POST /api/v1/inventory/adjustments`)
*(Requires `ERP_RUNTIME_MODE=BranchLocal`, `ENROLLED_BRANCH_ID=11111111-2222-4111-8111-000000000001`, Bearer token from `admin@medcare.test` or `sarah.pharm@medcare.test`, and header `Idempotency-Key: qa-adj-001`.)*

```json
{
  "branchId": "11111111-2222-4111-8111-000000000001",
  "transactionType": "ADJUSTMENT_IN",
  "reasonCode": "MANUAL_RESTOCK_TEST",
  "note": "Frontend QA stock adjustment test (2 Boxes = 28 Tablets)",
  "idempotencyKey": "qa-adj-001",
  "lines": [
    {
      "productId": "6dbdb1a7-c723-da4c-8e0e-b067c18bc710",
      "locationId": "694cb9a9-c19d-3c46-be41-a7fc76fcdc9f",
      "productUomId": "db06a376-50a7-224c-b9c5-4f342c45debb",
      "batchNumber": "MEDCARE-LOT-2601",
      "expiresOn": "2027-01-28",
      "enteredQty": 2,
      "unitCostEntered": 100.80
    }
  ]
}
```

---

## 4. Recommended Frontend QA Test Checklist

1. **Org Admin Login & Dashboard Overview**
   - Log in as `admin@medcare.test` (`MEDCARE` / `MedCare@2026!`).
   - Verify `GET /api/v1/auth/me` returns `role: "Admin"` and `branchScope: "ALL"`.
   - Verify `GET /api/v1/branches` lists all 3 MedCare branches, `GET /api/v1/product-categories` shows the 11-node category hierarchy, and `GET /api/v1/products?pageSize=50` returns 32 products.
   - Verify `GET /api/v1/inventory/transactions?branchId=11111111-2222-4111-8111-000000000001` shows `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, and internal transfer replenishment transactions (`TRF-OUT-*` / `TRF-IN-*`).

2. **Role, Branch-Scope (`403`) & Deactivated Account Enforcement**
   - Attempt login as `inactive.staff@medcare.test` (`MedCare@2026!`) -> confirm `403 FORBIDDEN` (`AccountInactive`).
   - Log in as `cashier.downtown@medcare.test` (`Cashier`, `ASSIGNED` to Downtown):
     - Confirm `GET /api/v1/branches/11111111-2222-4111-8111-000000000002` (Maadi) returns `403 FORBIDDEN_BRANCH`.
     - Confirm write endpoints (`POST /api/v1/products`, `POST /api/v1/inventory/adjustments`) return `403 FORBIDDEN`.
     - Confirm read access to Downtown balances (`GET /api/v1/inventory/balances?branchId=11111111-2222-4111-8111-000000000001`) succeeds (`200 OK`).

3. **Multi-UOM & Barcode Lookup**
   - Search `GET /api/v1/products?search=6221001000019` -> returns `Augmentin 1g Film-Coated Tablets` with 3 sellable UOMs (`TAB=1`, `STRIP=7`, `BOX=14`).
   - Search `GET /api/v1/products?search=6221001000248` -> returns `Omron M3 Comfort Blood Pressure Monitor` with `lotTrackingRequired: false` (`NON-LOT` batch).
   - Call `GET /api/v1/products/6dbdb1a7-c723-da4c-8e0e-b067c18bc710/uoms` -> confirm UOM conversions and prices match table above.

4. **Near-Expiry, Expired/Quarantine, Low-Stock & Out-of-Stock Filtering**
   - Query `GET /api/v1/inventory/batches?expiringBefore=2027-02-15` -> confirm near-expiry batches (`MEDCARE-NEAR-*`) and expired batches (`MEDCARE-EXP-*`) appear.
   - Query `GET /api/v1/inventory/batches?status=EXPIRED` -> confirm `MEDCARE-EXP-2501` (Augmentin) and `MEDCARE-EXP-2508` (Cataflam) appear and are stocked only inside `MAIN-QUARANTINE`.
   - Compare branch stock balances (`GET /api/v1/inventory/balances?branchId=...`) against branch reorder rules (`GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule`):
     - **Low-Stock:** `MED-LAN-100P` (Downtown), `MED-AUG-1000` (Maadi), `MED-CLX-040S` (Nasr City).
     - **Out-of-Stock:** `MED-VEN-100I` at Maadi (`0` on-hand), `MED-PLV-075` at Nasr City (no stock row + active reorder rule).

5. **Cross-Tenant PostgreSQL RLS Isolation Check (`MEDCARE` vs. `ALNOUR`)**
   - Log in as `admin@alnour.test` (`ALNOUR` / `AlNour@2026!`).
   - Confirm `GET /api/v1/products` returns **only** the 16 `AN-*` products and **never** any `MED-*` or `GL-*` products.
   - Attempt to fetch a MedCare product directly (`GET /api/v1/products/6dbdb1a7-c723-da4c-8e0e-b067c18bc710`) or MedCare branch (`GET /api/v1/branches/11111111-2222-4111-8111-000000000001`) using Al-Nour's token -> confirm `404 NOT_FOUND` (PostgreSQL `FORCE ROW LEVEL SECURITY` completely hides cross-tenant rows).
