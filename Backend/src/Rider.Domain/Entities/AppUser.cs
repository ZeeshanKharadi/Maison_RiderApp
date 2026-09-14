using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("Users")]
    public class AppUser
    {
        [Key]
        public Guid UserId { get; set; } = Guid.NewGuid();

        [MaxLength(200)]
        public string? UserName { get; set; }

        [MaxLength(200)]
        public string? Email { get; set; }

        [MaxLength(100)]
        public string? ThirdPartyEmployeeId { get; set; }

        /// <summary>Legacy AES ciphertext (IV + payload). Migrated to PasswordHash on successful login.</summary>
        public byte[]? PasswordEncrypted { get; set; }

        /// <summary>ASP.NET Identity PasswordHasher hash. Preferred over PasswordEncrypted.</summary>
        [MaxLength(500)]
        public string? PasswordHash { get; set; }

        public bool IsActive { get; set; } = true;

        /// <summary>Explicit Online preference. Distinct from LastSeenAt connectivity heartbeat.</summary>
        public bool IsAvailableOnline { get; set; }

        public DateTime? AvailabilityChangedAt { get; set; }

        public bool IsVerified { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? DeletedAt { get; set; }

        [MaxLength(100)]
        public string? Position { get; set; }

        [MaxLength(100)]
        public string? PayGroup { get; set; }

        public DateTime? DateOfBirth { get; set; }

        [MaxLength(50)]
        public string? Grade { get; set; }

        [MaxLength(50)]
        public string? PhoneNumber { get; set; }

        [MaxLength(50)]
        public string? Cnic { get; set; }

        [MaxLength(100)]
        public string? Department { get; set; }

        [MaxLength(100)]
        public string? CostCenter { get; set; }

        [MaxLength(500)]
        public string? ProfileImageUrl { get; set; }

        /// <summary>Store assignment. Null for head-office admins.</summary>
        [MaxLength(50)]
        public string? StoreId { get; set; }

        public DateTime? LastSeenAt { get; set; }

        /// <summary>Incremented on password reset to invalidate existing access JWTs.</summary>
        public int TokenVersion { get; set; }

        public ICollection<OtpCode>? Otps { get; set; }
        public ICollection<UserRefreshToken>? RefreshTokens { get; set; }
        public ICollection<UserRole>? UserRoles { get; set; }
    }
}
