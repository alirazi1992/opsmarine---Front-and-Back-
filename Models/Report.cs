namespace OpsMarine.Api.Models;

public class Report
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? Title { get; set; }
    public string? Type { get; set; }      // Daily | Weekly | Analytics
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Url { get; set; }
}
