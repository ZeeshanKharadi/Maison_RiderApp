using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("AppSettings")]
    public class AppSetting
    {
        [Key]
        [MaxLength(100)]
        public string SettingKey { get; set; }

        [MaxLength(500)]
        public string SettingValue { get; set; }

        public DateTime? UpdatedAt { get; set; }
    }
}
