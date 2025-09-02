using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using OpsMarine.Api.Services; // <— NEW (for AisStreamIngestor)

var builder = WebApplication.CreateBuilder(args);

// Controllers + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// EF InMemory (keep as-is; switch to SQLite later if you want persistence)
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseInMemoryDatabase("OpsMarineDB"));

// CORS: allow Vite frontend at http://localhost:5175
builder.Services.AddCors(opt =>
{
    opt.AddPolicy("frontend",
        p => p.WithOrigins("http://localhost:5175")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// === Register AISstream background ingestor ===
// Only add it if you actually set a token in appsettings.json
var aisToken = builder.Configuration["AisStream:Token"];
if (!string.IsNullOrWhiteSpace(aisToken))
{
    builder.Services.AddHostedService<AisStreamIngestor>();
    // AisStreamIngestor will read BoundingBox / ReconnectSeconds from config
}

var app = builder.Build();

// (Optional) seed
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    Seed.Run(db); // if you added the Seed class; otherwise remove this block
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("frontend");

// If you later save uploaded files to wwwroot, also add:
// app.UseStaticFiles();

app.MapControllers();

app.Run();
