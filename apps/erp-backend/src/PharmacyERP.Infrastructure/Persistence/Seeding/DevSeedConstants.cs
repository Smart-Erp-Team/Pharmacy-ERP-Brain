using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace PharmacyERP.Infrastructure.Persistence.Seeding;

/// <summary>
/// Deterministic identifiers, credentials, and realistic English-only development seed blueprints
/// for the three multi-tenant development organizations.
/// </summary>
internal static class DevSeedConstants
{
    public const string FlagshipOrganizationCode = "MEDCARE";

    // Fixed Tenant (Organization) IDs
    public static readonly Guid MedCareOrgId = Guid.Parse("11111111-1111-4111-8111-111111111101");
    public static readonly Guid AlNourOrgId = Guid.Parse("22222222-2222-4222-8222-222222222202");
    public static readonly Guid GreenLeafOrgId = Guid.Parse("33333333-3333-4333-8333-333333333303");

    // Fixed Branch IDs — Tenant 1: MedCare Wellness Pharmacies
    public static readonly Guid MedCareDowntownBranchId = Guid.Parse("11111111-2222-4111-8111-000000000001");
    public static readonly Guid MedCareMaadiBranchId = Guid.Parse("11111111-2222-4111-8111-000000000002");
    public static readonly Guid MedCareNasrCityBranchId = Guid.Parse("11111111-2222-4111-8111-000000000003");

    // Fixed Branch IDs — Tenant 2: Al-Nour Clinical Pharmacy Group
    public static readonly Guid AlNourHeliopolisBranchId = Guid.Parse("22222222-2222-4222-8222-000000000001");
    public static readonly Guid AlNourSheikhZayedBranchId = Guid.Parse("22222222-2222-4222-8222-000000000002");

    // Fixed Branch ID — Tenant 3: GreenLeaf Family Pharmacy
    public static readonly Guid GreenLeafDokkiBranchId = Guid.Parse("33333333-2222-4333-8333-000000000001");

    // Development Passwords (hashed at runtime with production PasswordHasherService)
    public const string MedCarePassword = "MedCare@2026!";
    public const string AlNourPassword = "AlNour@2026!";
    public const string GreenLeafPassword = "GreenLeaf@2026!";

    // Development Clear-Text Enrollment Tokens (hashed with SHA-256 into identity.BRANCH_ENROLLMENT)
    public const string MedCareDowntownEnrollmentToken = "medcare-downtown-enroll-dev-2026";
    public const string MedCareMaadiEnrollmentToken = "medcare-maadi-enroll-dev-2026";
    public const string MedCareNasrCityEnrollmentToken = "medcare-nasrcity-enroll-dev-2026";
    public const string AlNourHeliopolisEnrollmentToken = "alnour-heliopolis-enroll-dev-2026";
    public const string AlNourSheikhZayedEnrollmentToken = "alnour-sheikhzayed-enroll-dev-2026";
    public const string GreenLeafDokkiEnrollmentToken = "greenleaf-dokki-enroll-dev-2026";

    // Location Codes
    public const string MainSellableCode = "MAIN-SELLABLE";
    public const string BackroomBulkCode = "BACKROOM-BULK";
    public const string ColdChainCode = "COLD-CHAIN";
    public const string QuarantineCode = "MAIN-QUARANTINE";

    /// <summary>
    /// Computes a deterministic RFC-4122 v5-like GUID from a stable key so seeded entity IDs
    /// remain identical across machines and match FRONTEND_TEST_DATA_GUIDE.md.
    /// </summary>
    public static Guid DeterministicGuid(string key)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("PharmacyERP.DevSeed:" + key));
        Span<byte> bytes = stackalloc byte[16];
        hash.AsSpan(0, 16).CopyTo(bytes);
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x40);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes);
    }

    /// <summary>
    /// Computes a valid 13-digit EAN-13 barcode from a 12-digit numeric prefix.
    /// </summary>
    public static string MakeEan13(string first12Digits)
    {
        if (first12Digits.Length != 12)
        {
            throw new ArgumentException("EAN-13 prefix must be exactly 12 digits.", nameof(first12Digits));
        }

        int sum = 0;
        for (int i = 0; i < 12; i++)
        {
            int digit = first12Digits[i] - '0';
            sum += (i % 2 == 0) ? digit : digit * 3;
        }

        int checkDigit = (10 - (sum % 10)) % 10;
        return first12Digits + checkDigit.ToString();
    }

    public static byte[] HashEnrollmentToken(string clearToken)
        => SHA256.HashData(Encoding.UTF8.GetBytes(clearToken));
}

internal sealed record SeedUomSpec(
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal SaleUnitPrice,
    bool IsBase);

internal sealed record SeedProductSpec(
    string Sku,
    string Ean12Prefix,
    string CategoryCode,
    string Name,
    string GenericName,
    string BrandName,
    string BaseUomCode,
    decimal TaxRate,
    bool LotTrackingRequired,
    int ExpiryAlertDays,
    decimal BaseUnitCost,
    bool IsColdChain,
    IReadOnlyList<SeedUomSpec> Uoms);

internal sealed record SeedCategorySpec(
    string Code,
    string Name,
    string Description,
    string? ParentCode = null);

internal sealed record SeedStaffSpec(
    string EmployeeNo,
    string FullName,
    string Email,
    string Phone,
    string JobTitle,
    Guid PrimaryBranchId,
    PharmacyERP.Domain.Enums.UserRole Role,
    PharmacyERP.Domain.Enums.BranchScope BranchScope,
    Guid[] AssignedBranchIds,
    bool IsActive = true,
    string Street = "14 El-Tahrir Street",
    string City = "Cairo",
    string Region = "Cairo",
    string PostalCode = "11511");
