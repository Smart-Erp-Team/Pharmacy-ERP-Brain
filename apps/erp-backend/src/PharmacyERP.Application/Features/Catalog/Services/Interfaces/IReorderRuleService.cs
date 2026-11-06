using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Services.Interfaces;

public interface IReorderRuleService
{
    Task<Result<ReorderRuleDto>> GetReorderRuleAsync(Guid branchId, Guid productId, CancellationToken ct = default);

    Task<Result<ReorderRuleDto>> UpsertReorderRuleAsync(Guid branchId, Guid productId, UpsertReorderRuleRequest request, CancellationToken ct = default);
}

