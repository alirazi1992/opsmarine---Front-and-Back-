// /src/routes/alerts.js
import { h, jget, jdel, panel, table, kpi, showModal, destroyModal } from "../main.js";

/* -------- helpers -------- */
const toStr = (x) => String(x ?? "");
const clsForLevel = (lvl="")=>{
  const s = lvl.toLowerCase();
  if (s==="critical") return "bg-red-900/50 text-red-300";
  if (s==="high")     return "bg-orange-900/50 text-orange-300";
  if (s==="medium" || s==="warning") return "bg-yellow-900/50 text-yellow-300";
  if (s==="low")      return "bg-blue-900/40 text-blue-300";
  return "bg-slate-700/50 text-slate-200";
};
const badge = (txt)=> h("span",{class:`text-xs px-2 py-0.5 rounded-full ${clsForLevel(txt)}`}, txt || "—");

function timeAgo(iso){
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, (Date.now() - t)/1000);
  if (s < 60)   return `${Math.floor(s)}s ago`;
  const m = s/60;
  if (m < 60)   return `${Math.floor(m)}m ago`;
  const h = m/60;
  if (h < 24)   return `${Math.floor(h)}h ago`;
  const d = h/24;
  return `${Math.floor(d)}d ago`;
}

/* acknowledge persistence (client-side only) */
const ACK_KEY = "ack_alert_ids";
function getAck(){ try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) || "[]")); } catch { return new Set(); } }
function saveAck(set){ localStorage.setItem(ACK_KEY, JSON.stringify(Array.from(set))); }

/* -------- route -------- */
export async function routeAlerts(){
  // load data
  let [alerts, vessels] = await Promise.all([
    jget("/alerts").catch(()=>[]),
    jget("/vessels").catch(()=>[])
  ]);
  let ack = getAck();

  // quick vessel lookup
  const vById = new Map((vessels||[]).map(v=> [String(v.id), v]));

  // state
  const filters = {
    level: "ALL",       // ALL | Critical | High | Medium | Low | Info
    vessel: "ALL",      // ALL | <id>
    search: "",
    hideAck: false
  };

  // ---- KPIs
  const counts = ()=> {
    const c = { total: alerts.length, critical:0, high:0, medium:0, low:0 };
    alerts.forEach(a=>{
      const s = (a.level||"").toLowerCase();
      if (s==="critical") c.critical++;
      else if (s==="high") c.high++;
      else if (s==="medium") c.medium++;
      else if (s==="low") c.low++;
    });
    return c;
  };
  const k = counts();
  const kpis = h("div",{class:"grid grid-cols-2 md:grid-cols-5 gap-4 mb-4"},[
    kpi("Total Alerts", k.total),
    kpi("Critical", k.critical),
    kpi("High", k.high),
    kpi("Medium", k.medium),
    kpi("Low", k.low),
  ]);

  // ---- toolbar
  const levelSel = h("select",{class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm"},[
    h("option",{value:"ALL"},"All Levels"),
    h("option",{value:"Critical"},"Critical"),
    h("option",{value:"High"},"High"),
    h("option",{value:"Medium"},"Medium"),
    h("option",{value:"Low"},"Low")
  ]);
  const vesselSel = h("select",{class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm"});
  const search = h("input",{placeholder:"Search message…", class:"bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm w-56"});
  const hideAck = h("label",{class:"text-sm flex items-center gap-2"},[
    h("input",{type:"checkbox", class:"accent-cyan-500", onChange:()=>{ filters.hideAck = !filters.hideAck; rerender(); }}),
    h("span",{class:"text-slate-300"},"Hide acknowledged")
  ]);

  function buildVesselOptions(){
    const opts = ["ALL", ...Array.from(new Set((alerts||[])
      .map(a=> toStr(a.vesselId))
      .filter(id=> id && id!=="undefined")))];
    vesselSel.innerHTML = "";
    vesselSel.appendChild(h("option",{value:"ALL"},"All Vessels"));
    opts.filter(x=> x!=="ALL").forEach(id=>{
      const name = vById.get(String(id))?.name || `#${id}`;
      vesselSel.appendChild(h("option",{value:String(id)} , name));
    });
  }
  buildVesselOptions();

  levelSel.addEventListener("change",(e)=>{ filters.level=e.target.value; rerender(); });
  vesselSel.addEventListener("change",(e)=>{ filters.vessel=e.target.value; rerender(); });
  search.addEventListener("input",(e)=>{ filters.search=e.target.value||""; rerender(); });

  const refreshBtn = h("button",{
    class:"px-3 py-1.5 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-sm",
    onClick: async ()=>{ alerts = await jget("/alerts").catch(()=>alerts); buildVesselOptions(); rerender(true); }
  }, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]);

  const clearAllBtn = h("button",{
    class:"px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-sm",
    onClick: async ()=>{
      if (!alerts.length) return;
      if (!confirm(`Delete ${alerts.length} alerts?`)) return;
      // best-effort bulk delete
      await Promise.all(alerts.map(a=> jdel(`/alerts/${a.id}`).catch(()=>{})));
      alerts = await jget("/alerts").catch(()=>[]);
      rerender(true);
    }
  },"Clear all");

  const toolbar = h("div",{class:"mb-3 flex flex-wrap items-center gap-2"},[
    h("span",{class:"text-sm text-slate-400"},"Level"), levelSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Vessel"), vesselSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Search"), search,
    h("span",{class:"ml-2"}, hideAck),
    h("div",{class:"ml-auto flex gap-2"}, [refreshBtn, clearAllBtn])
  ]);

  // ---- per-row actions
  const columns = [
    {label:"Level", value:a=> badge(a.level || "Info")},
    {label:"Message", value:a=>{
      const acked = ack.has(String(a.id));
      const vessel = vById.get(String(a.vesselId));
      const sub = h("div",{class:"text-[11px] text-slate-400 mt-0.5"}, vessel ? vessel.name : (a.vesselId!=null ? `Vessel #${a.vesselId}` : "—"));
      return h("div",{class: acked ? "opacity-70" : ""},[
        h("div",{class:"text-sm"}, a.message || "—"),
        sub
      ]);
    }},
    {label:"Created", value:a=>{
      const t = a.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
      return h("span",{title: t}, timeAgo(a.createdAt));
    }},
    {label:"Actions", value:a=>{
      const id = String(a.id);
      const isAck = ack.has(id);
      const ackBtn = h("button",{
        class:`px-2 py-1 rounded border border-slate-700 ${isAck?"bg-slate-800/60":"bg-emerald-900/50 hover:bg-emerald-800/50"} text-xs`,
        onClick:()=>{ if(isAck){ ack.delete(id); } else { ack.add(id); } saveAck(ack); rerender(); }
      }, isAck ? "Un-ack" : "Acknowledge");

      const delBtn = h("button",{
        class:"px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-xs",
        onClick: async ()=>{
          if (!confirm("Delete this alert?")) return;
          await jdel(`/alerts/${a.id}`).catch(()=>{});
          alerts = await jget("/alerts").catch(()=>alerts);
          rerender(true);
        }
      },"Delete");

      const infoBtn = h("button",{
        class:"px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs",
        onClick:()=> openDetails(a)
      },"Details");

      return h("div",{class:"flex gap-2"},[ackBtn, infoBtn, delBtn]);
    }}
  ];

  // ---- table render
  const listWrap = h("div");
  function filtered(){
    let arr = (alerts||[]).slice().sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
    if (filters.level!=="ALL") arr = arr.filter(a=> toStr(a.level).toLowerCase() === filters.level.toLowerCase());
    if (filters.vessel!=="ALL") arr = arr.filter(a=> toStr(a.vesselId) === toStr(filters.vessel));
    if (filters.search.trim()){
      const q = filters.search.toLowerCase();
      arr = arr.filter(a=> toStr(a.message).toLowerCase().includes(q));
    }
    if (filters.hideAck) arr = arr.filter(a=> !ack.has(String(a.id)));
    return arr;
  }
  function drawTable(){ listWrap.replaceChildren(table(filtered(), columns)); }

  // ---- auto refresh (15s)
  let stopTimer = autoTimer(async ()=>{
    const fresh = await jget("/alerts").catch(()=>null);
    if (fresh) { alerts = fresh; buildVesselOptions(); rerender(true); }
  }, 15000);

  function rerender(fromTimer=false){
    // KPIs
    const c = counts();
    kpis.replaceChildren(
      kpi("Total Alerts", c.total),
      kpi("Critical", c.critical),
      kpi("High", c.high),
      kpi("Medium", c.medium),
      kpi("Low", c.low),
    );
    drawTable();

    if (!fromTimer){
      stopTimer();
      stopTimer = autoTimer(async ()=>{
        const fresh = await jget("/alerts").catch(()=>null);
        if (fresh) { alerts = fresh; buildVesselOptions(); rerender(true); }
      }, 15000);
    }
  }

  // ---- compose page
  const page = h("div",{class:"space-y-4"},[
    kpis,
    panel("Alerts", h("div",{},[toolbar, listWrap]))
  ]);
  rerender();
  return page;
}

/* ---------- small utils ---------- */
function autoTimer(fn, ms){ const id=setInterval(fn,ms); return ()=>clearInterval(id); }

/* ---------- details modal ---------- */
function openDetails(a){
  const header = h("div",{class:"mb-2"},[
    h("div",{class:"text-xs text-slate-400"},"Alert"),
    h("div",{class:"text-base font-semibold flex items-center gap-2"}, [badge(a.level || "Info"), a.message || "—"])
  ]);
  const rows = [
    ["ID", a.id || "—"],
    ["Vessel", a.vesselId!=null ? `#${a.vesselId}` : "—"],
    ["Created", a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"],
    ["Raw", JSON.stringify(a, null, 2)]
  ];
  const body = h("div",{class:"space-y-2"},[
    header,
    ...rows.map(([k,v])=> h("div",{},[
      h("div",{class:"text-xs text-slate-400"}, k),
      v instanceof Node ? v : h("div",{class:"text-sm"}, v)
    ])),
    h("div",{class:"mt-3 text-xs text-slate-500"},"Tip: Use the Acknowledge button to hide this alert without deleting it.")
  ]);
  showModal("Alert Details", h("div",{},[
    body,
    h("div",{class:"mt-4 flex justify-end"},[
      h("button",{class:"px-3 py-2 rounded bg-slate-700 hover:bg-slate-600", onClick: destroyModal},"Close")
    ])
  ]));
}
