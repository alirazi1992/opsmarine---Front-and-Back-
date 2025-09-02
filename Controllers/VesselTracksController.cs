using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;

namespace OpsMarine.Api.Controllers;

[ApiController]
public class VesselTracksController : ControllerBase
{
    private readonly AppDbContext _db;
    public VesselTracksController(AppDbContext db) => _db = db;

    // exact path expected by frontend: /vessel_tracks
    [HttpGet("vessel_tracks")]
    public async Task<IActionResult> GetTracks() =>
        Ok(await _db.VesselTracks.AsNoTracking().ToListAsync());
}
