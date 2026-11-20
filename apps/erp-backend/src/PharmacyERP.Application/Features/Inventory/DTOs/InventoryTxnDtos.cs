using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.DTOs;

public record CreateInventoryAdjustmentLineRequest(
    Guid ProductId,
    Guid ProductUomId,
    Guid LocationId,
    string? BatchNumber,
    DateOnly? ManufacturedOn,
    DateOnly? ExpiresOn,
    decimal EnteredQty,
    decimal? UnitCostEntered);

public record CreateInventoryAdjustmentRequest(
    Guid BranchId,
    InventoryTransactionType TransactionType,
    string ReasonCode,
    string? Note,
    Guid? ReversesInventoryTxnId,
    IReadOnlyList<CreateInventoryAdjustmentLineRequest> Lines,
    string IdempotencyKey);

public record InventoryTxnLineDto(
    Guid InventoryTxnLineId,
    Guid ProductId,
    Guid LocationId,
    Guid BatchId,
    string BatchNumber,
    Guid ProductUomId,
    decimal EnteredQty,
    decimal ConversionSnapshot,
    decimal QuantityDeltaBase,
    decimal UnitCostBase);

public record InventoryTxnDto(
    Guid InventoryTxnId,
    Guid OrganizationId,
    Guid BranchId,
    string TransactionNo,
    InventoryTransactionType TransactionType,
    InventoryTransactionStatus Status,
    string? ReasonCode,
    string? Note,
    string IdempotencyKey,
    Guid CreatedByEmployeeId,
    Guid? ReversesInventoryTxnId,
    DateTimeOffset? PostedAt,
    IReadOnlyList<InventoryTxnLineDto> Lines);
