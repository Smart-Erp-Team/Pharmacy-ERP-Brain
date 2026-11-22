namespace PharmacyERP.Domain.Entities.Inventory;

/// <summary>
/// Current on-hand quantity (in base units) and weighted-average unit cost for one batch at one location.
/// Every mutation increments <see cref="RowVersion"/>, which EF Core maps as a concurrency token
/// (<c>row_version</c>), so concurrent updates to the same balance surface as concurrency conflicts.
/// </summary>
public class StockBalance
{
    public Guid OrganizationId { get; private set; }
    public Guid LocationId { get; private set; }
    public Guid BatchId { get; private set; }
    public decimal OnHandQtyBase { get; private set; }
    public decimal AverageUnitCost { get; private set; }
    public long RowVersion { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    // Navigation Properties
    public virtual InventoryLocation Location { get; private set; } = null!;
    public virtual InventoryBatch Batch { get; private set; } = null!;

    private StockBalance()
    {
    }

    public static StockBalance Create(Guid organizationId, Guid locationId, Guid batchId, DateTimeOffset now)
    {
        if (organizationId == Guid.Empty)
            throw new ArgumentException("OrganizationId cannot be empty.", nameof(organizationId));

        if (locationId == Guid.Empty)
            throw new ArgumentException("LocationId cannot be empty.", nameof(locationId));

        if (batchId == Guid.Empty)
            throw new ArgumentException("BatchId cannot be empty.", nameof(batchId));

        return new StockBalance
        {
            OrganizationId = organizationId,
            LocationId = locationId,
            BatchId = batchId,
            OnHandQtyBase = 0m,
            AverageUnitCost = 0m,
            RowVersion = 1,
            UpdatedAt = now
        };
    }

    // Sets the starting quantity/cost directly (no weighted-average math) and keeps RowVersion at its initial value of 1.
    public static StockBalance CreateInitial(Guid organizationId, Guid locationId, Guid batchId, decimal initialQtyBase = 0m, decimal initialCostBase = 0m, DateTimeOffset? now = null)
    {
        var balance = Create(organizationId, locationId, batchId, now ?? DateTimeOffset.UtcNow);
        balance.OnHandQtyBase = initialQtyBase;
        balance.AverageUnitCost = initialCostBase;
        return balance;
    }

    /// <summary>
    /// Adds stock and recomputes the weighted-average cost:
    /// newAverage = (onHand * currentAverage + accepted * incomingCost) / (onHand + accepted),
    /// with the resulting average and quantity rounded to 4 decimals (midpoint away from zero).
    /// </summary>
    public void ApplyIncomingStock(decimal acceptedQtyBase, decimal incomingUnitCostBase, DateTimeOffset now)
    {
        if (acceptedQtyBase <= 0m || incomingUnitCostBase < 0m)
            throw new NegativeCostOrQuantityException();

        // Intermediate values are kept unrounded; rounding is applied only to the stored results.
        decimal totalNewQty = OnHandQtyBase + acceptedQtyBase;
        decimal newTotalValue = (OnHandQtyBase * AverageUnitCost) + (acceptedQtyBase * incomingUnitCostBase);
        decimal newWeightedAverageCost = newTotalValue / totalNewQty;

        AverageUnitCost = Math.Round(newWeightedAverageCost, 4, MidpointRounding.AwayFromZero);
        OnHandQtyBase = Math.Round(totalNewQty, 4, MidpointRounding.AwayFromZero);
        RowVersion++;
        UpdatedAt = now;
    }

    /// <summary>
    /// Removes stock and returns the unit cost to record on the outgoing line. Issues are costed at the
    /// current weighted average, so <see cref="AverageUnitCost"/> itself is left unchanged.
    /// </summary>
    /// <exception cref="InsufficientStockException">On-hand quantity is lower than the requested issue.</exception>
    public decimal ApplyOutgoingStock(decimal issueQtyBaseAbs, DateTimeOffset now)
    {
        if (issueQtyBaseAbs <= 0m)
            throw new NegativeCostOrQuantityException();

        if (OnHandQtyBase < issueQtyBaseAbs)
            throw new InsufficientStockException();

        OnHandQtyBase = Math.Round(OnHandQtyBase - issueQtyBaseAbs, 4, MidpointRounding.AwayFromZero);
        RowVersion++;
        UpdatedAt = now;

        return AverageUnitCost;
    }
}