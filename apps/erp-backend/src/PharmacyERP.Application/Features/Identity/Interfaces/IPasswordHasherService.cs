namespace PharmacyERP.Application.Features.Identity.Interfaces;

public interface IPasswordHasherService
{
    string HashPassword(UserAccount account, string password);
    bool VerifyPassword(UserAccount account, string hashedPassword, string providedPassword);
}
