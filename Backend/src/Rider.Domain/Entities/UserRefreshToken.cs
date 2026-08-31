using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("UserRefreshTokens")]
    public class UserRefreshToken
    {
        [Key]
        public long Id { get; set; }

        public Guid UserId { get; set; }

        [Required]
        [MaxLength(500)]
        public string RefreshToken { get; set; }

        public DateTime ExpiresAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public bool IsRevoked { get; set; }

        [ForeignKey(nameof(UserId))]
        public AppUser User { get; set; }
    }
}
