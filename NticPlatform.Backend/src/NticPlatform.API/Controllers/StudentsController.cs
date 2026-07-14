using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NticPlatform.Domain.Entities.StudentContext;
using NticPlatform.Domain.Enums;
using NticPlatform.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace NticPlatform.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StudentsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public StudentsController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Student>>> GetStudents()
        {
            var students = await _context.Students.ToListAsync();
            return Ok(students);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Student>> GetStudent(Guid id)
        {
            var student = await _context.Students.FindAsync(id);
            if (student == null)
            {
                return NotFound();
            }
            return Ok(student);
        }

        public record CreateStudentRequest(
            Guid TenantId,
            string FirstName,
            string LastName,
            string Email,
            CompetitionTrack Track,
            bool ConsentGranted);

        [HttpPost]
        public async Task<ActionResult<Student>> CreateStudent([FromBody] CreateStudentRequest request)
        {
            var student = new Student(
                request.TenantId,
                request.FirstName,
                request.LastName,
                request.Email,
                request.Track,
                request.ConsentGranted);

            _context.Students.Add(student);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetStudent), new { id = student.Id }, student);
        }
    }
}
