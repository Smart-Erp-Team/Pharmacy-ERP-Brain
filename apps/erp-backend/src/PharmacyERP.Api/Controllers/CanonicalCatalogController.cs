#nullable enable

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/canonical")]
public sealed class CanonicalCatalogController : ControllerBase
{
    private readonly ICanonicalCatalogService _service;
    private readonly ICurrentUser _currentUser;

    public CanonicalCatalogController(
        ICanonicalCatalogService service,
        ICurrentUser currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpGet("products")]
    [ProducesResponseType(typeof(CanonicalProductFeedPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> GetProductsFeed(
        [FromQuery(Name = "updated_since")] DateTimeOffset? updatedSince,
        [FromQuery(Name = "cursor")] string? cursor,
        [FromQuery(Name = "limit")] int limit = 50,
        CancellationToken ct = default)
    {
        var result = await _service.GetCanonicalProductsFeedAsync(updatedSince, cursor, limit, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPost("configuration/products")]
    [ProducesResponseType(typeof(CanonicalWriteResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(CanonicalWriteResultDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> ConfigureProduct(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CanonicalProductConfigurationRequest request,
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
        var result = await _service.ConfigureProductAsync(requestWithKey, ct);

        if (requestWithKey.Action is CatalogConfigurationAction.CreateProduct or CatalogConfigurationAction.AddUom)
        {
            var locationUri = result.IsSuccess
                ? requestWithKey.Action == CatalogConfigurationAction.CreateProduct
                    ? $"/api/v1/products/{result.Value!.TargetEntityId}"
                    : $"/api/v1/products/{requestWithKey.ProductId}/uoms/{result.Value!.TargetEntityId}"
                : null;
            return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
        }

        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPut("configuration/reorder-rules")]
    [ProducesResponseType(typeof(CanonicalWriteResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> ConfigureReorderRule(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CanonicalReorderRuleConfigurationRequest request,
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
        var result = await _service.ConfigureReorderRuleAsync(requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
