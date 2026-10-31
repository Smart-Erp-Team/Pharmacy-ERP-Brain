namespace PharmacyERP.Application.Common.Constants;

public static class ErrorMessages
{
    // 1. General & Protocol Errors (HTTP 400 & 422)
    public const string MalformedRequest = "The request is malformed or missing required protocol headers.";
    public const string ValidationError = "One or more validation errors occurred. Please check the request details.";

    // 2. Authentication & Authorization (HTTP 401 & 403)
    public const string Unauthorized = "Authentication is required or the provided credentials are invalid.";
    public const string Forbidden = "You do not have the required permissions to perform this action.";
    public const string ForbiddenBranch = "You are not authorized to access or perform operations on this branch.";

    // 3. Resource Lookup (HTTP 404)
    public const string NotFound = "The requested resource could not be found.";
    public const string UserNotFound = "The specified user account could not be found.";

    // 4. State & Conflict Errors (HTTP 409)
    public const string Conflict = "The operation could not be completed due to a conflict with the current state of the resource.";
    public const string InvalidStateTransition = "The requested state transition is not allowed for this document or transaction.";
    public const string IdempotencyMismatch = "The operation was previously submitted with a different payload. Idempotency key mismatch.";

    // 5. Inventory & Sales Specific Rules (HTTP 409 & 422)
    public const string OutOfStock = "The requested quantity is not currently available in the eligible sellable stock.";
    public const string ExpiryPolicyViolation = "The operation violates the configured expiry or minimum shelf-life policy.";
    public const string ImmutablePostedTransaction = "Posted inventory transactions and their lines are immutable and cannot be modified or deleted.";
    public const string NegativeCostOrQuantity = "Quantities and unit costs must be strictly positive values.";
    public const string InvalidLocationSellableFlag = "Location sellable flag does not match the location type.";
    public const string InvalidBatchDates = "Manufactured date cannot be after the expiration date, or expiration date is missing.";
    public const string NonLotMisuse = "NON-LOT batch cannot be used for products that require lot tracking.";
    public const string CloudStockMutationForbidden = "Inventory adjustments cannot be performed on the Cloud environment. They must be done on the local branch.";

    // The same constant values as ErrorCode enum for easier mapping in service responses
    public const string ForbiddenBranchAccess = ForbiddenBranch;
    public const string DuplicateLocationCode = "A location with this code already exists in this branch.";
    public const string LocationNotFound = "The specified inventory location was not found.";
    public const string CloudMutationForbidden = CloudStockMutationForbidden;
    public const string InsufficientStock = OutOfStock;

    // 6. Catalog Specific Rules (HTTP 409 & 422)
    public const string CategorySelfParent = "A product category cannot be set as its own parent.";
    public const string HistoricalUomModificationForbidden = "Cannot modify base UOM or tracking policy for a product that has existing stock balances or posted transaction history.";
    public const string InvalidBaseUomInvariant = "The product must have exactly one active base UOM with a conversion factor of 1 matching its base UOM code.";
    
}