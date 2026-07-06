using System;

namespace NticPlatform.Domain.Common
{
    public abstract class BaseTenantEntity
    {
        public Guid Id { get; protected set; }
        public Guid TenantId { get; protected set; } // Cross-tenant data leak prevention
        public bool IsDeleted { get; protected set; }
        public DateTime CreatedAt { get; protected set; }
        public string CreatedBy { get; protected set; }
        public DateTime? ModifiedAt { get; protected set; }
        public string ModifiedBy { get; protected set; }
        
        public void MarkAsDeleted() => IsDeleted = true;
    }
}
