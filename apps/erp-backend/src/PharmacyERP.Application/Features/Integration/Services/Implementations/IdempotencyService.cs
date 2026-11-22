using PharmacyERP.Application.Common.Utilities;

namespace PharmacyERP.Application.Features.Integration.Services.Implementations;

/// <summary>
/// Enforces request idempotency by serializing concurrent calls with the same key, comparing
/// canonical SHA-256 request payload hashes to detect conflicting reuse, and replaying the
/// previously persisted response on safe retries.
/// </summary>
public class IdempotencyService : IIdempotencyService
{
    private static readonly JsonSerializerOptions IdempotencyJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly IIdempotencyRepository _repository;
    private readonly ITenantContext _tenantContext;
    private readonly IDateTimeProvider _dateTimeProvider;

    public IdempotencyService(IIdempotencyRepository repository, ITenantContext tenantContext, IDateTimeProvider dateTimeProvider)
    {
        _repository = repository;
        _tenantContext = tenantContext;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<IdempotencyCheckResult<TResponse>> CheckAsync<TRequest, TResponse>(
        string operationScope, string idempotencyKey, Guid? branchId, TRequest requestPayload, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
        {
            throw new InvalidOperationException("OrganizationId is required to perform idempotency checks.");
        }

        if (string.IsNullOrWhiteSpace(operationScope))
        {
            throw new IntegrationDomainException("OperationScope is required.");
        }

        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            throw new IntegrationDomainException("IdempotencyKey is required.");
        }

        var organizationId = _tenantContext.OrganizationId.Value;
        var payloadHash = CanonicalJsonHasher.ComputeSha256Hex(requestPayload);

        // Acquire a transaction-scoped advisory lock before reading so two concurrent retries
        // with the same Idempotency-Key serialize cleanly instead of racing on insert.
        await _repository.AcquireLockAsync(organizationId, branchId, operationScope, idempotencyKey, ct);
        var existingRecord = await _repository.GetAsync(organizationId, branchId, operationScope, idempotencyKey, ct);

        if (existingRecord != null)
        {
            // Reusing an Idempotency-Key with a different canonical payload is a client conflict (409/IDEMPOTENCY_MISMATCH).
            if (existingRecord.PayloadHash != payloadHash)
            {
                throw new IntegrationDomainException("IDEMPOTENCY_MISMATCH");
            }

            var replayedResponse = JsonSerializer.Deserialize<TResponse>(existingRecord.ResponseBody, IdempotencyJsonOptions);

            return new IdempotencyCheckResult<TResponse> { IsReplay = true, ReplayedResponse = replayedResponse };
        }

        return new IdempotencyCheckResult<TResponse> { IsReplay = false };
    }

    public async Task PersistResponseAsync<TRequest, TResponse>(
        string operationScope, string idempotencyKey, Guid? branchId, TRequest requestPayload, TResponse responseBody, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            throw new InvalidOperationException("OrganizationId is required to persist idempotency responses.");

        var organizationId = _tenantContext.OrganizationId.Value;
        var payloadHash = CanonicalJsonHasher.ComputeSha256Hex(requestPayload);
        var responseJson = JsonSerializer.Serialize(responseBody, IdempotencyJsonOptions);

        var idempotencyRecord = new IdempotencyRecord(organizationId, branchId, operationScope, idempotencyKey, payloadHash, responseJson, _dateTimeProvider.UtcNow);
        await _repository.AddAsync(idempotencyRecord, ct);
    }
}
