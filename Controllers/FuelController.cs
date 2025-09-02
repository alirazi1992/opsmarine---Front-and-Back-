using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using OpsMarine.Api.Models;

namespace OpsMarine.Api.Controllers;

[ApiController]
[Route("fuel")]
public class FuelController : ControllerBase
{
    private readonly AppDbContext _db;
    public FuelController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _db.Fuel.AsNoTracking().ToListAsync());

    public class FuelPatch
    {
        public int? Liters { get; set; }
        public int? Percent { get; set; }
    }

    // matches frontend: PATCH /fuel/{id} with { liters, percent } :contentReference[oaicite:12]{index=12}
    [HttpPatch("{id}")]
    public async Task<IActionResult> Patch(string id, [FromBody] FuelPatch patch)
    {
        var t = await _db.Fuel.FirstOrDefaultAsync(x => x.Id == id);
        if (t == null) return NotFound();

        var cap = t.Capacity ?? 0;

        if (patch.Liters.HasValue)
        {
            var liters = patch.Liters.Value;
            if (cap > 0) liters = Math.Clamp(liters, 0, cap);
            t.Liters = liters;
            if (cap > 0) t.Percent = (int)Math.Clamp(Math.Round((double)liters / cap * 100), 0, 100);
        }
        if (patch.Percent.HasValue && cap > 0)
        {
            var pct = Math.Clamp(patch.Percent.Value, 0, 100);
            t.Percent = pct;
            t.Liters = (int)Math.Round(pct / 100.0 * cap);
        }

        await _db.SaveChangesAsync();
        return Ok(t);
    }
}
