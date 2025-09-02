using OpsMarine.Api.Data;
using OpsMarine.Api.Models;

namespace OpsMarine.Api.Data;

public static class SeedFuelAnalytics
{
    public static void Run(AppDbContext db)
    {
        if (db.FuelLogs.Any()) return; // keep existing data

        var rnd = new Random(42);
        var start = DateTime.UtcNow.AddDays(-30);
        var tankId = "TANK-A"; // your existing tanks can have any string id

        double dailyBase = 1800; // liters/day base burn
        for (int i = 0; i < 30; i++)
        {
            var day = start.AddDays(i);

            // introduce some variability (weather/ops)
            var waveFactor = 0.85 + rnd.NextDouble() * 0.5;     // 0.85–1.35
            var speedBump = (i > 18 ? 1.12 : 1.0);              // last 12 days a bit faster
            var consumed = Math.Round(dailyBase * waveFactor * speedBump + rnd.Next(-120, 120));

            db.FuelLogs.Add(new FuelLog
            {
                TankId = tankId,
                CreatedAt = day.AddHours(18),
                Delta = (int)-consumed   // negative for consumption
            });

            // random small bunkers
            if (rnd.NextDouble() < 0.12)
            {
                db.FuelLogs.Add(new FuelLog
                {
                    TankId = tankId,
                    CreatedAt = day.AddHours(10),
                    Delta = rnd.Next(1500, 3500)   // positive = bunker
                });
            }
        }

        db.SaveChanges();
    }
}
