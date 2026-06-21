using System;
using StemPlatform.Domain.Common;

namespace StemPlatform.Domain.Entities.LMSContext
{
    public class AssignmentSubmission : BaseTenantEntity
    {
        public Guid StudentId { get; private set; }
        public string SourceCodePath { get; private set; }
        public string VideoUrl { get; private set; }
        public int? TotalScore { get; private set; }
        public string InstructorFeedback { get; private set; }
        public string Status { get; private set; }

        protected AssignmentSubmission() { }

        public AssignmentSubmission(Guid tenantId, Guid studentId, string sourceCodePath, string videoUrl)
        {
            Id = Guid.NewGuid();
            TenantId = tenantId;
            StudentId = studentId;
            SourceCodePath = sourceCodePath;
            VideoUrl = videoUrl;
            Status = "Pending";
            CreatedAt = DateTime.UtcNow;
            IsDeleted = false;
        }

        public void ReviewSubmission(int score, string feedback, string status, string reviewerId)
        {
            TotalScore = score;
            InstructorFeedback = feedback;
            Status = status;
            ModifiedAt = DateTime.UtcNow;
            ModifiedBy = reviewerId;
        }
    }
}
