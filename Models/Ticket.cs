namespace OpsMarine.Api.Models;

public class Ticket
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Title { get; set; }
    public string? VesselId { get; set; }
    public string? Priority { get; set; } // Low | Medium | High | Urgent
    public string? Status { get; set; }   // Open | In Progress | Closed
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public string? Subcategory { get; set; }
    public string? Assignee { get; set; }
    public DateTime? DueDate { get; set; }
    public string[]? Tags { get; set; }
    public string[]? Watchers { get; set; }
    public string[]? Files { get; set; }  // just filenames for now
}
