using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Integration.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Services.Interfaces;

/// <summary>
/// Service interface for Stage 1 canonical catalog read feed and approved AI configuration writes.
/// </summary>
public interface ICanonicalCatalogService
{
    /// <summary>
    /// Retrieves a page of canonical product representations supporting optional updatedSince and cursor-based paging.
    /// </summary>
    Task<Result<CanonicalProductFeedPageDto>> GetCanonicalProductsFeedAsync(
        DateTimeOffset? updatedSince,
        string? cursor,
        int limit = 50,
        CancellationToken ct = default);

    /// <summary>
    /// Executes an approved AI-assisted product configuration write (POST /api/v1/canonical/configuration/products).
    /// Restricted to Cloud runtime mode and Admin and Pharmacist roles.
    /// </summary>
    Task<Result<CanonicalWriteResultDto>> ConfigureProductAsync(
        CanonicalProductConfigurationRequest request,
        CancellationToken ct = default);

    /// <summary>
    /// Executes an approved AI-assisted reorder rule configuration write (PUT /api/v1/canonical/configuration/reorder-rules).
    /// Restricted to Cloud runtime mode and Admin and Pharmacist roles.
    /// </summary>
    Task<Result<CanonicalWriteResultDto>> ConfigureReorderRuleAsync(
        CanonicalReorderRuleConfigurationRequest request,
        CancellationToken ct = default);
}

