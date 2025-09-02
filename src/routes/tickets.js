// /src/routes/tickets.js
import { h, jget, panel, table, showModal, destroyModal } from "../main.js";

/* Utils */
const toStr = (x) => String(x ?? "");
const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
};
const PRIORITIES = ["Low","Medium","High","Urgent"];
const STATUSES   = ["Open","In Progress","Closed"];

export async function routeTickets(){
  // Load tickets + vessels for display-only context
  let [tickets, vessels] = await Promise.all([
    jget("/tickets"),
    jget("/vessels").catch(()=>[])
  ]);
  const vesselNameById = Object.fromEntries(
    (vessels||[]).map(v => [toStr(v.id), v.name || `#${v.id}`])
  );

  // Filters state
  const filters = { status:"ALL", priority:"ALL", vessel:"ALL", search:"" };

  // Summary
  const summary = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"});
  function kpi(label, value){
    const v = (typeof value === "function") ? value() : value;
    return h("div",{class:"glass-panel rounded-xl p-3 border border-slate-800/50"},[
      h("div",{class:"text-xs text-slate-400"}, label),
      h("div",{class:"text-lg font-semibold"}, String(v))
    ]);
  }
  function renderSummary(){
    const total  = tickets.length;
    const open   = tickets.filter(t=> (t.status||"") === "Open").length;
    const prog   = tickets.filter(t=> (t.status||"") === "In Progress").length;
    const closed = tickets.filter(t=> (t.status||"") === "Closed").length;
    summary.replaceChildren(
      kpi("Total", total),
      kpi("Open", open),
      kpi("In Progress", prog),
      kpi("Closed", closed),
    );
  }

  // Toolbar (filters + search + new ticket link)
  const toolbar = buildToolbar();

  // Table columns (read-only)
  const columns = [
    {label:"ID", key:"id"},
    {label:"Title",   value:(t)=> titleCell(t)},
    {label:"Vessel",  value:(t)=> vesselNameById[toStr(t.vesselId)] || (t.vesselId!=null ? `#${t.vesselId}` : "—")},
    {label:"Priority",value:(t)=> priorityPill(t.priority)},
    {label:"Status",  value:(t)=> statusPill(t.status)},
    {label:"Created", value:(t)=> fmtDate(t.createdAt)},
    {label:"",        value:(t)=> viewBtn(t)}
  ];

  let tableNode = table(filtered(), columns);

  function rerender(){
    renderSummary();
    const fresh = table(filtered(), columns);
    tableNode.replaceWith(fresh);
    tableNode = fresh;
  }

  function filtered(){
    let arr = tickets.slice();
    if (filters.status   !== "ALL") arr = arr.filter(t=> toStr(t.status)   === filters.status);
    if (filters.priority !== "ALL") arr = arr.filter(t=> toStr(t.priority) === filters.priority);
    if (filters.vessel   !== "ALL") arr = arr.filter(t=> toStr(t.vesselId) === filters.vessel);
    if (filters.search.trim()){
      const q = filters.search.trim().toLowerCase();
      arr = arr.filter(t =>
        toStr(t.id).toLowerCase().includes(q) ||
        toStr(t.title).toLowerCase().includes(q) ||
        toStr(t.priority).toLowerCase().includes(q) ||
        toStr(vesselNameById[toStr(t.vesselId)] || t.vesselId).toLowerCase().includes(q) ||
        toStr(t.status).toLowerCase().includes(q)
      );
    }
    return arr;
  }

  /* Cells / pills / buttons */
  function titleCell(t){
    const sub = h("div",{class:"text-[11px] text-slate-400 mt-0.5"},
      `${vesselNameById[toStr(t.vesselId)] || (t.vesselId!=null?`#${t.vesselId}`:"—")} • #${t.id}`
    );
    const btn = h("button",{
      class:"text-left text-cyan-300 hover:text-cyan-200 underline decoration-dotted",
      onClick:()=> openDetails(t)
    }, t.title || "(untitled)");
    return h("div",{},[btn, sub]);
  }
  function priorityPill(p){
    const s = toStr(p);
    const cls = s==="Low"    ? "bg-blue-900/50 text-blue-300"
             : s==="Medium" ? "bg-yellow-900/50 text-yellow-300"
             : s==="High"   ? "bg-red-900/50 text-red-300"
             : s==="Urgent" ? "bg-red-900/70 text-red-200"
             : "bg-slate-700/50 text-slate-200";
    return h("span",{class:`px-2 py-0.5 rounded text-xs ${cls}`}, s || "—");
  }
  function statusPill(s){
    const v = toStr(s);
    const cls = v==="Open"         ? "bg-blue-900/50 text-blue-300"
             : v==="In Progress"   ? "bg-yellow-900/50 text-yellow-300"
             : v==="Closed"        ? "bg-emerald-900/50 text-emerald-300"
             : "bg-slate-700/50 text-slate-200";
    return h("span",{class:`px-2 py-0.5 rounded text-xs ${cls}`}, v || "—");
  }
  function viewBtn(t){
    return h("button",{
      class:"px-2 py-1 bg-slate-800 rounded border border-slate-700 hover:bg-slate-700 text-xs",
      onClick:()=> openDetails(t)
    },"View");
  }

  /* Read-only details modal */
  function openDetails(t){
    const row = (label, value) => h("div",{},[
      h("div",{class:"text-sm text-slate-300 mb-1"}, label),
      h("div",{class:"text-sm"}, value)
    ]);

    const content = h("div",{class:"space-y-3"},[
      row("Title",        toStr(t.title) || "—"),
      row("Description",  toStr(t.description) || "—"),
      row("Assignee",     toStr(t.assignee) || "—"),
      row("Priority",     priorityPill(t.priority)),
      row("Status",       statusPill(t.status)),
      row("Vessel",       vesselNameById[toStr(t.vesselId)] || (t.vesselId!=null?`#${t.vesselId}`:"—")),
      row("Created",      fmtDate(t.createdAt)),
      row("Ticket ID",    `#${t.id}`)
    ]);

    const footer = h("div",{class:"mt-4 flex gap-2"},[
      h("button",{class:"px-3 py-2 rounded bg-slate-700 hover:bg-slate-600", onClick: destroyModal},"Close")
    ]);

    showModal(`Ticket #${t.id}`, h("div",{},[content, footer]));
  }

  function buildToolbar(){
    const vesselSel  = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const statusSel  = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const priorSel   = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const search     = h("input",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm w-64", placeholder:"Search…"});
    const newLink    = h("a",{href:"#/new-ticket", class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm"},"New Ticket");

    // options
    vesselSel.appendChild(h("option",{value:"ALL"},"All Vessels"));
    Array.from(new Set(tickets.map(t=> toStr(t.vesselId)).filter(Boolean))).forEach(id=>{
      const name = vesselNameById[id] || `#${id}`;
      vesselSel.appendChild(h("option",{value:id}, name));
    });

    statusSel.appendChild(h("option",{value:"ALL"},"All Statuses"));
    STATUSES.forEach(s=> statusSel.appendChild(h("option",{value:s}, s)));

    priorSel.appendChild(h("option",{value:"ALL"},"All Priorities"));
    PRIORITIES.forEach(p=> priorSel.appendChild(h("option",{value:p}, p)));

    // bind
    vesselSel.addEventListener("change", e=>{ filters.vessel  = e.target.value; rerender(); });
    statusSel.addEventListener("change", e=>{ filters.status  = e.target.value; rerender(); });
    priorSel .addEventListener("change", e=>{ filters.priority= e.target.value; rerender(); });
    search   .addEventListener("input",  e=>{ filters.search  = e.target.value; rerender(); });

    return h("div",{class:"mb-3 flex flex-col md:flex-row gap-2 md:items-center md:justify-between"},[
      h("div",{class:"flex flex-wrap gap-2"},[
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Vessel"), vesselSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Status"), statusSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Priority"), priorSel]),
      ]),
      h("div",{class:"flex items-center gap-2"},[
        search,
        newLink
      ])
    ]);
  }

  // Initial render
  renderSummary();
  const root = panel("IT Ticketing", h("div",{},[
    summary,
    toolbar,
    h("div",{class:"mb-3"}, h("a",{href:"#/new-ticket", class:"text-cyan-400 hover:underline"},"Create new ticket")),
    tableNode
  ]));

  return root;
}
