namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/organizations")]
[Authorize(Policy = "PlatformProvisionerOnly")]
public sealed class OrganizationsController : ControllerBase
{
    private readonly IOrganizationProvisioningService _service;
    private readonly ICurrentUser _currentUser;
    public OrganizationsController(IOrganizationProvisioningService service, ICurrentUser currentUser) { _service = service; _currentUser = currentUser; }

    [AllowHeaderIdempotencyKey]
    [HttpPost]
    [ProducesResponseType(typeof(OrganizationDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateOrganizationRequest request,
        CancellationToken ct)
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

        var result = await _service.CreateAsync(request with { IdempotencyKey = effectiveKey }, ct);
        var locationUri = result.IsSuccess ? $"/api/v1/organizations/{result.Value!.OrganizationId}" : null;
        return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
    }
}
