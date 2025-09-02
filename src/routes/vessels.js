// /src/routes/vessels.js
import { h, jget, kpi, panel, table, initVesselMap, showModal, destroyModal } from "../main.js";

/* -------- helpers -------- */
const toStr = (x) => String(x ?? "");
const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
};
function inferType(v){
  const t = (v.type||"").toString().toLowerCase();
  if (t) return t;
  const n = (v.name||"").toLowerCase();
  if (n.includes("tank")) return "tanker";
  if (n.includes("support") || n.includes("tug") || n.includes("assist")) return "support";
  return "cargo";
}
function statusKey(s=""){
  const x = s.toLowerCase();
  if (x.includes("underway")) return "underway";
  if (x.includes("berth"))    return "berth";
  if (x.includes("anchor"))   return "anchored";
  return "other";
}
/* great-circle distance (nm) */
function nmBetween(a, b){
  if (!a || !b || a.lat==null || a.lon==null || b.lat==null || b.lon==null) return 0;
  const Rkm=6371, toRad=(x)=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLon/2);
  const c=2*Math.asin(Math.sqrt(s1*s1 + Math.cos(lat1)*Math.cos(lat2)*s2*s2));
  return (Rkm*c)*0.539957; // km -> nm
}
/* bearing degrees 0..360 */
function bearing(a,b){
  const toRad=(x)=>x*Math.PI/180, toDeg=(x)=>x*180/Math.PI;
  const φ1=toRad(a.lat), φ2=toRad(b.lat), λ1=toRad(a.lon), λ2=toRad(b.lon);
  const y = Math.sin(λ2-λ1)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const brng = toDeg(Math.atan2(y,x));
  return (brng + 360) % 360;
}

/* -------- route -------- */
export async function routeVessels(){
  // Pull vessels + tracks; tracks fill missing positions & power speed/heading calc
  const [vessels, tracks] = await Promise.all([
    jget("/vessels"),
    jget("/vessel_tracks").catch(()=>[])
  ]);

  // Build per-vessel tracks (sorted) and "last point" lookup
  const tracksByVessel = {};
  const lastTrackByVessel = {};
  (tracks || []).forEach(t => {
    if (!t?.vessel) return;
    (tracksByVessel[t.vessel] ||= []).push(t);
    const ts  = new Date(t.time || t.createdAt || 0).getTime();
    const cur = lastTrackByVessel[t.vessel];
    const curTs = cur ? new Date(cur.time || cur.createdAt || 0).getTime() : -Infinity;
    if (Number.isFinite(ts) && ts > curTs) lastTrackByVessel[t.vessel] = t;
  });
  Object.values(tracksByVessel).forEach(arr => arr.sort((a,b)=> new Date(a.time)-new Date(b.time)));

  // Enrich vessels with type + best-known position (prefer explicit lat/lon; else last track)
  const withTypeAndPos = (vessels || []).map(v => {
    const _type = inferType(v);
    let lat = v.lat, lon = v.lon, lastUpdate = null;
    if ((lat == null || lon == null) && lastTrackByVessel[v.name]){
      lat = lastTrackByVessel[v.name].lat;
      lon = lastTrackByVessel[v.name].lon;
      lastUpdate = lastTrackByVessel[v.name].time || lastTrackByVessel[v.name].createdAt || null;
    }
    return { ...v, _type, lat, lon, _lastUpdate: lastUpdate };
  });

  // state
  const filters = { type: "all", status: "ALL", search: "" };

  // KPIs (overall)
  const underway    = withTypeAndPos.filter(v=> statusKey(v.status)==="underway").length;
  const atBerth     = withTypeAndPos.filter(v=> statusKey(v.status)==="berth").length;
  const anchored    = withTypeAndPos.filter(v=> statusKey(v.status)==="anchored").length;

  const kpis = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Vessels", withTypeAndPos.length),
    kpi("Underway",      underway),
    kpi("At Berth",      atBerth),
    kpi("Anchored",      anchored),
  ]);

  // Toolbar
  const typeSel = h("select",{
    class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500"
  },[
    h("option",{value:"all"},"All Types"),
    h("option",{value:"cargo"},"Cargo Ships"),
    h("option",{value:"tanker"},"Tankers"),
    h("option",{value:"support"},"Support Vessels")
  ]);

  const statusSel = h("select",{
    class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500"
  },[
    h("option",{value:"ALL"},"All Statuses"),
    h("option",{value:"underway"},"Underway"),
    h("option",{value:"berth"},"At Berth"),
    h("option",{value:"anchored"},"Anchored"),
    h("option",{value:"other"},"Other")
  ]);

  const search = h("input",{
    placeholder:"Search name / IMO / status",
    class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 w-56"
  });

  const filterBar = h("div",{class:"flex flex-wrap items-center gap-2"},[
    h("span",{class:"text-sm text-slate-400"},"Type"),   typeSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Status"), statusSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Search"), search
  ]);

  // Map panel
  const mapWrap = h("div",{class:"glass-panel rounded-2xl p-4 border border-slate-800/50 h-full"},[
    h("div",{class:"flex items-center justify-between mb-3"},[
      h("h2",{class:"text-lg font-semibold"},"Vessel Tracking Map"),
      filterBar
    ]),
    h("div",{id:"vessels-map", class:"h-96 rounded-xl overflow-hidden"})
  ]);

  // Table container
  const tableContainer = h("div");
  const tblPanel = panel("Vessels", tableContainer);

  // Compose view
  const view = h("div",{class:"space-y-4"},[
    kpis,
    h("div",{class:"grid md:grid-cols-2 gap-4"},[
      mapWrap,
      tblPanel
    ])
  ]);

  // Build map
  const mapEl = mapWrap.querySelector("#vessels-map");
  let ctl = null;
  if (mapEl && window.L){
    ctl = initVesselMap(mapEl, { vessels: withTypeAndPos, autoRefresh: true });
    const pts = withTypeAndPos
      .filter(v => v.lat != null && v.lon != null)
      .map(v => [Number(v.lat), Number(v.lon)]);
    if (pts.length){
      setTimeout(()=> ctl?.map?.fitBounds(pts, { padding:[20,20], maxZoom: 5 }), 50);
    }
  }

  // Table columns
  const cols = [
    {label:"Name",   value:(r)=> nameCell(r)},
    {label:"IMO",    key:"imo"},
    {label:"Type",   value:(r)=> r._type},
    {label:"Status", key:"status"},
    {label:"ETA (local)", value:v=> v.eta ? fmtDate(v.eta) : "—"},
    {label:"",       value:(r)=> viewBtn(r)}
  ];

  function nameCell(v){
    const btn = h("button",{
      class:"text-left text-cyan-300 hover:text-cyan-200 underline decoration-dotted",
      onClick:()=> openDetails(v)
    }, v.name || "—");
    const sub = h("div",{class:"text-[11px] text-slate-400 mt-0.5"}, `IMO ${v.imo || "—"}`);
    return h("div",{},[btn, sub]);
  }
  function viewBtn(v){
    return h("button",{
      class:"px-2 py-1 bg-slate-800 rounded border border-slate-700 hover:bg-slate-700 text-xs",
      onClick:()=> openDetails(v)
    },"Details");
  }

  // Filtering
  function filtered(){
    let arr = withTypeAndPos.slice();
    if (filters.type !== "all")   arr = arr.filter(v => v._type === filters.type);
    if (filters.status !== "ALL") arr = arr.filter(v => statusKey(v.status) === filters.status);
    if (filters.search.trim()){
      const q = filters.search.toLowerCase();
      arr = arr.filter(v =>
        toStr(v.name).toLowerCase().includes(q) ||
        toStr(v.imo).toLowerCase().includes(q) ||
        toStr(v.status).toLowerCase().includes(q) ||
        v._type.toLowerCase().includes(q)
      );
    }
    return arr;
  }
  function renderTable(){ tableContainer.replaceChildren(table(filtered(), cols)); }

  // Bind toolbar
  typeSel.addEventListener("change", (e)=>{
    filters.type = e.target.value;
    renderTable();
    ctl?.setFilter(filters.type);
  });
  statusSel.addEventListener("change", (e)=>{
    filters.status = e.target.value;
    renderTable();
  });
  search.addEventListener("input", (e)=>{
    filters.search = e.target.value;
    renderTable();
  });

  // Initial render
  renderTable();
  ctl?.setFilter(filters.type);

  // --- Details modal (now shows speed/heading/last update/position) ---
  function openDetails(v){
    const series = tracksByVessel[v.name] || [];
    const last   = series.length ? series[series.length-1] : null;
    const prev   = series.length > 1 ? series[series.length-2] : null;

    let curLat = v.lat ?? (last?.lat ?? null);
    let curLon = v.lon ?? (last?.lon ?? null);

    // Compute live metrics from last two points if not provided on vessel
    let calcSpeed = null, calcHeading = null, lastTime = v._lastUpdate || (last?.time || last?.createdAt) || null;
    if (last && prev){
      const distNm = nmBetween(prev, last);
      const dtHrs  = (new Date(last.time || last.createdAt) - new Date(prev.time || prev.createdAt)) / 3600000;
      if (dtHrs > 0) calcSpeed = distNm / dtHrs;
      calcHeading = bearing(prev, last);
    }
    const speed   = (v.speed != null ? Number(v.speed) : calcSpeed);
    const heading = (v.heading != null ? Number(v.heading) : calcHeading);

    const val = (x)=> (x==null || Number.isNaN(x)) ? "—" : String(x);
    const coord = (n)=> (n==null ? "—" : Number(n).toFixed(4));
    const pill = (txt)=>{
      const k = statusKey(txt||"");
      const cls = k==="underway" ? "bg-blue-900/50 text-blue-300"
               : k==="berth"     ? "bg-emerald-900/50 text-emerald-300"
               : k==="anchored"  ? "bg-yellow-900/50 text-yellow-300"
               : "bg-slate-700/50 text-slate-200";
      return h("span",{class:`px-2 py-0.5 rounded text-xs ${cls}`}, txt || "—");
    };

    const row = (label, value) => h("div",{class:"mb-2"},[
      h("div",{class:"text-xs text-slate-400"}, label),
      (value instanceof Node) ? value : h("div",{class:"text-sm"}, value)
    ]);

    const content = h("div",{class:"space-y-3"},[
      row("Name", v.name || "—"),
      row("IMO", v.imo || "—"),
      row("Type", v._type || inferType(v)),
      row("Status", pill(v.status || "—")),
      row("ETA", v.eta ? fmtDate(v.eta) : "—"),
      row("Position (lat, lon)", `${coord(curLat)}, ${coord(curLon)}`),
      row("Last update", lastTime ? fmtDate(lastTime) : "—"),
      row("Current speed", speed != null ? `${speed.toFixed(1)} kts` : "—"),
      row("Heading", heading != null ? `${Math.round(heading)}°` : "—"),
      row("Track points available", String(series.length))
    ]);

    const footer = h("div",{class:"mt-4 flex justify-end gap-2"},[
      curLat!=null && curLon!=null ? h("button",{
        class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500",
        onClick:()=>{ destroyModal(); ctl?.map?.setView([curLat, curLon], 7); }
      },"Center on Map") : null,
      h("button",{class:"px-3 py-2 rounded bg-slate-700 hover:bg-slate-600", onClick: destroyModal},"Close")
    ].filter(Boolean));

    showModal("Vessel Details", h("div",{},[content, footer]));
  }

  return view;
}
