using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.BackgroundServices;

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
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while processing pending outbox events.");

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

        tenantContext.AllowSystemBypass();

        await unitOfWork.BeginTransactionAsync(ct);
        try
        {
            List<OutboxEvent> pendingEvents;
            if (dbContext.Database.IsRelational())
            {
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
                    .Where(e => e.PublishedAt == null && e.AttemptCount < MaxPublishAttempts)
                    .OrderBy(e => e.OrganizationId)
                    .ThenBy(e => e.EventSequence)
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
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        ex,
                        "Failed to publish outbox event {EventId} ({EventType}) for Organization {OrganizationId} Seq {EventSequence}.",
                        outboxEvent.EventId,
                        outboxEvent.EventType,
                        outboxEvent.OrganizationId,
                        outboxEvent.EventSequence);
                    outboxEvent.RecordPublishFailure(ex.Message ?? "Outbox dispatch failed.");
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
