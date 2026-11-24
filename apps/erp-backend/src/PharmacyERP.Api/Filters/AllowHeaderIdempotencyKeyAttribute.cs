#nullable enable

using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace PharmacyERP.Api.Filters;

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

    internal static readonly string SnakeCaseRequiredErrorMessage =
        new RequiredAttribute().FormatErrorMessage("idempotency_key");

    private static readonly string[] CandidateModelStateKeys =
    [
        "IdempotencyKey",
        "request.IdempotencyKey",
        "idempotency_key",
        "$.idempotency_key",
        "request.idempotency_key"
    ];

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
            !string.IsNullOrEmpty(idempotencyProp.GetValue(requestObj) as string))
        {
            return;
        }

        foreach (var candidateKey in CandidateModelStateKeys)
        {
            RemoveImplicitRequiredError(context, candidateKey);
        }
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
                (string.Equals(e.ErrorMessage, ImplicitRequiredErrorMessage, StringComparison.Ordinal) ||
                 string.Equals(e.ErrorMessage, SnakeCaseRequiredErrorMessage, StringComparison.Ordinal)))
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
