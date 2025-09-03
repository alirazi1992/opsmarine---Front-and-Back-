// /src/routes/reports.js
import { h, jget, panel, table, showModal, destroyModal } from "../main.js";

/* ───────────────────────── helpers ───────────────────────── */
const toStr = (x) => String(x ?? "");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const sum = (a) => a.reduce((x,y)=> x + (Number(y)||0), 0);
const avg = (a) => (a.length ? sum(a)/a.length : 0);
const pct = (n,d) => (d>0 ? (100*n/d) : 0);
const fmtPct = (x, d=1) => `${(Number.isFinite(x)?x:0).toFixed(d)}%`;
const fmtLocal = (iso) => { try { return iso ? new Date(iso).toLocaleString() : "—"; } catch { return "—"; } };
const uniq = (arr) => Array.from(new Set(arr));
const fmtDM = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const fmtD  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hoursBetween = (a,b) => Math.max(0, (new Date(b)-new Date(a))/3600000);

/* ────────────── ultra-light Markdown → HTML (safe-ish subset) ────────────── */
function mdToHtml(md=""){
  const esc = (s)=> s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const lines = md.split(/\r?\n/).map(line=>{
    if (/^###\s+/.test(line)) return `<h3 class="text-sm font-semibold text-slate-200 mb-1">${esc(line.replace(/^###\s+/,""))}</h3>`;
    if (/^##\s+/.test(line))  return `<h2 class="text-base font-semibold text-slate-200 mb-1">${esc(line.replace(/^##\s+/,""))}</h2>`;
    if (/^#\s+/.test(line))   return `<h1 class="text-lg font-semibold text-slate-200 mb-1">${esc(line.replace(/^#\s+/,""))}</h1>`;
    if (/^\s*[-*]\s+/.test(line)) return `<li class="ml-4">${esc(line.replace(/^\s*[-*]\s+/,""))}</li>`;
    return `<p class="mb-1 text-sm text-slate-300">${esc(line)}</p>`;
  });
  let html = lines.join("\n");
  html = html.replace(/\*\*([^*]+)\*\*/g,'<strong class="text-slate-100">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g,'<em>$1</em>');
  html = html.replace(/`([^`]+)`/g,'<code class="px-1 rounded bg-slate-800 border border-slate-700">$1</code>');
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ul class="list-disc text-sm text-slate-300 pl-5">$1</ul>');
  return html;
}
function renderMarkdown(container, md){
  const wrap = h("div",{class:"prose prose-invert max-w-none text-slate-300 text-sm"});
  wrap.innerHTML = mdToHtml(md);
  container.replaceChildren(wrap);
}

/* ───────────────────── SVG utils (no libs) ───────────────────── */
const NS = "http://www.w3.org/2000/svg";
const makeSVG = (w,h) => {
  const s=document.createElementNS(NS,"svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`);
  s.setAttribute("width", w);
  s.setAttribute("height", h);
  s.classList.add("w-full","h-auto");
  return s;
};
const S = (name, attrs={}) => {
  const el=document.createElementNS(NS,name);
  Object.entries(attrs).forEach(([k,v])=> el.setAttribute(k,v));
  return el;
};

/* ───────── polished tooltip host (no clipping, high z) ───────── */
function addTooltipHost() {
  const host = h("div",{class:"relative", style:"overflow:visible"});
  const tip  = h("div",{
    class:"hidden absolute z-50 px-2.5 py-1.5 rounded-md bg-slate-900/95 text-xs border border-slate-700/70 text-slate-100 pointer-events-none shadow-xl",
    style:"max-width:260px; line-height:1.15;"
  });
  host._tip = tip; host.appendChild(tip); return host;
}
function showTip(host, x, y, html){
  const tip = host._tip; if(!tip) return;
  tip.innerHTML = html;
  // make visible offscreen to measure
  tip.style.left = "-9999px";
  tip.style.top  = "-9999px";
  tip.classList.remove("hidden");
  const br = host.getBoundingClientRect();
  const tw = tip.offsetWidth || 180;
  const th = tip.offsetHeight || 60;
  const pad = 12;
  const left = clamp(x + pad, 0, Math.max(0, br.width - tw - pad));
  const top  = clamp(y + pad, 0, Math.max(0, br.height - th - pad));
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}
function hideTip(host){ host?._tip?.classList.add("hidden"); }

/* ───────────────────── shaping & grouping ───────────────────── */
const normalizeReport = (r)=>({
  id: r.id ?? r._id ?? Math.random().toString(36).slice(2),
  title: r.title ?? "Report",
  type: r.type ?? "Ops",
  status: r.status ?? "Closed",            // Open | In Progress | Closed
  severity: Number(r.severity ?? 2),       // 1..5
  createdAt: r.createdAt ?? new Date().toISOString(),
  resolvedAt: r.resolvedAt ?? (r.status==="Closed" ? new Date().toISOString() : null),
  vessel: r.vessel ?? "—",
  owner: r.owner ?? "—",
  slaBreached: Boolean(r.slaBreached ?? false),
  costImpact: Number(r.costImpact ?? 0),
  url: r.url || ""
});

function groupByDay(list, days=null){
  const m = new Map();
  const now = Date.now();
  const min = days ? (now - days*86400000) : -Infinity;
  list.forEach(r=>{
    const t = new Date(r.createdAt).getTime();
    if (!Number.isFinite(t) || t<min) return;
    const key = fmtD(new Date(t));
    m.set(key, (m.get(key)||0)+1);
  });
  return Array.from(m.entries())
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([label,value])=>({label,value}));
}
function statusBreakdown(list){
  const m = new Map();
  list.forEach(r=> m.set(r.status||"Open", (m.get(r.status||"Open")||0)+1));
  const arr = Array.from(m.entries()).map(([label,value])=>({label,value}));
  const total = sum(arr.map(a=>a.value));
  return {arr, total};
}
function groupWeekType(list, weeks=10){
  const weekKey = (iso)=>{
    const d = new Date(iso);
    const first = new Date(d.getFullYear(),0,1);
    const wk = Math.ceil((((d-first)/86400000)+first.getDay()+1)/7);
    return `${d.getFullYear()}-W${String(wk).padStart(2,"0")}`;
  };
  const map = new Map();
  list.forEach(r=>{
    const wk = weekKey(r.createdAt);
    const ty = r.type || "Unknown";
    if (!map.has(wk)) map.set(wk, new Map());
    const inner = map.get(wk);
    inner.set(ty, (inner.get(ty)||0)+1);
  });
  const keys = Array.from(map.keys()).sort((a,b)=> a.localeCompare(b)).slice(-weeks);
  const types = Array.from(new Set(list.map(r=> r.type || "Unknown")));
  const rows = keys.map(k=>{
    const obj = { label:k };
    const inner = map.get(k) || new Map();
    types.forEach(t=> obj[t] = inner.get(t)||0);
    return obj;
  });
  return {rows, types, labels: keys};
}

/* ───────────────────── charts ───────────────────── */
function addAxesLabels(svg, m, w, h, { xLabel="", yLabel="", title="" }={}){
  if (title) svg.appendChild(S("text",{ x:m.left, y:18,"font-size":"12", fill:"#cbd5e1"})).appendChild(document.createTextNode(title));
  if (xLabel) svg.appendChild(S("text",{ x:m.left + w/2, y:m.top + h + 32, "text-anchor":"middle", "font-size":"11", fill:"#94a3b8"})).appendChild(document.createTextNode(xLabel));
  if (yLabel) {
    const t = S("text",{ x:16, y:m.top + h/2, transform:`rotate(-90, 16, ${m.top + h/2})`, "text-anchor":"middle", "font-size":"11", fill:"#94a3b8"});
    t.textContent = yLabel; svg.appendChild(t);
  }
}
function makeLegend(host, items){
  const wrap = h("div",{class:"mt-2 flex flex-wrap gap-2 text-xs"});
  items.forEach(({label,color})=>{
    wrap.appendChild(
      h("div",{class:"flex items-center gap-1 px-2 py-1 rounded border border-slate-800/60 bg-slate-900/40"},
        [h("span",{class:"inline-block w-3 h-3 rounded", style:`background:${color}`}), h("span",{},label)]
      )
    );
  });
  host.appendChild(wrap);
}

/* ─────────── LINE CHART with full-area hover ─────────── */
function lineChart({ host, labels, values, width=840, height=300, meta={} }){
  const svg = makeSVG(width, height);
  svg.setAttribute("style","pointer-events:auto");
  const m = { top:28, right:18, bottom:48, left:56 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const g = S("g",{ transform:`translate(${m.left},${m.top})` });
  svg.appendChild(g);

  const max = Math.max(1, ...values);
  // grid + y ticks
  for(let i=0;i<=4;i++){
    const y = h - (i/4)*(h-4);
    g.appendChild(S("line",{ x1:0, y1:y, x2:w, y2:y, stroke:"#334155","stroke-width":"1","stroke-opacity":"0.35"}));
    const val = Math.round((i/4)*max);
    const yt = S("text",{ x:-8, y:y+4, "text-anchor":"end", "font-size":"10", fill:"#94a3b8"}); yt.textContent = String(val);
    g.appendChild(yt);
  }
  g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155","stroke-width":"1"}));

  const step = w / Math.max(1, labels.length-1);
  let d=""; const pts=[];
  labels.forEach((lb,i)=>{
    const v = values[i] ?? 0;
    const x = i*step;
    const y = h - (v/max)*(h-8);
    pts.push({x,y,v,lb,i});
    d += (i===0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  g.appendChild(S("path",{ d, fill:"none", stroke:"#22d3ee","stroke-width":"2.25", style:"pointer-events:visibleStroke" }));

  // large invisible hit-circles for easy hover
  pts.forEach(p=>{
    const hit = S("circle",{ cx:p.x, cy:p.y, r:10, fill:"transparent", style:"pointer-events:auto" });
    hit.addEventListener("mousemove",(ev)=>{
      const br = svg.getBoundingClientRect();
      const prev  = p.i>0 ? (values[p.i-1]||0) : null;
      const delta = prev==null ? "—" : (p.v - prev);
      const totalRange = sum(values.map(v=> v||0));
      const pctOf = totalRange>0 ? (p.v*100/totalRange).toFixed(1)+"%" : "0%";
      showTip(host, ev.clientX - br.left, ev.clientY - br.top,
        `<div><strong>${p.lb}</strong></div>
         <div>Count: <strong>${p.v}</strong> (${pctOf} of range)</div>
         <div>Δ vs prev: <strong>${delta>=0?"+":""}${delta??"—"}</strong></div>`);
    });
    hit.addEventListener("mouseleave", ()=> hideTip(host));
    g.appendChild(hit);
  });

  // visible points
  pts.forEach(p=>{
    g.appendChild(S("circle",{ cx:p.x, cy:p.y, r:3.6, fill:"#22d3ee", style:"pointer-events:none" }));
  });

  // x labels (sparse)
  const sparse = Math.ceil(labels.length/8);
  pts.forEach((p,i)=>{
    if (i%sparse===0 || i===labels.length-1){
      g.appendChild(S("text",{ x:p.x, y:h+14, "text-anchor":"middle","font-size":"10",fill:"#94a3b8"})).textContent = p.lb;
    }
  });

  addAxesLabels(svg, m, w, h, meta);

  // full-area overlay for nearest-point hover
  const overlay = S("rect",{x:m.left,y:m.top,width:w,height:h,fill:"transparent", style:"pointer-events:auto"});
  svg.appendChild(overlay);
  overlay.addEventListener("mousemove",(ev)=>{
    const br = svg.getBoundingClientRect();
    const rx = ev.clientX - br.left - m.left;
    const idx = clamp(Math.round(rx/step), 0, pts.length-1);
    const p = pts[idx]; if (!p) return;
    const prev  = p.i>0 ? (values[p.i-1]||0) : null;
    const delta = prev==null ? "—" : (p.v - prev);
    const totalRange = sum(values.map(v=> v||0));
    const pctOf = totalRange>0 ? (p.v*100/totalRange).toFixed(1)+"%" : "0%";
    showTip(host, ev.clientX - br.left, ev.clientY - br.top,
      `<div><strong>${p.lb}</strong></div>
       <div>Count: <strong>${p.v}</strong> (${pctOf} of range)</div>
       <div>Δ vs prev: <strong>${delta>=0?"+":""}${delta??"—"}</strong></div>`);
  });
  overlay.addEventListener("mouseleave", ()=> hideTip(host));

  host.appendChild(svg);
  host._svg = svg;
}

/* ───────── STACKED BAR with reliable hit targets ───────── */
function stackedBar({ host, dataset, categories, width=840, height=320, meta={} }){
  const svg = makeSVG(width, height);
  svg.setAttribute("style","pointer-events:auto");
  const m = { top:28, right:18, bottom:48, left:56 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const g = S("g",{ transform:`translate(${m.left},${m.top})` });
  svg.appendChild(g);

  const totals = dataset.map(row => categories.reduce((a,c)=>a+(row[c]||0),0));
  const max = Math.max(1, ...totals);
  const bw = w / Math.max(1, dataset.length);
  const weekTotals = totals.slice();

  for(let i=0;i<=4;i++){
    const y = h - (i/4)*(h-4);
    g.appendChild(S("line",{ x1:0, y1:y, x2:w, y2:y, stroke:"#334155","stroke-width":"1","stroke-opacity":"0.35"}));
    const val = Math.round((i/4)*max);
    const yt = S("text",{ x:-8, y:y+4, "text-anchor":"end", "font-size":"10", fill:"#94a3b8"}); yt.textContent = String(val);
    g.appendChild(yt);
  }
  g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155","stroke-width":"1"}));

  const palette = ["#22d3ee","#60a5fa","#a78bfa","#34d399","#f472b6","#f59e0b","#eab308"];
  dataset.forEach((row,i)=>{
    let yCursor = h;
    categories.forEach((c,ci)=>{
      const v = row[c]||0;
      const bh = Math.max(1,(v/max)*(h-8)); // ensure >=1px hit area
      const x = i*bw + 8;
      const y = yCursor - bh;
      const rect = S("rect",{ x, y, width:Math.max(2,bw-16), height:bh, rx:6, fill:palette[ci%palette.length], opacity:"0.92", style:"pointer-events:auto" });
      rect.addEventListener("mousemove",(ev)=>{
        const br = svg.getBoundingClientRect();
        const wTot = weekTotals[i] || 0;
        const share = wTot>0 ? ((v*100)/wTot).toFixed(1)+"%" : "0%";
        showTip(host, ev.clientX - br.left, ev.clientY - br.top,
          `<div><strong>${row.label}</strong></div>
           <div>${c}: <strong>${v}</strong> (${share} of week)</div>
           <div>Week total: <strong>${wTot}</strong></div>`);
      });
      rect.addEventListener("mouseleave", ()=> hideTip(host));
      g.appendChild(rect);
      yCursor -= bh;
    });
    if (bw>=40){
      g.appendChild(S("text",{ x:i*bw + bw/2, y:h+14, "text-anchor":"middle","font-size":"10", fill:"#94a3b8"})).textContent = row.label;
    }
  });

  addAxesLabels(svg, m, w, h, meta);
  host.appendChild(svg);
  host._svg = svg;

  // Legend
  makeLegend(host, categories.map((c,i)=>({label:c,color:palette[i%palette.length]})));
}

/* ───────── DONUT with explicit pointer events ───────── */
function donutChart({ host, pairs, width=420, height=260, meta={} }){
  const svg = makeSVG(width, height);
  svg.setAttribute("style","pointer-events:auto");
  const r = Math.min(width,height)*0.36;
  const cx = width/2, cy = height/2 + 6;
  const total = Math.max(1, sum(pairs.map(p=>p.value)));
  let a0 = -Math.PI/2;
  const palette = ["#22d3ee","#60a5fa","#a78bfa","#34d399","#f472b6","#f59e0b"];

  pairs.forEach((p,i)=>{
    const frac = p.value/total;
    const a1 = a0 + frac*2*Math.PI;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    const slice = S("path",{ d, fill:palette[i%palette.length], opacity:"0.95", stroke:"#0f172a","stroke-width":"1", style:"pointer-events:auto" });
    slice.addEventListener("mousemove",(ev)=>{
      const br = svg.getBoundingClientRect();
      const share = fmtPct((p.value*100)/total);
      showTip(host, ev.clientX - br.left, ev.clientY - br.top,
        `<div><strong>${p.label}</strong></div>
         <div>Value: <strong>${p.value}</strong></div>
         <div>Share: <strong>${share}</strong> of ${total}</div>`);
    });
    slice.addEventListener("mouseleave", ()=> hideTip(host));
    svg.appendChild(slice);
    a0 = a1;
  });

  addAxesLabels(svg, {top:18,left:0,bottom:0,right:0}, width, height-18, meta); // title only
  host.appendChild(svg);
  host._svg = svg;

  // Legend
  makeLegend(host, pairs.map((p,i)=>({label:`${p.label} (${fmtPct((p.value*100)/total)})`, color:palette[i%palette.length]})));
}

/* ───────────────────── demo seeding (frontend top-up) ───────────────────── */
function seedReports(n=180){
  const types = ["Ops","Safety","Maintenance","Compliance","Fuel","Crew","IT","Navigation","Cargo"];
  const statuses = ["Open","In Progress","Closed"];
  const vessels = ["Aquila","Leviathan","Orion","Selene","Calypso","Nereid","Andromeda","Poseidon","Atlas","Hestia"];
  const owners = ["Dispatch","HSE","Chief Eng.","Ops Center","Fleet IT","Master","1st Officer","Port Agent"];
  const now = Date.now();
  const out=[];
  for(let i=0;i<n;i++){
    const created = new Date(now - Math.random()*120*86400000);
    const status = statuses[Math.floor(Math.random()*statuses.length)];
    const sev = Math.ceil(1 + Math.random()*4);
    const cost = Math.round((200 + Math.random()*12000) * (sev>=4 ? 1.6 : 1));
    const closeHours = status==="Closed" ? (6 + Math.random()*120) : null;
    const resolvedAt = closeHours ? new Date(+created + closeHours*3600000) : null;
    out.push(normalizeReport({
      title: `${types[Math.floor(Math.random()*types.length)]} #${1000+i}`,
      type: types[Math.floor(Math.random()*types.length)],
      status,
      severity: sev,
      createdAt: created.toISOString(),
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      vessel: vessels[Math.floor(Math.random()*vessels.length)],
      owner: owners[Math.floor(Math.random()*owners.length)],
      slaBreached: Math.random()<0.18,
      costImpact: cost
    }));
  }
  return out;
}

/* ─────────────────────────── page ─────────────────────────── */
export async function routeReports(){
  let reports = await jget("/reports").catch(()=>[]);
  if (!Array.isArray(reports)) reports = [];
  reports = reports.map(normalizeReport);

  // Frontend top-up for prettier charts
  let demoMode = false;
  if (reports.length < 50) {
    const need = Math.max(180 - reports.length, 0);
    if (need > 0) { reports = reports.concat(seedReports(need)); demoMode = true; }
  }

  /* state */
  const state = {
    type: "ALL",
    status: "ALL",
    range: "30",        // 7 | 30 | 90 | all
    search: "",
    sort: "date_desc"   // date_desc | date_asc | title | type | severity | status
  };

  /* toolbar */
  const types = ["ALL", ...uniq(reports.map(r=> r.type||"Unknown"))];
  const statuses = ["ALL","Open","In Progress","Closed"];

  const typeSel   = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"}, types.map(t=> h("option",{value:t}, t)));
  const statusSel = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"}, statuses.map(s=> h("option",{value:s}, s)));
  const rangeSel  = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},
    [["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]].map(([v,l])=> h("option",{value:v}, l))
  );
  const sortSel   = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},
    [["date_desc","Newest first"],["date_asc","Oldest first"],["title","Title"],["type","Type"],["severity","Severity"],["status","Status"]].map(([v,l])=> h("option",{value:v}, l))
  );
  const searchBox = h("input",{placeholder:"Search title / vessel / owner…", class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm w-64"});

  [["change",typeSel,  (e)=>{ state.type=e.target.value; redrawAll(); }],
   ["change",statusSel,(e)=>{ state.status=e.target.value; redrawAll(); }],
   ["change",rangeSel, (e)=>{ state.range=e.target.value; redrawAll(); }],
   ["change",sortSel,  (e)=>{ state.sort =e.target.value; redrawTable(); redrawCharts(); }],
   ["input", searchBox,(e)=>{ state.search=e.target.value||""; redrawTable(); redrawCharts(); }]]
   .forEach(([evt,el,fn])=> el.addEventListener(evt, fn));

  const refreshBtn = h("button",{class:"px-3 py-1.5 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-sm",
    onClick: async ()=> {
      let fresh = await jget("/reports").catch(()=>null);
      if (Array.isArray(fresh)) {
        reports = fresh.map(normalizeReport);
        if (reports.length < 50) {
          const need = Math.max(180 - reports.length, 0);
          if (need > 0) { reports = reports.concat(seedReports(need)); demoMode = true; }
        } else demoMode = false;
        typeSel.innerHTML = ""; ["ALL", ...uniq(reports.map(r=> r.type||"Unknown"))].forEach(t=> typeSel.appendChild(h("option",{value:t}, t)));
      }
      redrawAll();
    }
  }, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]);

  const printBtn = h("button",{class:"px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"},[h("i",{class:"fas fa-print mr-2"}),"Print"]);
  printBtn.addEventListener("click", ()=> window.print());

  const toolbar = h("div",{class:"mb-3 flex flex-wrap items-center gap-2"},[
    h("span",{class:"text-sm text-slate-400"},"Type"),   typeSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Status"), statusSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Range"),  rangeSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Sort"),   sortSel,
    h("span",{class:"text-sm text-slate-400 ml-2"},"Search"), searchBox,
    h("div",{class:"ml-auto flex gap-2"},[ refreshBtn, printBtn ])
  ]);

  /* KPI band */
  const kpiBand = h("div",{class:"grid grid-cols-2 md:grid-cols-6 gap-3"});
  function kpiCard(label, value, sub=""){
    return h("div",{class:"rounded-xl bg-slate-800/50 border border-slate-700/50 p-3"},[
      h("div",{class:"text-xs text-slate-400"},label),
      h("div",{class:"text-xl font-semibold"}, value),
      sub ? h("div",{class:"text-[11px] text-slate-400 mt-1"}, sub) : ""
    ]);
  }

  /* panels & hosts */
  const trendHost  = addTooltipHost();
  const stackHost  = addTooltipHost();
  const donutHost  = addTooltipHost();

  // Markdown detail containers
  const trendMd  = h("div",{class:"mt-2"});
  const donutMd  = h("div",{class:"mt-2"});
  const stackMd  = h("div",{class:"mt-2"});
  const tableMd  = h("div",{class:"mb-2"});

  const chartsPanel = panel("Reports Overview",
    h("div",{},[
      toolbar,
      h("div",{class:"mb-3"}, kpiBand),
      h("div",{class:"grid grid-cols-1 lg:grid-cols-2 gap-4"},[
        h("div",{class:"rounded-2xl glass-panel p-3 border border-slate-800/50"},[
          h("div",{class:"text-sm text-slate-300 font-medium mb-1"},"Reports per Day"),
          trendHost,
          trendMd
        ]),
        h("div",{class:"rounded-2xl glass-panel p-3 border border-slate-800/50"},[
          h("div",{class:"text-sm text-slate-300 font-medium mb-1"},"Status Mix"),
          donutHost,
          donutMd
        ]),
        h("div",{class:"rounded-2xl glass-panel p-3 border border-slate-800/50 lg:col-span-2"},[
          h("div",{class:"text-sm text-slate-300 font-medium mb-1"},"Weekly Breakdown by Type"),
          stackHost,
          stackMd
        ])
      ])
    ])
  );

  /* insights + narrative */
  const insightsWrap = h("div",{class:"grid md:grid-cols-2 gap-4"});
  const insightsPanel = panel("Insights & Narrative",
    h("div",{},[
      insightsWrap
    ])
  );

  /* table & export */
  const listWrap = h("div");
  const exportBtn = h("button",{class:"px-3 py-1 bg-slate-800/70 rounded border border-slate-700 hover:bg-slate-700/60 text-sm"},"Export CSV");
  exportBtn.addEventListener("click", ()=>{
    const rows = filtered();
    const header = ["ID","Title","Type","Status","Severity","Created","Resolved","Vessel","Owner","SLA Breach","Cost","URL"];
    const body = rows.map(r=>[
      r.id, r.title, r.type, r.status, r.severity, r.createdAt || "", r.resolvedAt || "",
      r.vessel || "", r.owner || "", r.slaBreached ? "Yes":"No", r.costImpact || 0, r.url || ""
    ]);
    const csv = [header, ...body].map(row=> row.map(x=> `"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="reports_filtered.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  const tablePanel = panel("Reports",
    h("div",{},[
      tableMd,
      listWrap,
      h("div",{class:"mt-3"}, exportBtn)
    ])
  );

  /* filters + derive */
  function filtered(){
    let arr = reports.slice();
    if (state.type !== "ALL")   arr = arr.filter(r=> (r.type||"Unknown")===state.type);
    if (state.status !== "ALL") arr = arr.filter(r=> (r.status||"Open")===state.status);
    if (state.range !== "all"){
      const days = Number(state.range||0);
      const min = Date.now() - days*86400000;
      arr = arr.filter(r=> new Date(r.createdAt).getTime() >= min);
    }
    if (state.search.trim()){
      const q = state.search.toLowerCase();
      arr = arr.filter(r=>
        toStr(r.title).toLowerCase().includes(q) ||
        toStr(r.vessel).toLowerCase().includes(q) ||
        toStr(r.owner).toLowerCase().includes(q) ||
        toStr(r.type).toLowerCase().includes(q)
      );
    }
    // sort
    arr.sort((a,b)=>{
      if (state.sort==="title")    return toStr(a.title).localeCompare(toStr(b.title));
      if (state.sort==="type")     return toStr(a.type ).localeCompare(toStr(b.type ));
      if (state.sort==="severity") return (a.severity||0) - (b.severity||0);
      if (state.sort==="status")   return toStr(a.status).localeCompare(toStr(b.status));
      const ta=new Date(a.createdAt||0).getTime(), tb=new Date(b.createdAt||0).getTime();
      return state.sort==="date_asc" ? (ta - tb) : (tb - ta);
    });
    return arr;
  }

  /* render: KPIs */
  function renderKPIs(rows){
    const total = rows.length;
    const closed = rows.filter(r=> r.status==="Closed").length;
    const cr = fmtPct(pct(closed,total));
    const mttrHrs = avg(rows.filter(r=> r.status==="Closed" && r.resolvedAt)
      .map(r=> hoursBetween(r.createdAt, r.resolvedAt)));
    const mttr = Number.isFinite(mttrHrs) ? `${mttrHrs.toFixed(1)} h` : "—";
    const sla = rows.filter(r=> r.slaBreached).length;
    const sev = avg(rows.map(r=> r.severity||0));
    const sevStr = Number.isFinite(sev) ? sev.toFixed(1) : "—";
    const cost = sum(rows.map(r=> r.costImpact||0)).toLocaleString();

    kpiBand.replaceChildren(
      kpiCard("Total Reports", total.toLocaleString()),
      kpiCard("Close Rate", cr),
      kpiCard("MTTR", mttr, "Mean time to resolve"),
      kpiCard("SLA Breaches", sla.toLocaleString()),
      kpiCard("Avg Severity", sevStr),
      kpiCard("Est. Cost", `$${cost}`, demoMode ? "Demo data" : "")
    );
  }

  /* render: charts + markdown details */
  function redrawCharts(){
    const rows = filtered();
    // Trend
    trendHost.innerHTML = ""; hideTip(trendHost);
    const days = state.range==="all" ? null : Number(state.range);
    const perDay = groupByDay(rows, days);
    const tLabels = perDay.map(d=> d.label);
    const tValues = perDay.map(d=> d.value);
    if (tLabels.length){
      lineChart({ host:trendHost, labels:tLabels, values:tValues,
        meta:{ title:"Reports per Day", xLabel:"Date", yLabel:"Reports" }
      });
      const total = sum(tValues);
      renderMarkdown(trendMd, [
        `### Details`,
        `- **Total** in range: **${total}**`,
        `- **Average / day**: ${(avg(tValues)||0).toFixed(2)}`,
        `- **Peak**: ${Math.max(0,...tValues)} on \`${tLabels[tValues.indexOf(Math.max(0,...tValues))]||"—"}\``,
      ].join("\n"));
    } else {
      trendHost.appendChild(h("div",{class:"text-xs text-slate-400"},"No data for current filters."));
      trendMd.replaceChildren();
    }

    // Donut
    donutHost.innerHTML = ""; hideTip(donutHost);
    const sb = statusBreakdown(rows);
    if (sb.arr.length){
      donutChart({ host:donutHost, pairs:sb.arr, meta:{ title:"Status Mix" }});
      renderMarkdown(donutMd, [
        `### Details`,
        ...sb.arr.map(p=> `- **${p.label}**: ${p.value} (${fmtPct(pct(p.value, sb.total))})`)
      ].join("\n"));
    } else {
      donutHost.appendChild(h("div",{class:"text-xs text-slate-400"},"No status data."));
      donutMd.replaceChildren();
    }

    // Stacked weekly
    stackHost.innerHTML = ""; hideTip(stackHost);
    const wk = groupWeekType(rows, 10);
    if (wk.rows.length){
      stackedBar({ host:stackHost, dataset:wk.rows, categories:wk.types,
        meta:{ title:"Weekly Breakdown by Type", xLabel:"Week", yLabel:"Reports" }
      });
      const last = wk.rows[wk.rows.length-1];
      const lastSummary = Object.entries(last).filter(([k])=>k!=="label").map(([k,v])=> `${k}: ${v}`).join(", ");
      renderMarkdown(stackMd, [
        `### Details`,
        `- **Weeks shown**: ${wk.rows.length}`,
        `- **Latest week** (${last.label}): ${lastSummary}`
      ].join("\n"));
    } else {
      stackHost.appendChild(h("div",{class:"text-xs text-slate-400"},"No weekly data."));
      stackMd.replaceChildren();
    }
  }

  /* render: insights + narrative */
  function renderInsights(){
    const rows = filtered();
    const total = rows.length || 1;
    const byType = Object.entries(rows.reduce((m,r)=> (m[r.type]=(m[r.type]||0)+1,m), {}))
                   .sort((a,b)=> b[1]-a[1]).slice(0,3);
    const openAging = rows.filter(r=> r.status!=="Closed")
      .map(r=> ({...r, age: hoursBetween(r.createdAt, Date.now())}))
      .sort((a,b)=> b.age-a.age).slice(0,3);
    const topCost = rows.slice().sort((a,b)=> (b.costImpact||0)-(a.costImpact||0)).slice(0,3);
    const breachRate = pct(rows.filter(r=> r.slaBreached).length, total);

    const list = h("div",{class:"rounded-2xl glass-panel p-3 border border-slate-800/50"},[
      h("div",{class:"text-sm font-medium mb-2"},"Top 5 Insights"),
      h("ul",{class:"text-sm list-disc pl-5 space-y-1"},[
        h("li",{}, `Most common types: ${byType.map(([t,c])=> `${t} (${c})`).join(", ") || "—"}`),
        h("li",{}, `SLA breach rate: ${fmtPct(breachRate)}`),
        h("li",{}, `Oldest open items: ${openAging.map(r=> `${r.title} (${r.vessel}) ~ ${(r.age/24).toFixed(1)} d`).join("; ") || "—"}`),
        h("li",{}, `Highest cost: ${topCost.map(r=> `${r.title} $${(r.costImpact||0).toLocaleString()}`).join("; ") || "—"}`),
        h("li",{}, `Close rate: ${fmtPct(pct(rows.filter(r=> r.status==="Closed").length, total))}`)
      ])
    ]);

    const last7 = groupByDay(rows, 7).reduce((a,b)=> a + b.value, 0);
    const prev7 = groupByDay(reports, 14).slice(0,7).reduce((a,b)=> a + b.value, 0);
    const delta = last7 - prev7;
    const trendWord = delta>0 ? "increased" : (delta<0 ? "decreased" : "held steady");
    const narrative = h("div",{class:"rounded-2xl glass-panel p-3 border border-slate-800/50"},[
      h("div",{class:"text-sm font-medium mb-2"},"Narrative"),
      h("div",{class:"text-sm text-slate-300"},[
        `In the last 7 days we logged ${last7} report(s), which ${trendWord} vs the prior week (${Math.abs(delta)} delta). `,
        `Close rate is ${fmtPct(pct(rows.filter(r=> r.status==="Closed").length, rows.length || 1))}, `,
        `SLA breach rate at ${fmtPct(pct(rows.filter(r=> r.slaBreached).length, rows.length || 1))}. `,
        `Focus areas: ${byType.map(([t])=> t).slice(0,2).join(" & ") || "—"}.`
      ].join(""))
    ]);

    insightsWrap.replaceChildren(list, narrative);
  }

  /* table details modal */
  function openDetails(r){
    const rows = [
      ["Title", r.title || "—"],
      ["Type", r.type || "—"],
      ["Status", r.status || "—"],
      ["Severity", String(r.severity ?? "—")],
      ["Created", fmtLocal(r.createdAt)],
      ["Resolved", r.resolvedAt ? fmtLocal(r.resolvedAt) : "—"],
      ["Vessel", r.vessel || "—"],
      ["Owner", r.owner || "—"],
      ["SLA Breach", r.slaBreached ? "Yes" : "No"],
      ["Cost Impact", `$${(r.costImpact||0).toLocaleString()}`],
      ["URL", r.url ? h("a",{href:r.url, target:"_blank", class:"text-cyan-300 underline break-all"}, r.url) : "—"]
    ];
    const body = h("div",{class:"space-y-2"},
      rows.map(([k,v])=> h("div",{},[
        h("div",{class:"text-xs text-slate-400"},k),
        (v instanceof Node)?v: h("div",{class:"text-sm"},v)
      ]))
    );
    const preview = r.url ? h("iframe",{src:r.url, class:"w-full h-72 rounded border border-slate-800/60 mt-3"}) : null;
    showModal("Report Details", h("div",{},[
      body,
      preview || "",
      h("div",{class:"mt-4 flex justify-end"},[
        h("button",{class:"px-3 py-2 rounded bg-slate-700 hover:bg-slate-600", onClick: destroyModal},"Close")
      ])
    ]));
  }

  /* render: table */
  function redrawTable(){
    const rows = filtered().map(r=> ({...r, createdLocal: fmtLocal(r.createdAt), resolvedLocal: r.resolvedAt?fmtLocal(r.resolvedAt):"—"}));

    // Markdown caption/description for table
    const open = rows.filter(r=> r.status!=="Closed").length;
    renderMarkdown(tableMd, [
      `### Details`,
      `- **Rows**: ${rows.length.toLocaleString()}`,
      `- **Open**: ${open.toLocaleString()}  •  **Closed**: ${(rows.length-open).toLocaleString()}`,
      `- Hover a cell to see full value.`
    ].join("\n"));

    // columns (with native title tooltips + Details button)
    const cols = [
      {label:"ID",       key:"id",          title:(r)=>r.id},
      {label:"Title",    value:(r)=>{
        const link = r.url ? h("a",{href:r.url,target:"_blank",class:"text-cyan-300 hover:text-cyan-200 underline decoration-dotted", title:r.title||"Report"}, r.title || "Report") : h("span",{title:r.title||"Report"}, r.title || "Report");
        const pill = h("span",{class:`ml-2 text-[11px] px-2 py-0.5 rounded-full ${r.status==="Closed"?"bg-green-900/40 text-green-300": r.status==="In Progress"?"bg-blue-900/40 text-blue-300":"bg-yellow-900/40 text-yellow-300"}`, title:`Status: ${r.status}`}, r.status);
        const btn  = h("button",{class:"ml-2 px-2 py-0.5 text-xs bg-slate-800/70 border border-slate-700 rounded hover:bg-slate-700/60", onClick:()=>openDetails(r), title:"Open details"},"Details");
        return h("div",{},[link, pill, btn]);
      }},
      {label:"Type",     key:"type",        title:(r)=>r.type},
      {label:"Severity", key:"severity",    title:(r)=>String(r.severity)},
      {label:"Created",  key:"createdLocal",title:(r)=>fmtLocal(r.createdAt)},
      {label:"Resolved", key:"resolvedLocal",title:(r)=>r.resolvedAt?fmtLocal(r.resolvedAt):"—"},
      {label:"Vessel",   key:"vessel",      title:(r)=>r.vessel||"—"},
      {label:"Owner",    key:"owner",       title:(r)=>r.owner||"—"},
      {label:"SLA",      value:(r)=> r.slaBreached ? h("span",{class:"text-red-300", title:"SLA breached"},"Breach") : h("span",{title:"No breach"},"—")},
      {label:"Cost",     value:(r)=> h("span",{title:String(r.costImpact||0)}, `$${(r.costImpact||0).toLocaleString()}`)},
    ];

    listWrap.replaceChildren(table(rows, cols));
  }

  /* master redraw */
  function redrawAll(){
    const rows = filtered();
    renderKPIs(rows);
    redrawCharts();
    renderInsights();
    redrawTable();
  }

  // initial paint
  redrawAll();

  /* layout */
  return h("div",{class:"grid gap-6"},[
    chartsPanel,
    insightsPanel,
    tablePanel
  ]);
}
