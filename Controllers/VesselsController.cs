using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;

namespace OpsMarine.Api.Controllers;

[ApiController]
public class VesselsController : ControllerBase
{
    private readonly AppDbContext _db;
    public VesselsController(AppDbContext db) => _db = db;

    [HttpGet("vessels")]
    public async Task<IActionResult> GetVessels() =>
        Ok(await _db.Vessels.AsNoTracking().ToListAsync());
}
