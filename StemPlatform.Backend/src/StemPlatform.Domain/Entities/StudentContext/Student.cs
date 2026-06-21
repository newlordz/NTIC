using System;
using StemPlatform.Domain.Common;
using StemPlatform.Domain.Enums;

namespace StemPlatform.Domain.Entities.StudentContext
{
    public record SkillsAssessment(int AnalyticalScore, int PracticalScore, int InnovationScore);

    public class Student : BaseTenantEntity
    {
        public string FirstName { get; private set; }
        public string LastName { get; private set; }
        public string Email { get; private set; }
        public bool DataProcessingConsentGranted { get; private set; } // Ghana Data Protection Act requirement
        public CompetitionTrack Track { get; private set; }
        public SkillsAssessment Assessment { get; private set; }

        protected Student() { }

        public Student(Guid tenantId, string firstName, string lastName, string email, CompetitionTrack track, bool consentGranted)
        {
            Id = Guid.NewGuid();
            TenantId = tenantId;
            FirstName = firstName;
            LastName = lastName;
            Email = email;
            Track = track;
            DataProcessingConsentGranted = consentGranted;
            CreatedAt = DateTime.UtcNow;
            IsDeleted = false;
        }

        public void AssignAssessment(SkillsAssessment assessment)
        {
            Assessment = assessment;
            ModifiedAt = DateTime.UtcNow;
        }
    }
}
