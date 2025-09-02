// /src/routes/reports.js
import { h, jget, panel, table, showModal, destroyModal } from "../main.js";

/* ───────────────────────── utils ───────────────────────── */
const toStr = (x) => String(x ?? "");
const fmtLocal = (iso) => { try { return iso ? new Date(iso).toLocaleString() : "—"; } catch { return "—"; } };
const uniq = (arr) => Array.from(new Set(arr));
const clamp = (n, lo, hi)=> Math.max(lo, Math.min(hi, n));

/* SVG helpers (no libs) */
const NS = "http://www.w3.org/2000/svg";
const makeSVG = (w,h) => { const s=document.createElementNS(NS,"svg"); s.setAttribute("viewBox",`0 0 ${w} ${h}`); s.setAttribute("width",w); s.setAttribute("height",h); s.classList.add("w-full","h-auto"); return s; };
const S = (name, attrs={})=>{ const el=document.createElementNS(NS,name); for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); return el; };

/* grouping */
const fmtDM = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const fmtD  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

const groupByType = (list) => {
  const m = new Map();
  list.forEach(r=> m.set(r.type||"Unknown", (m.get(r.type||"Unknown")||0)+1));
  return Array.from(m.entries()).map(([label,value])=>({label,value}));
};

const groupByDay = (list, days=null) => {
  const m = new Map();
  const now = Date.now();
  const min = days ? (now - days*86400000) : -Infinity;
  list.forEach(r=>{
    if(!r.createdAt) return;
    const t = new Date(r.createdAt).getTime();
    if (!Number.isFinite(t) || t<min) return;
    const key = fmtD(new Date(t));
    m.set(key, (m.get(key)||0)+1);
  });
  return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([label,value])=>({label,value}));
};

const groupByMonth = (list) => {
  const m = new Map();
  list.forEach(r=>{
    if(!r.createdAt) return;
    const key = fmtDM(new Date(r.createdAt));
    m.set(key, (m.get(key)||0)+1);
  });
  return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([label,value])=>({label,value}));
};

/* ───────────────────── charts w/ tooltip ───────────────────── */
function addTooltipHost() {
  const host = h("div",{class:"relative"});
  const tip  = h("div",{class:"hidden absolute px-2 py-1 rounded bg-slate-900/90 text-xs border border-slate-700/70 text-slate-100 pointer-events-none"});
  host._tip = tip;
  host.appendChild(tip);
  return host;
}
function showTip(host, x, y, text){
  const tip = host._tip; if(!tip) return;
  tip.textContent = text;
  tip.style.left = `${clamp(x+10, 0, host.clientWidth-10)}px`;
  tip.style.top  = `${clamp(y-10, 0, host.clientHeight-10)}px`;
  tip.classList.remove("hidden");
}
function hideTip(host){ host?._tip?.classList.add("hidden"); }

/* bar */
function barChart({ host, labels, values, width=720, height=260, title="" }){
  const svg = makeSVG(width, height);
  const m = { top:24, right:16, bottom:36, left:40 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const max = Math.max(1, ...values);

  const g = S("g",{ transform:`translate(${m.left},${m.top})` });
  svg.appendChild(g);

  // grid
  const gy = 4;
  for(let i=0;i<=gy;i++){
    const y = h - (i/gy)*(h-4);
    g.appendChild(S("line",{ x1:0, y1:y, x2:w, y2:y, stroke:"#334155", "stroke-width":"1", "stroke-opacity":"0.35"}));
  }

  // axes
  g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155", "stroke-width":"1"}));

  // bars
  const bw = w / Math.max(1, labels.length);
  labels.forEach((lb,i)=>{
    const v  = values[i] ?? 0;
    const bh = (v/max) * (h - 8);
    const x  = i*bw + 8;
    const y  = h - bh;
    const rect = S("rect",{ x, y, width:Math.max(2,bw-16), height:Math.max(0,bh), rx:6, fill:"#22d3ee", opacity:"0.9" });
    rect.addEventListener("mouseenter", ()=> rect.setAttribute("opacity","1"));
    rect.addEventListener("mouseleave", ()=> rect.setAttribute("opacity","0.9"));
    rect.addEventListener("mousemove", (ev)=>{
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const ctm = svg.getBoundingClientRect();
      showTip(host, ev.clientX-ctm.left, ev.clientY-ctm.top, `${lb}: ${v}`);
    });
    rect.addEventListener("mouseleave", ()=> hideTip(host));
    g.appendChild(rect);

    if (bw >= 36) {
      const t = S("text",{ x:x+(bw-16)/2, y:h+14, "text-anchor":"middle", "font-size":"10", fill:"#94a3b8"});
      t.appendChild(document.createTextNode(lb)); g.appendChild(t);
    }
  });

  if (title) svg.appendChild(S("text",{ x:m.left, y:18, "font-size":"12", fill:"#94a3b8"})).appendChild(document.createTextNode(title));
  host.appendChild(svg);
}

/* line */
function lineChart({ host, labels, values, width=720, height=260, title="" }){
  const svg = makeSVG(width, height);
  const m = { top:24, right:16, bottom:36, left:40 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, labels.length-1);

  const g = S("g",{ transform:`translate(${m.left},${m.top})` });
  svg.appendChild(g);

  // grid
  const gy = 4;
  for(let i=0;i<=gy;i++){
    const y = h - (i/gy)*(h-4);
    g.appendChild(S("line",{ x1:0, y1:y, x2:w, y2:y, stroke:"#334155", "stroke-width":"1", "stroke-opacity":"0.35"}));
  }
  g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155", "stroke-width":"1"}));

  // path
  let d=""; const pts=[];
  labels.forEach((_,i)=>{
    const v = values[i] ?? 0;
    const x = i*step;
    const y = h - (v/max)*(h-8);
    pts.push([x,y,v]);
    d += (i===0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  g.appendChild(S("path",{ d, fill:"none", stroke:"#22d3ee", "stroke-width":"2.25"}));

  // points + sparse labels + tooltip
  const sparse = Math.ceil(labels.length / 8);
  pts.forEach(([x,y,v],i)=>{
    const c = S("circle",{ cx:x, cy:y, r:3.5, fill:"#22d3ee" });
    c.addEventListener("mouseenter", ()=> c.setAttribute("r","4.5"));
    c.addEventListener("mouseleave", ()=> c.setAttribute("r","3.5"));
    c.addEventListener("mousemove",(ev)=>{
      const br = svg.getBoundingClientRect();
      showTip(host, ev.clientX - br.left, ev.clientY - br.top, `${labels[i]}: ${v}`);
    });
    c.addEventListener("mouseleave", ()=> hideTip(host));
    g.appendChild(c);
    if (i % sparse === 0 || i === labels.length-1) {
      const t = S("text",{ x, y:h+14, "text-anchor":"middle", "font-size":"10", fill:"#94a3b8"});
      t.appendChild(document.createTextNode(labels[i])); g.appendChild(t);
    }
  });

  if (title) svg.appendChild(S("text",{ x:m.left, y:18, "font-size":"12", fill:"#94a3b8"})).appendChild(document.createTextNode(title));
  host.appendChild(svg);
}

/* ─────────────────────────── page ─────────────────────────── */
export async function routeReports(){
  let reports = await jget("/reports").catch(()=>[]);

  // toolbar state
  const state = {
    type: "ALL",
    range: "30",          // '7' | '30' | '90' | 'all'
    search: "",
    sort: "date_desc"     // 'date_desc' | 'date_asc' | 'title' | 'type'
  };

  // toolbar controls
  const types = ["ALL", ...uniq(reports.map(r=> r.type || "Unknown"))];

  const typeSel = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},
    types.map(t=> h("option",{value:t}, t))
  );
  const rangeSel = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},
    [ ["7","Last 7 days"], ["30","Last 30 days"], ["90","Last 90 days"], ["all","All time"] ].map(([v,l])=> h("option",{value:v}, l))
  );
  const sortSel = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},
    [
      ["date_desc","Newest first"],
      ["date_asc","Oldest first"],
      ["title","Title"],
      ["type","Type"]
    ].map(([v,l])=> h("option",{value:v}, l))
  );
  const searchBox = h("input",{placeholder:"Search title/type…", class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm w-56"});

  [ ["change",typeSel,(e)=>{ state.type=e.target.value; redrawAll(); }],
    ["change",rangeSel,(e)=>{ state.range=e.target.value; redrawAll(); }],
    ["change",sortSel,(e)=>{ state.sort =e.target.value; redrawTable(); redrawPlot(); }],
    ["input", searchBox,(e)=>{ state.search=e.target.value||""; redrawTable(); redrawPlot(); }]
  ].forEach(([evt,el,fn])=> el.addEventListener(evt, fn));

  const refreshBtn = h("button",{class:"px-3 py-1.5 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-sm",
    onClick: async ()=>{ reports = await jget("/reports").catch(()=>reports); // keep selection options in sync
      const freshTypes = ["ALL", ...uniq(reports.map(r=> r.type || "Unknown"))];
      typeSel.innerHTML=""; freshTypes.forEach(t=> typeSel.appendChild(h("option",{value:t}, t)));
      redrawAll();
    }
  }, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]);

  const toolbar = h("div",{class:"mb-2 flex flex-wrap items-center gap-2"},[
    h("span",{class:"text-sm text-slate-400"},"Type"), typeSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Range"), rangeSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Sort"), sortSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Search"), searchBox,
    h("div",{class:"ml-auto"}, refreshBtn)
  ]);

  /* ------------- PLOT AREA ------------- */
  const plotHost = addTooltipHost();
  const plotTitle = h("div",{class:"text-sm text-slate-400 mb-1"});
  const plotPanel = panel("Reports Overview", h("div",{},[
    toolbar,
    plotTitle,
    plotHost
  ]));

  function filteredReports(){
    let arr = reports.slice();
    // type
    if (state.type !== "ALL"){
      arr = arr.filter(r=> (r.type||"Unknown")===state.type);
    }
    // range (by createdAt)
    if (state.range !== "all"){
      const days = Number(state.range||0);
      const min = Date.now() - days*86400000;
      arr = arr.filter(r=>{
        const t = new Date(r.createdAt||0).getTime();
        return Number.isFinite(t) && t >= min;
      });
    }
    // search
    if (state.search.trim()){
      const q = state.search.toLowerCase();
      arr = arr.filter(r=> toStr(r.title).toLowerCase().includes(q) || toStr(r.type).toLowerCase().includes(q));
    }
    // sort
    arr.sort((a,b)=>{
      if (state.sort==="title") return toStr(a.title).localeCompare(toStr(b.title));
      if (state.sort==="type")  return toStr(a.type ).localeCompare(toStr(b.type ));
      const ta = new Date(a.createdAt||0).getTime(), tb = new Date(b.createdAt||0).getTime();
      return state.sort==="date_asc" ? (ta - tb) : (tb - ta);
    });
    return arr;
  }

  function redrawPlot(){
    plotHost.innerHTML = "";
    hideTip(plotHost);

    const filtered = filteredReports();

    // choose best metric: per-day over selected range
    const days = state.range==="all" ? null : Number(state.range);
    const data = groupByDay(filtered, days);
    const labels = data.map(d=> d.label);
    const values = data.map(d=> d.value);

    if (!labels.length){
      plotTitle.textContent = "No data for the current filters.";
      plotHost.appendChild(h("div",{class:"text-xs text-slate-400"},"Try widening the range or clearing filters."));
      return;
    }
    plotTitle.textContent = `Reports per day ${days?`(last ${days}d)`:"(all time)"} — ${filtered.length} item(s)`;
    lineChart({ host: plotHost, labels, values, title:"" });
  }

  /* ------------- TABLE AREA ------------- */
  const listWrap = h("div");
  const exportBtn = h("button",{class:"px-3 py-1 bg-slate-800/70 rounded border border-slate-700 hover:bg-slate-700/60 text-sm"},"Export CSV");
  exportBtn.addEventListener("click", ()=>{
    const rows = filteredReports();
    const header = ["ID","Title","Type","Created","URL"];
    const body = rows.map(r=>[ r.id, r.title, r.type, r.createdAt || "", r.url || "" ]);
    const csv = [header, ...body].map(r=> r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="reports_filtered.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  const tablePanel = panel("Reports", h("div",{},[
    listWrap,
    h("div",{class:"mt-3"}, exportBtn)
  ]));

  function openDetails(r){
    const rows = [
      ["Title", r.title || "—"],
      ["Type",  r.type  || "—"],
      ["Created", fmtLocal(r.createdAt)],
      ["URL",  r.url ? h("a",{href:r.url, target:"_blank", class:"text-cyan-300 underline break-all"}, r.url) : "—"]
    ];
    const body = h("div",{class:"space-y-2"}, rows.map(([k,v])=>
      h("div",{},[ h("div",{class:"text-xs text-slate-400"}, k), (v instanceof Node)?v:h("div",{class:"text-sm"}, v) ])
    ));
    const preview = r.url ? h("iframe",{src:r.url, class:"w-full h-72 rounded border border-slate-800/60 mt-3"}) : null;
    showModal("Report Details", h("div",{},[
      body,
      preview || "",
      h("div",{class:"mt-4 flex justify-end"},[
        h("button",{class:"px-3 py-2 rounded bg-slate-700 hover:bg-slate-600", onClick: destroyModal},"Close")
      ])
    ]));
  }

  function redrawTable(){
    const rows = filteredReports().map(r=> ({...r, createdLocal: fmtLocal(r.createdAt)}));
    const cols = [
      {label:"ID",       key:"id"},
      {label:"Title",    value:(r)=> {
        const link = r.url ? h("a",{href:r.url, target:"_blank", class:"text-cyan-300 hover:text-cyan-200 underline decoration-dotted"}, r.title || "Report") : (r.title || "Report");
        const btn  = h("button",{class:"ml-2 px-2 py-0.5 text-xs bg-slate-800/70 border border-slate-700 rounded hover:bg-slate-700/60", onClick:()=>openDetails(r)},"Details");
        return h("div",{},[link, btn]);
      }},
      {label:"Type",     key:"type"},
      {label:"Created",  key:"createdLocal"},
      {label:"Link",     value:(r)=> r.url ? h("a",{href:r.url, target:"_blank", class:"text-blue-400 underline"},"Open") : "—"}
    ];
    listWrap.replaceChildren(table(rows, cols));
  }

  function redrawAll(){ redrawPlot(); redrawTable(); }

  // initial paint
  redrawAll();

  /* ------------- layout ------------- */
  return h("div",{class:"grid gap-6"},[
    plotPanel,
    tablePanel
  ]);
}
