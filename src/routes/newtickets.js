// src/routes/newtickets.js
import { h, jget, jpost, panel } from "../main.js";

export async function routeNewTicket() {
  const vessels = await jget("/vessels").catch(() => []);

  // --- helpers ---
  const cc = (n) => n == null ? "" : String(n).trim();

  const fieldWrap = (label, control, help = "") =>
    h("div", { class: "space-y-1" }, [
      h("label", { class: "block text-sm text-slate-300" }, label),
      control,
      help ? h("div", { class: "text-xs text-slate-500" }, help) : null,
    ]);

  const input = (id, ph, attrs = {}) =>
    h("input", {
      id,
      placeholder: ph,
      class:
        "w-full p-2 rounded bg-slate-800/70 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
      ...attrs,
    });

  const select = (id, opts, attrs = {}) =>
    h(
      "select",
      {
        id,
        class:
          "w-full p-2 rounded bg-slate-800/70 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
        ...attrs,
      },
      [h("option", { value: "" }, "Select ..."), ...opts.map((o) => h("option", { value: o }, o))]
    );

  const textarea = (id, ph, attrs = {}) =>
    h("textarea", {
      id,
      placeholder: ph,
      rows: 5,
      class:
        "w-full p-2 rounded bg-slate-800/70 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
      ...attrs,
    });

  const vesselSelect = (vessels) =>
    h(
      "select",
      {
        id: "vesselId",
        class:
          "w-full p-2 rounded bg-slate-800/70 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
        required: true,
      },
      [
        h("option", { value: "" }, "Assign to vessel"),
        ...vessels.map((v) => h("option", { value: v.id }, v.name || `Vessel #${v.id}`)),
      ]
    );

  // --- controls ---
  const title = input("title", "Short title", { required: true, maxlength: 120 });
  const desc = textarea("description", "Describe the issue… (steps to reproduce, expected vs actual)", {
    maxlength: 2000,
  });
  const descCounter = h("div", { class: "text-xs text-slate-500 text-right" }, "0 / 2000");

  desc.addEventListener("input", () => {
    descCounter.textContent = `${desc.value.length} / 2000`;
  });

  const priority = select("priority", ["Low", "Medium", "High", "Urgent"], { required: true });
  const status = select("status", ["Open", "In Progress", "Blocked", "Closed"], { required: true });

  const category = select("category", ["Hardware", "Software", "Network", "Sensor", "Operations", "Other"]);
  const subcategory = input("subcategory", "e.g., Engine room, ECDIS, Radar…");

  const assignee = input("assignee", "Assignee (name or email)");
  const due = input("dueDate", "Due date", { type: "datetime-local" });

  const tags = input("tags", "Tags (comma separated, e.g., sensor, fuel, bridge)");
  const watchers = input("watchers", "Watchers emails (comma separated)");

  // Attachments
  const fileInput = input("files", "", { type: "file", multiple: true, accept: "" });
  const fileList = h("div", { class: "space-y-2" });
  const pickedFiles = [];
  fileInput.addEventListener("change", () => {
    // Reset list and rebuild
    fileList.innerHTML = "";
    pickedFiles.length = 0;
    Array.from(fileInput.files || []).forEach((f, idx) => {
      pickedFiles.push(f);
      const row = h("div", {
        class:
          "flex items-center justify-between px-2 py-1 rounded border border-slate-700 bg-slate-900/40 text-sm",
      }, [
        h("div", { class: "truncate mr-2" }, `${f.name} • ${(f.size / 1024).toFixed(1)} KB`),
        h(
          "button",
          {
            type: "button",
            class:
              "px-2 py-0.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700",
            onClick: () => {
              pickedFiles.splice(idx, 1);
              row.remove();
            },
          },
          "Remove"
        ),
      ]);
      // tiny image preview
      if (f.type.startsWith("image/")) {
        const url = URL.createObjectURL(f);
        row.insertBefore(
          h("img", { src: url, class: "w-8 h-8 object-cover rounded mr-2" }),
          row.firstChild
        );
      }
      fileList.appendChild(row);
    });
  });

  // Quick toggles
  const urgentToggle = h("input", { id: "urgent", type: "checkbox", class: "mr-2" });
  urgentToggle.addEventListener("change", () => {
    if (urgentToggle.checked) priority.value = "Urgent";
  });

  const form = h(
    "form",
    { class: "grid gap-5 max-w-3xl" },
    [
      // row 1
      h("div", { class: "grid md:grid-cols-2 gap-4" }, [
        fieldWrap("Title *", title, "Keep it concise (max 120 characters)"),
        fieldWrap("Vessel *", vesselSelect(vessels)),
      ]),

      // row 2
      h("div", { class: "grid md:grid-cols-3 gap-4" }, [
        fieldWrap("Priority *", priority),
        fieldWrap("Status *", status),
        h("div", { class: "flex items-end" }, [
          h("label", { class: "text-sm text-slate-300 flex items-center gap-2" }, [
            urgentToggle,
            h("span", {}, "Mark as urgent"),
          ]),
        ]),
      ]),

      // row 3
      fieldWrap(
        "Description",
        h("div", {}, [desc, descCounter]),
        "Add details, logs, or steps to reproduce."
      ),

      // row 4
      h("div", { class: "grid md:grid-cols-2 gap-4" }, [
        fieldWrap("Category", category),
        fieldWrap("Subcategory", subcategory),
      ]),

      // row 5
      h("div", { class: "grid md:grid-cols-3 gap-4" }, [
        fieldWrap("Assignee", assignee),
        fieldWrap("Due Date", due),
        fieldWrap("Tags", tags),
      ]),

      // row 6 attachments + watchers
      h("div", { class: "grid md:grid-cols-2 gap-4" }, [
        fieldWrap("Attachments", h("div", { class: "space-y-2" }, [fileInput, fileList]), "Images, PDFs, logs…"),
        fieldWrap("Watchers", watchers, "Emails to notify (comma separated)"),
      ]),

      // actions
      h("div", { class: "flex items-center gap-2" }, [
        h(
          "button",
          {
            type: "submit",
            class:
              "px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50",
          },
          "Create Ticket"
        ),
        h(
          "a",
          {
            href: "#/tickets",
            class:
              "px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700",
          },
          "Cancel"
        ),
      ]),
    ]
  );

  const msgOk = h(
    "div",
    { class: "text-green-400 mt-2 hidden" },
    "Ticket created!"
  );
  const msgErr = h(
    "div",
    { class: "text-red-400 mt-2 hidden" },
    "Could not create ticket."
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // basic validation
    if (!cc(title.value)) return title.focus();
    if (!form.querySelector("#vesselId").value) return form.querySelector("#vesselId").focus();
    if (!priority.value) return priority.focus();
    if (!status.value) return status.focus();

    // build payload
    const vesselId = parseInt(form.querySelector("#vesselId").value, 10);
    const createdAt = new Date().toISOString();

    const tagArr = cc(tags.value)
      ? cc(tags.value)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const watcherArr = cc(watchers.value)
      ? cc(watchers.value)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // only metadata for files (json-server can't store binaries)
    const attachments = pickedFiles.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));

    const body = {
      title: cc(title.value),
      description: cc(desc.value),
      priority: priority.value,
      status: status.value,
      vesselId,
      category: cc(category.value),
      subcategory: cc(subcategory.value),
      assignee: cc(assignee.value),
      dueDate: cc(due.value) ? new Date(due.value).toISOString() : null,
      tags: tagArr,
      watchers: watcherArr,
      attachments,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      msgOk.classList.add("hidden");
      msgErr.classList.add("hidden");
      const res = await jpost("/tickets", body);
      // reset/feedback
      form.reset();
      descCounter.textContent = "0 / 2000";
      pickedFiles.length = 0;
      fileList.innerHTML = "";
      msgOk.classList.remove("hidden");
      // slight pause then go to tickets
      setTimeout(() => (location.hash = "#/tickets"), 700);
    } catch (e) {
      console.error(e);
      msgErr.classList.remove("hidden");
    }
  });

  return panel(
    "New Ticket",
    h("div", {}, [form, msgOk, msgErr])
  );
}
