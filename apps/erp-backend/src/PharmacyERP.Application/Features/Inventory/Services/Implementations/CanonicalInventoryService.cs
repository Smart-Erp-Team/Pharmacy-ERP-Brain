using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class CanonicalInventoryService : ICanonicalInventoryService
{
    private readonly ICurrentUser _currentUser;
    private readonly IStockBalanceRepository _stockBalanceRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITenantContext _tenantContext;

    public CanonicalInventoryService(
        ICurrentUser currentUser,
        IStockBalanceRepository stockBalanceRepository,
        IDateTimeProvider dateTimeProvider,
        ITenantContext tenantContext)
    {
        _currentUser = currentUser;
        _stockBalanceRepository = stockBalanceRepository;
        _dateTimeProvider = dateTimeProvider;
        _tenantContext = tenantContext;
    }

    public async Task<Result<PagedResult<CanonicalInventoryItemDto>>> GetCanonicalInventoryAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        long? cursor,
        int pageSize,
        CancellationToken ct)
    {
        
        if (!_currentUser.CanAccessBranch(branchId))
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.FORBIDDEN_BRANCH,
                ErrorMessages.ForbiddenBranchAccess);
        }

        var businessDate = _dateTimeProvider.GetOrganizationBusinessDate("UTC");

        
        var balances = await _stockBalanceRepository.GetBalancesWithDetailsAsync(
            organizationId, branchId, productId, null, null, ct);

        
        if (updatedSince.HasValue)
        {
            balances = balances.Where(b => b.UpdatedAt >= updatedSince.Value).ToList();
        }

     
        var allItems = balances
            .GroupBy(b => new { b.OrganizationId, b.Location.BranchId, b.Batch.ProductId, b.LocationId })
            .Select(g =>
            {
                var firstBalance = g.First();

                var lots = g.Select(b =>
                {
                   
                    bool isAvailable = b.Location.IsSellable && b.Location.IsActive && b.Batch.IsEligibleForSale(businessDate);
                    return new CanonicalInventoryLotDto(
                        BatchId: b.BatchId,
                        BatchNumber: b.Batch.BatchNumber,
                        QuantityOnHandBase: b.OnHandQtyBase,
                        AvailableQuantityBase: isAvailable ? b.OnHandQtyBase : 0m,
                        ManufacturedOn: b.Batch.ManufacturedOn,
                        ExpiresOn: b.Batch.ExpiresOn,
                        QualityStatus: b.Batch.QualityStatus.ToString()
                    );
                }).ToList();

                var totalOnHand = lots.Sum(l => l.QuantityOnHandBase);
                var totalAvailable = lots.Sum(l => l.AvailableQuantityBase);

                var averageUnitCostBase = totalOnHand > 0
                    ? Math.Round(g.Sum(b => b.OnHandQtyBase * b.AverageUnitCost) / totalOnHand, 4, MidpointRounding.AwayFromZero)
                    : 0m;

                return new CanonicalInventoryItemDto(
                    OrganizationId: g.Key.OrganizationId,
                    BranchId: g.Key.BranchId,
                    ProductId: g.Key.ProductId,
                    LocationId: g.Key.LocationId,
                    BaseUomCode: firstBalance.Batch.Product.BaseUomCode, 
                    QuantityOnHandBase: totalOnHand,
                    AvailableQuantityBase: totalAvailable,
                    AverageUnitCostBase: averageUnitCostBase,
                    ReorderPointBase: firstBalance.Batch.Product.ReorderRules
                        .FirstOrDefault(r => r.BranchId == branchId && r.IsActive)?.ReorderPointBase,
                    Lots: lots,
                    UpdatedAt: g.Max(b => b.UpdatedAt)
                );
            })
            .OrderBy(x => x.ProductId).ThenBy(x => x.LocationId)
            .ToList();

        var page = cursor.HasValue ? ((int)cursor.Value / pageSize) + 1 : 1;
        var items = allItems
            .Skip(cursor.HasValue ? (int)cursor.Value : 0)
            .Take(pageSize)
            .ToList();

        var pagedResult = new PagedResult<CanonicalInventoryItemDto>(
            items,
            page,
            pageSize,
            allItems.Count
        );

        return Result<PagedResult<CanonicalInventoryItemDto>>.Success(pagedResult);
    }
}