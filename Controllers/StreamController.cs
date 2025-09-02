using Microsoft.AspNetCore.Mvc;

namespace OpsMarine.Api.Controllers;

[ApiController]
public class StreamController : ControllerBase
{
    // GET http://localhost:7001/vessels/stream
    [HttpGet("vessels/stream")]
    public async Task GetVesselsStream()
    {
        // Required SSE headers
        Response.StatusCode = 200;
        Response.Headers["Content-Type"] = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no"; // helpful if behind Nginx

        await Response.Body.FlushAsync();

        var ct = HttpContext.RequestAborted;

        try
        {
            while (!ct.IsCancellationRequested)
            {
                // Send a named event "tick" with a simple payload (timestamp)
                var payload = $"event: tick\ndata: {DateTime.UtcNow:O}\n\n";
                await Response.WriteAsync(payload, ct);
                await Response.Body.FlushAsync(ct);

                // Every 10 seconds (tune as you like)
                await Task.Delay(TimeSpan.FromSeconds(10), ct);
            }
        }
        catch (TaskCanceledException)
        {
            // client disconnected — safe to ignore
        }
    }
}
