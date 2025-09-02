using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using System.Linq;

namespace OpsMarine.Api.Controllers;

[ApiController]
public class FuelLogsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FuelLogsController(AppDbContext db) => _db = db;

    // GET /fuelLogs and /fuel_logs
    // Supports ?tankId=... OR ?tank_id=...
    [HttpGet("fuelLogs")]
    [HttpGet("fuel_logs")]
    public async Task<IActionResult> GetAll()
    {
        string? tankId =
            (Request.Query.TryGetValue("tankId", out var v1) ? v1.ToString() : null)
            ?? (Request.Query.TryGetValue("tank_id", out var v2) ? v2.ToString() : null);

        var q = _db.FuelLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(tankId))
            q = q.Where(x => x.TankId == tankId);

        var list = await q.OrderBy(x => x.CreatedAt).ToListAsync();
        return Ok(list);
    }

    // GET /fuelLogs/{tankId} and /fuel_logs/{tankId}
    [HttpGet("fuelLogs/{tankId}")]
    [HttpGet("fuel_logs/{tankId}")]
    public async Task<IActionResult> GetByTank(string tankId)
    {
        var list = await _db.FuelLogs.AsNoTracking()
            .Where(x => x.TankId == tankId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync();

        return Ok(list);
    }
}
