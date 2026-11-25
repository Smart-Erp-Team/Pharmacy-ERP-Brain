#nullable enable

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/inventory/locations")]
public class InventoryLocationsController : ControllerBase
{
    private readonly IInventoryLocationService _locationService;
    private readonly ICurrentUser _currentUser;

    public InventoryLocationsController(IInventoryLocationService locationService, ICurrentUser currentUser)
    {
        _locationService = locationService;
        _currentUser = currentUser;
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    public async Task<IActionResult> GetLocations(
        [FromQuery(Name = "branch_id")] Guid branchId,
        [FromQuery(Name = "is_sellable")] bool? isSellable,
        [FromQuery(Name = "include_inactive")] bool includeInactive = false,
        [FromQuery(Name = "page")] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 25,
        CancellationToken ct = default)
    {
        var result = await _locationService.GetPagedAsync(branchId, isSellable, includeInactive, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [HttpPost]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> CreateLocation(
        [FromBody] CreateInventoryLocationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, _currentUser.TraceId);
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey.Trim() : request.IdempotencyKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(effectiveKey))
        {
            return ApiResultMapper.ToMissingIdempotencyKeyResult(this, _currentUser.TraceId);
        }

        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _locationService.CreateAsync(requestWithKey, ct);
        var locationUri = result.IsSuccess ? $"/api/v1/inventory/locations/{result.Value!.LocationId}" : null;
        return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
    }

    [AllowHeaderIdempotencyKey]
    [HttpPatch("{id:guid}")]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> UpdateLocation(
        Guid id,
        [FromBody] UpdateInventoryLocationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, _currentUser.TraceId);
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey.Trim() : request.IdempotencyKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(effectiveKey))
        {
            return ApiResultMapper.ToMissingIdempotencyKeyResult(this, _currentUser.TraceId);
        }

        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _locationService.UpdateAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
