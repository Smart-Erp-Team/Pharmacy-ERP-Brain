using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Integration.DTOs;

namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface ICanonicalInventoryService
{
    Task<Result<PagedResult<CanonicalInventoryItemDto>>> GetCanonicalInventoryAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        long? cursor,
        int pageSize,
        CancellationToken ct);
}