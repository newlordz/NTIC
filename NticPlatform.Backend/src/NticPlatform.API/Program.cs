using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NticPlatform.Infrastructure;
using NticPlatform.Infrastructure.Persistence;
using System;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(NticPlatform.Application.LMSContext.Commands.SubmitAssignmentCommand).Assembly));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.CreateApp();

// Configure HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();

// Ensure PostgreSQL database is created
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        dbContext.Database.EnsureCreated();
        logger.LogInformation("Successfully connected to PostgreSQL and verified database schema.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not automatically create/connect to PostgreSQL database on startup. Verify PostgreSQL server is running.");
    }
}

app.Run();

// Extension method helper for testing/extension
public static class WebApplicationExtensions
{
    public static WebApplication CreateApp(this WebApplicationBuilder builder)
    {
        return builder.Build();
    }
}
