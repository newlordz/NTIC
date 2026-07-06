using MediatR;
using System;
using System.Threading;
using System.Threading.Tasks;
using NticPlatform.Domain.Entities.LMSContext;

namespace NticPlatform.Application.LMSContext.Commands
{
    public record SubmitAssignmentCommand(
        Guid StudentId, 
        string SourceCodePath, 
        string VideoUrl) : IRequest<Guid>;

    // Interface placeholders for DI
    public interface IApplicationDbContext
    {
        Microsoft.EntityFrameworkCore.DbSet<NticPlatform.Domain.Entities.StudentContext.Student> Students { get; }
        Microsoft.EntityFrameworkCore.DbSet<AssignmentSubmission> AssignmentSubmissions { get; }
        Task<int> SaveChangesAsync(CancellationToken cancellationToken);
    }

    public interface ITenantProvider
    {
        Guid GetCurrentTenantId();
    }

    public class SubmitAssignmentCommandHandler : IRequestHandler<SubmitAssignmentCommand, Guid>
    {
        private readonly IApplicationDbContext _context;
        private readonly ITenantProvider _tenantProvider;

        public SubmitAssignmentCommandHandler(IApplicationDbContext context, ITenantProvider tenantProvider)
        {
            _context = context;
            _tenantProvider = tenantProvider;
        }

        public async Task<Guid> Handle(SubmitAssignmentCommand request, CancellationToken cancellationToken)
        {
            var currentTenantId = _tenantProvider.GetCurrentTenantId();
            
            // Retrieve student within the current tenant boundary
            var student = await _context.Students.FindAsync(new object[] { request.StudentId }, cancellationToken);
            
            if (student == null)
                throw new Exception("Student not found.");

            // STRICT COMPLIANCE: Ghana Data Protection Act (Act 843)
            // Section 18: Processing of personal data strictly requires prior consent.
            if (!student.DataProcessingConsentGranted)
            {
                throw new InvalidOperationException("GDPA Violation: Cannot process assignment data without explicit student consent.");
            }

            var submission = new AssignmentSubmission(
                tenantId: currentTenantId,
                studentId: request.StudentId,
                sourceCodePath: request.SourceCodePath,
                videoUrl: request.VideoUrl
            );

            _context.AssignmentSubmissions.Add(submission);
            await _context.SaveChangesAsync(cancellationToken);

            return submission.Id;
        }
    }
}
