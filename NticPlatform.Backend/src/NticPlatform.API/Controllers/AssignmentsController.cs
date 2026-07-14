using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NticPlatform.Application.LMSContext.Commands;
using NticPlatform.Domain.Entities.LMSContext;
using NticPlatform.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace NticPlatform.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AssignmentsController : ControllerBase
    {
        private readonly IMediator _mediator;
        private readonly ApplicationDbContext _context;

        public AssignmentsController(IMediator mediator, ApplicationDbContext context)
        {
            _mediator = mediator;
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<AssignmentSubmission>>> GetSubmissions()
        {
            var submissions = await _context.AssignmentSubmissions.ToListAsync();
            return Ok(submissions);
        }

        [HttpPost("submit")]
        public async Task<ActionResult<Guid>> SubmitAssignment([FromBody] SubmitAssignmentCommand command)
        {
            var submissionId = await _mediator.Send(command);
            return Ok(submissionId);
        }
    }
}
