using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Seeding;

/// <summary>
/// Idempotent development-only database seeder that populates local erp_db with realistic
/// English-only multi-tenant pharmaceutical data while respecting PostgreSQL RLS and
/// ledger/audit immutability triggers.
/// </summary>
public sealed class DevDatabaseSeeder
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DevDatabaseSeeder> _logger;

    public DevDatabaseSeeder(IServiceScopeFactory scopeFactory, ILogger<DevDatabaseSeeder> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (await IsAlreadySeededAsync(ct))
        {
            _logger.LogInformation("Development seed data already exists; skipping.");
            return;
        }

        _logger.LogInformation("Seeding realistic multi-tenant development data into erp_db...");

        await SeedMedCareTenantAsync(ct);
        await SeedAlNourTenantAsync(ct);
        await SeedGreenLeafTenantAsync(ct);

        _logger.LogInformation("Development seed data completed cleanly across 3 tenants (MedCare, Al-Nour, GreenLeaf).");
    }

    private async Task<bool> IsAlreadySeededAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        tenantContext.AllowSystemBypass();
        await unitOfWork.BeginTransactionAsync(ct);
        try
        {
            return await db.Organizations
                .AsNoTracking()
                .AnyAsync(o => o.OrganizationCode == DevSeedConstants.FlagshipOrganizationCode, ct);
        }
        finally
        {
            await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        }
    }

    private async Task SeedMedCareTenantAsync(CancellationToken ct)
    {
        var branches = new (Guid BranchId, string Code, string Name, Address Address, string EnrollmentToken)[]
        {
            (
                DevSeedConstants.MedCareDowntownBranchId,
                "MED-DT",
                "MedCare - Downtown Flagship",
                new Address("18 Talaat Harb Street, Ground Floor", "24/7 Flagship Pharmacy", "Cairo", "Cairo", "11511", "EG"),
                DevSeedConstants.MedCareDowntownEnrollmentToken
            ),
            (
                DevSeedConstants.MedCareMaadiBranchId,
                "MED-MD",
                "MedCare - Maadi Medical Plaza",
                new Address("42 Road 9, Maadi Medical Plaza", "Adjacent to Maadi Specialty Clinics", "Cairo", "Cairo", "11728", "EG"),
                DevSeedConstants.MedCareMaadiEnrollmentToken
            ),
            (
                DevSeedConstants.MedCareNasrCityBranchId,
                "MED-NC",
                "MedCare - Nasr City Hub",
                new Address("85 Abbas El-Akkad Street", "High-Volume Retail & Cold-Chain Hub", "Cairo", "Cairo", "11765", "EG"),
                DevSeedConstants.MedCareNasrCityEnrollmentToken
            )
        };

        var staff = new SeedStaffSpec[]
        {
            new("MED-EMP-001", "Dr. Karim Mansour", "admin@medcare.test", "+201001112201", "Chief Pharmacy Officer",
                DevSeedConstants.MedCareDowntownBranchId, UserRole.Admin, BranchScope.ALL, Array.Empty<Guid>(),
                true, "12 Zamalek Corniche", "Cairo", "Cairo", "11211"),
            new("MED-EMP-002", "Dr. Nadia El-Sayed", "downtown.admin@medcare.test", "+201001112202", "Downtown Branch Admin",
                DevSeedConstants.MedCareDowntownBranchId, UserRole.Admin, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareDowntownBranchId },
                true, "24 Qasr El-Nil St", "Cairo", "Cairo", "11511"),
            new("MED-EMP-003", "Dr. Tarek Hassan", "maadi.manager@medcare.test", "+201001112203", "Branch Manager",
                DevSeedConstants.MedCareMaadiBranchId, UserRole.Admin, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareMaadiBranchId },
                true, "15 Road 231, Degla", "Cairo", "Cairo", "11728"),
            new("MED-EMP-004", "Dr. Heba Abdelrahman", "nasrcity.manager@medcare.test", "+201001112204", "Branch Manager",
                DevSeedConstants.MedCareNasrCityBranchId, UserRole.Admin, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareNasrCityBranchId },
                true, "33 Makram Ebeid St", "Cairo", "Cairo", "11765"),
            new("MED-EMP-005", "Dr. Sarah Nabil", "sarah.pharm@medcare.test", "+201001112205", "Senior Clinical Pharmacist",
                DevSeedConstants.MedCareDowntownBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareDowntownBranchId },
                true, "7 Champollion St", "Cairo", "Cairo", "11511"),
            new("MED-EMP-006", "Dr. Omar Farouk", "omar.pharm@medcare.test", "+201001112206", "Clinical Pharmacist",
                DevSeedConstants.MedCareMaadiBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareMaadiBranchId },
                true, "29 Road 250, Maadi", "Cairo", "Cairo", "11728"),
            new("MED-EMP-007", "Dr. Lina Youssef", "lina.pharm@medcare.test", "+201001112207", "Cold-Chain Pharmacist",
                DevSeedConstants.MedCareNasrCityBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareNasrCityBranchId },
                true, "19 Mostafa El-Nahas St", "Cairo", "Cairo", "11765"),
            new("MED-EMP-008", "Youssef Adel", "cashier.downtown@medcare.test", "+201001112208", "POS Cashier",
                DevSeedConstants.MedCareDowntownBranchId, UserRole.Cashier, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareDowntownBranchId },
                true, "55 Ramses Street", "Cairo", "Cairo", "11522"),
            new("MED-EMP-009", "Mariam Sherif", "cashier.maadi@medcare.test", "+201001112209", "POS Cashier",
                DevSeedConstants.MedCareMaadiBranchId, UserRole.Cashier, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareMaadiBranchId },
                true, "11 Zahraa El-Maadi", "Cairo", "Cairo", "11742"),
            new("MED-EMP-010", "Hossam El-Din", "inactive.staff@medcare.test", "+201001112210", "Former Relief Pharmacist",
                DevSeedConstants.MedCareNasrCityBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.MedCareNasrCityBranchId },
                false, "60 Ahmed Fakhry St", "Cairo", "Cairo", "11765")
        };

        var categories = new SeedCategorySpec[]
        {
            new("RX", "Prescription Medications", "Dispensed strictly by licensed pharmacist with valid prescription"),
            new("RX-ABX", "Antibiotics & Anti-Infectives", "Systemic and localized antibacterial therapies", "RX"),
            new("RX-CV", "Cardiovascular & Hypertension", "Antihypertensives, statins, anticoagulants, and antiplatelets", "RX"),
            new("RX-DM", "Diabetes & Endocrinology", "Oral hypoglycemics, insulins, and thyroid medications", "RX"),
            new("RX-GI", "Gastrointestinal & PPIs", "Proton pump inhibitors, antacids, and GI anti-infectives", "RX"),
            new("RX-CNS", "CNS & Neurology", "Neuropathic pain and central nervous system therapeutics", "RX"),
            new("OTC", "Over-The-Counter (OTC)", "Non-prescription self-care and symptomatic relief medicines"),
            new("OTC-PAIN", "Analgesics & Antipyretics", "Pain relievers, anti-inflammatories, and fever reducers", "OTC"),
            new("OTC-COLD", "Cold, Flu & Allergy", "Antihistamines, decongestants, bronchodilators, and throat care", "OTC"),
            new("DERM", "Dermocosmetics & Personal Care", "Dermatological skincare, moisturizers, antiseptics, and sunscreens"),
            new("DEV", "Medical Devices & Diagnostics", "Home monitoring instruments and diagnostic test strips")
        };

        var products = BuildMedCareCatalog();

        await SeedTenantCoreAsync(
            orgId: DevSeedConstants.MedCareOrgId,
            orgCode: "MEDCARE",
            orgName: "MedCare Wellness Pharmacies",
            orgAddress: new Address("18 Talaat Harb Street, Headquarters", "Suite 400", "Cairo", "Cairo", "11511", "EG"),
            password: DevSeedConstants.MedCarePassword,
            branches: branches,
            staff: staff,
            categories: categories,
            products: products,
            isFlagship: true,
            ct: ct);
    }

    private async Task SeedAlNourTenantAsync(CancellationToken ct)
    {
        var branches = new (Guid BranchId, string Code, string Name, Address Address, string EnrollmentToken)[]
        {
            (
                DevSeedConstants.AlNourHeliopolisBranchId,
                "AN-HEL",
                "Al-Nour - Heliopolis Medical Center",
                new Address("104 El-Merghany Street", "Ground Floor, Medical Tower", "Cairo", "Cairo", "11341", "EG"),
                DevSeedConstants.AlNourHeliopolisEnrollmentToken
            ),
            (
                DevSeedConstants.AlNourSheikhZayedBranchId,
                "AN-SZ",
                "Al-Nour - Sheikh Zayed Clinic",
                new Address("12 Central Axis, Arkan Medical Annex", "Building B", "Sheikh Zayed", "Giza", "12588", "EG"),
                DevSeedConstants.AlNourSheikhZayedEnrollmentToken
            )
        };

        var staff = new SeedStaffSpec[]
        {
            new("AN-EMP-001", "Dr. Mahmoud El-Shazly", "admin@alnour.test", "+201112223301", "Group Managing Director",
                DevSeedConstants.AlNourHeliopolisBranchId, UserRole.Admin, BranchScope.ALL, Array.Empty<Guid>(),
                true, "18 Baghdad St, Korba", "Cairo", "Cairo", "11341"),
            new("AN-EMP-002", "Dr. Salma Mostafa", "pharmacist@alnour.test", "+201112223302", "Lead Clinical Pharmacist",
                DevSeedConstants.AlNourHeliopolisBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.AlNourHeliopolisBranchId },
                true, "9 Cleopatra St, Heliopolis", "Cairo", "Cairo", "11341"),
            new("AN-EMP-003", "Mostafa Gamal", "cashier@alnour.test", "+201112223303", "Branch Cashier",
                DevSeedConstants.AlNourSheikhZayedBranchId, UserRole.Cashier, BranchScope.ASSIGNED, new[] { DevSeedConstants.AlNourSheikhZayedBranchId },
                true, "District 4, Neighborhood 2", "Sheikh Zayed", "Giza", "12588")
        };

        var categories = new SeedCategorySpec[]
        {
            new("AN-RX", "Clinical Prescriptions", "Prescription-only clinical therapeutics"),
            new("AN-ABX", "Anti-Infectives", "Macrolides, fluoroquinolones, and antiprotozoals", "AN-RX"),
            new("AN-CHRON", "Chronic Care", "Cardiometabolic and endocrine long-term therapy", "AN-RX"),
            new("AN-GI", "Digestive Health", "Acid suppression and prokinetic medications", "AN-RX"),
            new("AN-OTC", "OTC & Respiratory", "Allergy, cold, flu, and cough formulations"),
            new("AN-VIT", "Vitamins & Supplements", "Neurotropic vitamins and bone health supplements"),
            new("AN-DEV", "Clinical Diagnostics", "Home fever and diagnostic instruments")
        };

        var products = BuildAlNourCatalog();

        await SeedTenantCoreAsync(
            orgId: DevSeedConstants.AlNourOrgId,
            orgCode: "ALNOUR",
            orgName: "Al-Nour Clinical Pharmacy Group",
            orgAddress: new Address("104 El-Merghany Street, Heliopolis", "Clinical Group HQ", "Cairo", "Cairo", "11341", "EG"),
            password: DevSeedConstants.AlNourPassword,
            branches: branches,
            staff: staff,
            categories: categories,
            products: products,
            isFlagship: false,
            ct: ct);
    }

    private async Task SeedGreenLeafTenantAsync(CancellationToken ct)
    {
        var branches = new (Guid BranchId, string Code, string Name, Address Address, string EnrollmentToken)[]
        {
            (
                DevSeedConstants.GreenLeafDokkiBranchId,
                "GL-DK",
                "GreenLeaf - Dokki Central",
                new Address("27 Mosaddak Street", "Dokki Main Corner", "Giza", "Giza", "12311", "EG"),
                DevSeedConstants.GreenLeafDokkiEnrollmentToken
            )
        };

        var staff = new SeedStaffSpec[]
        {
            new("GL-EMP-001", "Dr. Rania El-Masry", "owner@greenleaf.test", "+201223334401", "Pharmacy Owner & Director",
                DevSeedConstants.GreenLeafDokkiBranchId, UserRole.Admin, BranchScope.ALL, Array.Empty<Guid>(),
                true, "14 Mohi El-Din Abou El-Ezz St", "Giza", "Giza", "12311"),
            new("GL-EMP-002", "Dr. Ahmed Samir", "staff@greenleaf.test", "+201223334402", "Community Pharmacist",
                DevSeedConstants.GreenLeafDokkiBranchId, UserRole.Pharmacist, BranchScope.ASSIGNED, new[] { DevSeedConstants.GreenLeafDokkiBranchId },
                true, "31 El-Tahrir St, Dokki", "Giza", "Giza", "12311")
        };

        var categories = new SeedCategorySpec[]
        {
            new("GL-VIT", "Vitamins & Wellness", "Daily multivitamins, vitamin C, and omega fatty acids"),
            new("GL-SKIN", "Skincare & Dermocosmetics", "Facial cleansers, micellar water, and daily moisturizers"),
            new("GL-FIRST", "First Aid & Antiseptics", "Wound dressings, plasters, and antiseptic liquids"),
            new("GL-CARE", "Daily Family Care", "Eye drops, oral care, and digestive relief")
        };

        var products = BuildGreenLeafCatalog();

        await SeedTenantCoreAsync(
            orgId: DevSeedConstants.GreenLeafOrgId,
            orgCode: "GREENLEAF",
            orgName: "GreenLeaf Family Pharmacy",
            orgAddress: new Address("27 Mosaddak Street, Dokki", null, "Giza", "Giza", "12311", "EG"),
            password: DevSeedConstants.GreenLeafPassword,
            branches: branches,
            staff: staff,
            categories: categories,
            products: products,
            isFlagship: false,
            ct: ct);
    }

    private async Task SeedTenantCoreAsync(
        Guid orgId,
        string orgCode,
        string orgName,
        Address orgAddress,
        string password,
        (Guid BranchId, string Code, string Name, Address Address, string EnrollmentToken)[] branches,
        SeedStaffSpec[] staff,
        SeedCategorySpec[] categories,
        SeedProductSpec[] products,
        bool isFlagship,
        CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();
        var clock = scope.ServiceProvider.GetRequiredService<IDateTimeProvider>();

        var now = clock.UtcNow;
        var today = DateOnly.FromDateTime(now.UtcDateTime);

        tenantContext.SetTenant(orgId);
        await unitOfWork.BeginTransactionAsync(ct);

        try
        {
            // 1. Organization & Outbox Cursor
            var org = Organization.Create(orgCode, orgName, "EGP", "Africa/Cairo", orgAddress);
            SetPrivateProperty(org, nameof(Organization.OrganizationId), orgId);
            db.Organizations.Add(org);
            db.OutboxEventCursors.Add(new OutboxEventCursor(orgId));
            await unitOfWork.SaveChangesAsync(ct);

            // 2. Branches & Active Branch Enrollments
            var branchEntities = new Dictionary<Guid, Branch>();
            foreach (var b in branches)
            {
                var branch = Branch.Create(orgId, b.Code, b.Name, b.Address);
                SetPrivateProperty(branch, nameof(Branch.BranchId), b.BranchId);
                db.Branches.Add(branch);
                branchEntities[b.BranchId] = branch;

                var enrollment = BranchEnrollment.Create(
                    orgId,
                    b.BranchId,
                    DevSeedConstants.HashEnrollmentToken(b.EnrollmentToken),
                    now.AddDays(365),
                    now);
                SetPrivateProperty(enrollment, nameof(BranchEnrollment.EnrollmentId),
                    DevSeedConstants.DeterministicGuid($"{orgCode}:enrollment:{b.Code}"));
                db.BranchEnrollments.Add(enrollment);
            }

            // 3. Employees, UserAccounts & UserBranchAccess
            Employee? primaryAdminEmployee = null;
            UserAccount? primaryAdminUser = null;

            foreach (var s in staff)
            {
                var empAddr = new Address(s.Street, null, s.City, s.Region, s.PostalCode, "EG");
                var emp = Employee.Create(
                    orgId,
                    s.PrimaryBranchId,
                    s.EmployeeNo,
                    s.FullName,
                    s.Email,
                    s.Phone,
                    s.JobTitle,
                    empAddr,
                    today.AddDays(-365));
                var empId = DevSeedConstants.DeterministicGuid($"{orgCode}:employee:{s.EmployeeNo}");
                SetPrivateProperty(emp, nameof(Employee.EmployeeId), empId);
                db.Employees.Add(emp);

                var user = UserAccount.Create(orgId, empId, s.Email, "pending-hash", s.Role, s.BranchScope);
                var userId = DevSeedConstants.DeterministicGuid($"{orgCode}:user:{s.Email}");
                SetPrivateProperty(user, nameof(UserAccount.UserId), userId);
                user.UpdatePasswordHash(passwordHasher.HashPassword(user, password), now);

                if (!s.IsActive)
                {
                    user.Deactivate();
                }

                db.UserAccounts.Add(user);

                if (primaryAdminEmployee is null && s.Role == UserRole.Admin && s.BranchScope == BranchScope.ALL)
                {
                    primaryAdminEmployee = emp;
                    primaryAdminUser = user;
                }

                if (s.BranchScope == BranchScope.ASSIGNED)
                {
                    foreach (var assignedBranchId in s.AssignedBranchIds.Distinct())
                    {
                        db.UserBranchAccesses.Add(UserBranchAccess.Create(orgId, userId, assignedBranchId));
                    }
                }
            }

            await unitOfWork.SaveChangesAsync(ct);

            // 4. Hierarchical Product Categories (Roots first, then Subcategories)
            var categoryByCode = new Dictionary<string, ProductCategory>(StringComparer.Ordinal);
            foreach (var c in categories.Where(x => x.ParentCode is null))
            {
                var catId = DevSeedConstants.DeterministicGuid($"{orgCode}:category:{c.Code}");
                var entity = ProductCategory.Create(orgId, c.Code, c.Name, c.Description, null, catId);
                db.ProductCategories.Add(entity);
                categoryByCode[c.Code] = entity;
            }

            await unitOfWork.SaveChangesAsync(ct);

            foreach (var c in categories.Where(x => x.ParentCode is not null))
            {
                var parent = categoryByCode[c.ParentCode!];
                var catId = DevSeedConstants.DeterministicGuid($"{orgCode}:category:{c.Code}");
                var entity = ProductCategory.Create(orgId, c.Code, c.Name, c.Description, parent.CategoryId, catId);
                db.ProductCategories.Add(entity);
                categoryByCode[c.Code] = entity;
            }

            await unitOfWork.SaveChangesAsync(ct);

            // 5. Products & Multi-UOM Definitions
            var productMap = new Dictionary<string, (Product Product, SeedProductSpec Spec, ProductUom BaseUom, ProductUom? SecondaryUom)>(StringComparer.Ordinal);
            foreach (var p in products)
            {
                var prodId = DevSeedConstants.DeterministicGuid($"{orgCode}:product:{p.Sku}");
                var barcode = DevSeedConstants.MakeEan13(p.Ean12Prefix);
                var uomDefs = p.Uoms
                    .Select(u => new InitialUomDefinition(
                        u.UomCode,
                        u.DisplayName,
                        u.ConversionToBase,
                        u.SaleUnitPrice,
                        u.IsBase,
                        IsSellable: true,
                        IsPurchasable: true))
                    .ToList();

                var product = Product.Create(
                    organizationId: orgId,
                    categoryId: categoryByCode[p.CategoryCode].CategoryId,
                    sku: p.Sku,
                    barcode: barcode,
                    name: p.Name,
                    genericName: p.GenericName,
                    brandName: p.BrandName,
                    baseUomCode: p.BaseUomCode,
                    taxRate: p.TaxRate,
                    imageUrl: null,
                    lotTrackingRequired: p.LotTrackingRequired,
                    expiryAlertDays: p.ExpiryAlertDays,
                    initialUoms: uomDefs,
                    productId: prodId);

                foreach (var uom in product.Uoms)
                {
                    var uomId = DevSeedConstants.DeterministicGuid($"{orgCode}:uom:{p.Sku}:{uom.UomCode}");
                    SetPrivateProperty(uom, nameof(ProductUom.ProductUomId), uomId);
                }

                db.Products.Add(product);
                var baseUom = product.Uoms.Single(u => u.IsBase);
                var secondaryUom = product.Uoms.Where(u => !u.IsBase).OrderByDescending(u => u.ConversionToBase).FirstOrDefault();
                productMap[p.Sku] = (product, p, baseUom, secondaryUom);
            }

            await unitOfWork.SaveChangesAsync(ct);

            // 6. Inventory Locations (4 per branch)
            var locationsByBranch = new Dictionary<Guid, Dictionary<string, InventoryLocation>>();
            foreach (var b in branches)
            {
                var branchLocs = new Dictionary<string, InventoryLocation>(StringComparer.Ordinal);
                var specs = new (string Code, string Name, LocationType Type, bool IsSellable)[]
                {
                    (DevSeedConstants.MainSellableCode, "Main Dispensing Shelves", LocationType.SELLABLE, true),
                    (DevSeedConstants.BackroomBulkCode, "Backroom Bulk Storage", LocationType.SELLABLE, true),
                    (DevSeedConstants.ColdChainCode, "Cold Chain Refrigerator (2-8C)", LocationType.SELLABLE, true),
                    (DevSeedConstants.QuarantineCode, "Quarantine & Expired Bay", LocationType.QUARANTINE, false)
                };

                foreach (var locSpec in specs)
                {
                    var loc = InventoryLocation.Create(orgId, b.BranchId, locSpec.Code, locSpec.Name, locSpec.Type, locSpec.IsSellable, now);
                    var locId = DevSeedConstants.DeterministicGuid($"{orgCode}:loc:{b.Code}:{locSpec.Code}");
                    SetPrivateProperty(loc, nameof(InventoryLocation.LocationId), locId);
                    db.InventoryLocations.Add(loc);
                    branchLocs[locSpec.Code] = loc;
                }

                locationsByBranch[b.BranchId] = branchLocs;
            }

            // 7. Reorder Rules across Branches
            for (int i = 0; i < products.Length; i++)
            {
                var p = products[i];
                var product = productMap[p.Sku].Product;
                var packFactor = p.Uoms.Max(u => u.ConversionToBase);

                // Configure reorder rules for key items (first 16 for flagship, first 8 for others)
                if (i < (isFlagship ? 16 : 8))
                {
                    foreach (var b in branches)
                    {
                        decimal reorderPoint = packFactor * (p.IsColdChain ? 6m : 10m);
                        decimal reorderQty = packFactor * (p.IsColdChain ? 15m : 25m);
                        decimal maxQty = packFactor * (p.IsColdChain ? 40m : 80m);

                        var ruleId = DevSeedConstants.DeterministicGuid($"{orgCode}:reorder:{b.Code}:{p.Sku}");
                        var rule = ProductReorderRule.Create(orgId, product.ProductId, b.BranchId, reorderPoint, reorderQty, maxQty, ruleId);
                        db.ProductReorderRules.Add(rule);
                    }
                }
            }

            // 8. Inventory Batches (Healthy 2027-2028, Near-Expiry 30-75 days, Expired in Quarantine, Non-Lot)
            var healthyBatchBySku = new Dictionary<string, InventoryBatch>(StringComparer.Ordinal);
            var nearExpiryBatchBySku = new Dictionary<string, InventoryBatch>(StringComparer.Ordinal);
            var expiredBatchBySku = new Dictionary<string, InventoryBatch>(StringComparer.Ordinal);

            for (int i = 0; i < products.Length; i++)
            {
                var p = products[i];
                var product = productMap[p.Sku].Product;

                if (!p.LotTrackingRequired)
                {
                    var nonLotBatch = InventoryBatch.CreateNonLotSystemBatch(orgId, product.ProductId, now);
                    db.InventoryBatches.Add(nonLotBatch);
                    healthyBatchBySku[p.Sku] = nonLotBatch;
                    continue;
                }

                var healthyExpiry = new DateOnly(2027 + (i % 2), ((i * 2) % 12) + 1, 28);
                var healthyMfg = healthyExpiry.AddYears(-2);
                var healthyBatchNo = $"{orgCode}-LOT-{(2601 + i):D4}";
                var healthyBatch = InventoryBatch.CreateDatedBatch(
                    orgId, product.ProductId, healthyBatchNo, healthyExpiry, healthyMfg, BatchQualityStatus.AVAILABLE, now);
                db.InventoryBatches.Add(healthyBatch);
                healthyBatchBySku[p.Sku] = healthyBatch;

                // Near-expiry batches (35-70 days from today) on select high-turnover SKUs
                if (i is 0 or 1 or 5 or 10 or 24 || (!isFlagship && i is 2 or 3))
                {
                    int daysToExpiry = 35 + ((i * 7) % 36); // 35..70 days
                    var nearExpiry = today.AddDays(daysToExpiry);
                    var nearBatchNo = $"{orgCode}-NEAR-{(2601 + i):D4}";
                    var nearBatch = InventoryBatch.CreateDatedBatch(
                        orgId, product.ProductId, nearBatchNo, nearExpiry, nearExpiry.AddYears(-2), BatchQualityStatus.AVAILABLE, now);
                    db.InventoryBatches.Add(nearBatch);
                    nearExpiryBatchBySku[p.Sku] = nearBatch;
                }

                // Expired batches (expired 35-50 days ago, BatchQualityStatus.EXPIRED) for quarantine bay testing
                if ((isFlagship && i is 0 or 7) || (!isFlagship && orgCode == "ALNOUR" && i == 0))
                {
                    var expiredOn = today.AddDays(-(35 + i * 2));
                    var expBatchNo = $"{orgCode}-EXP-{(2501 + i):D4}";
                    var expBatch = InventoryBatch.CreateDatedBatch(
                        orgId, product.ProductId, expBatchNo, expiredOn, expiredOn.AddYears(-2), BatchQualityStatus.EXPIRED, now);
                    db.InventoryBatches.Add(expBatch);
                    expiredBatchBySku[p.Sku] = expBatch;
                }
            }

            await unitOfWork.SaveChangesAsync(ct);

            // 9. Consistent Ledger Transactions (DRAFT -> Save -> POSTED) & Matching StockBalances
            var creatorEmployeeId = primaryAdminEmployee!.EmployeeId;
            var creatorUserId = primaryAdminUser!.UserId;
            var balances = new Dictionary<(Guid LocationId, Guid BatchId), StockBalance>();
            var draftTxns = new List<(InventoryTxn Txn, DateTimeOffset PostedAt)>();

            StockBalance GetOrCreateBalance(Guid locationId, Guid batchId, DateTimeOffset ts)
            {
                if (!balances.TryGetValue((locationId, batchId), out var bal))
                {
                    bal = StockBalance.Create(orgId, locationId, batchId, ts);
                    balances[(locationId, batchId)] = bal;
                    db.StockBalances.Add(bal);
                }

                return bal;
            }

            void AddIncomingLine(
                InventoryTxn txn,
                Product product,
                InventoryLocation location,
                InventoryBatch batch,
                ProductUom uom,
                decimal enteredQty,
                decimal unitCostBase,
                DateTimeOffset ts)
            {
                decimal qtyBase = Math.Round(enteredQty * uom.ConversionToBase, 4, MidpointRounding.AwayFromZero);
                var balance = GetOrCreateBalance(location.LocationId, batch.BatchId, ts);
                balance.ApplyIncomingStock(qtyBase, unitCostBase, ts);

                txn.AddLine(
                    productId: product.ProductId,
                    locationId: location.LocationId,
                    batchId: batch.BatchId,
                    productUomId: uom.ProductUomId,
                    enteredQty: enteredQty,
                    conversionSnapshot: uom.ConversionToBase,
                    quantityDeltaBase: qtyBase,
                    unitCostBase: unitCostBase);
            }

            void AddOutgoingLine(
                InventoryTxn txn,
                Product product,
                InventoryLocation location,
                InventoryBatch batch,
                ProductUom uom,
                decimal enteredQty,
                DateTimeOffset ts)
            {
                decimal qtyBase = Math.Round(enteredQty * uom.ConversionToBase, 4, MidpointRounding.AwayFromZero);
                var balance = GetOrCreateBalance(location.LocationId, batch.BatchId, ts);
                decimal outUnitCost = balance.ApplyOutgoingStock(qtyBase, ts);

                txn.AddLine(
                    productId: product.ProductId,
                    locationId: location.LocationId,
                    batchId: batch.BatchId,
                    productUomId: uom.ProductUomId,
                    enteredQty: enteredQty,
                    conversionSnapshot: uom.ConversionToBase,
                    quantityDeltaBase: -qtyBase,
                    unitCostBase: outUnitCost);
            }

            var openingTime = now.AddDays(-14);
            var adjustmentTime = now.AddDays(-5);
            var transferTime = now.AddDays(-2);

            for (int bIdx = 0; bIdx < branches.Length; bIdx++)
            {
                var b = branches[bIdx];
                var locs = locationsByBranch[b.BranchId];
                var mainLoc = locs[DevSeedConstants.MainSellableCode];
                var backroomLoc = locs[DevSeedConstants.BackroomBulkCode];
                var coldLoc = locs[DevSeedConstants.ColdChainCode];
                var quarantineLoc = locs[DevSeedConstants.QuarantineCode];

                // 9a. Opening Balance Transaction per Branch
                var openingTxn = InventoryTxn.CreateDraft(
                    organizationId: orgId,
                    branchId: b.BranchId,
                    transactionNo: $"OPN-{b.Code}-2026-0001",
                    transactionType: InventoryTransactionType.OPENING_BALANCE,
                    idempotencyKey: $"dev-seed:{orgCode}:{b.Code}:opening-0001",
                    createdByEmployeeId: creatorEmployeeId,
                    now: openingTime,
                    reasonCode: "INITIAL_OPENING_STOCK",
                    note: $"Initial opening inventory load for {b.Name}");

                for (int pIdx = 0; pIdx < products.Length; pIdx++)
                {
                    var p = products[pIdx];
                    var (product, spec, baseUom, secondaryUom) = productMap[p.Sku];
                    var entryUom = secondaryUom ?? baseUom;
                    var healthyBatch = healthyBatchBySku[p.Sku];
                    var primaryLoc = spec.IsColdChain ? coldLoc : mainLoc;

                    // Deliberate out-of-stock case: skip Plavix (index 13) at Nasr City (branch index 2)
                    if (isFlagship && bIdx == 2 && pIdx == 13)
                    {
                        continue;
                    }

                    // Deliberate low-stock cases (below reorder point) for QA filtering
                    decimal mainEnteredQty;
                    bool isLowStockTarget =
                        (isFlagship && bIdx == 0 && pIdx == 5) ||  // Lantus SoloStar low at Downtown
                        (isFlagship && bIdx == 1 && pIdx == 0) ||  // Augmentin 1g low at Maadi
                        (isFlagship && bIdx == 2 && pIdx == 10) || // Clexane 40mg low at Nasr City
                        (!isFlagship && bIdx == 0 && pIdx == 1);   // Low stock item in Al-Nour / GreenLeaf

                    if (isLowStockTarget)
                    {
                        mainEnteredQty = 3m;
                    }
                    else if (isFlagship && bIdx == 1 && pIdx == 9)
                    {
                        // Ventolin at Maadi: will be adjusted out to 0 to demonstrate ledger-verified zero stock
                        mainEnteredQty = 6m;
                    }
                    else
                    {
                        mainEnteredQty = 18m + ((pIdx + bIdx * 3) % 20);
                    }

                    AddIncomingLine(openingTxn, product, primaryLoc, healthyBatch, entryUom, mainEnteredQty, spec.BaseUnitCost, openingTime);

                    // Backroom bulk reserve for top non-cold-chain items
                    if (!spec.IsColdChain && !isLowStockTarget && pIdx < 12)
                    {
                        AddIncomingLine(openingTxn, product, backroomLoc, healthyBatch, entryUom, 12m + (pIdx % 8), spec.BaseUnitCost, openingTime);
                    }

                    // Stock near-expiry batches in sellable shelf/fridge
                    if (nearExpiryBatchBySku.TryGetValue(p.Sku, out var nearBatch))
                    {
                        AddIncomingLine(openingTxn, product, primaryLoc, nearBatch, entryUom, 4m, spec.BaseUnitCost, openingTime);
                    }

                    // Stock expired batches strictly inside Quarantine & Expired Bay
                    if (bIdx == 0 && expiredBatchBySku.TryGetValue(p.Sku, out var expBatch))
                    {
                        AddIncomingLine(openingTxn, product, quarantineLoc, expBatch, entryUom, 2m, spec.BaseUnitCost, openingTime);
                    }
                    else if (isFlagship && bIdx == 1 && pIdx == 7 && expiredBatchBySku.TryGetValue(p.Sku, out var maadiExpBatch))
                    {
                        AddIncomingLine(openingTxn, product, quarantineLoc, maadiExpBatch, entryUom, 2m, spec.BaseUnitCost, openingTime);
                    }
                }

                db.InventoryTxns.Add(openingTxn);
                draftTxns.Add((openingTxn, openingTime));

                // 9b. Stock Adjustment (ADJUSTMENT_IN restock + ADJUSTMENT_OUT cycle-count / depletion)
                var adjInTxn = InventoryTxn.CreateDraft(
                    organizationId: orgId,
                    branchId: b.BranchId,
                    transactionNo: $"ADJ-IN-{b.Code}-2026-0001",
                    transactionType: InventoryTransactionType.ADJUSTMENT_IN,
                    idempotencyKey: $"dev-seed:{orgCode}:{b.Code}:adj-in-0001",
                    createdByEmployeeId: creatorEmployeeId,
                    now: adjustmentTime,
                    reasonCode: "CYCLE_COUNT_SURPLUS",
                    note: $"Verified physical count surplus adjustment at {b.Name}");

                var restockSpec = products[1];
                var (restockProd, restockInfo, restockBase, restockSec) = productMap[restockSpec.Sku];
                AddIncomingLine(adjInTxn, restockProd, mainLoc, healthyBatchBySku[restockSpec.Sku], restockSec ?? restockBase, 5m, restockInfo.BaseUnitCost, adjustmentTime);
                db.InventoryTxns.Add(adjInTxn);
                draftTxns.Add((adjInTxn, adjustmentTime));

                var adjOutTxn = InventoryTxn.CreateDraft(
                    organizationId: orgId,
                    branchId: b.BranchId,
                    transactionNo: $"ADJ-OUT-{b.Code}-2026-0001",
                    transactionType: InventoryTransactionType.ADJUSTMENT_OUT,
                    idempotencyKey: $"dev-seed:{orgCode}:{b.Code}:adj-out-0001",
                    createdByEmployeeId: creatorEmployeeId,
                    now: adjustmentTime.AddMinutes(15),
                    reasonCode: "DAMAGED_PACKAGING",
                    note: $"Dispensing shelf cycle-count shrinkage/damaged box removal at {b.Name}");

                var shrinkIdx = isFlagship && bIdx == 1 ? 9 : 2;
                var shrinkSpec = products[shrinkIdx];
                var (shrinkProd, _, shrinkBase, shrinkSec) = productMap[shrinkSpec.Sku];
                var shrinkQty = isFlagship && bIdx == 1 ? 6m : 2m; // Brings Maadi Ventolin down to exact 0 on-hand
                AddOutgoingLine(adjOutTxn, shrinkProd, mainLoc, healthyBatchBySku[shrinkSpec.Sku], shrinkSec ?? shrinkBase, shrinkQty, adjustmentTime.AddMinutes(15));
                db.InventoryTxns.Add(adjOutTxn);
                draftTxns.Add((adjOutTxn, adjustmentTime.AddMinutes(15)));

                // 9c. Internal Shelf Replenishment Transfer (paired ADJUSTMENT_OUT from Backroom + ADJUSTMENT_IN to Main Shelves)
                if (bIdx == 0)
                {
                    var transferSpec = products[0];
                    var (transferProd, transferInfo, transferBase, transferSec) = productMap[transferSpec.Sku];
                    var transferUom = transferSec ?? transferBase;
                    var transferBatch = healthyBatchBySku[transferSpec.Sku];

                    var transferOutTxn = InventoryTxn.CreateDraft(
                        organizationId: orgId,
                        branchId: b.BranchId,
                        transactionNo: $"TRF-OUT-{b.Code}-2026-0001",
                        transactionType: InventoryTransactionType.ADJUSTMENT_OUT,
                        idempotencyKey: $"dev-seed:{orgCode}:{b.Code}:trf-out-0001",
                        createdByEmployeeId: creatorEmployeeId,
                        now: transferTime,
                        reasonCode: "INTERNAL_TRANSFER_OUT",
                        note: "Replenishment transfer out from Backroom Bulk Storage to Main Dispensing Shelves");
                    AddOutgoingLine(transferOutTxn, transferProd, backroomLoc, transferBatch, transferUom, 4m, transferTime);
                    db.InventoryTxns.Add(transferOutTxn);
                    draftTxns.Add((transferOutTxn, transferTime));

                    var transferInTxn = InventoryTxn.CreateDraft(
                        organizationId: orgId,
                        branchId: b.BranchId,
                        transactionNo: $"TRF-IN-{b.Code}-2026-0001",
                        transactionType: InventoryTransactionType.ADJUSTMENT_IN,
                        idempotencyKey: $"dev-seed:{orgCode}:{b.Code}:trf-in-0001",
                        createdByEmployeeId: creatorEmployeeId,
                        now: transferTime.AddMinutes(1),
                        reasonCode: "INTERNAL_TRANSFER_IN",
                        note: "Replenishment transfer in to Main Dispensing Shelves from Backroom Bulk Storage");
                    AddIncomingLine(transferInTxn, transferProd, mainLoc, transferBatch, transferUom, 4m, transferInfo.BaseUnitCost, transferTime.AddMinutes(1));
                    db.InventoryTxns.Add(transferInTxn);
                    draftTxns.Add((transferInTxn, transferTime.AddMinutes(1)));
                }
            }

            // CRITICAL: Persist DRAFT headers + lines first so PostgreSQL BEFORE INSERT line trigger validates parent status = 'DRAFT'
            await unitOfWork.SaveChangesAsync(ct);

            // Transition every transaction atomically to POSTED
            foreach (var (txn, postedAt) in draftTxns)
            {
                txn.Post(postedAt);
            }

            await unitOfWork.SaveChangesAsync(ct);

            // 10. Append-Only Audit Logs (integration.AUDIT_LOG)
            var traceId = $"dev-seed-{orgCode.ToLowerInvariant()}-2026";
            db.AuditLogs.Add(new AuditLog(
                organizationId: orgId,
                branchId: branches[0].BranchId,
                actorUserId: creatorUserId,
                actorEmployeeId: creatorEmployeeId,
                actorType: AuditActorType.SYSTEM,
                action: "dev_seed.organization_initialized",
                entitySchema: "identity",
                entityName: "ORGANIZATION",
                entityId: orgId,
                beforeData: null,
                afterData: JsonSerializer.Serialize(new
                {
                    OrganizationCode = orgCode,
                    Name = orgName,
                    BranchesCount = branches.Length,
                    UsersCount = staff.Length,
                    ProductsCount = products.Length
                }),
                traceId: traceId,
                createdAt: now));

            foreach (var (txn, postedAt) in draftTxns)
            {
                db.AuditLogs.Add(new AuditLog(
                    organizationId: orgId,
                    branchId: txn.BranchId,
                    actorUserId: creatorUserId,
                    actorEmployeeId: creatorEmployeeId,
                    actorType: AuditActorType.SYSTEM,
                    action: "POST",
                    entitySchema: "inventory",
                    entityName: "INVENTORY_TXN",
                    entityId: txn.InventoryTxnId,
                    beforeData: null,
                    afterData: JsonSerializer.Serialize(new
                    {
                        txn.TransactionNo,
                        TransactionType = txn.TransactionType.ToString(),
                        Status = txn.Status.ToString(),
                        LineCount = txn.Lines.Count
                    }),
                    traceId: traceId,
                    createdAt: postedAt));
            }

            await unitOfWork.CommitTransactionAsync(ct);

            _logger.LogInformation(
                "Seeded tenant '{OrgName}' ({OrgCode}): {Branches} branches, {Staff} users, {Products} products, {Txns} posted ledger transactions, {Balances} stock balances.",
                orgName, orgCode, branches.Length, staff.Length, products.Length, draftTxns.Count, balances.Count);
        }
        catch
        {
            await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    private static void SetPrivateProperty<TEntity, TValue>(TEntity entity, string propertyName, TValue value)
    {
        var prop = typeof(TEntity).GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException($"Property '{propertyName}' was not found on '{typeof(TEntity).Name}'.");
        prop.SetValue(entity, value);
    }

    private static SeedProductSpec[] BuildMedCareCatalog() =>
    [
        new("MED-AUG-1000", "622100100001", "RX-ABX", "Augmentin 1g Film-Coated Tablets", "Amoxicillin / Clavulanic Acid 875mg/125mg", "GSK", "TAB", 0.00m, true, 60, 7.20m, false,
            [new("TAB", "Tablet", 1m, 10.50m, true), new("STRIP", "Strip (7 Tablets)", 7m, 70.00m, false), new("BOX", "Box (14 Tablets)", 14m, 138.00m, false)]),
        new("MED-PAN-500X", "622100100002", "OTC-PAIN", "Panadol Extra Advance 500mg", "Paracetamol 500mg / Caffeine 65mg", "Haleon", "TAB", 0.00m, true, 60, 1.85m, false,
            [new("TAB", "Tablet", 1m, 2.75m, true), new("STRIP", "Strip (8 Tablets)", 8m, 21.00m, false), new("BOX", "Box (24 Tablets)", 24m, 60.00m, false)]),
        new("MED-CON-005", "622100100003", "RX-CV", "Concor 5mg Tablets", "Bisoprolol Fumarate 5mg", "Merck", "TAB", 0.00m, true, 90, 2.10m, false,
            [new("TAB", "Tablet", 1m, 3.20m, true), new("STRIP", "Strip (10 Tablets)", 10m, 30.00m, false), new("BOX", "Box (30 Tablets)", 30m, 87.00m, false)]),
        new("MED-LIP-020", "622100100004", "RX-CV", "Lipitor 20mg Tablets", "Atorvastatin Calcium 20mg", "Viatris", "TAB", 0.00m, true, 90, 5.40m, false,
            [new("TAB", "Tablet", 1m, 7.80m, true), new("STRIP", "Strip (10 Tablets)", 10m, 76.00m, false), new("BOX", "Box (30 Tablets)", 30m, 222.00m, false)]),
        new("MED-GLU-1000", "622100100005", "RX-DM", "Glucophage 1000mg XR", "Metformin Hydrochloride 1000mg Extended-Release", "Merck", "TAB", 0.00m, true, 90, 2.60m, false,
            [new("TAB", "Tablet", 1m, 3.80m, true), new("STRIP", "Strip (15 Tablets)", 15m, 55.00m, false), new("BOX", "Box (30 Tablets)", 30m, 108.00m, false)]),
        new("MED-LAN-100P", "622100100006", "RX-DM", "Lantus SoloStar 100 U/mL Pen", "Insulin Glargine 100 Units/mL Pre-Filled Pen", "Sanofi", "PEN", 0.00m, true, 90, 145.00m, true,
            [new("PEN", "Pre-Filled Pen (3mL)", 1m, 195.00m, true), new("BOX", "Box (5 Pens)", 5m, 950.00m, false)]),
        new("MED-NEX-040", "622100100007", "RX-GI", "Nexium 40mg Tablets", "Esomeprazole Magnesium 40mg", "AstraZeneca", "TAB", 0.00m, true, 60, 9.80m, false,
            [new("TAB", "Tablet", 1m, 14.50m, true), new("STRIP", "Strip (7 Tablets)", 7m, 98.00m, false), new("BOX", "Box (14 Tablets)", 14m, 192.00m, false)]),
        new("MED-CAT-050", "622100100008", "OTC-PAIN", "Cataflam 50mg Tablets", "Diclofenac Potassium 50mg", "Novartis", "TAB", 0.00m, true, 60, 2.25m, false,
            [new("TAB", "Tablet", 1m, 3.40m, true), new("STRIP", "Strip (10 Tablets)", 10m, 33.00m, false), new("BOX", "Box (20 Tablets)", 20m, 64.00m, false)]),
        new("MED-ZYR-010", "622100100009", "OTC-COLD", "Zyrtec 10mg Tablets", "Cetirizine Dihydrochloride 10mg", "UCB", "TAB", 0.00m, true, 60, 2.50m, false,
            [new("TAB", "Tablet", 1m, 3.75m, true), new("STRIP", "Strip (10 Tablets)", 10m, 36.00m, false), new("BOX", "Box (20 Tablets)", 20m, 70.00m, false)]),
        new("MED-VEN-100I", "622100100010", "OTC-COLD", "Ventolin Evohaler 100mcg", "Salbutamol Sulfate 100mcg/actuation Pressurized Inhaler", "GSK", "INH", 0.00m, true, 90, 58.00m, false,
            [new("INH", "Inhaler (200 Doses)", 1m, 82.00m, true)]),
        new("MED-CLX-040S", "622100100011", "RX-CV", "Clexane 40mg/0.4mL Pre-Filled Syringes", "Enoxaparin Sodium 4000 IU", "Sanofi", "SYR", 0.00m, true, 90, 74.00m, true,
            [new("SYR", "Pre-Filled Syringe (0.4mL)", 1m, 105.00m, true), new("BOX", "Box (2 Syringes)", 2m, 204.00m, false)]),
        new("MED-VOL-050G", "622100100012", "OTC-PAIN", "Voltaren Emulgel 50g", "Diclofenac Diethylammonium 1.16% Topical Gel", "Haleon", "TUBE", 0.00m, true, 60, 48.00m, false,
            [new("TUBE", "Tube (50g)", 1m, 72.00m, true)]),
        new("MED-BEP-030G", "622100100013", "DERM", "Bepanthen Moisturizing Cream 30g", "Dexpanthenol 5% Topical Cream", "Bayer", "TUBE", 0.14m, true, 60, 78.00m, false,
            [new("TUBE", "Tube (30g)", 1m, 118.00m, true)]),
        new("MED-PLV-075", "622100100014", "RX-CV", "Plavix 75mg Tablets", "Clopidogrel Bisulfate 75mg", "Sanofi", "TAB", 0.00m, true, 90, 8.10m, false,
            [new("TAB", "Tablet", 1m, 11.50m, true), new("STRIP", "Strip (14 Tablets)", 14m, 158.00m, false), new("BOX", "Box (28 Tablets)", 28m, 310.00m, false)]),
        new("MED-CTL-040", "622100100015", "RX-GI", "Controloc 40mg Tablets", "Pantoprazole Sodium 40mg Gastro-Resistant", "Takeda", "TAB", 0.00m, true, 60, 6.40m, false,
            [new("TAB", "Tablet", 1m, 9.20m, true), new("STRIP", "Strip (14 Tablets)", 14m, 126.00m, false), new("BOX", "Box (28 Tablets)", 28m, 245.00m, false)]),
        new("MED-XAR-020", "622100100016", "RX-CV", "Xarelto 20mg Tablets", "Rivaroxaban 20mg", "Bayer", "TAB", 0.00m, true, 90, 26.50m, false,
            [new("TAB", "Tablet", 1m, 36.00m, true), new("STRIP", "Strip (14 Tablets)", 14m, 495.00m, false), new("BOX", "Box (28 Tablets)", 28m, 980.00m, false)]),
        new("MED-EUT-100", "622100100017", "RX-DM", "Euthyrox 100mcg Tablets", "Levothyroxine Sodium 100mcg", "Merck", "TAB", 0.00m, true, 90, 1.15m, false,
            [new("TAB", "Tablet", 1m, 1.75m, true), new("STRIP", "Strip (25 Tablets)", 25m, 42.00m, false), new("BOX", "Box (50 Tablets)", 50m, 80.00m, false)]),
        new("MED-DAF-500", "622100100018", "RX-CV", "Daflon 500mg Tablets", "Micronized Purified Flavonoid Fraction (Diosmin 450mg / Hesperidin 50mg)", "Servier", "TAB", 0.00m, true, 60, 3.90m, false,
            [new("TAB", "Tablet", 1m, 5.50m, true), new("STRIP", "Strip (15 Tablets)", 15m, 80.00m, false), new("BOX", "Box (30 Tablets)", 30m, 156.00m, false)]),
        new("MED-TEL-180", "622100100019", "OTC-COLD", "Telfast 180mg Tablets", "Fexofenadine Hydrochloride 180mg", "Sanofi", "TAB", 0.00m, true, 60, 4.10m, false,
            [new("TAB", "Tablet", 1m, 6.00m, true), new("STRIP", "Strip (10 Tablets)", 10m, 58.00m, false), new("BOX", "Box (20 Tablets)", 20m, 112.00m, false)]),
        new("MED-ANT-200", "622100100020", "RX-GI", "Antinal 200mg Capsules", "Nifuroxazide 200mg", "Amoun", "CAP", 0.00m, true, 60, 1.40m, false,
            [new("CAP", "Capsule", 1m, 2.20m, true), new("STRIP", "Strip (12 Capsules)", 12m, 25.00m, false), new("BOX", "Box (24 Capsules)", 24m, 48.00m, false)]),
        new("MED-HIB-1000", "622100100021", "RX-ABX", "Hibiotic 1g Tablets", "Amoxicillin / Clavulanate 875mg/125mg", "Amoun", "TAB", 0.00m, true, 60, 5.10m, false,
            [new("TAB", "Tablet", 1m, 7.50m, true), new("STRIP", "Strip (8 Tablets)", 8m, 58.00m, false), new("BOX", "Box (16 Tablets)", 16m, 112.00m, false)]),
        new("MED-BRU-600", "622100100022", "OTC-PAIN", "Brufen 600mg Tablets", "Ibuprofen 600mg", "Abbott", "TAB", 0.00m, true, 60, 1.95m, false,
            [new("TAB", "Tablet", 1m, 2.90m, true), new("STRIP", "Strip (10 Tablets)", 10m, 28.00m, false), new("BOX", "Box (30 Tablets)", 30m, 81.00m, false)]),
        new("MED-JAN-5010", "622100100023", "RX-DM", "Janumet 50/1000mg Tablets", "Sitagliptin 50mg / Metformin HCl 1000mg", "MSD", "TAB", 0.00m, true, 90, 9.60m, false,
            [new("TAB", "Tablet", 1m, 13.50m, true), new("STRIP", "Strip (14 Tablets)", 14m, 185.00m, false), new("BOX", "Box (56 Tablets)", 56m, 725.00m, false)]),
        new("MED-OMR-M3BP", "622100100024", "DEV", "Omron M3 Comfort Blood Pressure Monitor", "Upper Arm Automatic Sphygmomanometer (Intelli Wrap Cuff)", "Omron", "UNIT", 0.14m, false, 0, 2150.00m, false,
            [new("UNIT", "Device Unit", 1m, 2890.00m, true)]),
        new("MED-ACC-STRP", "622100100025", "DEV", "Accu-Chek Instant Blood Glucose Test Strips", "Glucose Dehydrogenase Diagnostic Strips", "Roche Diagnostics", "STRIP", 0.14m, true, 60, 6.20m, false,
            [new("STRIP", "Test Strip", 1m, 9.00m, true), new("BOX", "Vial Box (50 Strips)", 50m, 410.00m, false)]),
        new("MED-BET-120M", "622100100026", "DERM", "Betadine Antiseptic Solution 120mL", "Povidone-Iodine 10% w/v Solution", "Mundipharma", "BTL", 0.00m, true, 60, 44.00m, false,
            [new("BTL", "Bottle (120mL)", 1m, 65.00m, true)]),
        new("MED-OTR-010M", "622100100027", "OTC-COLD", "Otrivin Adult Nasal Drops 0.1%", "Xylometazoline Hydrochloride 0.1% Nasal Solution", "Haleon", "BTL", 0.00m, true, 60, 19.00m, false,
            [new("BTL", "Dropper Bottle (10mL)", 1m, 29.00m, true)]),
        new("MED-GAV-150M", "622100100028", "RX-GI", "Gaviscon Advance Peppermint 150mL", "Sodium Alginate 1000mg / Potassium Bicarbonate 200mg", "Reckitt", "BTL", 0.00m, true, 60, 92.00m, false,
            [new("BTL", "Bottle (150mL)", 1m, 132.00m, true)]),
        new("MED-STR-HL24", "622100100029", "OTC-COLD", "Strepsils Honey & Lemon Lozenges", "Amylmetacresol 0.6mg / Dichlorobenzyl Alcohol 1.2mg", "Reckitt", "LOZ", 0.00m, true, 60, 3.20m, false,
            [new("LOZ", "Lozenge", 1m, 5.00m, true), new("STRIP", "Strip (12 Lozenges)", 12m, 56.00m, false), new("BOX", "Box (24 Lozenges)", 24m, 108.00m, false)]),
        new("MED-LRP-SPF50", "622100100030", "DERM", "La Roche-Posay Anthelios UVMune 400 SPF 50+", "Invisible Fluid Very High Protection Sunscreen 50mL", "La Roche-Posay", "BTL", 0.14m, true, 90, 680.00m, false,
            [new("BTL", "Bottle (50mL)", 1m, 945.00m, true)]),
        new("MED-LYR-075", "622100100031", "RX-CNS", "Lyrica 75mg Capsules", "Pregabalin 75mg", "Viatris", "CAP", 0.00m, true, 90, 5.20m, false,
            [new("CAP", "Capsule", 1m, 7.60m, true), new("STRIP", "Strip (14 Capsules)", 14m, 102.00m, false), new("BOX", "Box (56 Capsules)", 56m, 398.00m, false)]),
        new("MED-TEG-200", "622100100032", "RX-CNS", "Tegretol 200mg CR Tablets", "Carbamazepine 200mg Controlled-Release", "Novartis", "TAB", 0.00m, true, 90, 2.30m, false,
            [new("TAB", "Tablet", 1m, 3.50m, true), new("STRIP", "Strip (10 Tablets)", 10m, 33.00m, false), new("BOX", "Box (50 Tablets)", 50m, 160.00m, false)])
    ];

    private static SeedProductSpec[] BuildAlNourCatalog() =>
    [
        new("AN-ZIT-500", "622200200001", "AN-ABX", "Zithromax 500mg Tablets", "Azithromycin Dihydrate 500mg", "Pfizer", "TAB", 0.00m, true, 60, 26.00m, false,
            [new("TAB", "Tablet", 1m, 36.00m, true), new("BOX", "Box (3 Tablets)", 3m, 105.00m, false)]),
        new("AN-CRS-010", "622200200002", "AN-CHRON", "Crestor 10mg Tablets", "Rosuvastatin Calcium 10mg", "AstraZeneca", "TAB", 0.00m, true, 90, 8.90m, false,
            [new("TAB", "Tablet", 1m, 12.80m, true), new("STRIP", "Strip (14 Tablets)", 14m, 175.00m, false), new("BOX", "Box (28 Tablets)", 28m, 342.00m, false)]),
        new("AN-AMA-002", "622200200003", "AN-CHRON", "Amaryl 2mg Tablets", "Glimepiride 2mg", "Sanofi", "TAB", 0.00m, true, 90, 2.15m, false,
            [new("TAB", "Tablet", 1m, 3.20m, true), new("STRIP", "Strip (15 Tablets)", 15m, 46.00m, false), new("BOX", "Box (30 Tablets)", 30m, 89.00m, false)]),
        new("AN-CIP-500", "622200200004", "AN-ABX", "Ciprobay 500mg Tablets", "Ciprofloxacin Hydrochloride 500mg", "Bayer", "TAB", 0.00m, true, 60, 8.40m, false,
            [new("TAB", "Tablet", 1m, 12.00m, true), new("BOX", "Box (10 Tablets)", 10m, 116.00m, false)]),
        new("AN-MOT-010", "622200200005", "AN-GI", "Motilium 10mg Tablets", "Domperidone 10mg", "Janssen", "TAB", 0.00m, true, 60, 2.00m, false,
            [new("TAB", "Tablet", 1m, 3.10m, true), new("STRIP", "Strip (10 Tablets)", 10m, 30.00m, false), new("BOX", "Box (30 Tablets)", 30m, 87.00m, false)]),
        new("AN-COV-005", "622200200006", "AN-CHRON", "Coversyl 5mg Tablets", "Perindopril Arginine 5mg", "Servier", "TAB", 0.00m, true, 90, 4.90m, false,
            [new("TAB", "Tablet", 1m, 7.20m, true), new("BOX", "Bottle (30 Tablets)", 30m, 210.00m, false)]),
        new("AN-EXF-516", "622200200007", "AN-CHRON", "Exforge 5/160mg Tablets", "Amlodipine 5mg / Valsartan 160mg", "Novartis", "TAB", 0.00m, true, 90, 7.60m, false,
            [new("TAB", "Tablet", 1m, 11.00m, true), new("STRIP", "Strip (14 Tablets)", 14m, 150.00m, false), new("BOX", "Box (28 Tablets)", 28m, 294.00m, false)]),
        new("AN-FLG-500", "622200200008", "AN-ABX", "Flagyl 500mg Tablets", "Metronidazole 500mg", "Sanofi", "TAB", 0.00m, true, 60, 1.50m, false,
            [new("TAB", "Tablet", 1m, 2.30m, true), new("STRIP", "Strip (10 Tablets)", 10m, 22.00m, false), new("BOX", "Box (20 Tablets)", 20m, 42.00m, false)]),
        new("AN-LOS-020", "622200200009", "AN-GI", "Losec 20mg Capsules", "Omeprazole 20mg Gastro-Resistant", "AstraZeneca", "CAP", 0.00m, true, 60, 5.80m, false,
            [new("CAP", "Capsule", 1m, 8.50m, true), new("STRIP", "Strip (7 Capsules)", 7m, 58.00m, false), new("BOX", "Box (14 Capsules)", 14m, 112.00m, false)]),
        new("AN-CLR-010", "622200200010", "AN-OTC", "Claritine 10mg Tablets", "Loratadine 10mg", "Bayer", "TAB", 0.00m, true, 60, 2.60m, false,
            [new("TAB", "Tablet", 1m, 3.90m, true), new("STRIP", "Strip (10 Tablets)", 10m, 38.00m, false), new("BOX", "Box (20 Tablets)", 20m, 74.00m, false)]),
        new("AN-PCF-DAY", "622200200011", "AN-OTC", "Panadol Cold & Flu Day Caplets", "Paracetamol 500mg / Phenylephrine 5mg / Caffeine 25mg", "Haleon", "CAP", 0.00m, true, 60, 2.10m, false,
            [new("CAP", "Caplet", 1m, 3.25m, true), new("STRIP", "Strip (12 Caplets)", 12m, 38.00m, false), new("BOX", "Box (24 Caplets)", 24m, 74.00m, false)]),
        new("AN-MUC-125", "622200200012", "AN-OTC", "Mucophylline Syrup 125mL", "Acefylline Piperazine / Bromhexine HCl", "Misr Pharma", "BTL", 0.00m, true, 60, 22.00m, false,
            [new("BTL", "Bottle (125mL)", 1m, 34.00m, true)]),
        new("AN-NRB-020", "622200200013", "AN-VIT", "Neurobion Coated Tablets", "Vitamin B1 / Vitamin B6 / Vitamin B12", "P&G Health", "TAB", 0.00m, true, 90, 2.70m, false,
            [new("TAB", "Tablet", 1m, 4.00m, true), new("STRIP", "Strip (10 Tablets)", 10m, 39.00m, false), new("BOX", "Box (20 Tablets)", 20m, 76.00m, false)]),
        new("AN-OST-030", "622200200014", "AN-VIT", "Osteocare Original Tablets", "Calcium / Magnesium / Vitamin D3 / Zinc", "Vitabiotics", "TAB", 0.00m, true, 90, 2.40m, false,
            [new("TAB", "Tablet", 1m, 3.60m, true), new("STRIP", "Strip (15 Tablets)", 15m, 52.00m, false), new("BOX", "Box (30 Tablets)", 30m, 99.00m, false)]),
        new("AN-BRN-IRT", "622200200015", "AN-DEV", "Braun ThermoScan 7 Ear Thermometer", "Infrared Digital Tympanic Thermometer (Age Precision)", "Braun", "UNIT", 0.14m, false, 0, 2450.00m, false,
            [new("UNIT", "Device Unit", 1m, 3250.00m, true)]),
        new("AN-NOV-100", "622200200016", "AN-CHRON", "NovoRapid FlexPen 100 U/mL", "Insulin Aspart 100 Units/mL Pre-Filled Pen", "Novo Nordisk", "PEN", 0.00m, true, 90, 128.00m, true,
            [new("PEN", "Pre-Filled Pen (3mL)", 1m, 172.00m, true), new("BOX", "Box (5 Pens)", 5m, 835.00m, false)])
    ];

    private static SeedProductSpec[] BuildGreenLeafCatalog() =>
    [
        new("GL-CEN-030", "622300300001", "GL-VIT", "Centrum Adults Multivitamin Tablets", "Complete A to Zinc Daily Multivitamin", "Haleon", "TAB", 0.00m, true, 90, 8.20m, false,
            [new("TAB", "Tablet", 1m, 12.00m, true), new("BTL", "Bottle (30 Tablets)", 30m, 340.00m, false)]),
        new("GL-RDX-100", "622300300002", "GL-VIT", "Redoxon Vitamin C 1000mg Effervescent", "Ascorbic Acid 1000mg / Zinc 10mg", "Bayer", "TAB", 0.00m, true, 60, 7.50m, false,
            [new("TAB", "Effervescent Tablet", 1m, 11.00m, true), new("TUBE", "Tube (15 Tablets)", 15m, 155.00m, false)]),
        new("GL-CRV-236", "622300300003", "GL-SKIN", "CeraVe Foaming Facial Cleanser 236mL", "Ceramides / Niacinamide / Hyaluronic Acid", "CeraVe", "BTL", 0.14m, true, 90, 410.00m, false,
            [new("BTL", "Pump Bottle (236mL)", 1m, 575.00m, true)]),
        new("GL-BIO-250", "622300300004", "GL-SKIN", "Bioderma Sensibio H2O Micellar Water 250mL", "Dermatological Soothing Micellar Cleanser", "Bioderma", "BTL", 0.14m, true, 90, 390.00m, false,
            [new("BTL", "Bottle (250mL)", 1m, 545.00m, true)]),
        new("GL-NIV-100", "622300300005", "GL-SKIN", "Nivea Soft Moisturizing Cream 100mL", "Jojoba Oil & Vitamin E Refreshing Cream", "Beiersdorf", "JAR", 0.14m, true, 90, 82.00m, false,
            [new("JAR", "Jar (100mL)", 1m, 125.00m, true)]),
        new("GL-DET-250", "622300300006", "GL-FIRST", "Dettol Antiseptic Liquid 250mL", "Chloroxylenol 4.8% w/v Antiseptic Disinfectant", "Reckitt", "BTL", 0.14m, true, 90, 95.00m, false,
            [new("BTL", "Bottle (250mL)", 1m, 138.00m, true)]),
        new("GL-HAN-020", "622300300007", "GL-FIRST", "Hansaplast Elastic Fabric Plasters", "Breathable Flexible Wound Strips (Box of 20)", "Beiersdorf", "STRIP", 0.14m, false, 0, 2.20m, false,
            [new("STRIP", "Single Plaster", 1m, 3.50m, true), new("BOX", "Box (20 Plasters)", 20m, 62.00m, false)]),
        new("GL-SYS-010", "622300300008", "GL-CARE", "Systane Ultra Lubricant Eye Drops 10mL", "Polyethylene Glycol 400 / Propylene Glycol", "Alcon", "BTL", 0.00m, true, 60, 145.00m, false,
            [new("BTL", "Dropper Bottle (10mL)", 1m, 205.00m, true)]),
        new("GL-MAA-180", "622300300009", "GL-CARE", "Maalox Plus Oral Suspension 180mL", "Aluminum Hydroxide / Magnesium Hydroxide / Simethicone", "Sanofi", "BTL", 0.00m, true, 60, 52.00m, false,
            [new("BTL", "Bottle (180mL)", 1m, 76.00m, true)]),
        new("GL-SEN-075", "622300300010", "GL-CARE", "Sensodyne Repair & Protect Toothpaste 75mL", "NovaMin Calcium Sodium Phosphosilicate / Fluoride", "Haleon", "TUBE", 0.14m, true, 90, 92.00m, false,
            [new("TUBE", "Tube (75mL)", 1m, 135.00m, true)]),
        new("GL-OMG-030", "622300300011", "GL-VIT", "Omega-3 Plus Soft Gelatin Capsules", "Fish Oil 1000mg / Wheat Germ Oil 100mg", "SEDICO", "CAP", 0.00m, true, 90, 2.30m, false,
            [new("CAP", "Softgel Capsule", 1m, 3.40m, true), new("STRIP", "Strip (10 Capsules)", 10m, 33.00m, false), new("BOX", "Box (30 Capsules)", 30m, 96.00m, false)])
    ];
}
