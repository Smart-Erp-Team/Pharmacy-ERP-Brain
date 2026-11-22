using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Identity.Services.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

public sealed class UserManagementAuthorizer : IUserManagementAuthorizer
{
    private readonly ICurrentUser _currentUser;

    public UserManagementAuthorizer(ICurrentUser currentUser)
    {
        _currentUser = currentUser;
    }

    public Result AuthorizeList(Guid? requestedBranchId)
    {
        if (!IsAdmin())
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (IsOrgAdmin())
            return Result.Success();

        if (!requestedBranchId.HasValue || !_currentUser.CanAccessBranch(requestedBranchId.Value))
            return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        return Result.Success();
    }

    public Result AuthorizeRead(UserAccount target)
    {
        if (!IsAdmin())
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (IsOrgAdmin())
            return Result.Success();

        if (_currentUser.UserId.HasValue && target.UserId == _currentUser.UserId.Value)
            return Result.Success();

        return AuthorizeAssignedAdminTarget(target);
    }

    public Result AuthorizeCreate(Employee targetEmployee, UserRole requestedRole, BranchScope requestedScope, IReadOnlyCollection<Guid> requestedBranchIds)
    {
        if (!IsAdmin())
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (IsOrgAdmin())
            return Result.Success();

        if (requestedRole == UserRole.Admin || requestedScope == BranchScope.ALL)
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!_currentUser.CanAccessBranch(targetEmployee.BranchId))
            return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        if (!AreAllBranchesAuthorized(requestedBranchIds))
            return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        return Result.Success();
    }

    public Result AuthorizeUpdate(UserAccount target, UserRole requestedRole, BranchScope requestedScope, IReadOnlyCollection<Guid> requestedBranchIds, bool? requestedIsActive)
    {
        if (!IsAdmin())
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        // Rule (c): Nobody may change their own role, scope, or active state.
        if (_currentUser.UserId.HasValue && target.UserId == _currentUser.UserId.Value)
        {
            var isChangingRole = requestedRole != target.Role;
            var isChangingScope = requestedScope != target.BranchScope;
            var isChangingActive = requestedIsActive.HasValue && requestedIsActive.Value != target.IsActive;
            if (isChangingRole || isChangingScope || isChangingActive)
                return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        }

        if (IsOrgAdmin())
            return Result.Success();

        // Rule (a): Only Admin + ALL may assign Admin/ALL or manage existing ALL-scope/Admin users.
        if (requestedRole == UserRole.Admin || requestedScope == BranchScope.ALL)
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var targetCheck = AuthorizeAssignedAdminTarget(target);
        if (!targetCheck.IsSuccess)
            return targetCheck;

        // Rule (b): ASSIGNED Admin may assign only BranchIds inside their own AuthorizedBranchIds.
        if (!AreAllBranchesAuthorized(requestedBranchIds))
            return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        return Result.Success();
    }

    public Result AuthorizeSensitiveAction(UserAccount target)
    {
        if (!IsAdmin())
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (IsOrgAdmin())
            return Result.Success();

        return AuthorizeAssignedAdminTarget(target);
    }

    private Result AuthorizeAssignedAdminTarget(UserAccount target)
    {
        // Rule (a): ASSIGNED Admins cannot manage ALL-scope or Admin users.
        if (target.BranchScope == BranchScope.ALL || target.Role == UserRole.Admin)
            return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        // Rule (b): Target user's BranchAccesses must be a subset of caller's AuthorizedBranchIds.
        var callerBranches = _currentUser.AuthorizedBranchIds;
        if (callerBranches.Count == 0)
            return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        if (target.BranchAccesses.Count > 0)
        {
            if (!target.BranchAccesses.All(a => callerBranches.Contains(a.BranchId)))
                return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

            return Result.Success();
        }

        if (target.Employee is not null && callerBranches.Contains(target.Employee.BranchId))
            return Result.Success();

        return IdentityResults.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
    }

    private bool AreAllBranchesAuthorized(IReadOnlyCollection<Guid> branchIds)
    {
        if (branchIds.Count == 0)
            return false;

        var callerBranches = _currentUser.AuthorizedBranchIds;
        return callerBranches.Count > 0 && branchIds.All(callerBranches.Contains);
    }

    private bool IsAdmin()
        => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);

    private bool IsOrgAdmin()
        => IsAdmin() && string.Equals(_currentUser.BranchScope, BranchScope.ALL.ToString(), StringComparison.OrdinalIgnoreCase);
}
