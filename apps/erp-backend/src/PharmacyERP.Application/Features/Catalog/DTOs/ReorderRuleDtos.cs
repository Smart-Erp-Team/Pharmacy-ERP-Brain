namespace PharmacyERP.Application.Features.Catalog.DTOs;

public sealed record UpsertReorderRuleRequest(
    decimal ReorderPointBase,
    decimal ReorderQuantityBase,
    decimal? MaxQuantityBase,
    bool IsActive,
    string IdempotencyKey);

public sealed record ReorderRuleDto(
    Guid ReorderRuleId,
    Guid OrganizationId,
    Guid BranchId,
    Guid ProductId,
    decimal ReorderPointBase,
    decimal ReorderQuantityBase,
    decimal? MaxQuantityBase,
    bool IsActive,
    DateTimeOffset UpdatedAt);

