// ---------------------------------------------------------
// Config + tiny API
// ---------------------------------------------------------
const API_BASE = (import.meta?.env?.VITE_API_BASE) || "http://localhost:7001";

export const API = {
  get base() { return localStorage.getItem("apiBase") || API_BASE; },
  set base(v) { localStorage.setItem("apiBase", v); }
};

function api(path, opts = {}) {
  return fetch(`${API.base}${path}`, {
    headers: { "Content-Type":"application/json" },
    ...opts
  });
}
export async function jget(p){ const r=await api(p); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jpost(p,b){ const r=await api(p,{method:"POST",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jpatch(p,b){ const r=await api(p,{method:"PATCH",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jdel(p){ const r=await api(p,{method:"DELETE"}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }

// ---------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      el.setAttribute(k, v);
    }
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (c === false || c === true) return;
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  });
  return el;
}
const qs  = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> Array.from(r.querySelectorAll(s));

export function panel(title, content){
  return h("div",{class:"glass-panel rounded-2xl p-4 border border-slate-800/50"},[
    h("h2",{class:"text-lg font-semibold mb-3"}, title), content
  ]);
}
export function kpi(label, val){
  const value = (typeof val === "function" ? val() : val);
  return h("div",{class:"rounded-xl bg-slate-800/60 p-4"},[
    h("div",{class:"text-slate-300 text-sm"}, label),
    h("div",{class:"text-2xl font-bold"}, value == null ? "0" : String(value))
  ]);
}
export function table(items, columns){
  const thead = h("thead",{class:"border-b border-slate-800/60"},
    h("tr",{}, columns.map(c=>h("th",{class:"py-2 pr-4 font-semibold text-left"}, c.label)))
  );
  const tbody = h("tbody");
  (items||[]).forEach(row=>{
    const tr = h("tr",{class:"border-b border-slate-800/40 hover:bg-slate-800/30"});
    columns.forEach(c=>{
      const raw = typeof c.value === "function" ? c.value(row) : row[c.key || c.value];
      const td = h("td",{class:"py-2 pr-4"});
      if (raw instanceof Node) td.appendChild(raw);
      else if (raw == null) td.textContent = "";
      else td.textContent = typeof raw === "string" ? raw : String(raw);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  return h("table",{class:"min-w-full text-sm"},[thead,tbody]);
}

// ---------------------------------------------------------
// Modal utility (reusable)
// ---------------------------------------------------------
function closeOnEsc(e){ if(e.key==="Escape"){ destroyModal(); } }
export function showModal(title, contentNode){
  destroyModal();
  const root = qs("#modal-root");
  const overlay = h("div",{class:"fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4", id:"_modal_overlay", onClick:(e)=>{ if(e.target.id==="_modal_overlay") destroyModal(); }});
  const box = h("div",{class:"glass-panel w-full max-w-6xl rounded-2xl border border-slate-800/60 shadow-xl"},[
    h("div",{class:"flex items-center justify-between p-4 border-b border-slate-800/60"},[
      h("h3",{class:"text-lg font-semibold"}, title),
      h("button",{class:"text-slate-400 hover:text-white", onClick:destroyModal}, h("i",{class:"fas fa-times"}))
    ]),
    h("div",{class:"p-4 overflow-auto max-h-[75vh]"}, contentNode)
  ]);
  overlay.appendChild(box);
  root.appendChild(overlay);
  document.addEventListener("keydown", closeOnEsc);
}
export function destroyModal(){
  const root = qs("#modal-root");
  if (root) root.innerHTML = "";
  document.removeEventListener("keydown", closeOnEsc);
}

// ---------------------------------------------------------
// Router (imports)
// ---------------------------------------------------------
import { routeVessels }   from "./routes/vessels.js";
import { routeTickets }   from "./routes/tickets.js";
import { routeNewTicket } from "./routes/newtickets.js";
import { routeFuel }      from "./routes/fuel.js";
import { routeAlerts }    from "./routes/alerts.js";
import { routeReports }   from "./routes/reports.js";
import { routeSettings }  from "./routes/settings.js";

const routes = {
  "/dashboard": renderDashboard,
  "/vessels":   routeVessels,
  "/tickets":   routeTickets,
  "/new-ticket":routeNewTicket,
  "/fuel":      routeFuel,
  "/alerts":    routeAlerts,
  "/reports":   routeReports,
  "/settings":  routeSettings,
};

function setActiveNav(hash){
  qsa(".navlink").forEach(a=>a.classList.remove("nav-active"));
  const active = document.querySelector(`a[href="${hash}"]`);
  if (active) active.classList.add("nav-active");
}

/* ---------------- Theme / language helpers (persist + apply on every route) ---------------- */
function getTheme(){ return localStorage.getItem("theme") || "dark"; }
function applyTheme(mode){
  if (mode === "light") document.documentElement.classList.add("light");
  else document.documentElement.classList.remove("light");
  localStorage.setItem("theme", mode);
}
function getDir(){ return localStorage.getItem("uiDir") || "ltr"; }
function applyDir(dir){
  document.documentElement.setAttribute("dir", dir);
  if(dir==="rtl") document.body.classList.add("rtl"); else document.body.classList.remove("rtl");
  localStorage.setItem("uiDir", dir);
  // update search placeholder if present
  const gi = qs("#global-search") || qs('.glass-panel.sticky input[type="text"]');
  if (gi) gi.placeholder = dir==="rtl" ? "جستجو کشتی‌ها، تیکت‌ها..." : "Search vessels, tickets...";
}

/* ---------------- Topbar wiring (search, bell, user, theme/lang buttons) ------------------- */
function initTopbar(){
  // Theme buttons
  qs("#btnLight")?.addEventListener("click", ()=> applyTheme("light"));
  qs("#btnDark") ?.addEventListener("click", ()=> applyTheme("dark"));
  qs("#btnEN")   ?.addEventListener("click", ()=> applyDir("ltr"));
  qs("#btnFA")   ?.addEventListener("click", ()=> applyDir("rtl"));

  // --- GLOBAL SEARCH ---
  const gSearch = qs("#global-search") || qs('.glass-panel.sticky input[type="text"]');
  if (gSearch){
    const runSearch = async (qInput)=>{
      const q = String(qInput ?? gSearch.value ?? "").trim();
      if (!q) return;

      const [vesselsRes, ticketsRes, alertsRes] = await Promise.allSettled([
        jget("/vessels"), jget("/tickets"), jget("/alerts")
      ]);
      const ok = s => s.status==="fulfilled" ? s.value : [];
      const V = ok(vesselsRes), T = ok(ticketsRes), A = ok(alertsRes);
      const k = q.toLowerCase();

      const mv = V.filter(v => [v.name,v.imo,v.status,v.type].some(x=> String(x||"").toLowerCase().includes(k)));
      const mt = T.filter(t => [t.title,t.priority,t.status,t.vesselId].some(x=> String(x||"").toLowerCase().includes(k)));
      const ma = A.filter(a => [a.message,a.level,a.vesselId].some(x=> String(x||"").toLowerCase().includes(k)));

      const vCols = [
        {label:"Name",   value:r=> r.name||"—"},
        {label:"IMO",    value:r=> r.imo||"—"},
        {label:"Type",   value:r=> r.type||"—"},
        {label:"Status", value:r=> r.status||"—"},
        {label:"",       value:r=> h("a",{href:"#/vessels", class:"text-cyan-400 underline"},"Open")}
      ];
      const tCols = [
        {label:"Title",    value:r=> r.title||"—"},
        {label:"Vessel",   value:r=> r.vesselId!=null?`#${r.vesselId}`:"—"},
        {label:"Priority", value:r=> r.priority||"—"},
        {label:"Status",   value:r=> r.status||"—"},
        {label:"",         value:r=> h("a",{href:"#/tickets", class:"text-cyan-400 underline"},"Open")}
      ];
      const aCols = [
        {label:"Level",   value:r=> r.level||r.severity||"—"},
        {label:"Message", value:r=> r.message||"—"},
        {label:"Vessel",  value:r=> r.vesselId!=null?`#${r.vesselId}`:"—"},
        {label:"Time",    value:r=> r.createdAt?new Date(r.createdAt).toLocaleString():"—"},
        {label:"",        value:r=> h("a",{href:"#/alerts", class:"text-cyan-400 underline"},"Open")}
      ];

      const wrap = h("div",{class:"space-y-4"},[
        h("div",{class:"text-sm text-slate-400"}, `Search results for "${q}"`),
        panel("Vessels", table(mv.slice(0,10), vCols)),
        panel("Tickets", table(mt.slice(0,10), tCols)),
        panel("Alerts",  table(ma.slice(0,10), aCols)),
      ]);
      showModal("Search", wrap);
    };

    // Enter key -> search (and stop form submission)
    gSearch.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){
        e.preventDefault();
        e.stopPropagation();
        runSearch();
      }
    });

    // If input is inside a <form>, prevent page reload
    gSearch.closest("form")?.addEventListener("submit", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      runSearch();
    });

    // Magnifier icon click -> search
    const icon = document.querySelector('.glass-panel.sticky .fa-magnifying-glass, .glass-panel.sticky .fa-search');
    if (icon){
      icon.style.cursor = "pointer";
      icon.addEventListener("click", ()=> runSearch());
    }
  }

  // Bell (notifications)
  const bellIcon = qs('.glass-panel.sticky .fa-bell');
  const bellBtn  = bellIcon?.closest('button');
  bellBtn?.addEventListener("click", async ()=>{
    try{
      const alerts = await jget("/alerts");
      const list = alerts.slice().sort((a,b)=> new Date(b.createdAt||0)-new Date(a.createdAt||0));
      const body = h("div",{class:"space-y-2"},
        list.length ? list.slice(0,10).map(a=>{
          const lv = String(a.level||a.severity||"Info").toLowerCase();
          const cls = lv==="high"||lv==="critical" ? "text-red-300 bg-red-900/40"
                    : lv==="medium"||lv==="warning" ? "text-yellow-300 bg-yellow-900/40"
                    : "text-blue-300 bg-blue-900/40";
          return h("div",{class:`p-3 rounded-lg ${cls} border border-slate-800/50`},[
            h("div",{class:"text-sm font-medium"}, a.message || a.title || "Alert"),
            h("div",{class:"text-xs opacity-80 mt-1"}, `Vessel #${a.vesselId ?? "—"} • ${a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}`)
          ]);
        }) : h("div",{class:"text-sm text-slate-400"},"No new alerts.")
      );
      const footer = h("div",{class:"mt-3 flex justify-between"},[
        h("a",{href:"#/alerts", class:"text-cyan-400 hover:text-cyan-300 text-sm"},"Open Alerts"),
        h("button",{class:"text-sm px-3 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick: destroyModal},"Close")
      ]);
      showModal("Notifications", h("div",{},[body, footer]));
      // hide red dot if present
      const dot = bellBtn.querySelector('.w-2.h-2.bg-red-500.rounded-full');
      dot && dot.classList.add('hidden');
    }catch(err){
      showModal("Notifications", h("div",{class:"text-red-400"}, String(err?.message||err)));
    }
  });

  // User chip quick actions
  const avatar = qs('.glass-panel.sticky .w-8.h-8.rounded-full');
  const userContainer = avatar ? avatar.parentElement?.parentElement : null;
  userContainer?.addEventListener("click", ()=>{
    const content = h("div",{class:"space-y-3"},[
      h("div",{class:"flex items-center gap-3"},[
        h("div",{class:"w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold"},"AD"),
        h("div",{},[
          h("div",{class:"font-semibold"},"Admin User"),
          h("div",{class:"text-xs text-slate-400"},"Administrator")
        ])
      ]),
      h("div",{class:"grid grid-cols-2 gap-2"},[
        h("button",{class:"px-3 py-2 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick:()=> applyTheme("light")}, "Light Theme"),
        h("button",{class:"px-3 py-2 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick:()=> applyTheme("dark")},  "Dark Theme"),
        h("button",{class:"px-3 py-2 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick:()=> applyDir("ltr")}, "English (EN)"),
        h("button",{class:"px-3 py-2 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick:()=> applyDir("rtl")}, "فارسی (FA)")
      ]),
      h("div",{class:"flex items-center justify-between mt-2"},[
        h("a",{href:"#/settings", class:"text-cyan-400 hover:text-cyan-300"},"Open Settings"),
        h("button",{class:"px-3 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60", onClick:destroyModal},"Close")
      ])
    ]);
    showModal("User", content);
  });
}

// Router with theme/dir application on every navigation
async function router(){
  const hash = location.hash || "#/dashboard";
  setActiveNav(hash);
  const key = hash.replace(/^#/, "");
  const handler = routes[key];
  const view = qs("#view"); view.innerHTML = "";
  try {
    applyTheme(getTheme());
    applyDir(getDir());
    const node = handler ? await handler() : h("div",{}, "Not found");
    view.appendChild(node);
  } catch(err){
    view.appendChild(h("pre",{class:"text-red-400 whitespace-pre-wrap"}, String(err?.message || err)));
  }
}
// ✅ expose router (not used by SSE anymore, but handy for debug)
window._router = router;

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", ()=>{
  initTopbar();
  applyTheme(getTheme());
  applyDir(getDir());
  // Avoid double router call: if we set the hash, hashchange will trigger router()
  if(!location.hash){
    location.hash="#/dashboard";
  } else {
    router();
  }
});

// ---------------------------------------------------------
// Dashboard
// ---------------------------------------------------------
async function renderDashboard(){
  const tpl = qs("#tmpl-dashboard")?.content?.cloneNode(true) || h("div",{},[]);
  const root = h("div",{},[tpl]);

  // Load data (also fuel_logs for recent activity)
  const [vesselsRes, ticketsRes, alertsRes, fuelRes, flogRes] = await Promise.allSettled([
    jget("/vessels"), jget("/tickets"), jget("/alerts"), jget("/fuel"), jget("/fuel_logs")
  ]);
  const ok = s => s.status==="fulfilled" ? s.value : [];

  const V = ok(vesselsRes), T = ok(ticketsRes), A = ok(alertsRes), F = ok(fuelRes), LOGS = ok(flogRes);
  const totFuelLiters = (F||[]).reduce((a,b)=> {
    const pct = (typeof b.percent === "number")
      ? Math.max(0, Math.min(100, b.percent))
      : (b.capacity ? Math.round(((b.liters??0)/b.capacity)*100) : 0);
    const liters = b.capacity ? Math.round((Number(b.capacity)*pct)/100) : (b.liters ?? 0);
    return a + (Number.isFinite(liters) ? liters : 0);
  }, 0);

  // KPIs
  root.querySelector("#kpi-active-vessels")?.replaceChildren(document.createTextNode(String((V||[]).length||0)));
  root.querySelector("#kpi-open-tickets") ?.replaceChildren(document.createTextNode(String((T||[]).filter(t=> (t.status||"").toLowerCase() !== "closed").length||0)));
  root.querySelector("#kpi-total-fuel")   ?.replaceChildren(document.createTextNode((totFuelLiters||0).toLocaleString()));
  root.querySelector("#kpi-alerts")       ?.replaceChildren(document.createTextNode(String((A||[]).length||0)));
  const badge = document.getElementById("alerts-count");
  if (badge) badge.textContent = String((A||[]).length||0);
  const bellIcon = qs('.glass-panel.sticky .fa-bell');
  const bellBtn  = bellIcon?.closest('button');
  const dot = bellBtn?.querySelector('.w-2.h-2.bg-red-500.rounded-full');
  if (dot){ if ((A||[]).length>0) dot.classList.remove('hidden'); else dot.classList.add('hidden'); }

  // Recent tickets cards
  const recentWrap = root.querySelector("#recent-tickets");
  if (recentWrap && (T||[]).length){
    recentWrap.innerHTML = "";
    (T||[]).slice(-3).reverse().forEach(t=>{
      const card = h("button",{class:"w-full text-left p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition"},[
        h("div",{class:"flex items-start justify-between"},[
          h("div",{},[
            h("div",{class:"font-medium"}, t.title || "Ticket"),
            h("div",{class:"text-xs text-slate-400 mt-1"}, `Vessel #${t.vesselId ?? "—"}`)
          ]),
          h("span",{class:`text-xs ${
            ({"Low":"bg-blue-900/50 text-blue-300","Medium":"bg-yellow-900/50 text-yellow-300","High":"bg-red-900/50 text-red-300"})[t.priority] || "bg-slate-700/50 text-slate-200"
          } px-2 py-0.5 rounded-full`}, t.priority || "—")
        ]),
        h("div",{class:"mt-2 text-xs text-slate-500"}, t.status||"")
      ]);
      card.addEventListener("click", ()=>{
        const vessel = (V||[]).find(v=> String(v.id)===String(t.vesselId));
        const content = h("div",{class:"space-y-2"},[
          h("div",{class:"text-lg font-semibold"}, t.title || "Ticket"),
          h("div",{class:"text-sm text-slate-400"}, `Ticket #${t.id}`),
          h("div",{class:"grid grid-cols-2 gap-3 mt-2"},[
            h("div",{},[h("div",{class:"text-xs text-slate-400"},"Vessel"), h("div",{}, vessel?.name ? `${vessel.name} (#${t.vesselId})` : `#${t.vesselId}` )]),
            h("div",{},[h("div",{class:"text-xs text-slate-400"},"Priority"), h("div",{}, t.priority || "—")]),
            h("div",{},[h("div",{class:"text-xs text-slate-400"},"Status"),   h("div",{}, t.status   || "—")]),
            h("div",{},[h("div",{class:"text-xs text-slate-400"},"Created"),  h("div",{}, t.createdAt ? new Date(t.createdAt).toLocaleString() : "—")]),
          ]),
          h("div",{class:"mt-3 flex justify-end"},[
            h("a",{href:"#/tickets", class:"px-3 py-1.5 rounded-md bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm"},"Go to Tickets"),
            h("button",{class:"ml-2 px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm", onClick:destroyModal},"Close")
          ])
        ]);
        showModal("Ticket Details", content);
      });
      recentWrap.appendChild(card);
    });
  }

  // Fuel preview
  const fuelPrev = root.querySelector("#fuel-preview");
  if (fuelPrev && (F||[]).length){
    fuelPrev.innerHTML = "";
    (F||[]).slice(0,4).forEach(t=>{
      const pct = Math.max(0, Math.min(100, typeof t.percent==="number" ? t.percent : (t.capacity ? Math.round(((t.liters??0)/t.capacity)*100) : 0)));
      const liters = t.capacity ? Math.round((pct/100)*Number(t.capacity)) : (t.liters ?? 0);
      const statusClass = pct<20 ? 'bg-yellow-900/30 text-yellow-400'
                        : pct<50 ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-green-900/30 text-green-400';
      fuelPrev.appendChild(
        h("div",{class:"bg-slate-800/30 rounded-xl p-4 hover:border-cyan-500/30 transition border border-slate-800/50"},[
          h("div",{class:"flex items-center justify-between mb-2"},[
            h("div",{class:"font-medium"}, t.name || "Tank"),
            h("div",{class:`text-xs ${statusClass} px-2 py-0.5 rounded-full`}, pct<20 ? "Low" : "Normal")
          ]), 
          h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel||"—"} • ${t.type||"—"}`),
          h("div",{class:"flex items-center justify-center mb-3"},[
            h("div",{class:"fuel-gauge"},[
              h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
                h("path",{"class":"fuel-gauge-circle fuel-gauge-bg",
                  d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
                  "stroke-dasharray":"100, 100"
                }),
                h("path",{"class":"fuel-gauge-circle fuel-gauge-fill",
                  d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
                  "stroke-dasharray":`${pct}, 100`
                }),
              ]),
              h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
                h("div",{class:"text-xl font-bold"}, `${pct}%`),
                h("div",{class:"text-xs text-slate-400"}, `${(liters||0).toLocaleString()}L`)
              ])
            ])
          ]),
          h("div",{class:"flex items-center justify-between text-xs"},[
            h("span",{class:"text-slate-400"}, t.capacity ? `Capacity: ${Number(t.capacity).toLocaleString()}L` : ""),
            h("a",{href:"#/fuel", class:"text-cyan-400 hover:text-cyan-300"}, h("i",{class:"fas fa-ellipsis-h"}))
          ])
        ])
      );
    });
  }

  // Map + filter
  const mapEl = root.querySelector("#leaflet-map-dashboard");
  if (mapEl && window.L) {
    // ⬇️ no autoRefresh here; SSE can be used by that route if needed
    const controller = initVesselMap(mapEl, { vessels: V, autoRefresh: false });
    root.querySelector("#map-filter")?.addEventListener("change", (e)=>{
      controller?.setFilter?.(e.target.value);
    });
  }

  // KPI modals
  const ensure = (sel, fn)=> root.querySelector(sel)?.addEventListener("click", fn);

  ensure("#kpi-card-active-vessels", ()=>{
    const active = (V||[]).filter(v=>{
      const st = (v.status||"").toString().toLowerCase();
      return st.includes("active") || st.includes("underway") || Number(v.speed||0) > 0.5;
    });
    showModal("Active Vessels Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${active.length} active vessel${active.length===1?"":"s"} found.`),
        table(active, [
          { label:"Name",    value:(r)=> r.name || "—" },
          { label:"IMO",     value:(r)=> r.imo  || "—" },
          { label:"Status",  value:(r)=> r.status || (Number(r.speed||0)>0.5 ? "Underway" : "—") },
          { label:"Speed",   value:(r)=> r.speed!=null ? `${r.speed} kts` : "—" },
          { label:"Heading", value:(r)=> r.heading!=null ? `${r.heading}°` : "—" },
          { label:"Lat",     value:(r)=> Array.isArray(r.position)? String(r.position[0]) : "—" },
          { label:"Lon",     value:(r)=> Array.isArray(r.position)? String(r.position[1]) : "—" },
        ]),
        h("div",{class:"mt-4 flex gap-2"},[
          h("a",{href:"#/vessels", class:"px-3 py-1.5 rounded-md bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm"},"Go to Vessels"),
          h("button",{class:"px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm", onClick:destroyModal},"Close")
        ])
      ])
    );
  });

  ensure("#kpi-card-open-tickets", ()=>{
    const open = (T||[]).filter(t => (t.status||"").toLowerCase() !== "closed");
    const pill = (p)=>{
      const cls = ({"Low":"bg-blue-900/50 text-blue-300","Medium":"bg-yellow-900/50 text-yellow-300","High":"bg-red-900/50 text-red-300"})[p] || "bg-slate-700/50 text-slate-200";
      return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`}, p||"—");
    };
    showModal("Open Tickets Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${open.length} open ticket${open.length===1?"":"s"} found.`),
        table(open, [
          { label:"Title",    value:(r)=> r.title || "—" },
          { label:"Vessel",   value:(r)=> r.vesselId!=null ? `#${r.vesselId}` : "—" },
          { label:"Priority", value:(r)=> pill(r.priority) },
          { label:"Status",   value:(r)=> r.status || "—" },
          { label:"Created",  value:(r)=> r.createdAt ? new Date(r.createdAt).toLocaleString() : "—" },
          { label:"Assignee", value:(r)=> r.assignee || "—" }
        ]),
        h("div",{class:"mt-4 flex gap-2"},[
          h("a",{href:"#/tickets", class:"px-3 py-1.5 rounded-md bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm"},"Go to Tickets"),
          h("button",{class:"px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm", onClick:destroyModal},"Close")
        ])
      ])
    );
  });

  ensure("#kpi-card-total-fuel", ()=>{
    const rows = (F||[]).map(t=>{
      const pct = Math.max(0, Math.min(100, typeof t.percent==="number" ? t.percent : (t.capacity ? Math.round(((t.liters??0)/t.capacity)*100) : 0)));
      const liters = t.capacity ? Math.round((pct/100)*Number(t.capacity)) : (t.liters ?? 0);
      return {...t, pct, liters};
    });
    const total = rows.reduce((a,b)=> a + (b.liters||0), 0);
    showModal("Fuel Inventory Overview",
      h("div",{},[
        h("div",{class:"mb-1 text-sm text-slate-400"}, `Total fuel: ${total.toLocaleString()} L across ${rows.length} tank${rows.length===1?"":"s"}.`),
        table(rows, [
          { label:"Tank",     value:(r)=> r.name || "—" },
          { label:"Vessel",   value:(r)=> r.vessel || "—" },
          { label:"Type",     value:(r)=> r.type || "—" },
          { label:"Level",    value:(r)=> `${r.pct}%` },
          { label:"Liters",   value:(r)=> (r.liters||0).toLocaleString() },
          { label:"Capacity", value:(r)=> r.capacity!=null ? `${Number(r.capacity).toLocaleString()} L` : "—" },
          { label:"Status",   value:(r)=> (r.pct) < 20 ? "Low" : "Normal" }
        ])
      ])
    );
  });

  ensure("#kpi-card-alerts", ()=>{
    showModal("System Alerts Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${(A||[]).length} alert${(A||[]).length===1?"":"s"} total.`),
        table((A||[]), [
          { label:"Title",     value:(r)=> r.title || r.type || "—" },
          { label:"Severity",  value:(r)=> {
              const s = (r.severity||"").toLowerCase();
              const cls = s==="critical" ? "bg-red-900/50 text-red-300"
                       : s==="high"      ? "bg-orange-900/50 text-orange-300"
                       : s==="warning"   ? "bg-yellow-900/50 text-yellow-300"
                       : "bg-blue-900/40 text-blue-300";
              return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`}, r.severity||"Info");
            } },
          { label:"Message",   value:(r)=> r.message || r.desc || "—" },
          { label:"Vessel",    value:(r)=> r.vessel || (r.vesselId!=null?`#${r.vesselId}`:"—") },
          { label:"Time",      value:(r)=> r.createdAt ? new Date(r.createdAt).toLocaleString() : (r.time ? new Date(r.time).toLocaleString() : "—") }
        ])
      ])
    );
  });

  // Recent Activity + System Alerts (mounts)
  const ensureMountAfter = (headingText, mountId)=>{
    const byId = root.querySelector(`#${mountId}`);
    if (byId) return byId;
    const h2 = Array.from(root.querySelectorAll("h2")).find(el => (el.textContent||"").trim().toLowerCase() === headingText.toLowerCase());
    if (!h2) return null;
    const panelEl = h2.parentElement;
    while (h2.nextSibling) panelEl.removeChild(h2.nextSibling);
    const mount = h("div",{id:mountId});
    panelEl.appendChild(mount);
    return mount;
  };

  const actMount = ensureMountAfter("recent activity", "recent-activity");
  if (actMount){
    const events = [];
    (A||[]).forEach(a=>{
      events.push({
        time: a.createdAt ? new Date(a.createdAt).getTime() : 0,
        icon: "fa-triangle-exclamation",
        color: "text-red-400",
        title: a.message || a.title || "Alert",
        sub: `Vessel #${a.vesselId ?? "—"}`
      });
    });
    (LOGS||[]).forEach(l=>{
      events.push({
        time: l.createdAt ? new Date(l.createdAt).getTime() : 0,
        icon: l.delta>0 ? "fa-fill-drip" : "fa-gas-pump",
        color: l.delta>0 ? "text-emerald-400" : "text-sky-400",
        title: l.delta>0 ? `Bunkered +${(l.delta||0).toLocaleString()} L` : `Consumed ${(Math.abs(l.delta)||0).toLocaleString()} L`,
        sub: l.location ? `${l.location}` : `Tank ${l.tankId}`
      });
    });
    const latest = events.sort((a,b)=> b.time-a.time).slice(0,8);
    actMount.innerHTML = "";
    latest.forEach(ev=>{
      actMount.appendChild(
        h("div",{class:"flex items-start gap-3"},[
          h("div",{class:`w-8 h-8 rounded-full bg-slate-800/60 flex items-center justify-center ${ev.color}`}, h("i",{class:`fas ${ev.icon}`})),
          h("div",{},[
            h("div",{class:"text-sm font-medium"}, ev.title),
            h("div",{class:"text-xs text-slate-400"}, ev.sub)
          ])
        ])
      );
    });
  }

  const sysMount = ensureMountAfter("system alerts", "system-alerts");
  if (sysMount){
    sysMount.innerHTML = "";
    (A||[]).slice().sort((a,b)=> new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,6).forEach(a=>{
      const lv = String(a.level||a.severity||"info").toLowerCase();
      const cls = lv==="high"||lv==="critical" ? "border-red-500/30 bg-red-900/40"
                : lv==="medium"||lv==="warning" ? "border-yellow-500/30 bg-yellow-900/40"
                : "border-blue-500/30 bg-blue-900/40";
      sysMount.appendChild(
        h("div",{class:`p-3 rounded-lg border ${cls}`},[
          h("div",{class:"text-sm font-medium"}, a.message || a.title || "Alert"),
          h("div",{class:"text-xs text-slate-300 mt-1"}, `Vessel #${a.vesselId ?? "—"} • ${a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}`)
        ])
      );
    });
  }

  return root;
}

// ---------------------------------------------------------
// Shared Leaflet vessel map builder (returns controller)
// ---------------------------------------------------------
export function initVesselMap(container, {vessels=[], autoRefresh=false}={}){
  if (!container || !window.L) return null;

  if (!container.style.minHeight) container.style.minHeight = "24rem";

  const map = L.map(container, {
    zoomControl: true,
    preferCanvas: true,
    inertia: true,
  }).setView([20, 0], 2);

  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
    updateWhenIdle: false,
    detectRetina: true,
    crossOrigin: true
  });
  tiles.on("tileerror", e => console.warn("Leaflet tile load error:", e));
  tiles.addTo(map);

  const invalidate = () => map && map.invalidateSize({ animate:false });
  requestAnimationFrame(invalidate);
  setTimeout(invalidate, 120);
  setTimeout(invalidate, 600);

  const ro = new ResizeObserver(() => invalidate());
  ro.observe(container);
  const onHash = () => setTimeout(invalidate, 0);
  window.addEventListener("hashchange", onHash);

  const icons = {
    cargo:   L.divIcon({ className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#22d3ee;box-shadow:0 0 0 6px rgba(34,211,238,.25)"></div>' }),
    tanker:  L.divIcon({ className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#f97316;box-shadow:0 0 0 6px rgba(249,115,22,.25)"></div>' }),
    support: L.divIcon({ className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#a855f7;box-shadow:0 0 0 6px rgba(168,85,247,.25)"></div>' }),
    default: L.divIcon({ className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.25)"></div>' }),
  };
  const iconFor = (t) => icons[t] || icons.default;

  const inferType = (v) => {
    const t = (v.type||"").toString().toLowerCase();
    if (t) return t;
    const n = (v.name||"").toLowerCase();
    if (n.includes("tank")) return "tanker";
    if (n.includes("support") || n.includes("tug") || n.includes("assist")) return "support";
    return "cargo";
  };

  const seededPos = (seedStr) => {
    let h=0; for (let i=0;i<seedStr.length;i++) h=(h*31 + seedStr.charCodeAt(i))>>>0;
    const lat = ((h % 12000) / 100) - 60;
    const lon = ((((h/12000)|0) % 36000) / 100) - 180;
    return [lat, lon];
  };

  const normalize = (v) => {
    let pos = Array.isArray(v.position)
      ? v.position
      : (v.lat!=null && v.lon!=null ? [Number(v.lat), Number(v.lon)] : null);
    if (!pos) pos = seededPos(String(v.id||v.imo||v.name||Math.random()));
    return {...v, position: pos, _type: inferType(v)};
  };

  const tooltipHtml = (v) =>
    `<div><strong>${v.name || "Vessel"}</strong><br>
      <span>Type: ${v._type || "—"}</span><br>
      <span>Speed: ${v.speed!=null ? v.speed+" kts" : "—"} • Heading: ${v.heading!=null ? v.heading+"°" : "—"}</span></div>`;

  const popupHtml = (v) =>
    `<div class="text-sm">
      <div class="font-medium">${v.name || "Vessel"}</div>
      <div>Type: ${v._type || "—"}</div>
      <div>IMO: ${v.imo || "—"}</div>
      <div>Status: ${v.status || "—"}</div>
      <div>Speed: ${v.speed!=null ? v.speed+" kts" : "—"}</div>
      <div>Heading: ${v.heading!=null ? v.heading+"°" : "—"}</div>
    </div>`;

  let data = (vessels||[]).map(normalize);
  const markers = new Map();
  let currentFilter = "all";

  function refresh(){
    const rows = currentFilter==="all" ? data : data.filter(v=> v._type===currentFilter);
    const still = new Set();

    rows.forEach(v=>{
      if (!Array.isArray(v.position) || v.position.length!==2) return;
      const [lat, lon] = v.position;
      const key = String(v.id||v.imo||v.name||`${lat},${lon}`);

      still.add(key);

      if (markers.has(key)){
        const m = markers.get(key);
        m.setLatLng([lat, lon]).setIcon(iconFor(v._type)).setPopupContent(popupHtml(v));
        if (m.getTooltip && m.getTooltip()) m.setTooltipContent(tooltipHtml(v));
        else m.bindTooltip(tooltipHtml(v), {direction:"top", offset:[0,-10], sticky:true, opacity:0.95, className:"maptip"});
      } else {
        const m = L.marker([lat, lon], {icon: iconFor(v._type)})
          .addTo(map)
          .bindPopup(popupHtml(v))
          .bindTooltip(tooltipHtml(v), {direction:"top", offset:[0,-10], sticky:true, opacity:0.95, className:"maptip"});
        markers.set(key, m);
      }
    });

    for (const k of Array.from(markers.keys())){
      if (!still.has(k)) { map.removeLayer(markers.get(k)); markers.delete(k); }
    }
    invalidate();
  }

  function setFilter(type){ currentFilter = type; refresh(); }
  function update(list){ data = (list||[]).map(normalize); refresh(); }

  refresh();

  let interval=null;
  if (autoRefresh){
    interval = setInterval(async ()=>{
      try { const fresh = await jget("/vessels"); update(fresh); } catch {}
    }, 10000);
  }

  const deathObs = new MutationObserver(()=>{
    if(!document.body.contains(container)){
      try{ ro.disconnect(); }catch{}
      try{ window.removeEventListener("hashchange", onHash); }catch{}
      try{ interval && clearInterval(interval); }catch{}
      try{ map.remove(); }catch{}
      deathObs.disconnect();
    }
  });
  deathObs.observe(document.body,{childList:true,subtree:true});

  return { setFilter, update, map };
}

// ---------------------------------------------------------
// Live refresh via SSE (SOFT ticks only — no route rebuild)
// ---------------------------------------------------------
try {
  const es = new EventSource(`${API.base}/vessels/stream`);
  es.addEventListener('tick', () => {
    // Broadcast a soft tick. Routes can listen and update just their parts.
    window.dispatchEvent(new CustomEvent('ops:tick'));
  });
  window.addEventListener('beforeunload', () => es.close());
} catch (e) {
  console.warn('SSE not available:', e);
}
