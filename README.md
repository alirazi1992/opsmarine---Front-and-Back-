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




## 🤝 Contributing 

Feel free to fork the repo and submit PRs or raise issues for any suggastions.


## 📬  Contact
For questions or collaboration opportunities:

**📧 Email:** ali.razi9292@gmail.com

**🔗 LinkedIn:** linkedin.com/in/alirazi1992


