# 🌊 MarineOps 2025 — Vessel Tracking, Fuel Intelligence & IT Ticketing
 a modern, full-stack marine operations dashboard that tracks vessels, monitors fuel usage (with ML -style efficiency insights), and manags IT tickets — all in one place. 

 ----

 # ✨ Highlights

- **Real-time Vessel Map** (Leaflet + SSE): live markers, status, speed, heading, filters

- **Fuel Monitoring**: tanks, refuels, transfers, trends, projections, and efficiency KPIs

- **Fuel Efficiency “ML-style” Model**: estimates impact of **speed, route, weather, load, equipment**

- **IT Ticketing**: create, view, and track tickets from the UI or Swagger

- **Alerts & Report**s: system alerts plus quick reporting views

- **Swagger API**: explore every endpoint at `/swagger`

- **Monorepo-ready**: ship both **backend (.NET 8)** and **frontend (Vite)** together

---

📸 Screenshots


- **Dashboard Overview**


- **Vessel Map**


- **Fuel Monitoring & Trend**


- **Ticketing**
 
 ----

## 🧱 Tech Stack

- **Backend**: ASP.NET Core 8 (C#), Minimal APIs/Controllers, EF Core (InMemory for demo)

- **Frontend**: Vite, Vanilla JS (modular), Tailwind (CDN for dev), Leaflet

- **Data**: InMemory seed (demo), optional AIS stream integration (future)

- **Live updates**: Server-Sent Events (SSE) `/vessels/stream`

  ----
## 🗂 Project Structure 


  repo-root/
  apps/
    api/                  # ASP.NET Core backend
      OpsMarine.Api.sln
      OpsMarine.Api/
        Controllers/
        Data/
        Models/
        Program.cs
    web/                  # Frontend (Vite)
      index.html
      src/
        main.js
        routes/
          vessels.js
          fuel.js
          tickets.js
          newtickets.js
          alerts.js
          reports.js
          settings.js
      package.json
  docs/
    screenshots/
      dashboard.png
      vessel-map.png
      fuel-monitor.png
      tickets.png
  README.md

----

## 🚀 Quick Start (Local Dev)

**1) Backend (API)**

Requirements: **.NET 8 SDK, Visual Studio 2022** (or `dotnet` CLI)

1. Open `apps/api/OpsMarine.Api.sln` in Visual Studio.

2. Set `OpsMarine.Api` as startup project.

3. Run **F5** (or `dotnet run` in `apps/api/OpsMarine.Api/`).

You should see logs like:

Now listening on: http://localhost:7001
Application started. Press Ctrl+C to shut down.
Open Swagger: http://localhost:7001/swagger

**2) Frontend (Web)**

Requirements: **Node 18+**

```bash
cd apps/web
npm install
# Tell the web app where the API is:
# Option A: pass at runtime (dev)
set VITE_API_BASE=http://localhost:7001
npm run dev

# or put it in a .env file:
# .env
# VITE_API_BASE=http://localhost:7001
```
Vite dev server (default): http://localhost:5173

Make sure the API URL matches CORS in `Program.cs` (e.g., `http://localhost:5173`).
----
## 🔌 API Quick Reference

All via http://localhost:7001 in dev.

- `GET /vessels` — list vessels (lat/lon, speed, heading, type, status)

- `GET /vessels/stream` — **SSE** stream; frontend refreshes on `tick`

- `GET /fuel` — list tanks `{ id, name, vessel, type, capacity, percent|liters }`

- `PATCH /fuel/{id}` — update liters/percent

- `GET /fuelLogs` or `/fuelLogs?tankId=...` or `/fuelLogs/{tankId}` — fuel history

- `POST /fuelTransfers` — log a tank-to-tank transfer (optional)

- `GET /tickets` / `POST /tickets` — ticketing endpoints

- `GET /alerts` — system alerts

Explore and test from **Swagger**: `/swagger`

----
## 🧠 Fuel Efficiency “ML-style” Model (in UI)

Inside `/src/routes/fuel.js` you’ll find an interactive **Fuel Efficiency Monitor** that estimates fuel burn based on:

- **Speed (cube law)** — small changes have big impact

- **Route deviation** — actual distance vs. great-circle

- **Weather severity** — proxy factor 0..5 (wind/waves/currents)

- **Load factor** — cargo/DWT ratio

**Equipment condition** — hull fouling, propeller, engine (from last inspection or manual inputs)

Outputs:

- **Estimated daily burn (L/day)**

- **Estimated trip fuel (L)**

- **Efficiency index (0–100)**: higher is better

This is a **transparent, tunable model** for demo/POC. It mimics ML-style insights without external dependencies.
Plug in real sensors, SFOC curves, or a trained model later to replace these calculators.

----
## 🗺 Vessel Map & Fuel Tracks

- **Dashboard Map** uses Leaflet to show all vessels with colored markers by type (cargo/tanker/support).

- The **Fuel Tank Details modal** includes a **mini-track map** built from fuel logs:

       - Distances computed (great-circle) for consumption per nm

       - Start/Latest markers

       - Auto-fit bounds

- **SSE** keeps the UI fresh without full page reloads:

  - Backend: `GET /vessels/stream` sends `tick` every ~10s

  - Frontend: `EventSource` triggers route re-render (no hash flicker)
---
## 🧪 Demo Data & Seeding

- Backend seeds **vessels, fuel tanks, tickets, alerts,** and **fuel logs** on startup (optional).

- Vessel coordinates are clamped/snapped to realistic maritime regions to avoid “on-land” markers in the demo.

- You can rebuild seeders to target specific lanes or ports as needed.

  ----
## 🛠 Production Notes

- **Tailwind:** The demo uses `cdn.tailwindcss.com` for speed.
For production, install Tailwind properly (PostCSS/CLI) and purge unused styles:

    - https://tailwindcss.com/docs/installation

- **Swap EF InMemory for a real DB** (SQL Server/Postgres) in Program.cs:
```bash
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
```

- **Secrets**: Don’t commit .env. Use environment variables or CI/CD secrets.

----

## 🧯 Troubleshooting

**The page “jumps” or re-renders a lot**

- Ensure **only one** SSE listener is created (it’s at the bottom of `main.js`).

- In `renderDashboard`, make sure map controller auto-refresh is **disabled** (SSE already triggers refreshes).

**Swagger opens but endpoints 404/400**

- Confirm URLs match the routes (e.g., `/fuelLogs` vs `/fuel_logs`).

- Use the forms your frontend calls:

 - `/fuelLogs?tankId=...` or `/fuelLogs/{tankId}` (both implemented).

**CORS errors**

- Add your frontend dev URL to the `WithOrigins(...)` in `Program.cs`.

**Map markers on land**

- Seeders now bias to oceanic bounds; if you inject your own data ensure lat/lon are at sea and within OSM tile bounds.


----

## 🔮 Roadmap

- Replace demo efficiency model with trained ML model (regression over SFOC + sea state + hull condition).

- Real AIS integration (e.g., AISstream) with token & server processing.

- DB migrations & historical analytics (Postgres + Timescale).

- Role-based auth (JWT) and audit trails.

- Exportable reports (PDF/CSV).

----

🤝 Contributing

1. Fork & branch from `main`.

2. Commit with clear messages.

3. PR with screenshots for UI changes.

4. Please keep API Swagger accurate.

----
## 📬  Contact
For questions or collaboration opportunities:

**📧 Email:** ali.razi9292@gmail.com

**🔗 LinkedIn:** linkedin.com/in/alirazi1992




