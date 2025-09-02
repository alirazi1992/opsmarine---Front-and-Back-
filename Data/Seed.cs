using OpsMarine.Api.Models;

namespace OpsMarine.Api.Data;

public static class Seed
{
    // ~~~ CONFIG ~~~
    private static readonly Random Rng = new(1234);
    private const int TrackHours = 24;        // generate 24 hourly points
    private const int FuelLogEveryHours = 6;  // 1 fuel log per 6 hours
    private const double JitterKm = 0.6;      // small sideways jitter (keeps you off land)

    // Hand-picked offshore routes (Persian Gulf / Strait of Hormuz / Gulf of Oman)
    // Points chosen well away from coastline & islands.
    private static readonly List<(string name, (double lat, double lon)[] waypoints)> SeaRoutes =
    new()
    {
        (
            "Dubai → Hormuz → Oman",
            new (double,double)[] {
                (25.25, 55.23), // off Dubai
                (25.65, 56.05),
                (26.10, 56.60),
                (26.35, 56.95), // mid-Gulf
                (26.30, 57.25), // Strait of Hormuz W
                (26.05, 57.80),
                (25.70, 58.40)  // Gulf of Oman (offshore)
            }
        ),
        (
            "Upper Gulf → Mid Gulf → Dubai waters",
            new (double,double)[] {
                (29.10, 49.25), // N. Gulf offshore (south of Kuwait fairway)
                (28.10, 50.80),
                (27.30, 52.20),
                (26.60, 53.50),
                (26.00, 54.40),
                (25.60, 55.20)  // near Dubai waters offshore
            }
        ),
        (
            "Bushehr offshore → Mid Gulf → Abu Dhabi offshore",
            new (double,double)[] {
                (28.70, 50.60), // SSW of Bushehr, offshore
                (27.85, 51.70),
                (27.10, 52.90),
                (26.50, 54.10),
                (25.90, 54.90),
                (24.90, 53.80)  // off Abu Dhabi (offshore)
            }
        )
    };

    public static void Run(AppDbContext db)
    {
        if (db.Vessels.Any()) return; // already seeded

        // 1) Create vessels, positioned at first point of their assigned route
        var vessels = new List<Vessel>();
        var vesselToRoute = new Dictionary<string, (double lat, double lon)[]>();

        // pick 6 vessels across the 3 routes
        var routeA = SeaRoutes[0].waypoints;
        var routeB = SeaRoutes[1].waypoints;
        var routeC = SeaRoutes[2].waypoints;

        vessels.Add(MakeVessel("1", "SEA DAWN", "9876543", routeA[0]));
        vesselToRoute["1"] = routeA;

        vessels.Add(MakeVessel("2", "BLUE HARBOR", "9731122", routeB[0]));
        vesselToRoute["2"] = routeB;

        vessels.Add(MakeVessel("3", "ALPHA WAVE", "9588776", routeC[0]));
        vesselToRoute["3"] = routeC;

        vessels.Add(MakeVessel("4", "MV Oceanic", "9012345", routeA[0]));
        vesselToRoute["4"] = routeA;

        vessels.Add(MakeVessel("5", "MV Horizon", "9016789", routeB[0]));
        vesselToRoute["5"] = routeB;

        vessels.Add(MakeVessel("6", "MV Explorer", "9023456", routeC[0]));
        vesselToRoute["6"] = routeC;

        db.Vessels.AddRange(vessels);

        // 2) Tracks: generate hourly points along each route, with slight jitter
        var now = DateTime.UtcNow;
        var tracks = new List<VesselTrack>();

        foreach (var v in vessels)
        {
            var route = vesselToRoute[v.Id];
            var start = now.AddHours(-TrackHours); // last 24h
            for (int h = 0; h <= TrackHours; h++)
            {
                double t = (double)h / TrackHours;
                var p = InterpRoute(route, t);
                p = Jitter(p, JitterKm);

                tracks.Add(new VesselTrack
                {
                    Id = $"trk-{v.Id}-{h}",
                    Vessel = v.Name,
                    Time = start.AddHours(h),
                    Lat = p.lat,
                    Lon = p.lon
                });

                // For “current” vessel position use the last point
                if (h == TrackHours)
                {
                    v.Lat = p.lat;
                    v.Lon = p.lon;
                    v.Status = "Underway";
                    v.Eta = now.AddHours(Rng.Next(8, 48));
                    v.Type = GuessTypeFromName(v.Name);
                }
            }
        }
        db.VesselTracks.AddRange(tracks);

        // 3) Fuel tanks for 2 vessels + logs at some recent track points
        db.Fuel.AddRange(new[]
        {
            new FuelTank{ Id="1", Name="Main Tank", Percent=82, Type="Diesel", Vessel=vessels[3].Name, Capacity=20000, Liters=(int)(0.82*20000) },
            new FuelTank{ Id="2", Name="Aux Tank",  Percent=34, Type="Diesel", Vessel=vessels[3].Name, Capacity=20000, Liters=(int)(0.34*20000) },
            new FuelTank{ Id="3", Name="Port Tank", Percent=56, Type="Diesel", Vessel=vessels[4].Name, Capacity=20000, Liters=(int)(0.56*20000) }
        });

        var fuelLogs = new List<FuelLog>();
        // tie fuel logs to last points of Oceanic (v4) main tank
        var v4Name = vessels[3].Name; // MV Oceanic
        var v4Points = tracks.Where(t => t.Vessel == v4Name)
                             .OrderBy(t => t.Time)
                             .ToList();

        for (int i = v4Points.Count - 1; i >= 0 && i >= v4Points.Count - 1 - (TrackHours / FuelLogEveryHours * 2); i -= FuelLogEveryHours)
        {
            var pt = v4Points[i];
            var liters = 20000 - (v4Points.Count - 1 - i) * 180; // consume ~180 L/6h
            var delta = i == v4Points.Count - 1 ? 0 : -180;

            fuelLogs.Add(new FuelLog
            {
                Id = $"L-{i}",
                TankId = "1",
                CreatedAt = pt.Time,
                Liters = Math.Max(0, liters),
                Delta = delta,
                Distance_Nm = 12 + Rng.NextDouble() * 8,
                Location = "at sea",
                Lat = pt.Lat,
                Lon = pt.Lon
            });
        }
        db.FuelLogs.AddRange(fuelLogs);

        // 4) Tickets & Alerts (not critical for map placement)
        db.Tickets.AddRange(new[]
        {
            new Ticket{ Id="101", Title="Radar intermittent", VesselId="2", Priority="High", Status="Open", CreatedAt=now.AddDays(-1) },
            new Ticket{ Id="102", Title="Engine sensor alert", VesselId="1", Priority="Medium", Status="In Progress", CreatedAt=now.AddDays(-2) }
        });

        db.Alerts.AddRange(new[]
        {
            new Alert{ Id="1", Level="High", Message="Engine temp spike", VesselId="2", CreatedAt=now.AddHours(-6) },
            new Alert{ Id="2", Level="Medium", Message="Weather avoidance route change", VesselId="4", CreatedAt=now.AddHours(-3) }
        });

        db.Reports.Add(new Report { Id = "1", Title = "Daily Vessel Summary", Type = "Daily", CreatedAt = now.AddHours(-4) });

        db.SaveChanges();
    }

    // ~~~ helpers ~~~

    private static Vessel MakeVessel(string id, string name, string imo, (double lat, double lon) start)
        => new()
        {
            Id = id,
            Name = name,
            Imo = imo,
            Lat = start.lat,
            Lon = start.lon,
            Status = "Underway",
            Type = "cargo"
        };

    private static string GuessTypeFromName(string name)
    {
        name = name.ToLowerInvariant();
        if (name.Contains("oceanic") || name.Contains("horizon")) return "tanker";
        if (name.Contains("explorer") || name.Contains("alpha")) return "support";
        return "cargo";
    }

    // Interpolate along polyline route [0..1]
    private static (double lat, double lon) InterpRoute((double lat, double lon)[] route, double t)
    {
        if (t <= 0) return route[0];
        if (t >= 1) return route[^1];

        // compute cumulative segment lengths
        var segLen = new double[route.Length - 1];
        double total = 0;
        for (int i = 0; i < segLen.Length; i++)
        {
            segLen[i] = HaversineKm(route[i], route[i + 1]);
            total += segLen[i];
        }
        var dist = t * total;

        double cum = 0;
        for (int i = 0; i < segLen.Length; i++)
        {
            if (cum + segLen[i] >= dist)
            {
                var localT = (dist - cum) / segLen[i];
                return Lerp(route[i], route[i + 1], localT);
            }
            cum += segLen[i];
        }
        return route[^1];
    }

    private static (double lat, double lon) Lerp((double lat, double lon) a, (double lat, double lon) b, double t)
        => (a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);

    // Very small perpendicular jitter to avoid ruler-straight lines; small enough to stay offshore.
    private static (double lat, double lon) Jitter((double lat, double lon) p, double km)
    {
        if (km <= 0) return p;
        // 1 degree lat ≈ 111 km; 1 degree lon ≈ 111 km * cos(lat)
        double dLat = (Rng.NextDouble() - 0.5) * (km / 111.0) * 2.0;
        double lonScale = Math.Cos(p.lat * Math.PI / 180.0);
        double dLon = (Rng.NextDouble() - 0.5) * (km / (111.0 * Math.Max(0.2, lonScale))) * 2.0;
        return (p.lat + dLat, p.lon + dLon);
    }

    private static double HaversineKm((double lat, double lon) a, (double lat, double lon) b)
    {
        const double R = 6371.0; // km
        double dLat = (b.lat - a.lat) * Math.PI / 180.0;
        double dLon = (b.lon - a.lon) * Math.PI / 180.0;
        double sa = Math.Sin(dLat / 2), sb = Math.Sin(dLon / 2);
        double aa = sa * sa + Math.Cos(a.lat * Math.PI / 180.0) * Math.Cos(b.lat * Math.PI / 180.0) * sb * sb;
        return 2 * R * Math.Asin(Math.Min(1, Math.Sqrt(aa)));
    }
}
