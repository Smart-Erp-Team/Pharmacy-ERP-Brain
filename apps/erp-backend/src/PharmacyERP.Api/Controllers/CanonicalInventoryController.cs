#nullable enable

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/canonical/inventory")]
public class CanonicalInventoryController : ControllerBase
{
    private readonly ICanonicalInventoryService _canonicalService;
    private readonly ICurrentUser _currentUser;

    public CanonicalInventoryController(ICanonicalInventoryService canonicalService, ICurrentUser currentUser)
    {
        _canonicalService = canonicalService;
        _currentUser = currentUser;
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Pharmacist")]
    [ProducesResponseType(typeof(PagedResult<CanonicalInventoryItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> GetCanonicalInventory(
        [FromQuery(Name = "organization_id")] Guid? organizationId,
        [FromQuery(Name = "branch_id")] Guid branchId,
        [FromQuery(Name = "product_id")] Guid? productId,
        [FromQuery(Name = "updated_since")] DateTimeOffset? updatedSince,
        [FromQuery(Name = "cursor")] long? cursor,
        [FromQuery(Name = "limit")] int limit = 100,
        CancellationToken ct = default)
    {
        var result = await _canonicalService.GetCanonicalInventoryAsync(
            organizationId ?? Guid.Empty, branchId, productId, updatedSince, cursor, limit, ct);

        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
