using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.DTOs;

public record InventoryBatchDto(
    Guid BatchId,
    Guid OrganizationId,
    Guid ProductId,
    string BatchNumber,
    DateOnly? ManufacturedOn,
    DateOnly? ExpiresOn,
    BatchQualityStatus QualityStatus,
    DateTimeOffset UpdatedAt);