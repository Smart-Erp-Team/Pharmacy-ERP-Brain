#nullable enable
using System;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;

namespace PharmacyERP.Api.Controllers;

/// <summary>
/// Action filter applied strictly to write actions that accept the <c>Idempotency-Key</c> HTTP header.
/// Runs after model binding and before <c>ModelStateInvalidFilter</c> (Order = -2000) to clear only the
/// implicit non-nullable reference validation error on <c>IdempotencyKey</c> when the property is omitted
/// or null in the JSON body, allowing the controller and application service validator to resolve and
/// validate the effective key from the header and body without altering the DTO contracts.
/// </summary>
[AttributeUsage(AttributeTargets.Method, Inherited = false, AllowMultiple = false)]
internal sealed class AllowHeaderIdempotencyKeyAttribute : ActionFilterAttribute
{
    internal static readonly string ImplicitRequiredErrorMessage =
        new RequiredAttribute().FormatErrorMessage("IdempotencyKey");

    public AllowHeaderIdempotencyKeyAttribute()
    {
        Order = -3000;
    }

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        if (!context.ActionArguments.TryGetValue("request", out var requestObj) || requestObj == null)
        {
            return;
        }

        var idempotencyProp = requestObj.GetType().GetProperty("IdempotencyKey");
        if (idempotencyProp == null ||
            idempotencyProp.PropertyType != typeof(string) ||
            idempotencyProp.GetValue(requestObj) != null)
        {
            return;
        }

        RemoveImplicitRequiredError(context, "IdempotencyKey");
        RemoveImplicitRequiredError(context, "request.IdempotencyKey");
    }

    private static void RemoveImplicitRequiredError(ActionExecutingContext context, string key)
    {
        if (!context.ModelState.TryGetValue(key, out var entry) || entry.Errors.Count == 0)
        {
            return;
        }

        var matchingErrors = entry.Errors
            .Where(e =>
                e.Exception == null &&
                string.Equals(e.ErrorMessage, ImplicitRequiredErrorMessage, StringComparison.Ordinal))
            .ToList();

        if (matchingErrors.Count == 0)
        {
            return;
        }

        foreach (var error in matchingErrors)
        {
            entry.Errors.Remove(error);
        }

        if (entry.Errors.Count == 0)
        {
            context.ModelState.Remove(key);
        }
        else
        {
            entry.ValidationState = ModelValidationState.Invalid;
        }
    }
}

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
            return BadRequest();
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
            return BadRequest();
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _service.UpdateCategoryAsync(id, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
