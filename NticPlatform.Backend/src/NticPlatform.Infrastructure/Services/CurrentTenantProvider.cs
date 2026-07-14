using System;
using AppITenantProvider = NticPlatform.Application.LMSContext.Commands.ITenantProvider;
using InfraITenantProvider = NticPlatform.Infrastructure.Persistence.Configurations.ITenantProvider;

namespace NticPlatform.Infrastructure.Services
{
    public class CurrentTenantProvider : AppITenantProvider, InfraITenantProvider
    {
        private readonly Guid _defaultTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        public Guid GetCurrentTenantId()
        {
            return _defaultTenantId;
        }
    }
}
