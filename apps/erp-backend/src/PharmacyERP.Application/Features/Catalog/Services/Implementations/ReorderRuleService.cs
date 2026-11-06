using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
using PharmacyERP.Application.Features.Catalog.Validators;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;

namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

public class ReorderRuleService : IReorderRuleService
{
    private readonly IProductReorderRuleRepository _reorderRuleRepository;
    private readonly IProductRepository _productRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeModeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;

    public ReorderRuleService(
        IProductReorderRuleRepository reorderRuleRepository,
        IProductRepository productRepository,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeModeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService)
    {
        _reorderRuleRepository = reorderRuleRepository;
        _productRepository = productRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeModeProvider = runtimeModeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
    }

    public async Task<Result<ReorderRuleDto>> GetReorderRuleAsync(Guid branchId, Guid productId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ReorderRuleDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<ReorderRuleDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        if (!IsAuthorizedForRead())
            return Result<ReorderRuleDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var rule = await _reorderRuleRepository.GetByBranchAndProductAsync(orgId, branchId, productId, ct);
        if (rule == null)
            return Result<ReorderRuleDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ReorderRuleNotFound);

        return Result<ReorderRuleDto>.Success(MapToDto(rule));
    }

    public async Task<Result<ReorderRuleDto>> UpsertReorderRuleAsync(Guid branchId, Guid productId, UpsertReorderRuleRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ReorderRuleDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<ReorderRuleDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        if (!IsCloudRuntimeMode())
            return Result<ReorderRuleDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ReorderRuleDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = UpsertReorderRuleRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ReorderRuleDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<UpsertReorderRuleRequest, ReorderRuleDto>(
                    "catalog.reorderrule.upsert", request.IdempotencyKey, branchId, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ReorderRuleDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ReorderRuleDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var product = await _productRepository.GetByIdAsync(orgId, productId, ct);
            if (product == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ReorderRuleDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
            }

            var existingRule = await _reorderRuleRepository.GetByBranchAndProductAsync(orgId, branchId, productId, ct);
            ProductReorderRule rule;
            string action;

            if (existingRule != null)
            {
                try
                {
                    existingRule.UpdateThresholds(request.ReorderPointBase, request.ReorderQuantityBase, request.MaxQuantityBase);
                    existingRule.SetActiveState(request.IsActive);
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ReorderRuleDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
                }

                rule = existingRule;
                action = "UPDATE";
            }
            else
            {
                try
                {
                    rule = ProductReorderRule.Create(
                        orgId,
                        productId,
                        branchId,
                        request.ReorderPointBase,
                        request.ReorderQuantityBase,
                        request.MaxQuantityBase);
                    rule.SetActiveState(request.IsActive);
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ReorderRuleDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
                }

                await _reorderRuleRepository.AddAsync(rule, ct);
                action = "CREATE";
            }

            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync(action, "catalog", "PRODUCT_REORDER_RULE", rule.ReorderRuleId, null, rule, branchId, null, null, ct);
            await _outboxService.EnqueueAsync(
                action == "CREATE" ? "catalog.reorderrule.created" : "catalog.reorderrule.updated",
                branchId,
                new { rule.ReorderRuleId, rule.OrganizationId, rule.BranchId, rule.ProductId, rule.IsActive },
                "1.0",
                ct);

            var dto = MapToDto(rule);
            await _idempotencyService.PersistResponseAsync("catalog.reorderrule.upsert", request.IdempotencyKey, branchId, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ReorderRuleDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    private bool IsCloudRuntimeMode() =>
        _runtimeModeProvider.CurrentMode == ErpRuntimeMode.Cloud;

    private bool IsAuthorizedForWrite() =>
        string.Equals(_currentUser.Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Pharmacist", StringComparison.OrdinalIgnoreCase);

    private bool IsAuthorizedForRead() =>
        string.Equals(_currentUser.Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Pharmacist", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Cashier", StringComparison.OrdinalIgnoreCase);

    private static ReorderRuleDto MapToDto(ProductReorderRule r) =>
        new(
            r.ReorderRuleId,
            r.OrganizationId,
            r.BranchId,
            r.ProductId,
            r.ReorderPointBase,
            r.ReorderQuantityBase,
            r.MaxQuantityBase,
            r.IsActive,
            r.UpdatedAt);
}
