using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;

namespace OpsMarine.Api.Controllers;

[ApiController]
[Route("alerts")]
public class AlertsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AlertsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _db.Alerts.AsNoTracking().ToListAsync());

    // Optional acknowledge endpoint to complement your local ack
    [HttpPost("{id}/ack")]
    public async Task<IActionResult> Ack(string id)
    {
        var a = await _db.Alerts.FirstOrDefaultAsync(x => x.Id == id);
        if (a == null) return NotFound();
        a.Acknowledged = true;
        await _db.SaveChangesAsync();
        return Ok(a);
    }
}
