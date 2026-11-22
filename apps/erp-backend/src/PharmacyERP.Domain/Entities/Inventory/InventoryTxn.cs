namespace PharmacyERP.Domain.Entities.Inventory;

/// <summary>
/// Header of an inventory ledger transaction. Lines may only be added while the transaction is
/// <see cref="InventoryTransactionStatus.DRAFT"/>; once POSTED (or CANCELLED) it is immutable.
/// A posted transaction is never edited or deleted — it is undone by posting a separate
/// <see cref="InventoryTransactionType.REVERSAL"/> transaction that references it via
/// <see cref="ReversesInventoryTxnId"/>.
/// </summary>
public class InventoryTxn
{
    public Guid InventoryTxnId { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid BranchId { get; private set; }

    public string TransactionNo { get; private set; } = string.Empty;

    public InventoryTransactionType TransactionType { get; private set; }

    public InventoryTransactionStatus Status { get; private set; }

    public string? ReasonCode { get; private set; }

    public string? Note { get; private set; }

    public string IdempotencyKey { get; private set; } = string.Empty;

    public Guid CreatedByEmployeeId { get; private set; }

    public Guid? ReversesInventoryTxnId { get; private set; }

    // Optional cross-module FKs for future stages
    public Guid? SalesOrderId { get; private set; }

    public Guid? SalesReturnId { get; private set; }

    public Guid? PurchaseOrderId { get; private set; }

    public Guid? VendorReturnId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? PostedAt { get; private set; }

    // Navigation Properties
    public virtual ICollection<InventoryTxnLine> Lines { get; private set; }
        = new List<InventoryTxnLine>();

    public virtual InventoryTxn? ReversesInventoryTxn { get; private set; }

    private InventoryTxn()
    {
    }

    public static InventoryTxn CreateDraft(
        Guid organizationId,
        Guid branchId,
        string transactionNo,
        InventoryTransactionType transactionType,
        string idempotencyKey,
        Guid createdByEmployeeId,
        DateTimeOffset? now = null,
        string? reasonCode = null,
        string? note = null,
        Guid? reversesInventoryTxnId = null,
        Guid? salesOrderId = null,
        Guid? salesReturnId = null,
        Guid? purchaseOrderId = null,
        Guid? vendorReturnId = null)
    {
        ValidateCreationParameters(organizationId, branchId, transactionNo, idempotencyKey, createdByEmployeeId);

        // A REVERSAL must always point at the transaction it undoes.
        if (transactionType == InventoryTransactionType.REVERSAL && (!reversesInventoryTxnId.HasValue || reversesInventoryTxnId.Value == Guid.Empty))
        {
            throw new ArgumentException("ReversesInventoryTxnId is required for REVERSAL transactions.", nameof(reversesInventoryTxnId));
        }

        var currentUtc = now ?? DateTimeOffset.UtcNow;

        return new InventoryTxn
        {
            InventoryTxnId = Guid.NewGuid(),
            OrganizationId = organizationId,
            BranchId = branchId,
            TransactionNo = transactionNo,
            TransactionType = transactionType,
            Status = InventoryTransactionStatus.DRAFT,
            ReasonCode = reasonCode,
            Note = note,
            IdempotencyKey = idempotencyKey,
            CreatedByEmployeeId = createdByEmployeeId,
            ReversesInventoryTxnId = reversesInventoryTxnId,
            SalesOrderId = salesOrderId,
            SalesReturnId = salesReturnId,
            PurchaseOrderId = purchaseOrderId,
            VendorReturnId = vendorReturnId,
            CreatedAt = currentUtc,
            PostedAt = null
        };
    }

    /// <summary>
    /// Creates a transaction that is already POSTED, using the same timestamp for
    /// <see cref="CreatedAt"/> and <see cref="PostedAt"/>. Lines added through
    /// <see cref="AddLine(InventoryTxnLine)"/> afterwards will be rejected because the transaction is no longer a draft.
    /// </summary>
    public static InventoryTxn CreatePosted(
        Guid organizationId,
        Guid branchId,
        string transactionNo,
        InventoryTransactionType transactionType,
        string idempotencyKey,
        Guid createdByEmployeeId,
        DateTimeOffset? now = null,
        string? reasonCode = null,
        string? note = null,
        Guid? reversesInventoryTxnId = null,
        Guid? salesOrderId = null,
        Guid? salesReturnId = null,
        Guid? purchaseOrderId = null,
        Guid? vendorReturnId = null)
    {
        var currentUtc = now ?? DateTimeOffset.UtcNow;

        var postedTransaction = CreateDraft(
            organizationId,
            branchId,
            transactionNo,
            transactionType,
            idempotencyKey,
            createdByEmployeeId,
            currentUtc,
            reasonCode,
            note,
            reversesInventoryTxnId,
            salesOrderId,
            salesReturnId,
            purchaseOrderId,
            vendorReturnId);

        postedTransaction.Status = InventoryTransactionStatus.POSTED;
        postedTransaction.PostedAt = currentUtc;
        return postedTransaction;
    }

    public void AddLine(InventoryTxnLine line)
    {
        EnsureDraft();
        if (line == null) throw new ArgumentNullException(nameof(line));
        Lines.Add(line);
    }

    /// <summary>
    /// Creates and appends a line bound to this transaction's organization, branch and type.
    /// The line validates UOM conversion math and the quantity sign for <see cref="TransactionType"/>.
    /// </summary>
    public void AddLine(
         Guid productId,
         Guid locationId,
         Guid batchId,
         Guid productUomId,
         decimal enteredQty,
         decimal conversionSnapshot,
         decimal quantityDeltaBase,
         decimal unitCostBase)
    {
        EnsureDraft();

        var line = InventoryTxnLine.Create(
            organizationId: OrganizationId,
            inventoryTxnId: InventoryTxnId,
            branchId: BranchId,
            productId: productId,
            locationId: locationId,
            batchId: batchId,
            productUomId: productUomId,
            enteredQty: enteredQty,
            conversionSnapshot: conversionSnapshot,
            quantityDeltaBase: quantityDeltaBase,
            unitCostBase: unitCostBase,
            transactionType: TransactionType);

        Lines.Add(line);
    }

    public void Post(DateTimeOffset postedAt)
    {
        EnsureDraft();
        Status = InventoryTransactionStatus.POSTED;
        PostedAt = postedAt;
    }

    public void Cancel()
    {
        EnsureDraft();
        Status = InventoryTransactionStatus.CANCELLED;
    }

    // Ledger immutability guard: posted transactions raise a domain exception (they can only be
    // undone by a REVERSAL), while cancelled drafts are simply dead and reject any further change.
    private void EnsureDraft()
    {
        if (Status == InventoryTransactionStatus.POSTED)
        {
            throw new ImmutablePostedTransactionException();
        }

        if (Status == InventoryTransactionStatus.CANCELLED)
        {
            throw new InvalidOperationException("Cannot mutate a cancelled transaction.");
        }
    }

    private static void ValidateCreationParameters(
        Guid organizationId,
        Guid branchId,
        string transactionNo,
        string idempotencyKey,
        Guid createdByEmployeeId)
    {
        if (organizationId == Guid.Empty)
            throw new ArgumentException("OrganizationId cannot be empty.", nameof(organizationId));

        if (branchId == Guid.Empty)
            throw new ArgumentException("BranchId cannot be empty.", nameof(branchId));

        if (string.IsNullOrWhiteSpace(transactionNo))
            throw new ArgumentException("TransactionNo is required.", nameof(transactionNo));

        if (transactionNo.Length > 40)
            throw new ArgumentException("TransactionNo cannot exceed 40 characters.", nameof(transactionNo));

        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ArgumentException("IdempotencyKey is required.", nameof(idempotencyKey));

        if (createdByEmployeeId == Guid.Empty)
            throw new ArgumentException("CreatedByEmployeeId cannot be empty.", nameof(createdByEmployeeId));
    }
}