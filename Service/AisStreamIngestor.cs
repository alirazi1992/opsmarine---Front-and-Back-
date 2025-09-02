using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using OpsMarine.Api.Models;

namespace OpsMarine.Api.Services;

public class AisStreamIngestor : BackgroundService
{
    private readonly ILogger<AisStreamIngestor> _log;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _cfg;

    public AisStreamIngestor(ILogger<AisStreamIngestor> log, IServiceScopeFactory scopeFactory, IConfiguration cfg)
    {
        _log = log;
        _scopeFactory = scopeFactory;
        _cfg = cfg;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var token = _cfg["AisStream:Token"] ?? "";
        if (string.IsNullOrWhiteSpace(token))
        {
            _log.LogWarning("AISstream token missing; skipping live ingest.");
            return;
        }

        var bbox = _cfg.GetSection("AisStream:BoundingBox").Get<double[]>() ?? new[] { 23.0, 51.0, 27.5, 58.5 };
        var reconnectSeconds = int.TryParse(_cfg["AisStream:ReconnectSeconds"], out var s) ? s : 10;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var ws = new ClientWebSocket();
                var uri = new Uri($"wss://stream.aisstream.io/v0/stream?token={token}");
                await ws.ConnectAsync(uri, stoppingToken);

                // Subscribe: bounding box + PositionReport messages
                var sub = new
                {
                    BoundingBoxes = new[] { new[] { bbox[0], bbox[1], bbox[2], bbox[3] } },
                    FilterMessageTypes = new[] { "PositionReport" }
                };
                var subJson = JsonSerializer.Serialize(sub);
                await ws.SendAsync(Encoding.UTF8.GetBytes(subJson), WebSocketMessageType.Text, true, stoppingToken);

                var buf = new byte[64 * 1024];
                _log.LogInformation("AISstream connected.");

                while (ws.State == WebSocketState.Open && !stoppingToken.IsCancellationRequested)
                {
                    var result = await ws.ReceiveAsync(buf, stoppingToken);
                    if (result.MessageType == WebSocketMessageType.Close) break;

                    var json = Encoding.UTF8.GetString(buf, 0, result.Count);
                    await HandleMessageAsync(json, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "AISstream ingest failed. Reconnecting in {sec}s", reconnectSeconds);
                await Task.Delay(TimeSpan.FromSeconds(reconnectSeconds), stoppingToken);
            }
        }
    }

    private async Task HandleMessageAsync(string json, CancellationToken ct)
    {
        // AISstream envelope: { "MessageType": "...", "Message": { ... } }
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (!root.TryGetProperty("MessageType", out var t) || t.GetString() != "PositionReport")
            return;

        if (!root.TryGetProperty("Message", out var msg)) return;

        // Extract needed fields (guard against missing ones)
        string? mmsi = msg.TryGetProperty("UserID", out var m) ? m.GetRawText().Trim('"') : null;
        if (string.IsNullOrWhiteSpace(mmsi)) return;

        double? lat = TryGetDouble(msg, "Latitude");
        double? lon = TryGetDouble(msg, "Longitude");
        double? sog = TryGetDouble(msg, "Sog"); // knots
        double? cog = TryGetDouble(msg, "Cog"); // deg
        string? nav = msg.TryGetProperty("NavigationalStatus", out var ns) && ns.ValueKind == JsonValueKind.String ? ns.GetString() : null;

        if (lat is null || lon is null) return;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Try to find matching vessel by MMSI (we'll store MMSI in Id if new)
        var vessel = await db.Vessels.FirstOrDefaultAsync(v => v.Imo == mmsi || v.Id == mmsi, ct);
        if (vessel == null)
        {
            vessel = new Vessel
            {
                Id = mmsi,          // store MMSI as Id to keep it simple
                Name = $"MMSI {mmsi}",
                Imo = mmsi,         // reuse field; your model doesn’t have MMSI
                Type = "cargo"
            };
            db.Vessels.Add(vessel);
        }

        vessel.Lat = lat;
        vessel.Lon = lon;
        vessel.Status = sog.HasValue && sog.Value > 0.5 ? "Underway" : "At Berth";
        vessel.Eta = DateTime.UtcNow.AddHours(12);

        // Append a short track (keep last ~100 pts / vessel to avoid growth)
        db.VesselTracks.Add(new VesselTrack
        {
            Id = $"{mmsi}-{Guid.NewGuid().ToString()[..8]}",
            Vessel = vessel.Name!,
            Time = DateTime.UtcNow,
            Lat = lat.Value,
            Lon = lon.Value
        });

        // Trim track if too long
        var old = await db.VesselTracks
            .Where(tk => tk.Vessel == vessel.Name)
            .OrderByDescending(tk => tk.Time)
            .Skip(100)
            .ToListAsync(ct);
        if (old.Count > 0) db.VesselTracks.RemoveRange(old);

        await db.SaveChangesAsync(ct);
    }

    private static double? TryGetDouble(JsonElement el, string name)
        => el.TryGetProperty(name, out var v) && v.TryGetDouble(out var d) ? d : null;
}
