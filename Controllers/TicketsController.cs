using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpsMarine.Api.Data;
using OpsMarine.Api.Models;

namespace OpsMarine.Api.Controllers;

[ApiController]
[Route("tickets")]
public class TicketsController : ControllerBase
{
    private readonly AppDbContext _db;
    public TicketsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _db.Tickets.AsNoTracking().ToListAsync());

    // ONE endpoint that handles JSON or form-data
    [HttpPost]
    public async Task<IActionResult> Create()
    {
        try
        {
            string? title, vesselInput, priority, status, description, category, subcategory, assignee, dueDateStr;
            string[]? tagsArr, watchersArr, files;

            if (Request.HasFormContentType)
            {
                var form = await Request.ReadFormAsync();

                title = form["title"].FirstOrDefault();
                vesselInput = form["vesselId"].FirstOrDefault() ?? form["vessel"].FirstOrDefault();
                priority = form["priority"].FirstOrDefault();
                status = form["status"].FirstOrDefault();
                description = form["description"].FirstOrDefault();
                category = form["category"].FirstOrDefault();
                subcategory = form["subcategory"].FirstOrDefault();
                assignee = form["assignee"].FirstOrDefault();
                dueDateStr = form["dueDate"].FirstOrDefault();

                tagsArr = SplitCsv(form["tags"].FirstOrDefault());
                watchersArr = SplitCsv(form["watchers"].FirstOrDefault());
                files = form.Files?.Select(f => f.FileName).ToArray();
            }
            else
            {
                using var reader = new StreamReader(Request.Body);
                var json = await reader.ReadToEndAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                title = GetString(root, "title");
                // vesselId may be number or string; vessel may be name
                vesselInput = GetStringFlexible(root, "vesselId") ?? GetString(root, "vessel");
                priority = GetString(root, "priority");
                status = GetString(root, "status");
                description = GetString(root, "description");
                category = GetString(root, "category");
                subcategory = GetString(root, "subcategory");
                assignee = GetString(root, "assignee");
                dueDateStr = GetString(root, "dueDate");

                tagsArr = ToStringArray(root, "tags");
                watchersArr = ToStringArray(root, "watchers");
                files = null; // JSON path sends only metadata; ignore for now
            }

            if (string.IsNullOrWhiteSpace(title))
                return BadRequest("Title is required.");

            var vesselId = await ResolveVesselId(vesselInput);

            var entity = new Ticket
            {
                Id = Guid.NewGuid().ToString(),
                Title = title,
                VesselId = vesselId,
                Priority = priority,
                Status = status,
                Description = description,
                Category = category,
                Subcategory = subcategory,
                Assignee = assignee,
                DueDate = ParseAnyDate(dueDateStr),
                Tags = tagsArr,
                Watchers = watchersArr,
                Files = files,
                CreatedAt = DateTime.UtcNow
            };

            _db.Tickets.Add(entity);
            await _db.SaveChangesAsync();
            return Created($"/tickets/{entity.Id}", entity);
        }
        catch (Exception ex)
        {
            // TEMP: surface the error so you can see it in Network response
            return StatusCode(500, $"Ticket create failed: {ex.Message}");
        }
    }

    // ------- helpers -------

    private async Task<string?> ResolveVesselId(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        // try exact id
        var byId = await _db.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Id == input);
        if (byId != null) return byId.Id;
        // try name
        var byName = await _db.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Name == input);
        if (byName != null) return byName.Id;
        return input; // fallback
    }

    private static string? GetString(JsonElement root, string prop)
        => root.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String
           ? el.GetString()
           : null;

    private static string? GetStringFlexible(JsonElement root, string prop)
    {
        if (!root.TryGetProperty(prop, out var el)) return null;
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.GetRawText(), // "1" from 1
            JsonValueKind.True or JsonValueKind.False => el.GetRawText(),
            _ => null
        };
    }

    private static string[]? ToStringArray(JsonElement root, string prop)
    {
        if (!root.TryGetProperty(prop, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Array)
        {
            var list = new List<string>();
            foreach (var item in el.EnumerateArray())
                if (item.ValueKind == JsonValueKind.String) list.Add(item.GetString()!);
            return list.Count == 0 ? null : list.ToArray();
        }
        if (el.ValueKind == JsonValueKind.String)
            return SplitCsv(el.GetString());
        return null;
    }

    private static string[]? SplitCsv(string? s) =>
        string.IsNullOrWhiteSpace(s)
            ? null
            : s.Split(',').Select(x => x.Trim()).Where(x => x.Length > 0).ToArray();

    private static DateTime? ParseAnyDate(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        string[] formats =
        {
            "MM/dd/yyyy h:mm tt","MM/dd/yyyy hh:mm tt",
            "MM/dd/yyyy H:mm","MM/dd/yyyy HH:mm",
            "yyyy-MM-dd'T'HH:mm:ss.fffK","yyyy-MM-dd'T'HH:mm:ssK",
            "yyyy-MM-dd HH:mm:ss","yyyy-MM-dd"
        };
        if (DateTime.TryParseExact(s, formats, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeLocal | DateTimeStyles.AllowWhiteSpaces, out var dt)) return dt;
        if (DateTime.TryParse(s, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out dt)) return dt;
        return null;
    }
}
