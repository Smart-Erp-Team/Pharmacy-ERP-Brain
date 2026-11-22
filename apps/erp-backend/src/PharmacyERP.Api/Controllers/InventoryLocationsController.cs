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
        [FromQuery] Guid branchId,
        [FromQuery] bool? isSellable,
        [FromQuery] bool includeInactive = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
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

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _locationService.CreateAsync(requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
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

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _locationService.UpdateAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
