namespace OpsMarine.Api.Models;

public class Alert
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Level { get; set; }     // Low | Medium | High | Critical
    public string? Message { get; set; }
    public string? VesselId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool Acknowledged { get; set; } = false;
}
