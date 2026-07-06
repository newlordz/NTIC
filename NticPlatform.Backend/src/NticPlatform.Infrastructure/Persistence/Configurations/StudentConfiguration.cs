using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NticPlatform.Domain.Entities.StudentContext;
using NticPlatform.Domain.Entities.LMSContext;
using System;

namespace NticPlatform.Infrastructure.Persistence.Configurations
{
    public interface ITenantProvider
    {
        Guid GetCurrentTenantId();
    }

    public class StudentConfiguration : IEntityTypeConfiguration<Student>
    {
        private readonly ITenantProvider _tenantProvider;

        public StudentConfiguration(ITenantProvider tenantProvider)
        {
            _tenantProvider = tenantProvider;
        }

        public void Configure(EntityTypeBuilder<Student> builder)
        {
            builder.ToTable("Students", "student_ctx");
            builder.HasKey(s => s.Id);

            // Cross-tenant data leak prevention & Soft Delete Query Filter
            builder.HasQueryFilter(s => !s.IsDeleted && s.TenantId == _tenantProvider.GetCurrentTenantId());

            builder.Property(s => s.FirstName).HasMaxLength(100).IsRequired();
            builder.Property(s => s.LastName).HasMaxLength(100).IsRequired();
            builder.Property(s => s.Email).HasMaxLength(150).IsRequired();
            builder.Property(s => s.Track).HasConversion<string>().HasMaxLength(50); // Store enum as string

            builder.Property(s => s.CreatedAt).IsRequired();
            builder.Property(s => s.CreatedBy).HasMaxLength(200);

            builder.OwnsOne(s => s.Assessment, a =>
            {
                a.Property(p => p.AnalyticalScore).HasColumnName("Assessment_Analytical");
                a.Property(p => p.PracticalScore).HasColumnName("Assessment_Practical");
                a.Property(p => p.InnovationScore).HasColumnName("Assessment_Innovation");
            });
        }
    }

    public class AssignmentSubmissionConfiguration : IEntityTypeConfiguration<AssignmentSubmission>
    {
        private readonly ITenantProvider _tenantProvider;

        public AssignmentSubmissionConfiguration(ITenantProvider tenantProvider)
        {
            _tenantProvider = tenantProvider;
        }

        public void Configure(EntityTypeBuilder<AssignmentSubmission> builder)
        {
            builder.ToTable("AssignmentSubmissions", "lms_ctx");
            builder.HasKey(a => a.Id);

            builder.HasQueryFilter(a => !a.IsDeleted && a.TenantId == _tenantProvider.GetCurrentTenantId());

            builder.Property(a => a.SourceCodePath).HasMaxLength(500).IsRequired();
            builder.Property(a => a.VideoUrl).HasMaxLength(500);
            builder.Property(a => a.InstructorFeedback).HasMaxLength(2000);
            builder.Property(a => a.Status).HasMaxLength(50).IsRequired();
        }
    }
}
