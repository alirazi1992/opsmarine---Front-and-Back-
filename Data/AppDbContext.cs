using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Models;
using OpsMarine.Api.Data.Entities; // ⬅️ add this (for FuelInspection)

namespace OpsMarine.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> opt) : base(opt) { }

    public DbSet<Vessel> Vessels => Set<Vessel>();
    public DbSet<VesselTrack> VesselTracks => Set<VesselTrack>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<FuelTank> Fuel => Set<FuelTank>();
    public DbSet<FuelLog> FuelLogs => Set<FuelLog>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<Report> Reports => Set<Report>();

    // NEW: inspections for hull/prop/engine/trim-ballast
    public DbSet<FuelInspection> FuelInspections => Set<FuelInspection>();
}
