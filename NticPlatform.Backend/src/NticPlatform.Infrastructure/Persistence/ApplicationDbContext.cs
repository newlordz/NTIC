using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;
using NticPlatform.Application.LMSContext.Commands;
using NticPlatform.Domain.Entities.StudentContext;
using NticPlatform.Domain.Entities.LMSContext;

namespace NticPlatform.Infrastructure.Persistence
{
    public class ApplicationDbContext : DbContext, IApplicationDbContext
    {
        private readonly ITenantProvider _tenantProvider;

        public ApplicationDbContext(
            DbContextOptions<ApplicationDbContext> options,
            ITenantProvider tenantProvider) : base(options)
        {
            _tenantProvider = tenantProvider;
        }

        public DbSet<Student> Students => Set<Student>();
        public DbSet<AssignmentSubmission> AssignmentSubmissions => Set<AssignmentSubmission>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Dynamically apply all IEntityTypeConfiguration implementations in this assembly
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        }

        public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return await base.SaveChangesAsync(cancellationToken);
        }
    }
}
