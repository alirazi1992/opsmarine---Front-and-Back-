namespace OpsMarine.Api.Models;

public class VesselTrack
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Vessel { get; set; }   // vessel name
    public DateTime Time { get; set; }
    public double Lat { get; set; }
    public double Lon { get; set; }
}
