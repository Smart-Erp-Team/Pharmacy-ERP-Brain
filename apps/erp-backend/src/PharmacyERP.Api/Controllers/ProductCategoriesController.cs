#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyERP.Api.Common;
using PharmacyERP.Api.Filters;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
using PharmacyERP.Domain.Enums;

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
    public async Task<IActionResult> GetCategories(
        [FromQuery] Guid? parentCategoryId,
        [FromQuery] bool includeInactive = false,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var result = await _service.GetCategoriesAsync(parentCategoryId, includeInactive, search, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPost]
    public async Task<IActionResult> CreateCategory(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateProductCategoryRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, _currentUser.TraceId);
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _service.CreateCategoryAsync(requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetCategoryById(Guid id, CancellationToken ct = default)
    {
        var result = await _service.GetCategoryByIdAsync(id, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPatch("{id:guid}")]
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

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _service.UpdateCategoryAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
