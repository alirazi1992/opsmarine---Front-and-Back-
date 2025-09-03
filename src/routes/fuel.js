// /src/routes/fuel.js
import { h, jget, jpost, jpatch, panel, kpi } from "../main.js";

/* -------------------- helpers & math -------------------- */
const clamp   = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isNum   = (v) => Number.isFinite(Number(v));
const toStr   = (x) => String(x ?? "");
const fmtL    = (n) => `${Number(n || 0).toLocaleString()} L`;
const nmPerKm = 0.539957;

function litersOf(t){
  // Prefer percent×capacity so UI reflects servers that update % instead of absolute liters
  const cap = Number(t.capacity||0);
  if (cap > 0 && isNum(t.percent)) {
    return Math.round((Number(t.percent)/100) * cap);
  }
  if (isNum(t.liters)) return Number(t.liters);
  return 0;
}
function percentOf(t){
  const cap = Number(t.capacity||0);
  if (cap > 0) return clamp(Math.round((litersOf(t)/cap)*100), 0, 100);
  return clamp(Number(t.percent||0), 0, 100);
}
async function patchTank(tankId, newLiters, capacity){
  const cap = Number(capacity||0);
  const liters = clamp(Math.round(Number(newLiters||0)), 0, cap>0 ? cap : Number(newLiters||0));
  const body = cap>0
    ? { liters, percent: clamp(Math.round((liters/cap)*100),0,100) }
    : { liters };
  return jpatch(`/fuel/${tankId}`, body);
}

// global refresh signal (used after refuel/transfer)
function fuelBroadcastChanged(){ try{ window.dispatchEvent(new CustomEvent("fuel:changed")); }catch{} }

/* great-circle distance (nm) */
function nmBetween(a, b){
  if (!a || !b || a.lat==null || a.lon==null || b.lat==null || b.lon==null) return 0;
  const Rkm=6371, toRad=(x)=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLon/2);
  const c=2*Math.asin(Math.sqrt(s1*s1 + Math.cos(lat1)*Math.cos(lat2)*s2*s2));
  return (Rkm*c)*nmPerKm;
}

/* -------------------- fuels -------------------- */
const FUEL_TYPES = ["Diesel","MGO","HFO","LNG","Biofuel","Jet A-1","MDO","LPG"];

/* -------------------- logs + tracks fetchers -------------------- */
async function fetchLogsAny(tankId){
  try{
    const q = await jget(`/fuelLogs?tankId=${encodeURIComponent(tankId)}`);
    if (Array.isArray(q)) return q;
  }catch{}
  try{
    const d = await jget(`/fuelLogs/${encodeURIComponent(tankId)}`);
    if (Array.isArray(d)) return d;
  }catch{}
  try{
    const all = await jget(`/fuelLogs`);
    if (Array.isArray(all)) return all.filter(l=> toStr(l.tankId)===toStr(tankId));
  }catch{}
  return null;
}
async function fetchVesselTracks(vesselId){
  const tryGET = async (url) => { try { const r = await jget(url); if (Array.isArray(r)) return r; } catch{} return null; };
  return (await tryGET(`/vesselTracks?vesselId=${encodeURIComponent(vesselId)}`))
      || (await tryGET(`/vesselTracks/${encodeURIComponent(vesselId)}`))
      || (await tryGET(`/tracks?vesselId=${encodeURIComponent(vesselId)}`))
      || [];
}
async function findVesselForTank(tank){
  try{
    const vessels = await jget("/vessels");
    if (!Array.isArray(vessels) || !vessels.length) return null;
    if (tank.vesselId != null){
      const byId = vessels.find(v => String(v.id) === String(tank.vesselId));
      if (byId) return byId;
    }
    if (tank.vessel){
      const name = String(tank.vessel).toLowerCase();
      const byName = vessels.find(v => String(v.name||"").toLowerCase() === name);
      if (byName) return byName;
      const loose = vessels.find(v => String(v.name||"").toLowerCase().includes(name));
      if (loose) return loose;
    }
    return null;
  }catch{ return null; }
}

/* -------------------- ocean-safe synthetic logs -------------------- */
function synthLogs(tankId){
  const now = Date.now();
  // open ocean corridor
  let lat = -10 + Math.random()*30;
  let lon = -50 + Math.random()*25;
  const out=[]; let level = 18000 - Math.random()*2500;
  for(let i=11;i>=0;i--){
    lat += (-0.2 + Math.random()*0.4);
    lon += ( 0.6 + Math.random()*0.6);
    lat = clamp(lat, -20, 35);
    lon = clamp(lon, -60, -5);
    const t = new Date(now - i*2*3600*1000).toISOString();
    const burn = Math.max(0,(Math.random()*480)-100);
    level = Math.max(0, level - burn);
    out.push({
      tankId, time: t, liters: Math.round(level),
      lat: Number(lat.toFixed(3)),
      lon: Number(lon.toFixed(3)),
      distance: 8 + Math.random()*18,
      location: "at sea"
    });
  }
  for(let i=1;i<out.length;i++){
    const d = nmBetween(out[i-1], out[i]);
    if (d > 1) out[i].distance = d;
  }
  return out;
}

/* -------------------- UI bits -------------------- */
function ringGauge(percent, liters){
  const pct = clamp(Math.round(Number(percent||0)),0,100);
  return h("div",{class:"flex items-center justify-center mb-3"},[
    h("div",{class:"fuel-gauge relative w-[110px] h-[110px]"},[
      h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
        h("path",{class:"fuel-gauge-circle fuel-gauge-bg", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":"100, 100"}),
        h("path",{class:"fuel-gauge-circle fuel-gauge-fill", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":`${pct}, 100`})
      ]),
      h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
        h("div",{class:"text-xl font-bold"}, `${pct}%`),
        h("div",{class:"text-xs text-slate-400"}, fmtL(liters))
      ])
    ])
  ]);
}

/* ==================== Canvas trend chart ==================== */
function trendChart(logs = [], capacity) {
  try {
    if (!Array.isArray(logs) || logs.length < 2) {
      return h("div", { class: "text-xs text-slate-400" }, "Not enough history to chart.");
    }
    const cap = Number(capacity || 0);
    const pts = logs.map((l, i) => ({
      i,
      pct: cap > 0 ? clamp((Number(l.liters || 0) / cap) * 100, 0, 100) : 0
    })).filter(p => Number.isFinite(p.pct));
    if (pts.length < 2) {
      return h("div", { class: "text-xs text-slate-400" }, "Not enough history to chart.");
    }
    const w = 680, h = 160;
    const left = 30, right = 10, top = 8, bottom = 22;
    const innerW = w - left - right, innerH = h - top - bottom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.fillStyle = "rgba(15,23,42,.5)"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(148,163,184,.15)"; ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(g => {
      const y = top + innerH * (1 - g / 100);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + innerW, y); ctx.stroke();
    });
    ctx.strokeStyle = "rgba(34,211,238,.9)"; ctx.lineWidth = 2;
    pts.forEach((p, i) => {
      const x = left + (innerW * i) / (pts.length - 1);
      const y = top + innerH * (1 - p.pct / 100);
      if (i === 0) { ctx.beginPath(); ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    const last = pts[pts.length - 1];
    const lx = left + innerW;
    const ly = top + innerH * (1 - last.pct / 100);
    ctx.fillStyle = "rgba(34,211,238,1)";
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
    const wrap = h("div", { class: "rounded-md border border-slate-800/60 overflow-hidden" });
    wrap.appendChild(canvas); return wrap;
  } catch (e) {
    console.error("trendChart error:", e);
    return h("div", { class: "text-xs text-red-300" }, "Chart failed to render.");
  }
}

/* -------------------- modal framework -------------------- */
function ensureModalCSS(){
  if (document.getElementById("modal-scroll-style")) return;
  const st=document.createElement("style");
  st.id="modal-scroll-style";
  st.textContent=`
    .modal-scroll{max-height:70vh;overflow-y:auto}
    .modal-scroll::-webkit-scrollbar{width:8px}
    .modal-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:8px}
  `;
  document.head.appendChild(st);
}
function modalWrap(){ return h("div",{class:"fixed inset-0 z-50 flex items-center justify-center"}); }
function closeModal(w){ try{ document.body.removeChild(w); }catch{} }
function showPanel(wrap, title, nodes, actions){
  ensureModalCSS();
  const overlay = h("div",{class:"absolute inset-0 bg-black/60", onClick:()=>closeModal(wrap)});
  const panelEl = h("div",{class:"relative z-10 w-full max-w-6xl glass-panel rounded-2xl border border-slate-800/50 shadow-xl overflow-hidden"});
  const header = h("div",{class:"sticky top-0 z-10 backdrop-blur-lg bg-slate-900/70 border-b border-slate-800/50 p-4 flex items-center justify-between"},[
    h("h3",{class:"text-lg font-semibold"}, title),
    h("button",{class:"text-slate-400 hover:text-white", onClick:()=>closeModal(wrap)}, h("i",{class:"fas fa-times"}))
  ]);
  const body = h("div",{class:"p-4 modal-scroll"}, nodes);
  const footer = h("div",{class:"sticky bottom-0 z-10 backdrop-blur-lg bg-slate-900/70 border-t border-slate-800/50 p-3 flex justify-end gap-2"}, actions);
  panelEl.appendChild(header); panelEl.appendChild(body); panelEl.appendChild(footer);
  wrap.appendChild(overlay); wrap.appendChild(panelEl); document.body.appendChild(wrap);
  return { body };
}

/* -------------------- DETAILS (popup map fixed & ML compare) -------------------- */
function openTankDetailsInstant(tank){
  const wrap = modalWrap();
  const cap = Number(tank.capacity||0);
  const curL = litersOf(tank);
  const curP = percentOf(tank);

  const infoBox = h("div");
  const chartBox = h("div",{class:"mt-3"},[
    h("div",{class:"text-sm font-medium mb-2"},"Fuel usage trend"),
    h("div",{class:"text-xs text-slate-400"},"Loading…")
  ]);
  const mapId = `detail-map-${tank.id}`;
  const mapBox = h("div",{class:"mt-3"},[
    h("div",{class:"text-sm font-medium mb-2"},"Recent track"),
    h("div",{id:mapId, class:"h-64 rounded-xl overflow-hidden border border-slate-800/60 flex items-center justify-center text-xs text-slate-400"},"Loading map…")
  ]);
  const tableBox = h("div",{class:"mt-4"},[
    h("div",{class:"text-sm font-medium mb-2"},"Recent logs"),
    h("div",{class:"text-xs text-slate-400"},"Loading…")
  ]);

  const distInput = h("input",{type:"number", step:"1", placeholder:"Planned distance (nm)", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const projOut   = h("div",{class:"text-sm text-slate-300 mt-1"},"Not enough data to project yet.");

  showPanel(
    wrap,
    `Tank Details — ${tank.name || "Tank"}`,
    [
      h("div",{class:"grid md:grid-cols-[130px_1fr] gap-4 items-start"},[
        ringGauge(curP, curL),
        infoBox
      ]),
      h("div",{class:"mt-3"},[
        h("div",{class:"text-sm font-medium mb-1"},"Plan fuel for distance"),
        distInput, projOut
      ]),
      chartBox, mapBox, tableBox
    ],
    [ h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Close") ]
  );

  infoBox.replaceChildren(
    h("div",{class:"grid md:grid-cols-3 gap-3"},[
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Tank"),
        h("div",{class:"font-semibold"}, tank.name||"Tank"),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Vessel"),
        h("div",{}, tank.vessel||"—"),
      ]),
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Fuel Type"),
        h("div",{class:"font-semibold"}, tank.type||"—"),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Capacity"),
        h("div",{}, cap?fmtL(cap):"—"),
      ]),
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Current Level"),
        h("div",{class:"font-semibold"}, `${fmtL(curL)} (${curP}%)`),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Consumption"),
        h("div",{},"—")
      ])
    ])
  );

  (async ()=>{
    let logs = [];
    let trackPts = [];
    let vessel = null;

    try {
      const [realLogs, v] = await Promise.all([
        fetchLogsAny(tank.id).catch(()=>null),
        findVesselForTank(tank).catch(()=>null)
      ]);
      if (Array.isArray(realLogs)) logs = realLogs;
      vessel = v || null;

      if (vessel) {
        const tr = await fetchVesselTracks(vessel.id).catch(()=>[]);
        if (Array.isArray(tr) && tr.length){
          trackPts = tr
            .filter(p => p && p.lat!=null && p.lon!=null)
            .filter(p => {
              const loc = String(p.location||"").toLowerCase();
              const notLand = !(loc.includes("port") || loc.includes("berth") || loc.includes("dock") || loc.includes("harbor") || loc.includes("harbour") || loc.includes("land"));
              return notLand;
            })
            .map(p => [Number(p.lat), Number(p.lon)]);
        }
      }

      if (!trackPts.length && Array.isArray(logs) && logs.length){
        trackPts = logs
          .filter(p => p && p.lat!=null && p.lon!=null)
          .filter(p => {
            const loc = String(p.location||"").toLowerCase();
            return !loc || loc.includes("sea") || loc.includes("offshore");
          })
          .map(p => [Number(p.lat), Number(p.lon)]);
      }
      if (!trackPts.length){
        const demo = synthLogs(tank.id);
        logs = logs?.length ? logs : demo;
        trackPts = demo.map(p=> [p.lat, p.lon]);
      }

      // uniq consecutive points
      const uniqPath = [];
      for (const p of trackPts){
        const last = uniqPath[uniqPath.length-1];
        if (!last || last[0]!==p[0] || last[1]!==p[1]) uniqPath.push(p);
      }

      const sorted = (logs||[]).slice().sort((a,b)=> new Date(a.time)-new Date(b.time));
      if (!sorted.length){
        chartBox.replaceChildren(
          h("div",{class:"text-sm font-medium mb-2"},"Fuel usage trend"),
          h("div",{class:"text-xs text-slate-400"},"No data.")
        );
        tableBox.replaceChildren(h("div",{class:"text-sm font-medium mb-2"},"Recent logs"), h("div",{class:"text-xs text-slate-400"},"No data."));
      } else {
        let used=0, totalNm=0, totalHrs=0;
        for (let i=1;i<sorted.length;i++){
          const prev = Number(sorted[i-1].liters||0);
          const cur  = Number(sorted[i].liters||0);
          const d = prev-cur; if (d>0) used+=d;
          const nm = sorted[i].distance!=null ? Number(sorted[i].distance||0) : nmBetween(sorted[i-1], sorted[i]);
          totalNm += nm;
          const t0 = new Date(sorted[i-1].time).getTime();
          const t1 = new Date(sorted[i].time).getTime();
          totalHrs += Math.max(0, (t1 - t0) / 3600000);
        }
        const perNm = totalNm>0 ? used/totalNm : 0;
        const avgKts = (totalHrs>0 && totalNm>0) ? (totalNm/totalHrs) : null;

        // deviation vs great-circle
        let devPct = null;
        if (uniqPath.length>=2){
          const start = {lat: uniqPath[0][0], lon: uniqPath[0][1]};
          const end   = {lat: uniqPath[uniqPath.length-1][0], lon: uniqPath[uniqPath.length-1][1]};
          const gc = nmBetween(start, end);
          if (gc>0 && totalNm>0) devPct = ((totalNm/gc)-1)*100;
        }

        // ML compare
        const ml = loadModel();
        let mlLine = null;
        if (ml && avgKts){
          const equip =  equipmentScoreForVessel(vessel) ?? 0;
          const loadF =  loadFactorForVessel(vessel) ?? 0;
          const weather = latestWeatherFromLogs(sorted) ?? 0;
          const routeDev = Math.max(0, (devPct||0)/100);
          const predLph = predictLph(ml, { speed: avgKts, routeDev, weather, load: loadF, equip });
          if (predLph){
            const lpd = predLph*24;
            mlLine = h("div",{class:"text-xs text-slate-300 mt-2"},
              `ML est: ${Math.round(predLph).toLocaleString()} L/hr • ${Math.round(lpd).toLocaleString()} L/day`);
          }
        }

        const block = infoBox.querySelectorAll(".bg-slate-800\\/40")[2];
        if (block) block.replaceChildren(
          h("div",{class:"text-xs text-slate-400"},"Current Level"),
          h("div",{class:"font-semibold"}, `${fmtL(litersOf(tank))} (${percentOf(tank)}%)`),
          h("div",{class:"text-xs text-slate-400 mt-2"},"Consumption"),
          h("div",{}, totalNm>0 ? `${perNm.toFixed(1)} L / nm` : "—"),
          h("div",{class:"text-xs text-slate-400 mt-2"},"Avg Speed"),
          h("div",{}, avgKts!=null ? `${avgKts.toFixed(1)} kn` : "—"),
          h("div",{class:"text-xs text-slate-400 mt-2"},"Burn Rates"),
          h("div",{}, (avgKts!=null && perNm>0) ? `${(perNm*avgKts).toFixed(0)} L/hr • ${(perNm*avgKts*24).toFixed(0)} L/day` : "—"),
          h("div",{class:"text-xs text-slate-400 mt-2"},"Route Deviation"),
          h("div",{}, devPct!=null ? `${devPct.toFixed(1)}% vs GC` : "—"),
          mlLine || h("div")
        );

        const doProj = ()=>{
          const nm = Number(distInput.value||0);
          if (!nm || nm<=0 || !perNm){
            projOut.textContent = perNm ? "Enter a positive distance." : "Not enough data to project usage.";
            return;
          }
          const need = Math.round(perNm*nm);
          const delta = need - litersOf(tank);
          projOut.innerHTML = `Estimated need: <b>${fmtL(need)}</b> — You ${delta>0?`need <span class="text-red-300">${fmtL(delta)}</span> more`:`have <span class="text-green-300">${fmtL(-delta)}</span> spare`}.`;
        };
        distInput.oninput = doProj;

        chartBox.replaceChildren(
          h("div",{class:"text-sm font-medium mb-2"},"Fuel usage trend"),
          trendChart(sorted, cap)
        );

        tableBox.replaceChildren(
          h("div",{class:"text-sm font-medium mb-2"},"Recent logs"),
          h("table",{class:"min-w-full text-sm"},[
            h("thead",{class:"border-b border-slate-800/60"}, h("tr",{},[
              h("th",{class:"text-left py-2 pr-3"},"Time"),
              h("th",{class:"text-left py-2 pr-3"},"Location"),
              h("th",{class:"text-left py-2 pr-3"},"Liters"),
              h("th",{class:"text-left py-2 pr-3"},"Δ (L)"),
              h("th",{class:"text-left py-2 pr-3"},"Distance (nm)"),
            ])),
            h("tbody",{}, sorted.slice(-20).map((l,i,arr)=>{
              const prev = i>0 ? Number(arr[i-1].liters||0) : Number(l.liters||0);
              const d = prev - Number(l.liters||0);
              return h("tr",{class:"border-b border-slate-800/40"},[
                h("td",{class:"py-2 pr-3"}, new Date(l.time).toLocaleString()),
                h("td",{class:"py-2 pr-3"}, l.location || `${l.lat??"?"}, ${l.lon??"?"}`),
                h("td",{class:"py-2 pr-3"}, fmtL(l.liters)),
                h("td",{class:"py-2 pr-3"}, d===0?"—":(d>0?`-${fmtL(d)}`:`+${fmtL(-d)}`)),
                h("td",{class:"py-2 pr-3"}, (l.distance!=null)? Number(l.distance).toFixed(1) : "—"),
              ]);
            }))
          ])
        );
      }

      // map
      setTimeout(()=>{
        if (!window.L) return;
        const el = document.getElementById(mapId);
        if (!el) return;
        el.innerHTML = "";
        const map = L.map(el, { zoomControl:true, preferCanvas:true }).setView([10, -30], 3);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
          detectRetina:true
        }).addTo(map);
        const pts = (logs||[]).filter(p=>p.lat!=null&&p.lon!=null).map(p=>[+p.lat,+p.lon]);
        const uniq = [];
        for (const p of pts){
          const last = uniq[uniq.length-1];
          if (!last || last[0]!==p[0] || last[1]!==p[1]) uniq.push(p);
        }
        if (uniq.length>=2){
          const line = L.polyline(uniq, { weight:3, opacity:0.95 }).addTo(map);
          L.marker(uniq[0]).addTo(map).bindTooltip("Start");
          L.marker(uniq[uniq.length-1]).addTo(map).bindTooltip("Latest");
          map.fitBounds(line.getBounds(), { padding:[20,20] });
        } else if (uniq.length===1){
          L.marker(uniq[0]).addTo(map).bindTooltip("Position");
          map.setView(uniq[0], 6);
        } else {
          map.setView([10,-30], 3);
        }
        setTimeout(()=> map.invalidateSize(), 80);
      }, 0);

    } catch(err){
      console.error("Tank details hydrate failed:", err);
      chartBox.replaceChildren(h("div",{class:"text-xs text-red-300"},"Failed to render details."));
      tableBox.replaceChildren(h("div",{class:"text-xs text-red-300"},"Failed to load logs."));
      const el = document.getElementById(mapId);
      if (el) el.textContent = "Map failed to load.";
    }
  })();
}

/* -------------------- refuel & transfer modals -------------------- */
function openRefuelModal({ tank, onDone }){
  const wrap = modalWrap();
  const litersInput = h("input",{type:"number", step:"1", placeholder:"Liters (+ add, - remove)", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const apply = async ()=>{
    const delta = Number(litersInput.value||0);
    if (!delta) return;
    await patchTank(tank.id, litersOf(tank)+delta, tank.capacity);
    fuelBroadcastChanged();                   // <— notify all views
    onDone?.();
    closeModal(wrap);
  };
  showPanel(wrap, "Log Refuel / Adjustment", [
    h("div",{class:"text-sm text-slate-400 mb-2"}, `Target: ${tank.name||"Tank"} — ${tank.vessel||"—"}`),
    h("div",{},[h("label",{class:"text-sm text-slate-300"},"Liters"), litersInput]),
  ],[
    h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Cancel"),
    h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500", onClick:apply},"Apply")
  ]);
}

function openTransferModal({ tanks, preSourceId=null, onDone }){
  const wrap = modalWrap();
  const tankOpt = (t)=> h("option",{value:t.id}, `${t.name||"Tank"} — ${t.vessel||"—"} (${t.type||"—"})`);
  const srcSel = h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"}, tanks.map(tankOpt));
  const dstSel = h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const typeSel= h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"}, FUEL_TYPES.map(ft=>h("option",{value:ft}, ft)));
  const liters = h("input",{type:"number", step:"1", placeholder:"Liters to transfer", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});

  if (preSourceId) srcSel.value = toStr(preSourceId);
  const syncTypeFromSrc = ()=>{ const s = tanks.find(t=> toStr(t.id)===toStr(srcSel.value)); if (s?.type) typeSel.value = s.type; };
  const rebuildDst = ()=>{ const need = typeSel.value, srcId = toStr(srcSel.value); dstSel.innerHTML = ""; tanks.filter(t=> (t.type||"Diesel")===need && toStr(t.id)!==srcId).forEach(t=> dstSel.appendChild(tankOpt(t))); };

  syncTypeFromSrc(); rebuildDst();
  srcSel.addEventListener("change", ()=>{ syncTypeFromSrc(); rebuildDst(); });
  typeSel.addEventListener("change", rebuildDst);

  const doTransfer = async ()=>{
    const src = tanks.find(t=> toStr(t.id)===toStr(srcSel.value));
    const dst = tanks.find(t=> toStr(t.id)===toStr(dstSel.value));
    const amt = Number(liters.value||0);
    const need = typeSel.value;
    if (!src || !dst){ alert("Selected tanks not found."); return; }
    if (src.id===dst.id){ alert("Source and destination must differ."); return; }
    if (!amt || amt<=0){ alert("Enter a positive liters amount."); return; }
    if ((src.type||"Diesel")!==need || (dst.type||"Diesel")!==need){ alert("Tank types must match the selected fuel type."); return; }
    const srcL = litersOf(src), dstL = litersOf(dst), dstCap = Number(dst.capacity||0);
    if (srcL < amt){ alert("Source doesn't have enough fuel."); return; }
    const maxAccept = dstCap>0 ? Math.max(0, dstCap - dstL) : amt;
    const actual = Math.min(amt, maxAccept);
    if (actual<=0){ alert("Destination is already at capacity."); return; }

    await Promise.all([
      patchTank(src.id, srcL - actual, src.capacity),
      patchTank(dst.id, dstL + actual, dst.capacity),
      jpost("/fuelTransfers", { time:new Date().toISOString(), fromId:src.id, toId:dst.id, liters:actual, fuelType:need }).catch(()=>{})
    ]);
    fuelBroadcastChanged();                   // <— notify all views
    onDone?.({actual});
    closeModal(wrap);
  };

  showPanel(wrap, "Transfer Fuel", [
    h("div",{class:"grid md:grid-cols-2 gap-3"},[
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Source tank"), srcSel]),
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Destination tank"), dstSel]),
    ]),
    h("div",{class:"grid md:grid-cols-2 gap-3 mt-3"},[
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Fuel Type"), typeSel]),
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Liters"), liters]),
    ]),
    h("div",{class:"text-xs text-slate-400 mt-2"},"Capacity limits are enforced automatically.")
  ],[
    h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Cancel"),
    h("button",{class:"px-3 py-2 rounded bg-purple-600 hover:bg-purple-500", onClick:doTransfer},"Transfer")
  ]);
}

/* -------------------- page: Fuel Monitoring -------------------- */
export async function routeFuel(){
  let tanks = await jget("/fuel");
  let inspections = [];
  try { const insp = await jget("/fuel/inspections"); if (Array.isArray(insp)) inspections = insp; } catch {}

  const filters = { vessel:"ALL", type:"ALL", criticalOnly:false, search:"" };
  const header = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Tanks", ()=> filtered().length),
    kpi("Avg Fill",   ()=> `${avgPct(filtered())}%`),
    kpi("Critical (<20%)", ()=> filtered().filter(t=> percentOf(t)<20).length),
    kpi("Types", ()=> new Set(tanks.map(t=> t.type||"—")).size),
  ]);
  const toolbar = buildToolbar();
  const cards = h("div",{class:"grid md:grid-cols-3 gap-4"});
  let stopAuto = autoRefresh(async ()=>{ try{ tanks = await jget("/fuel"); rerender(true);}catch{} }, 10000);
  const root = panel("Fuel Monitoring", h("div",{},[header, toolbar, cards]));

  const mlPanel = buildMLPanel(inspections);
  root.appendChild(mlPanel);

  function filtered(){
    let out = tanks.slice();
    if (filters.vessel!=="ALL") out = out.filter(t=> (t.vessel||"—")===filters.vessel);
    if (filters.type  !=="ALL") out = out.filter(t=> (t.type  ||"—")===filters.type);
    if (filters.criticalOnly)   out = out.filter(t=> percentOf(t)<20);
    if (filters.search.trim()){
      const q = filters.search.toLowerCase();
      out = out.filter(t=>
        String(t.name||"").toLowerCase().includes(q) ||
        String(t.vessel||"").toLowerCase().includes(q) ||
        String(t.type||"").toLowerCase().includes(q)
      );
    }
    return out;
  }
  function renderKPIs(){
    header.innerHTML="";
    header.appendChild(kpi("Total Tanks", filtered().length));
    header.appendChild(kpi("Avg Fill", `${avgPct(filtered())}%`));
    header.appendChild(kpi("Critical (<20%)", filtered().filter(t=> percentOf(t)<20).length));
    header.appendChild(kpi("Types", new Set(tanks.map(t=> t.type||"—")).size));
  }
  function rerender(fromAuto=false){
    rebuildToolbarOptions(toolbar, tanks, filters);
    renderKPIs();
    cards.innerHTML="";
    const list = filtered();
    if (!list.length){
      cards.appendChild(h("div",{class:"text-slate-400 text-sm col-span-full py-8 text-center"},"No tanks match your filters."));
    } else {
      list.forEach(t=> cards.appendChild(tankCard(t)));
    }
    if (!fromAuto){
      stopAuto();
      stopAuto = autoRefresh(async ()=>{ try{ tanks = await jget("/fuel"); rerender(true);}catch{} }, 10000);
    }
  }

  // react to external updates (refuel/transfer)
  window.addEventListener("fuel:changed", async ()=>{
    try{
      const fresh = await jget("/fuel");
      if (Array.isArray(fresh)) tanks = fresh;
      rerender(true);
    }catch{}
  });

  function tankCard(t){
    const cap = Number(t.capacity||0);
    const liters = litersOf(t);
    const pct = percentOf(t);
    const statusClass = pct<20 ? "bg-yellow-900/30 text-yellow-400"
                      : pct<50 ? "bg-blue-900/30 text-blue-400"
                               : "bg-green-900/30 text-green-400";

    const card = h("div",{class:"bg-slate-800/30 rounded-xl p-4 border border-slate-800/50 cursor-pointer hover:border-cyan-500/30 transition"},[
      h("div",{class:"flex items-center justify-between mb-2"},[
        h("div",{class:"font-medium flex items-center gap-2"},[
          h("span",{}, t.name||"Tank"),
          cap ? h("span",{class:"text-xs text-slate-500"},"• Cap "+fmtL(cap)) : ""
        ]),
        h("div",{class:`text-xs ${statusClass} px-2 py-0.5 rounded-full`}, pct<20?"Low":"Normal")
      ]),
      h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel||"—"} • ${t.type||"—"}`),
      ringGauge(pct, liters),
      h("div",{class:"flex items-center justify-between text-xs mt-1"},[
        h("span",{class:"text-slate-400"}, cap?`Cap: ${fmtL(cap)}`:""),
        h("span",{class:"text-slate-400"}, `${fmtL(liters)} now`)
      ]),
      h("div",{class:"mt-3 flex flex-wrap gap-2"},[
        quickBtn("-5%", -5),
        quickBtn("+5%", +5),
        quickBtn("+10%", +10),
        actionBtn("Log refuel","bg-blue-600 hover:bg-blue-500", ()=> openRefuelModal({ tank:t, onDone: async ()=>{ const fresh=await jget("/fuel"); Object.assign(t, fresh.find(x=> toStr(x.id)===toStr(t.id)) || t); rerender(true);} })),
        actionBtn("Transfer","bg-purple-600 hover:bg-purple-500", ()=> openTransferModal({ tanks, preSourceId:t.id, onDone: async ()=>{ const fresh=await jget("/fuel"); Object.assign(t, fresh.find(x=> toStr(x.id)===toStr(t.id)) || t); rerender(true);} })),
        actionBtn("Details","bg-slate-700 hover:bg-slate-600", ()=> openTankDetailsInstant(t))
      ])
    ]);
    card.addEventListener("click",(e)=>{ if (e.target.closest("button")) return; openTankDetailsInstant(t); });

    function quickBtn(label, delta){
      return h("button",{
        class:"px-2 py-1 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-xs",
        onClick: async (ev)=>{
          ev.stopPropagation();
          const cap = Number(t.capacity||0);
          const curL = litersOf(t);
          const nextPct = clamp(percentOf(t)+delta, 0, 100);
          const nextL  = cap>0 ? Math.round((nextPct/100)*cap) : curL + Math.round((delta/100)*curL);
          await patchTank(t.id, nextL, cap);
          const fresh = await jget("/fuel");
          Object.assign(t, fresh.find(x=> toStr(x.id)===toStr(t.id)) || t);
          fuelBroadcastChanged();  // keep other views in sync
          rerender(true);
        }
      }, label);
    }
    function actionBtn(text, cls, onClick){
      return h("button",{class:`px-2 py-1 rounded ${cls} text-xs`, onClick:(ev)=>{ ev.stopPropagation(); onClick(); }}, text);
    }
    return card;
  }

  function buildToolbar(){
    const vesselSel = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const typeSel   = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const crit = h("input",{type:"checkbox", class:"accent-cyan-500"});
    const search = h("input",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm", placeholder:"Search tank / vessel / type"});
    vesselSel.addEventListener("change", e=>{ filters.vessel=e.target.value; rerender(); });
    typeSel  .addEventListener("change", e=>{ filters.type  =e.target.value; rerender(); });
    crit     .addEventListener("change", e=>{ filters.criticalOnly=e.target.checked; rerender(); });
    search   .addEventListener("input",  e=>{ filters.search=e.target.value; rerender(); });

    const refreshBtn = h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-sm", onClick: async ()=>{ tanks = await jget("/fuel"); rerender(true);} }, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]);
    const newRefuel  = h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm", onClick: ()=>{
      const first = filtered()[0] || tanks[0]; if (!first) return;
      openRefuelModal({ tank:first, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} });
    }}, [h("i",{class:"fas fa-plus mr-2"}),"Log Refuel"]);
    const newTrans   = h("button",{class:"px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-sm", onClick: ()=> openTransferModal({ tanks, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} })}, [h("i",{class:"fas fa-exchange-alt mr-2"}),"Transfer"]);

    const node = h("div",{class:"mb-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between"},[
      h("div",{class:"flex flex-wrap gap-2"},[
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Vessel"), vesselSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Fuel Type"), typeSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[crit, h("span",{class:"text-slate-400"},"Critical <20%")]),
      ]),
      h("div",{class:"flex flex-wrap gap-2"},[ search, refreshBtn, newRefuel, newTrans ])
    ]);
    node._vesselSel=vesselSel; node._typeSel=typeSel;
    return node;
  }
  function rebuildToolbarOptions(toolbarNode, data, filters){
    const vesselSel = toolbarNode._vesselSel;
    const typeSel   = toolbarNode._typeSel;
    if (!vesselSel || !typeSel) return;
    const vOpts = ["ALL", ...Array.from(new Set(data.map(t=> t.vessel || "—")))];
    vesselSel.innerHTML=""; vOpts.forEach(o=> vesselSel.appendChild(h("option",{value:o}, o)));
    vesselSel.value = vOpts.includes(filters.vessel) ? filters.vessel : "ALL";
    const tOpts = ["ALL", ...new Set([...FUEL_TYPES, ...data.map(t=> t.type || "Diesel")])];
    typeSel.innerHTML=""; tOpts.forEach(o=> typeSel.appendChild(h("option",{value:o}, o)));
    typeSel.value = tOpts.includes(filters.type) ? filters.type : "ALL";
  }

  rerender();
  return root;
}

/* -------------------- misc -------------------- */
function autoRefresh(fn, ms){ const id=setInterval(fn,ms); return ()=>clearInterval(id); }
function avgPct(arr){ if (!arr.length) return 0; const s=arr.reduce((a,t)=> a + percentOf(t), 0); return Math.round(s/arr.length); }

/* ==================================================================
   ML-ish Fuel Predictor (speed, route, weather, load, equipment)
   - Ridge regression on LPH
   - Auto-augment with synthetic voyages if real data is thin
================================================================== */
const FEATURE_NAMES = ["speed","speed2","routeDev","weather","load","equip"];
const FEATURE_LABELS = {
  speed:   "Speed (linear)",
  speed2:  "Speed² (nonlinear)",
  routeDev:"Route deviation",
  weather: "Weather severity",
  load:    "Load factor",
  equip:   "Equipment condition"
};
const MODEL_KEY = "fuelMLModel_v1";

/* presentation helpers */
function importancePercent(model){
  const mags = FEATURE_NAMES.map((_,i)=> Math.abs(model.w[i]||0));
  const sum  = mags.reduce((a,b)=>a+b,0)||1;
  return FEATURE_NAMES.map((n,i)=> ({ key:n, label: FEATURE_LABELS[n]||n, pct: 100*mags[i]/sum, w: model.w[i]||0 }))
    .sort((a,b)=> b.pct - a.pct);
}
function confBadge(r2){
  const r = Number(r2||0);
  let label="Low", cls="bg-yellow-900/40 text-yellow-300";
  if (r>=0.7){ label="High"; cls="bg-green-900/40 text-green-300"; }
  else if (r>=0.4){ label="Medium"; cls="bg-blue-900/40 text-blue-300"; }
  return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`},`Confidence: ${label}`);
}
function chip(text, cls="bg-slate-700/60 text-slate-200"){ return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`}, text); }
function bar(label,pct,colorCls="bg-cyan-500"){
  return h("div",{class:"space-y-1"},[
    h("div",{class:"flex justify-between text-xs"},[ h("span",{},label), h("span",{class:"text-slate-400"},`${Number(pct||0).toFixed(1)}%`) ]),
    h("div",{class:"w-full h-2 bg-slate-800/60 rounded"}, h("div",{class:`h-2 ${colorCls} rounded`, style:`width:${Math.min(100,Math.max(0,pct))}%`}))
  ]);
}
function toVal(node){ return (node?.querySelector?.("input")||node)?.value; }
function setVal(node, v){ const el = node?.querySelector?.("input") || node; if (!el) return; el.value = v; el.dispatchEvent(new Event("input")); }

/* details helpers */
function equipmentScoreForVessel(v){
  if (!v || !window.__inspIndex) return null;
  const insp = window.__inspIndex.get(String(v.id));
  if (!insp) return null;
  const hull = Number(insp.hullFouling||0);
  const prop = Number(insp.propeller||0);
  const eng  = Number(insp.engine||0);
  return clamp((hull+prop+eng) / 15, 0, 1);
}
function loadFactorForVessel(v){
  if (!v) return null;
  const cargo = Number(v.cargoTons ?? v.cargo ?? 0);
  const dwt = Number(v.dwtTons ?? v.dwt ?? 0);
  if (!dwt || dwt<=0) return null;
  return clamp(cargo/dwt, 0, 1);
}
function latestWeatherFromLogs(logs){
  for (let i=logs.length-1;i>=0;i--){
    const l = logs[i];
    const w = l?.weather ?? l?.seaState ?? l?.severity;
    if (isNum(w)) return clamp(Number(w), 0, 5);
  }
  return null;
}

/* model IO */
function saveModel(m){ try{ localStorage.setItem(MODEL_KEY, JSON.stringify(m)); }catch{} }
function loadModel(){ try{ const s=localStorage.getItem(MODEL_KEY); if(!s) return null; return JSON.parse(s); }catch{return null;} }

/* math */
function zstats(cols){
  const mu = cols.map(c=> c.reduce((a,x)=>a+x,0)/Math.max(1,c.length));
  const sigma = cols.map((c,i)=> {
    const m = mu[i]; const v = c.reduce((a,x)=> a+(x-m)*(x-m), 0)/Math.max(1,c.length);
    return Math.sqrt(v||1e-8);
  });
  return {mu, sigma};
}
function z(x, m, s){ return (x-m)/(s||1e-8); }
function normalEqRidge(X, y, lambda=0.1){
  const n=X.length, p=X[0]?.length||0;
  const XtX = Array.from({length:p},()=>Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for(let i=0;i<n;i++){
    const row = X[i];
    for(let a=0;a<p;a++){
      Xty[a]+= row[a]*y[i];
      for(let b=0;b<p;b++) XtX[a][b]+= row[a]*row[b];
    }
  }
  for(let k=0;k<p;k++) XtX[k][k]+= lambda;
  const A = XtX.map((r,i)=> r.concat([Xty[i]]));
  for(let i=0;i<p;i++){
    let maxR=i;
    for(let r=i+1;r<p;r++) if (Math.abs(A[r][i])>Math.abs(A[maxR][i])) maxR=r;
    const tmp=A[i]; A[i]=A[maxR]; A[maxR]=tmp;
    const piv=A[i][i]||1e-8;
    for(let j=i;j<=p;j++) A[i][j]/=piv;
    for(let r=0;r<p;r++){
      if(r===i) continue;
      const f=A[r][i];
      for(let j=i;j<=p;j++) A[r][j]-=f*A[i][j];
    }
  }
  const w=A.map(r=> r[p]);
  return w;
}
function r2Score(yTrue, yPred){
  const n=yTrue.length;
  const mu=yTrue.reduce((a,x)=>a+x,0)/Math.max(1,n);
  const ssTot=yTrue.reduce((a,x)=> a+(x-mu)*(x-mu),0);
  const ssRes=yTrue.reduce((a,x,i)=> a+(x-yPred[i])*(x-yPred[i]),0);
  return ssTot>0 ? 1-ssRes/ssTot : 0;
}
function mae(yTrue,yPred){ const n=yTrue.length||1; return yTrue.reduce((a,x,i)=> a+Math.abs(x-yPred[i]),0)/n; }

/* features & prediction */
function buildFeat(sample){
  const s = Math.max(0, Number(sample.speed)||0);
  const speed2 = s*s;
  const routeDev = Math.max(0, Number(sample.routeDev)||0);
  const weather = clamp(Number(sample.weather)||0, 0, 5);
  const load = clamp(Number(sample.load)||0, 0, 1);
  const equip = clamp(Number(sample.equip)||0, 0, 1);
  return [s, speed2, routeDev, weather, load, equip];
}
function predictLph(model, raw){
  try{
    const x = buildFeat(raw);
    const zX = x.map((v,i)=> z(v, model.mu[i], model.sigma[i]));
    const dot = zX.reduce((a,v,i)=> a + v*model.w[i], 0);
    return Math.max(0, dot);
  }catch{ return null; }
}

/* TRAINING DATA: real samples from logs */
async function collectSamples(inspections){
  window.__inspIndex = new Map();
  if (Array.isArray(inspections)){ inspections.forEach(i=> window.__inspIndex.set(String(i.vesselId), i)); }

  const [vesselsRes, fuelRes] = await Promise.allSettled([ jget("/vessels"), jget("/fuelLogs") ]);
  const V = vesselsRes.status==="fulfilled" && Array.isArray(vesselsRes.value) ? vesselsRes.value : [];
  const LOGS = fuelRes.status==="fulfilled" && Array.isArray(fuelRes.value) ? fuelRes.value : [];

  const byTank = new Map();
  for(const l of LOGS){ if (!l?.time) continue; const k = String(l.tankId ?? l.tankID ?? "unknown"); if (!byTank.has(k)) byTank.set(k, []); byTank.get(k).push(l); }
  for(const arr of byTank.values()){ arr.sort((a,b)=> new Date(a.time)-new Date(b.time)); }

  const vesselFor = (log) => {
    if (log?.vesselId!=null) return V.find(v=> String(v.id)===String(log.vesselId));
    if (log?.vessel){
      const nm = String(log.vessel).toLowerCase();
      return V.find(v=> String(v.name||"").toLowerCase()===nm) || V.find(v=> String(v.name||"").toLowerCase().includes(nm));
    }
    return null;
  };

  const samples = [];
  for(const arr of byTank.values()){
    for(let i=1;i<arr.length;i++){
      const a = arr[i-1], b = arr[i];
      const t0 = new Date(a.time).getTime();
      const t1 = new Date(b.time).getTime();
      const dh = Math.max(0.001, (t1 - t0) / 3600000);
      const dLit = Math.max(0, Number(a.liters||0) - Number(b.liters||0));
      if (!isFinite(dh) || dh<=0 || !isFinite(dLit)) continue;

      const nm = (b.distance!=null)
        ? Number(b.distance)||0
        : (a.lat!=null && a.lon!=null && b.lat!=null && b.lon!=null ? nmBetween(a,b) : 0);

      const lph = dLit/dh; if (!isFinite(lph) || lph<=0) continue;
      const spd = nm>0 ? (nm/dh) : (Number(b.speed||a.speed)||NaN); if (!isFinite(spd) || spd<=0) continue;

      const v = vesselFor(b);
      const equip = equipmentScoreForVessel(v);
      const load  = loadFactorForVessel(v);
      const weather = latestWeatherFromLogs([a,b]) ?? 0;
      const routeDev = 0;

      samples.push({ x: buildFeat({speed:spd, routeDev, weather, load:load??0, equip:equip??0}), y: lph });
    }
  }
  return samples;
}

/* SYNTHETIC VOYAGES for augmentation / demo */
function synthSamples(n=120){
  const out=[];
  for(let i=0;i<n;i++){
    const speed = 9 + Math.random()*8;                // 9–17 kn
    const routeDev = Math.max(0, (Math.random()**2)*0.35); // skew low, up to +35%
    const weather = Math.round(Math.random()*4);      // 0–4
    const load    = 0.3 + Math.random()*0.6;         // 0.3–0.9
    const equip   = Math.random()*0.6;                // 0–0.6 (badness)
    const baseLph = fallbackCube({speed, weather, load, equip, routeDev});
    const noisy   = baseLph * (0.9 + Math.random()*0.2); // ±10%
    out.push({ x: buildFeat({speed, routeDev, weather, load, equip}), y: noisy });
  }
  return out;
}

/* fit helper (shared by real/aug/demo) */
function fitFromSamples(samples, lambda=0.25, meta={}){
  const X = samples.map(s=> s.x);
  const y = samples.map(s=> s.y);
  const cols = FEATURE_NAMES.map((_,j)=> X.map(r=> r[j]));
  const {mu, sigma} = zstats(cols);
  const Xz = X.map(r=> r.map((v,j)=> z(v, mu[j], sigma[j])));
  const w = normalEqRidge(Xz, y, lambda);
  const yhat = Xz.map(r=> r.reduce((a,v,j)=> a + v*w[j], 0));
  const score = r2Score(y, yhat);
  const err = mae(y, yhat);
  const model = { w, mu, sigma, features: FEATURE_NAMES, target:"LPH", r2:score, mae:err, n:samples.length, lambda, ...meta };
  saveModel(model); return model;
}

/* TRAIN: real → auto-augment if thin */
async function trainModel(inspections, lambda=0.25){
  const real = await collectSamples(inspections);
  const minSamples = FEATURE_NAMES.length + 3; // small but > p
  let used = real.slice();
  let augmented = false;
  if (used.length < minSamples){
    used = used.concat(synthSamples(Math.max(40, minSamples*5)));
    augmented = true;
  }
  return fitFromSamples(used, lambda, { augmented, n_real: real.length });
}

/* DEMO: one-click fully synthetic */
function seedDemoModel(){
  const samples = synthSamples(140);
  return fitFromSamples(samples, 0.25, { augmented:true, n_real:0, demo:true });
}

/* ======== Presentation-friendly ML panel ======== */
function buildMLPanel(inspections){
  const header = h("div",{class:"flex items-center justify-between mb-2"},[
    h("div",{},[
      h("div",{class:"text-base font-semibold"},"Fuel Efficiency — ML Predictor (Beta)"),
      h("div",{class:"text-xs text-slate-400"},"Data-driven burn model (speed, route, weather, load, equipment)")
    ]),
    h("div",{class:"flex gap-2"},[
      h("button",{class:"px-3 py-1.5 rounded bg-slate-800/60 hover:bg-slate-700/60 text-sm",
        onClick:()=>{ localStorage.removeItem(MODEL_KEY); info.innerHTML="Cleared saved model."; coefWrap.innerHTML=""; impWrap.innerHTML=""; topLine.innerHTML=""; } },"Reset Model"),
      h("button",{class:"px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm", onClick:doTrain},"Train / Retrain"),
      h("button",{class:"px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-sm", onClick:doSeed},"One-Click Demo Model")
    ])
  ]);

  const info     = h("div",{class:"text-xs text-slate-300 flex items-center gap-2 flex-wrap"},[ chip("Status: Not trained") ]);
  const topLine  = h("div",{class:"flex items-center gap-2 mt-2 flex-wrap"});
  const impWrap  = h("div",{class:"grid md:grid-cols-2 gap-3 mt-3"});
  const coefWrap = h("div",{class:"mt-3"});
  const predForm = buildPredictForm();

  function renderModelSummary(m){
    topLine.innerHTML = "";
    topLine.appendChild(chip(`Samples: ${m.n}`, "bg-slate-700/60 text-slate-200"));
    topLine.appendChild(chip(`R²: ${Number(m.r2||0).toFixed(2)}`, "bg-slate-700/60 text-slate-200"));
    topLine.appendChild(chip(`MAE: ${Math.round(Number(m.mae||0)).toLocaleString()} L/h`, "bg-slate-700/60 text-slate-200"));
    topLine.appendChild(confBadge(Number(m.r2||0)));
    if (m.augmented){
      const tag = m.demo ? "Demo model" : `Augmented (real ${m.n_real||0})`;
      topLine.appendChild(chip(tag, "bg-blue-900/40 text-cyan-300"));
    }

    const imp = importancePercent(m);
    impWrap.innerHTML = "";
    impWrap.appendChild(
      h("div",{class:"rounded-xl bg-slate-800/60 p-3"},[
        h("div",{class:"text-sm font-semibold mb-2"},"Feature importance"),
        ...imp.map((r,idx)=> bar(r.label, r.pct, idx===0 ? "bg-cyan-400" : idx===1 ? "bg-blue-400" : "bg-slate-400"))
      ])
    );

    coefWrap.innerHTML = "";
    const details = h("details",{class:"rounded-xl bg-slate-800/60 p-3"},[
      h("summary",{class:"cursor-pointer text-sm font-semibold select-none"},"Model coefficients (z-scored)"),
      h("div",{class:"mt-2 grid md:grid-cols-2 gap-1 text-xs"},
        FEATURE_NAMES.map((name,i)=> h("div",{},`${FEATURE_LABELS[name]||name}: ${(m.w?.[i]??0)>=0?"+":""}${Number(m.w?.[i]??0).toFixed(3)}`))
      )
    ]);
    coefWrap.appendChild(details);

    const headline = `Top driver: ${imp[0]?.label || "—"} • Secondary: ${imp[1]?.label || "—"}`;
    info.innerHTML = `<span class="text-xs">${headline}</span>`;
  }

  async function doTrain(){
    info.textContent = "Training from historical logs…";
    topLine.innerHTML = ""; impWrap.innerHTML=""; coefWrap.innerHTML="";
    try{
      const m = await trainModel(inspections, 0.25);
      renderModelSummary(m);
    }catch(err){
      info.innerHTML = `<span class="text-red-300">Train failed:</span> ${String(err.message||err)}`;
    }
  }
  async function doSeed(){
    const m = seedDemoModel();
    renderModelSummary(m);
  }

  const existing = loadModel();
  if (existing){ renderModelSummary(existing); }

  return panel("",
    h("div",{},[
      header,
      info,
      topLine,
      impWrap,
      coefWrap,
      predForm
    ])
  );
}

function buildPredictForm(){
  const m = loadModel();
  const hint = h("div",{class:"text-xs text-slate-400 mt-2"},
    m ? "Model loaded. Use presets or set your scenario, then Predict."
      : "No model yet? Train or click One-Click Demo — you can still try the physics baseline."
  );

  const out = h("div",{class:"grid md:grid-cols-4 gap-3 mt-3"},[
    metric("Predicted burn (L/hr)", "—"),
    metric("Predicted daily (L/day)", "—"),
    metric("Predicted trip (L)", "—"),
    metric("ΔFuel for +1 kn (L/hr)", "—"),
  ]);

  const speed   = numInput("Speed (kn)", 12);
  const routeDv = numInput("Route deviation ratio (e.g. 0.10 = +10%)", 0.00);
  const weather = rangeInput("Weather severity (0–5)", 0, 0, 5, 1);
  const load    = numInput("Load factor (0..1, cargo/DWT)", 0.50);
  const equip   = numInput("Equipment badness (0..1)", 0.20);
  const dist    = numInput("Planned distance (nm)", 500);

  const presets = [
    {label:"Calm cruise",        vals:{speed:12, routeDev:0.02, weather:0, load:0.4, equip:0.1, dist:400}},
    {label:"Weather detour",     vals:{speed:12, routeDev:0.25, weather:2, load:0.4, equip:0.2, dist:600}},
    {label:"Heavy weather",      vals:{speed:13, routeDev:0.10, weather:4, load:0.5, equip:0.2, dist:500}},
    {label:"Maintenance needed", vals:{speed:12, routeDev:0.05, weather:1, load:0.5, equip:0.6, dist:450}},
  ];
  const presetRow = h("div",{class:"flex flex-wrap gap-2 mt-2"},
    presets.map(p=> h("button",{
      class:"px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 text-xs",
      onClick:()=>{
        setVal(speed, p.vals.speed);
        setVal(routeDv, p.vals.routeDev);
        setVal(weather, p.vals.weather);
        setVal(load, p.vals.load);
        setVal(equip, p.vals.equip);
        setVal(dist, p.vals.dist);
      }
    }, p.label))
  );

  const btn = h("button",{class:"px-3 py-1.5 rounded bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm mt-3"},"Predict");
  btn.addEventListener("click", ()=>{
    const model = loadModel();
    const raw = {
      speed: Number(toVal(speed))||0,
      routeDev: Math.max(0, Number(toVal(routeDv))||0),
      weather: clamp(Number(toVal(weather))||0,0,5),
      load: clamp(Number(toVal(load))||0,0,1),
      equip: clamp(Number(toVal(equip))||0,0,1)
    };
    const distanceNm = Number(toVal(dist))||0;

    const lph = model ? (predictLph(model, raw) ?? 0) : fallbackCube(raw);
    const lpd = lph*24;
    const trip = lph * (distanceNm / Math.max(1, raw.speed||1));
    const lphUp = model ? (predictLph(model, {...raw, speed: raw.speed+1}) ?? 0) : fallbackCube({...raw, speed: raw.speed+1});
    const delta = Math.max(0, lphUp - lph);

    out.children[0].querySelector("div:last-child").textContent = Math.round(lph).toLocaleString();
    out.children[1].querySelector("div:last-child").textContent = Math.round(lpd).toLocaleString();
    out.children[2].querySelector("div:last-child").textContent = Math.round(trip).toLocaleString();
    out.children[3].querySelector("div:last-child").textContent = Math.round(delta).toLocaleString();

    // headline tips
    let topDriver = "—";
    if (model){ const imp = importancePercent(model); topDriver = imp[0]?.label || "—"; }
    hint.innerHTML = adviceFrom(raw, model, topDriver);
  });

  return h("div",{},[
    h("div",{class:"grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"},[ speed, routeDv, weather, load, equip, dist ]),
    presetRow,
    btn,
    hint,
    out
  ]);
}

function adviceFrom(raw, model, topDriverLabel="—"){
  const coeffs = (model?.w||[]).map((w,i)=>({name:FEATURE_NAMES[i], w:Math.abs(w)})).sort((a,b)=> b.w-a.w);
  const readable = (k)=> FEATURE_LABELS[k] || k;
  const top3 = coeffs.slice(0,3).map(c=> readable(c.name));
  const tips = [];
  if (top3.some(n=> n.includes("Speed"))) tips.push("Try slow steaming; speed dominates burn (non-linear).");
  if (top3.includes("Route deviation")) tips.push("Optimize voyage plan to reduce detours vs great-circle.");
  if (top3.includes("Weather severity")) tips.push("Shift ETD/ETA to avoid heavy weather windows.");
  if (top3.includes("Load factor")) tips.push("Manage cargo/ballast to reduce displacement where possible.");
  if (top3.includes("Equipment condition")) tips.push("Schedule hull/prop/engine maintenance to cut drag.");
  return `
    <div class="mt-2 text-xs text-slate-300">
      <div class="mb-1">Top driver: <b>${topDriverLabel}</b>${ raw.speed ? ` • Scenario speed: <b>${Number(raw.speed).toFixed(1)} kn</b>` : ""}</div>
      ${tips.map(t=>`<div>• ${t}</div>`).join("")}
    </div>`;
}

/* physics baseline & small UI */
function fallbackCube({speed, weather=0, load=0, equip=0, routeDev=0}){
  const BASE_SPEED = 14, BASE_DAILY = 1800;
  const k = (BASE_DAILY/24) / Math.pow(BASE_SPEED,3);
  const burnPerHour = k * Math.pow(speed||1,3);
  const multi = (1 + 0.05*weather + 0.30*load + 0.30*equip) * (1 + routeDev);
  return Math.max(0, burnPerHour * multi);
}
function numInput(label, initial=null){
  const input = h("input",{type:"number", step:"any", value: initial==null ? "" : String(initial),
    class:"bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-sm"});
  return wrap(label, input);
}
function rangeInput(label, initial=0, min=0, max=5, step=1){
  const input = h("input",{type:"range", min:String(min), max:String(max), step:String(step), value:String(initial),
    class:"w-full"});
  const val = h("span",{class:"text-xs text-slate-300 ml-2"}, String(initial));
  input.addEventListener("input",()=> val.textContent = input.value);
  return wrap(label, h("div",{},[input, val]));
}
function metric(label, value){
  return h("div",{class:"rounded-xl bg-slate-800/60 p-4"},[
    h("div",{class:"text-slate-300 text-sm"}, label),
    h("div",{class:"text-2xl font-bold"}, value==null?"—":String(value))
  ]);
}
function wrap(label, input){
  return h("label",{class:"flex flex-col gap-1"},[
    h("span",{class:"text-xs text-slate-400"}, label),
    input
  ]);
}
