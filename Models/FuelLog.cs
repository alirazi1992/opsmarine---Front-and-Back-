namespace OpsMarine.Api.Models;

public class FuelLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? TankId { get; set; }
    public DateTime CreatedAt { get; set; }
    public int Liters { get; set; }
    public int Delta { get; set; }
    public double Distance_Nm { get; set; }
    public string? Location { get; set; }
    public double? Lat { get; set; }
    public double? Lon { get; set; }
}
