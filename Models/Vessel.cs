namespace OpsMarine.Api.Models;

public class Vessel
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Name { get; set; }
    public string? Imo { get; set; }
    public string? Status { get; set; }
    public DateTime? Eta { get; set; }
    public double? Lat { get; set; }
    public double? Lon { get; set; }
    public string? Type { get; set; } // cargo | tanker | support
}
