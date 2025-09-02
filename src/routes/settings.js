// routes/settings.js — Client-friendly Settings (no API edit)
import { h, panel } from "../main.js";

// ---- Defaults & persistence -----------------------------------------------
const DEFAULTS = {
  // Profile
  displayName: "",
  email: "",
  // Appearance
  theme: "dark",             // "dark" | "light"
  density: "comfortable",    // "compact" | "comfortable"
  language: "en",            // "en" | "fa"
  direction: "ltr",          // "ltr" | "rtl"
  // Units & Formats
  units: "metric",           // "metric" | "imperial"
  speedUnit: "knots",        // "knots" | "kmh" | "mph"
  volumeUnit: "liters",      // "liters" | "gallons"
  timezone: "auto",          // "auto" or IANA TZ string
  // Map
  mapDefaultType: "all",     // "all" | "cargo" | "tanker" | "support"
  mapAutoRefresh: true,
  mapCluster: true,
  // Notifications
  notifyBrowser: false,
  notifyEmail: false,        // UI only; requires backend in real deployments
  // Misc
  sounds: true
};

function getSettings(){
  try{
    const raw = localStorage.getItem("clientSettings");
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  }catch{
    return { ...DEFAULTS };
  }
}

function saveSettings(s){
  localStorage.setItem("clientSettings", JSON.stringify(s));
  // Also mirror a few widely-used flags for the rest of the app
  localStorage.setItem("theme", s.theme);
  localStorage.setItem("uiDir", s.direction);
  applyTheme(s.theme);
  applyDir(s.direction);
}

function resetSettings(){
  saveSettings({ ...DEFAULTS });
}

function applyTheme(theme){
  const root = document.documentElement;
  if (theme === "light") root.classList.add("light");
  else root.classList.remove("light");
}

function applyDir(dir){
  document.documentElement.setAttribute("dir", dir);
  if (dir === "rtl") document.body.classList.add("rtl");
  else document.body.classList.remove("rtl");
}

// ---- Small UI helpers ------------------------------------------------------
const field = (label, control) =>
  h("div", { class: "space-y-1" }, [
    h("div", { class: "text-sm text-slate-300" }, label),
    control
  ]);

const section = (title, body) =>
  h("div", { class: "rounded-xl border border-slate-800/60 bg-slate-900/40 p-4" }, [
    h("div", { class: "font-semibold mb-2" }, title),
    body
  ]);

const checkbox = (id, checked, label) => {
  const input = h("input", { id, type: "checkbox", class: "mr-2", checked: checked ? true : undefined });
  const wrap = h("label", { for: id, class: "text-sm text-slate-200 select-none" }, [input, " ", label]);
  return { root: h("div", { class: "flex items-center" }, wrap), input };
};

const select = (id, options, value) => {
  const sel = h("select", { id, class: "p-2 rounded bg-slate-800 border border-slate-700 w-full" },
    options.map(opt => h("option", { value: opt.value, selected: opt.value === value ? true : undefined }, opt.label))
  );
  return sel;
};

const input = (id, value, ph="") =>
  h("input", { id, value, placeholder: ph, class: "p-2 rounded bg-slate-800 border border-slate-700 w-full" });

const button = (txt, cls="", attrs={}) =>
  h("button", { class: `px-3 py-2 rounded ${cls}`, ...attrs }, txt);

// Simple toast
function toast(msg, kind="ok"){
  const clr = kind==="err" ? "bg-red-600" : "bg-emerald-600";
  const el = h("div",{class:`fixed bottom-4 right-4 ${clr} text-white px-3 py-2 rounded shadow-lg z-[60]`}, msg);
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1800);
}

// ---- Route renderer ---------------------------------------------------------
export async function routeSettings(){
  const s = getSettings();

  // Profile
  const nameInp  = input("displayName", s.displayName, "Your name");
  const emailInp = input("email", s.email, "name@example.com");

  const profileSec = section("Profile", h("div", { class: "grid gap-3 md:grid-cols-2" }, [
    field("Display name", nameInp),
    field("Email", emailInp),
    h("p", { class: "md:col-span-2 text-xs text-slate-400" }, "Used for default ticket reporter and notifications.")
  ]));

  // Appearance
  const themeSel = select("theme", [
    { value:"dark",  label:"Dark" },
    { value:"light", label:"Light" }
  ], s.theme);

  const densitySel = select("density", [
    { value:"compact",     label:"Compact" },
    { value:"comfortable", label:"Comfortable" }
  ], s.density);

  const langSel = select("language", [
    { value:"en", label:"English" },
    { value:"fa", label:"Farsi (فارسی)" }
  ], s.language);

  const dirSel = select("direction", [
    { value:"ltr", label:"Left-to-right" },
    { value:"rtl", label:"Right-to-left" }
  ], s.direction);

  const appearanceSec = section("Appearance", h("div",{class:"grid gap-3 md:grid-cols-2"},[
    field("Theme", themeSel),
    field("Density", densitySel),
    field("Language", langSel),
    field("Text direction", dirSel),
    h("p",{class:"md:col-span-2 text-xs text-slate-400"}, "Language and direction are applied immediately on save.")
  ]));

  // Units & Formats
  const unitsSel = select("units", [
    { value:"metric",   label:"Metric (km, °C, L)" },
    { value:"imperial", label:"Imperial (mi, °F, gal)" }
  ], s.units);

  const speedSel = select("speedUnit", [
    { value:"knots", label:"Knots (kt)" },
    { value:"kmh",   label:"km/h" },
    { value:"mph",   label:"mph" }
  ], s.speedUnit);

  const volSel = select("volumeUnit", [
    { value:"liters",  label:"Liters (L)" },
    { value:"gallons", label:"Gallons (gal)" }
  ], s.volumeUnit);

  const tzSel = select("timezone", [
    { value:"auto",               label:"Auto-detect" },
    { value:"UTC",                label:"UTC" },
    { value:"America/Toronto",    label:"America/Toronto" },
    { value:"Europe/London",      label:"Europe/London" },
    { value:"Asia/Tehran",        label:"Asia/Tehran" },
  ], s.timezone);

  const unitsSec = section("Units & Formats", h("div",{class:"grid gap-3 md:grid-cols-2"},[
    field("Measurement system", unitsSel),
    field("Speed", speedSel),
    field("Volume", volSel),
    field("Timezone", tzSel)
  ]));

  // Map preferences
  const typeSel = select("mapDefaultType", [
    { value:"all",     label:"All vessels" },
    { value:"cargo",   label:"Cargo only" },
    { value:"tanker",  label:"Tankers only" },
    { value:"support", label:"Support only" }
  ], s.mapDefaultType);

  const cbCluster = checkbox("mapCluster", s.mapCluster, "Enable marker clustering");
  const cbAuto    = checkbox("mapAutoRefresh", s.mapAutoRefresh, "Auto-refresh vessels every 10s");

  const mapsSec = section("Map", h("div",{class:"grid gap-3"},[
    field("Default vessel filter", typeSel),
    h("div",{class:"flex gap-6"}, [cbCluster.root, cbAuto.root]),
    h("p",{class:"text-xs text-slate-400"}, "These preferences affect the dashboard map and vessel views.")
  ]));

  // Notifications
  const cbBrowser = checkbox("notifyBrowser", s.notifyBrowser, "Browser notifications");
  const cbEmail   = checkbox("notifyEmail", s.notifyEmail, "Email digests");

  const testBtn = button("Send test notification", "bg-slate-800 border border-slate-700 text-slate-200", { type:"button" });
  testBtn.addEventListener("click", async ()=>{
    if (!("Notification" in window)){
      toast("Notifications not supported in this browser", "err");
      return;
    }
    let perm = Notification.permission;
    if (perm !== "granted"){
      perm = await Notification.requestPermission();
    }
    if (perm === "granted"){
      new Notification("MarineOps", { body:"This is a test notification.", icon:"" });
      toast("Test notification sent");
    } else {
      toast("Permission denied", "err");
    }
  });

  const notifySec = section("Notifications", h("div",{class:"grid gap-3"},[
    h("div",{class:"flex gap-6"},[cbBrowser.root, cbEmail.root]),
    h("div",{}, testBtn),
    h("p",{class:"text-xs text-slate-400"}, "Email notifications require server configuration and may be disabled.")
  ]));

  // Data & privacy
  const exportBtn = button("Export settings (JSON)", "bg-slate-800 border border-slate-700 text-slate-200", { type:"button" });
  exportBtn.addEventListener("click", ()=>{
    const now = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    const blob = new Blob([JSON.stringify(getSettings(), null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `marineops-settings-${now}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  const importInp = h("input",{ type:"file", accept:"application/json", class:"hidden", id:"importSettingsFile" });
  const importBtn = button("Import settings", "bg-slate-800 border border-slate-700 text-slate-200", { type:"button" });
  importBtn.addEventListener("click", ()=> importInp.click());
  importInp.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      const text = await f.text();
      const obj = JSON.parse(text);
      // shallow-validate
      const merged = { ...DEFAULTS, ...obj };
      saveSettings(merged);
      toast("Settings imported");
      setTimeout(()=> location.reload(), 300);
    }catch(err){
      console.error(err);
      toast("Invalid settings file", "err");
    }
  });

  const clearBtn = button("Reset to defaults", "bg-red-600 text-white", { type:"button" });
  clearBtn.addEventListener("click", ()=>{
    if (confirm("Reset all settings to defaults?")){
      resetSettings();
      toast("Settings reset");
      setTimeout(()=> location.reload(), 300);
    }
  });

  const dataSec = section("Data & Privacy", h("div",{class:"grid gap-3 md:grid-cols-2 items-center"},[
    h("div",{class:"md:col-span-2 flex gap-2 items-center"}, [exportBtn, importBtn, importInp]),
    h("div",{class:"md:col-span-2"}, clearBtn)
  ]));

  // Actions
  const saveBtn = button("Save changes", "bg-blue-600 text-white", { type:"button" });
  saveBtn.addEventListener("click", ()=>{
    const next = {
      ...s,
      displayName: nameInp.value.trim(),
      email: emailInp.value.trim(),
      theme: themeSel.value,
      density: densitySel.value,
      language: langSel.value,
      direction: dirSel.value,
      units: unitsSel.value,
      speedUnit: speedSel.value,
      volumeUnit: volSel.value,
      timezone: tzSel.value,
      mapDefaultType: typeSel.value,
      mapAutoRefresh: cbAuto.input.checked,
      mapCluster: cbCluster.input.checked,
      notifyBrowser: cbBrowser.input.checked,
      notifyEmail: cbEmail.input.checked
    };
    saveSettings(next);
    toast("Saved");
  });

  const actions = h("div",{class:"flex gap-2"},[ saveBtn ]);

  // Assemble
  const content = h("div", { class: "max-w-4xl space-y-5" }, [
    profileSec,
    appearanceSec,
    unitsSec,
    mapsSec,
    notifySec,
    dataSec,
    actions
  ]);

  // Apply current theme/dir on first render
  applyTheme(s.theme);
  applyDir(s.direction);

  return panel("Settings", content);
}
