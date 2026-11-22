namespace PharmacyERP.Infrastructure.BackgroundServices;

/// <summary>
/// Background hosted service that polls unpublished tenant outbox events under system bypass
/// using PostgreSQL <c>FOR UPDATE SKIP LOCKED</c> so multiple worker instances never double-dispatch
/// the same event, advancing <see cref="OutboxEvent.PublishedAt"/> or recording failures atomically.
/// </summary>
public class OutboxPublisherWorker : BackgroundService
{
    private const int MaxPublishAttempts = 10;
    private const int BatchSize = 50;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxPublisherWorker> _logger;
    private readonly TimeSpan _pollingInterval;

    public OutboxPublisherWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxPublisherWorker> logger,
        TimeSpan? pollingInterval = null)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _pollingInterval = pollingInterval ?? TimeSpan.FromSeconds(5);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingOutboxBatchAsync(stoppingToken);
                await Task.Delay(_pollingInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Error occurred while processing pending outbox events.");

                try
                {
                    await Task.Delay(_pollingInterval, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }

    public async Task<int> ProcessPendingOutboxBatchAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var dateTimeProvider = scope.ServiceProvider.GetRequiredService<IDateTimeProvider>();
        var dispatcher = scope.ServiceProvider.GetService<IOutboxEventDispatcher>();

        // The outbox worker processes pending events across all organizations in sequence order.
        tenantContext.AllowSystemBypass();

        await unitOfWork.BeginTransactionAsync(ct);
        try
        {
            List<OutboxEvent> pendingEvents;
            if (dbContext.Database.IsRelational())
            {
                // FOR UPDATE SKIP LOCKED allows concurrent workers to claim disjoint event batches without blocking.
                pendingEvents = await dbContext.OutboxEvents
                    .FromSqlInterpolated(
                        $@"SELECT * FROM integration.""OUTBOX_EVENT""
                           WHERE published_at IS NULL AND attempt_count < {MaxPublishAttempts}
                           ORDER BY organization_id ASC, event_sequence ASC
                           LIMIT {BatchSize}
                           FOR UPDATE SKIP LOCKED")
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);
            }
            else
            {
                pendingEvents = await dbContext.OutboxEvents
                    .IgnoreQueryFilters()
                    .Where(outboxEvent => outboxEvent.PublishedAt == null && outboxEvent.AttemptCount < MaxPublishAttempts)
                    .OrderBy(outboxEvent => outboxEvent.OrganizationId)
                    .ThenBy(outboxEvent => outboxEvent.EventSequence)
                    .Take(BatchSize)
                    .ToListAsync(ct);
            }

            foreach (var outboxEvent in pendingEvents)
            {
                try
                {
                    if (dispatcher != null)
                    {
                        await dispatcher.DispatchAsync(outboxEvent, ct);
                    }

                    outboxEvent.MarkPublished(dateTimeProvider.UtcNow);
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(
                        exception,
                        "Failed to publish outbox event {EventId} ({EventType}) for Organization {OrganizationId} Seq {EventSequence}.",
                        outboxEvent.EventId,
                        outboxEvent.EventType,
                        outboxEvent.OrganizationId,
                        outboxEvent.EventSequence);
                    outboxEvent.RecordPublishFailure(exception.Message ?? "Outbox dispatch failed.");
                }
            }

            await unitOfWork.CommitTransactionAsync(ct);
            return pendingEvents.Count;
        }
        catch
        {
            await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }
}
