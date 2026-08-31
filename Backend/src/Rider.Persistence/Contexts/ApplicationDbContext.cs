using Microsoft.EntityFrameworkCore;
using Rider.Domain.Entities;

namespace Rider.Persistence.Contexts
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
        {
        }

        public DbSet<AppUser> Users { get; set; }
        public DbSet<OtpCode> Otps { get; set; }
        public DbSet<UserRefreshToken> UserRefreshTokens { get; set; }
        public DbSet<Role> Roles { get; set; }
        public DbSet<UserRole> UserRoles { get; set; }
        public DbSet<Store> Stores { get; set; }
        public DbSet<AppSetting> AppSettings { get; set; }
        public DbSet<AssignedOrderBatch> AssignedOrderBatches { get; set; }
        public DbSet<AssignedOrder> AssignedOrders { get; set; }
        public DbSet<AssignedOrderItem> AssignedOrderItems { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<AppUser>(entity =>
            {
                entity.ToTable("Users");
                entity.HasKey(e => e.UserId);
                entity.HasIndex(e => e.ThirdPartyEmployeeId);
                entity.Property(e => e.PasswordEncrypted).HasColumnName("passwordencrypted");
                entity.Property(e => e.ThirdPartyEmployeeId).HasColumnName("ThirdPartyEmployeeId");
                entity.Property(e => e.UserName).HasColumnName("Username");
                entity.Property(e => e.Cnic).HasColumnName("cnic");
                entity.Property(e => e.PhoneNumber).HasColumnName("phoneNumber");
                entity.Property(e => e.Department).HasColumnName("department");
                entity.Property(e => e.CostCenter).HasColumnName("costCenter");
                entity.Property(e => e.StoreId).HasMaxLength(50);
            });

            modelBuilder.Entity<OtpCode>(entity =>
            {
                entity.ToTable("OTP");
                entity.HasKey(e => e.OtpId);
                entity.Property(e => e.OtpCodeValue).HasColumnName("OtpCode");
                entity.HasOne(e => e.User)
                    .WithMany(u => u.Otps)
                    .HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<UserRefreshToken>(entity =>
            {
                entity.ToTable("UserRefreshTokens");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
                entity.HasOne(e => e.User)
                    .WithMany(u => u.RefreshTokens)
                    .HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<Role>(entity =>
            {
                entity.ToTable("Roles");
                entity.HasKey(e => e.RoleId);
                entity.Property(e => e.RoleName).HasMaxLength(100).IsRequired();
            });

            modelBuilder.Entity<UserRole>(entity =>
            {
                entity.ToTable("UserRoles");
                entity.HasKey(e => e.UserRoleId);
                entity.HasOne(e => e.User)
                    .WithMany(u => u.UserRoles)
                    .HasForeignKey(e => e.UserId);
                entity.HasOne(e => e.Role)
                    .WithMany(r => r.UserRoles)
                    .HasForeignKey(e => e.RoleId);
            });

            modelBuilder.Entity<Store>(entity =>
            {
                entity.ToTable("Stores");
                entity.HasKey(e => e.StoreId);
                entity.Property(e => e.StoreId).HasMaxLength(50);
                entity.Property(e => e.Name).HasMaxLength(200);
            });

            modelBuilder.Entity<AppSetting>(entity =>
            {
                entity.ToTable("AppSettings");
                entity.HasKey(e => e.SettingKey);
                entity.Property(e => e.SettingKey).HasMaxLength(100);
                entity.Property(e => e.SettingValue).HasMaxLength(500).IsRequired();
            });

            modelBuilder.Entity<AssignedOrderBatch>(entity =>
            {
                entity.ToTable("AssignedOrderBatches");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Time).HasColumnName("Time").HasMaxLength(50);
                entity.Property(e => e.StoreId).HasMaxLength(50).IsRequired();
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
                entity.HasMany(e => e.Orders)
                    .WithOne(o => o.Batch)
                    .HasForeignKey(o => o.BatchId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<AssignedOrder>(entity =>
            {
                entity.ToTable("AssignedOrders");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.OrderId).IsUnique();
                entity.Property(e => e.OrderId).HasMaxLength(50).IsRequired();
                entity.Property(e => e.OrderNo).HasMaxLength(50);
                entity.Property(e => e.OrderTypeId).HasMaxLength(20);
                entity.Property(e => e.OrderState).HasMaxLength(50);
                entity.Property(e => e.Comment).HasMaxLength(500);
                entity.Property(e => e.LastName).HasMaxLength(100);
                entity.Property(e => e.FirstName).HasMaxLength(100);
                entity.Property(e => e.City).HasMaxLength(100);
                entity.Property(e => e.Street).HasMaxLength(200);
                entity.Property(e => e.AddressNo).HasMaxLength(50);
                entity.Property(e => e.PostCode).HasMaxLength(50);
                entity.Property(e => e.SecondaryAddress).HasMaxLength(200);
                entity.Property(e => e.Phone).HasMaxLength(50);
                entity.Property(e => e.OrderTotal).HasColumnType("decimal(18,2)");
                entity.Property(e => e.PaymentMethod).HasMaxLength(20);
                entity.Property(e => e.Cash).HasColumnType("decimal(18,2)");
                entity.Property(e => e.CashCollected).HasColumnType("decimal(18,2)");
                entity.Property(e => e.OrderTime).HasMaxLength(50);
                entity.Property(e => e.Status).HasMaxLength(30).HasDefaultValue("Available");
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
                entity.HasOne(e => e.AcceptedByUser)
                    .WithMany()
                    .HasForeignKey(e => e.AcceptedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasMany(e => e.Items)
                    .WithOne(i => i.Order)
                    .HasForeignKey(i => i.AssignedOrderId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AssignedOrderItem>(entity =>
            {
                entity.ToTable("AssignedOrderItems");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Description).HasMaxLength(500);
                entity.Property(e => e.Position).HasMaxLength(50);
                entity.Property(e => e.Comment).HasMaxLength(500);
                entity.Property(e => e.LineNum).HasMaxLength(50);
                entity.Property(e => e.Size).HasMaxLength(50);
            });
        }
    }
}
