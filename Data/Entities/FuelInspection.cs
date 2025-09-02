using System.ComponentModel.DataAnnotations;

namespace OpsMarine.Api.Data.Entities;

public class FuelInspection
{
    public int Id { get; set; }

    [Required, MaxLength(128)]
    public string Vessel { get; set; } = "Unknown";   // free text short name is fine

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // 0 = good, 5 = bad (more fouling / worse condition)
    [Range(0, 5)] public int HullFouling { get; set; } = 0;
    [Range(0, 5)] public int Propeller { get; set; } = 0;
    [Range(0, 5)] public int Engine { get; set; } = 0;

    // simple operational flags
    public bool TrimOk { get; set; } = true;
    public bool ExcessBallast { get; set; } = false;

    [MaxLength(512)]
    public string? Notes { get; set; }
}
