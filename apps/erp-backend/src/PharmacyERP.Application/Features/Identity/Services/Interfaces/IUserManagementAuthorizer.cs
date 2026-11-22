using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Identity.Services.Interfaces;

public interface IUserManagementAuthorizer
{
    Result AuthorizeList(Guid? requestedBranchId);
    Result AuthorizeRead(UserAccount target);
    Result AuthorizeCreate(Employee targetEmployee, UserRole requestedRole, BranchScope requestedScope, IReadOnlyCollection<Guid> requestedBranchIds);
    Result AuthorizeUpdate(UserAccount target, UserRole requestedRole, BranchScope requestedScope, IReadOnlyCollection<Guid> requestedBranchIds, bool? requestedIsActive);
    Result AuthorizeSensitiveAction(UserAccount target);
}
