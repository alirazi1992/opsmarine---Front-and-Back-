using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using OpsMarine.Api.Data.Entities; // FuelInspection
using OpsMarine.Api.Models;        // FuelLog, FuelTank

namespace OpsMarine.Api.Controllers;

[ApiController]
public class FuelAnalyticsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FuelAnalyticsController(AppDbContext db) => _db = db;

    // small helper type to avoid tuple name issues
    private sealed class DayAgg
    {
        public double Consumed; // liters (sum of negative deltas, as positive)
        public double Bunkered; // liters (sum of positive deltas)
    }

    private static DateOnly D(DateTime dt) => DateOnly.FromDateTime(dt.ToUniversalTime());

    private static Dictionary<DateOnly, DayAgg> BuildDailySeries(
        IEnumerable<(DateTime CreatedAt, double Delta)> logs, int days)
    {
        var end = DateOnly.FromDateTime(DateTime.UtcNow);
        var start = end.AddDays(-(days - 1));

        var dict = new Dictionary<DateOnly, DayAgg>();
        for (var d = start; d <= end; d = d.AddDays(1))
            dict[d] = new DayAgg();

        foreach (var (createdAt, delta) in logs)
        {
            var key = D(createdAt);
            if (!dict.ContainsKey(key)) continue;

            if (delta < 0)
                dict[key].Consumed += -delta; // store as positive liters consumed
            else if (delta > 0)
                dict[key].Bunkered += delta;
        }
        return dict;
    }

    private async Task<List<(DateTime CreatedAt, double Delta)>> LoadAllFuelLogsAsync()
    {
        // Your FuelLog is in OpsMarine.Api.Models and has: CreatedAt, Delta, TankId (TankId not needed here)
        var rows = await _db.FuelLogs
            .AsNoTracking()
            .Select(x => new { x.CreatedAt, x.Delta })
            .ToListAsync();

        return rows.Select(r => (r.CreatedAt, (double)r.Delta)).ToList();
    }

    private async Task<(double TotalLiters, double TotalCapacity)> GetTotalsAsync()
    {
        try
        {
            // Strongly-typed against your FuelTank model used by the frontend (Capacity, Liters, Percent)
            var rows = await _db.Fuel
                .AsNoTracking()
                .Select(t => new
                {
                    Capacity = (double?)(object?)t.Capacity, // handles int?/double?/decimal? at runtime
                    Liters = (double?)(object?)t.Liters,
                    Percent = (double?)(object?)t.Percent
                })
                .ToListAsync();

            double totalCap = 0, totalLiters = 0;
            foreach (var r in rows)
            {
                var cap = r.Capacity ?? 0;
                var liters = r.Liters ?? ((r.Percent.HasValue && r.Capacity.HasValue)
                    ? r.Capacity.Value * (r.Percent.Value / 100.0)
                    : 0);

                totalCap += cap;
                totalLiters += liters;
            }
            return (totalLiters, totalCap);
        }
        catch
        {
            return (0, 0);
        }
    }

    // -------------------- Endpoints --------------------

    // GET /fuel/analytics/trend?days=30
    [HttpGet("fuel/analytics/trend")]
    public async Task<IActionResult> Trend([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 7, 180);
        var logs = await LoadAllFuelLogsAsync();

        var daily = BuildDailySeries(logs, days)
            .OrderBy(kv => kv.Key)
            .Select(kv => new
            {
                date = kv.Key.ToDateTime(TimeOnly.MinValue),
                consumed = Math.Round(kv.Value.Consumed, 2),
                bunkered = Math.Round(kv.Value.Bunkered, 2)
            })
            .ToList();

        return Ok(daily);
    }

    // GET /fuel/analytics/summary?days=30
    [HttpGet("fuel/analytics/summary")]
    public async Task<IActionResult> Summary([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 7, 180);
        var logs = await LoadAllFuelLogsAsync();

        var daily = BuildDailySeries(logs, days);
        var consumedList = daily.Values.Select(v => v.Consumed).ToList();

        var avgDaily = consumedList.Count > 0 ? consumedList.Average() : 0.0;
        var maxDaily = consumedList.Count > 0 ? consumedList.Max() : 0.0;
        var minDaily = consumedList.Count > 0 ? consumedList.Min() : 0.0;

        // last 7 days rolling average
        var last7 = daily.OrderByDescending(kv => kv.Key)
                         .Take(7)
                         .Select(kv => kv.Value.Consumed)
                         .ToList();
        var last7Avg = last7.Count > 0 ? last7.Average() : 0.0;

        var (totalLiters, totalCapacity) = await GetTotalsAsync();
        double? estRangeDays = avgDaily > 0 ? Math.Round(totalLiters / avgDaily, 1) : (double?)null;

        return Ok(new
        {
            days,
            avgDailyLiters = Math.Round(avgDaily, 1),
            maxDailyLiters = Math.Round(maxDaily, 1),
            minDailyLiters = Math.Round(minDaily, 1),
            last7AvgLiters = Math.Round(last7Avg, 1),
            totalOnboardLiters = Math.Round(totalLiters, 0),
            totalCapacityLiters = Math.Round(totalCapacity, 0),
            estimatedDaysToEmpty = estRangeDays // nullable is OK in JSON
        });
    }

    // GET /fuel/analytics/recommendations?days=30
    [HttpGet("fuel/analytics/recommendations")]
    public async Task<IActionResult> Recommendations([FromQuery] int days = 30)
    {
        var recs = new List<object>();

        var logs = await LoadAllFuelLogsAsync();
        var daily = BuildDailySeries(logs, Math.Clamp(days, 7, 90))
            .OrderBy(kv => kv.Key)
            .Select(kv => kv.Value.Consumed)
            .ToList();

        if (daily.Count >= 14)
        {
            var first7 = daily.Skip(Math.Max(0, daily.Count - 14)).Take(7).ToList();
            var last7 = daily.TakeLast(7).ToList();
            var prevAvg = first7.Count > 0 ? first7.Average() : 0.0;
            var recentAv = last7.Average();

            if (prevAvg > 0 && recentAv > prevAvg * 1.15)
            {
                recs.Add(new
                {
                    level = "High",
                    message = "Fuel consumption rose >15% vs prior week. Consider slow steaming and route optimization.",
                    factor = "Speed management / Route planning"
                });
            }

            var stdev = Math.Sqrt(last7.Select(x => Math.Pow(x - recentAv, 2)).Sum() / last7.Count);
            if (stdev > Math.Max(50, recentAv * 0.35))
            {
                recs.Add(new
                {
                    level = "Medium",
                    message = "Large day-to-day variation suggests frequent maneuvering/idling near ports. Review port calls & anchoring time.",
                    factor = "Maneuvering & idling"
                });
            }
        }

        // Latest inspection (any vessel; we didn't bind logs to tanks by vessel name)
        var insp = await _db.FuelInspections.AsNoTracking()
            .OrderByDescending(i => i.CreatedAt)
            .FirstOrDefaultAsync();

        if (insp != null)
        {
            if (insp.HullFouling >= 3)
                recs.Add(new { level = "High", message = "Hull fouling is high. Schedule cleaning / anti-fouling coating.", factor = "Hull condition" });
            if (insp.Propeller >= 3)
                recs.Add(new { level = "High", message = "Propeller condition poor. Inspect/clean propeller.", factor = "Propeller condition" });
            if (insp.Engine >= 3)
                recs.Add(new { level = "Medium", message = "Engine health flagged. Check RPM/temps/pressures and maintenance logs.", factor = "Engine efficiency" });
            if (!insp.TrimOk)
                recs.Add(new { level = "Medium", message = "Trim not optimal. Adjust trim for lower resistance.", factor = "Trim & ballast" });
            if (insp.ExcessBallast)
                recs.Add(new { level = "Medium", message = "Excess ballast reported. Reduce ballast when safe.", factor = "Trim & ballast" });
        }
        else
        {
            recs.Add(new { level = "Info", message = "No inspection on record. Log a quick hull/prop/engine inspection to refine advice.", factor = "Monitoring" });
        }

        // Many small bunkers pattern
        var tinyBunkers = logs.Where(x => x.Delta > 0 && x.Delta <= 500).Count();
        if (tinyBunkers >= 3)
            recs.Add(new { level = "Low", message = "Many small bunkerings. Consolidate bunkers to reduce handling losses.", factor = "Bunker management" });

        return Ok(recs);
    }

    // ---------- Inspections CRUD ----------

    // GET /fuel/inspections
    [HttpGet("fuel/inspections")]
    public async Task<IActionResult> GetInspections()
    {
        var list = await _db.FuelInspections
            .AsNoTracking()
            .OrderByDescending(i => i.CreatedAt)
            .Take(50)
            .ToListAsync();

        return Ok(list);
    }

    // POST /fuel/inspections
    [HttpPost("fuel/inspections")]
    public async Task<IActionResult> CreateInspection([FromBody] FuelInspection dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Vessel)) dto.Vessel = "Unknown";
        dto.CreatedAt = DateTime.UtcNow;

        _db.FuelInspections.Add(dto);
        await _db.SaveChangesAsync();

        return Ok(dto);
    }
}
