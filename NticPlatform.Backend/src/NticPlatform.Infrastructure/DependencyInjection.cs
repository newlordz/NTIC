using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NticPlatform.Application.LMSContext.Commands;
using NticPlatform.Infrastructure.Persistence;

namespace NticPlatform.Infrastructure
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(
                    configuration.GetConnectionString("DefaultConnection"),
                    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

            services.AddScoped<NticPlatform.Application.LMSContext.Commands.ITenantProvider, NticPlatform.Infrastructure.Services.CurrentTenantProvider>();
            services.AddScoped<NticPlatform.Infrastructure.Persistence.Configurations.ITenantProvider, NticPlatform.Infrastructure.Services.CurrentTenantProvider>();

            return services;
        }
    }
}
