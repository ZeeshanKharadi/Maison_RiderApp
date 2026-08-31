using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("Roles")]
    public class Role
    {
        [Key]
        public int RoleId { get; set; }

        [MaxLength(100)]
        public string RoleName { get; set; }

        [MaxLength(255)]
        public string Description { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public ICollection<UserRole> UserRoles { get; set; }
    }
}
