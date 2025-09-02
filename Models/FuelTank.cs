namespace OpsMarine.Api.Models;

public class FuelTank
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Name { get; set; }
    public int? Percent { get; set; }    // 0..100
    public string? Type { get; set; }    // Diesel, MGO, etc.
    public string? Vessel { get; set; }  // vessel name (as per your JSON)
    public int? Capacity { get; set; }   // liters
    public int? Liters { get; set; }     // current liters
}
