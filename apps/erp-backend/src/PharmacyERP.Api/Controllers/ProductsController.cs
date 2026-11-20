#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/products")]
public sealed class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly IProductUomService _uomService;
    private readonly ICurrentUser _currentUser;

    public ProductsController(
        IProductService productService,
        IProductUomService uomService,
        ICurrentUser currentUser)
    {
        _productService = productService;
        _uomService = uomService;
        _currentUser = currentUser;
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet]
    public async Task<IActionResult> GetProducts(
        [FromQuery] Guid? categoryId,
        [FromQuery] bool includeInactive = false,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var result = await _productService.GetProductsAsync(categoryId, includeInactive, search, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPost]
    public async Task<IActionResult> CreateProduct(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateProductRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return BadRequest();
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _productService.CreateProductAsync(requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetProductById(Guid id, CancellationToken ct = default)
    {
        var result = await _productService.GetProductByIdAsync(id, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateProduct(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] UpdateProductRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return BadRequest();
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _productService.UpdateProductAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet("{id:guid}/uoms")]
    public async Task<IActionResult> GetProductUoms(Guid id, CancellationToken ct = default)
    {
        var result = await _uomService.GetProductUomsAsync(id, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPost("{id:guid}/uoms")]
    public async Task<IActionResult> CreateProductUom(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateProductUomRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return BadRequest();
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _uomService.CreateProductUomAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPatch("{id:guid}/uoms/{uomId:guid}")]
    public async Task<IActionResult> UpdateProductUom(
        Guid id,
        Guid uomId,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] UpdateProductUomRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return BadRequest();
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _uomService.UpdateProductUomAsync(id, uomId, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
