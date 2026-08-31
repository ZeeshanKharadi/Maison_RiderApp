using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("UserRoles")]
    public class UserRole
    {
        [Key]
        public int UserRoleId { get; set; }

        public Guid UserId { get; set; }

        public int RoleId { get; set; }

        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(UserId))]
        public AppUser User { get; set; }

        [ForeignKey(nameof(RoleId))]
        public Role Role { get; set; }
    }
}
