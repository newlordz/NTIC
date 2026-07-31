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
            var connectionString = configuration.GetConnectionString("DefaultConnection") ?? "";
            var password = configuration["POSTGRES_PASSWORD"]
                ?? configuration["PGPASSWORD"]
                ?? Environment.GetEnvironmentVariable("POSTGRES_PASSWORD")
                ?? Environment.GetEnvironmentVariable("PGPASSWORD");
            if (!string.IsNullOrEmpty(password) && !connectionString.Contains("Password=", StringComparison.OrdinalIgnoreCase))
            {
                connectionString += $";Password={password}";
            }

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(
                    connectionString,
                    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

            services.AddScoped<NticPlatform.Application.LMSContext.Commands.ITenantProvider, NticPlatform.Infrastructure.Services.CurrentTenantProvider>();
            services.AddScoped<NticPlatform.Infrastructure.Persistence.Configurations.ITenantProvider, NticPlatform.Infrastructure.Services.CurrentTenantProvider>();

            return services;
        }
    }
}
