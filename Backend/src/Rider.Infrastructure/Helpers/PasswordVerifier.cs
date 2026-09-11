using Microsoft.AspNetCore.Identity;
using Rider.Application.Helpers;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Helpers
{
    /// <summary>
    /// Verifies against PasswordHash (preferred) or legacy AES PasswordEncrypted,
    /// and upgrades to PasswordHash on successful legacy login.
    /// </summary>
    public class PasswordVerifier
    {
        private readonly PasswordHasher<object> _hasher = new();
        private readonly IPasswordCrypto _crypto;

        public PasswordVerifier(IPasswordCrypto crypto) => _crypto = crypto;

        public bool Verify(AppUser user, string plainPassword, out bool needsUpgrade)
        {
            needsUpgrade = false;
            if (string.IsNullOrEmpty(plainPassword))
                return false;

            if (!string.IsNullOrEmpty(user.PasswordHash))
            {
                var result = _hasher.VerifyHashedPassword(new object(), user.PasswordHash, plainPassword);
                return result is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
            }

            if (user.PasswordEncrypted == null || user.PasswordEncrypted.Length == 0)
                return false;

            string? stored;
            try { stored = _crypto.Decrypt(user.PasswordEncrypted); }
            catch { return false; }

            if (stored != plainPassword)
                return false;

            needsUpgrade = true;
            return true;
        }

        public string Hash(string plainPassword) => _hasher.HashPassword(new object(), plainPassword);

        public void SetPassword(AppUser user, string plainPassword)
        {
            user.PasswordHash = Hash(plainPassword);
            // Keep AES column in sync for any legacy tools; hash is authoritative for Verify.
            user.PasswordEncrypted = _crypto.Encrypt(plainPassword);
        }
    }
}
