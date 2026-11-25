#nullable enable

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/product-categories")]
public sealed class ProductCategoriesController : ControllerBase
{
    private readonly IProductCategoryService _service;
    private readonly ICurrentUser _currentUser;

    public ProductCategoriesController(
        IProductCategoryService service,
        ICurrentUser currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ProductCategoryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> GetCategories(
        [FromQuery(Name = "parent_category_id")] Guid? parentCategoryId,
        [FromQuery(Name = "include_inactive")] bool includeInactive = false,
        [FromQuery(Name = "search")] string? search = null,
        [FromQuery(Name = "page")] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 25,
        CancellationToken ct = default)
    {
        var result = await _service.GetCategoriesAsync(parentCategoryId, includeInactive, search, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPost]
    [ProducesResponseType(typeof(ProductCategoryDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> CreateCategory(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateProductCategoryRequest request,
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
        var result = await _service.CreateCategoryAsync(requestWithKey, ct);
        var locationUri = result.IsSuccess ? $"/api/v1/product-categories/{result.Value!.CategoryId}" : null;
        return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ProductCategoryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCategoryById(Guid id, CancellationToken ct = default)
    {
        var result = await _service.GetCategoryByIdAsync(id, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPatch("{id:guid}")]
    [ProducesResponseType(typeof(ProductCategoryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateCategory(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] UpdateProductCategoryRequest request,
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
        var result = await _service.UpdateCategoryAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
