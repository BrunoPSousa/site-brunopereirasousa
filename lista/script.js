import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBX2_w_7Xj5hsZ_EwSgDwsBmgsQFsLrRA0",
  authDomain: "brunopereirasousa-lista.firebaseapp.com",
  projectId: "brunopereirasousa-lista",
  storageBucket: "brunopereirasousa-lista.firebasestorage.app",
  messagingSenderId: "1039062641862",
  appId: "1:1039062641862:web:1ccaa4af5352a366e9bbc7"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const tasksCol    = collection(db, "tasks");

// ── DOM refs ──

const root       = document.documentElement;
const form       = document.getElementById("add-form");
const input      = document.getElementById("add-input");
const tagInput   = document.getElementById("tag-input");
const tagRow     = document.getElementById("tag-row");
const pendingChips = document.getElementById("pending-chips");
const taskList   = document.getElementById("task-list");
const filtersEl  = document.getElementById("filters");
const hojePanel  = document.getElementById("hoje-panel");
const hojeList   = document.getElementById("hoje-list");
const amanhaPanel = document.getElementById("amanha-panel");
const amanhaList  = document.getElementById("amanha-list");

// ── State ──

let tasks         = [];
let currentFilter = "all";
let pendingTags   = [];
let editingId     = null;
let editingTags   = [];

// ── Date helpers ──

const PT_MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayStr()    { return dateToStr(new Date()); }
function getTomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return dateToStr(d); }

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${PT_MONTHS[d.getMonth()]}`;
}

// ── Panel membership helpers ──

function isInHoje(task) {
  if (task.todayFlag) return true;
  // legacy: tomorrowDate set and now in the past or today
  if (task.tomorrowDate && task.tomorrowDate <= getTodayStr()) return true;
  // legacy tomorrow boolean from old data model — treat as amanhã (not hoje)
  // date-scheduled: if date is today or past → hoje
  if (task.date && task.date <= getTodayStr()) return true;
  return false;
}

function isInAmanha(task) {
  if (isInHoje(task)) return false; // hoje takes priority
  // legacy tomorrow boolean
  if (task.tomorrow && !task.tomorrowDate) return true;
  // manual amanhã: tomorrowDate is in the future
  if (task.tomorrowDate && task.tomorrowDate > getTodayStr()) return true;
  // date-scheduled: if date is exactly tomorrow
  if (task.date && task.date === getTomorrowStr()) return true;
  return false;
}

// ── Tag helpers ──

const TAG_HUE_OVERRIDES = {
  "Porto/Post/Doc": 285,
};

const TAG_PALETTE = [15, 45, 80, 120, 158, 185, 208, 235, 260, 285, 318, 348];

// Build a collision-free hue map for all current tags.
// Each tag starts at its hash-based palette index; if that hue is taken, moves to the next.
let _colorMap = null;
let _colorMapKey = null;

function buildColorMap() {
  const allTags = getAllTags();
  const key = allTags.join("|");
  if (key === _colorMapKey) return _colorMap;

  const map = {};
  const usedHues = new Set();

  // Reserve override hues first
  for (const [tag, hue] of Object.entries(TAG_HUE_OVERRIDES)) {
    if (allTags.includes(tag)) { map[tag] = hue; usedHues.add(hue); }
  }

  // Assign remaining tags
  for (const tag of allTags) {
    if (map[tag] !== undefined) continue;
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
    let idx = h % TAG_PALETTE.length;
    let tries = 0;
    while (usedHues.has(TAG_PALETTE[idx]) && tries < TAG_PALETTE.length) {
      idx = (idx + 1) % TAG_PALETTE.length;
      tries++;
    }
    map[tag] = TAG_PALETTE[idx];
    usedHues.add(TAG_PALETTE[idx]);
  }

  _colorMap = map;
  _colorMapKey = key;
  return map;
}

function tagHue(name) {
  return buildColorMap()[name] ?? 200;
}

function getAllTags() {
  const set = new Set();
  tasks.forEach(t => (t.tags ?? []).forEach(tag => set.add(tag)));
  return [...set].sort();
}

function normalizeTag(raw) {
  return raw.trim().replace(/[,#]+/g, "");
}

function resolveTag(raw) {
  const cleaned = normalizeTag(raw);
  if (!cleaned) return null;
  const match = getAllTags().find(t => t.toLowerCase() === cleaned.toLowerCase());
  return match ?? cleaned;
}

function tagsConflict(tag, arr) {
  return arr.some(t => t.toLowerCase() === tag.toLowerCase());
}

// ── Autocomplete ──

function attachAutocomplete(input, tagRowEl, onSelect) {
  const dropdown = document.createElement("div");
  dropdown.className = "tag-suggestions";
  dropdown.hidden = true;
  tagRowEl.appendChild(dropdown);

  let suggestions = [];
  let activeIndex = -1;

  function update() {
    const val = input.value.trim();
    if (!val) { hide(); return; }
    suggestions = getAllTags().filter(t =>
      t.toLowerCase().startsWith(val.toLowerCase()) &&
      t.toLowerCase() !== val.toLowerCase()
    );
    if (suggestions.length === 0) { hide(); return; }
    activeIndex = -1;
    dropdown.hidden = false;
    dropdown.innerHTML = "";
    suggestions.forEach(tag => {
      const item = document.createElement("div");
      item.className = "tag-suggestion-item";
      const bold = document.createElement("strong");
      bold.textContent = tag.slice(0, input.value.length);
      item.append(bold, document.createTextNode(tag.slice(input.value.length)));
      item.addEventListener("mousedown", e => {
        e.preventDefault();
        onSelect(tag);
        input.value = "";
        hide();
      });
      dropdown.appendChild(item);
    });
  }

  function hide() { dropdown.hidden = true; activeIndex = -1; suggestions = []; }

  function navigate(dir) {
    if (dropdown.hidden) return false;
    const items = dropdown.querySelectorAll(".tag-suggestion-item");
    activeIndex = Math.max(-1, Math.min(activeIndex + dir, items.length - 1));
    items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
    return true;
  }

  function getActive() { return activeIndex >= 0 ? suggestions[activeIndex] : null; }
  function isOpen() { return !dropdown.hidden; }

  input.addEventListener("input", update);
  input.addEventListener("blur", () => setTimeout(hide, 150));

  return { getActive, isOpen, navigate, hide };
}

// ── Pending tag chips (add form) ──

function renderPendingChips() {
  pendingChips.innerHTML = "";
  pendingTags.forEach((tag, i) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.style.setProperty("--tag-hue", tagHue(tag));
    const label = document.createElement("span");
    label.textContent = tag;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "tag-chip-remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => { pendingTags.splice(i, 1); renderPendingChips(); });
    chip.append(label, rm);
    pendingChips.appendChild(chip);
  });
}

function addPendingTag(raw) {
  const tag = resolveTag(raw);
  if (tag && !tagsConflict(tag, pendingTags)) { pendingTags.push(tag); renderPendingChips(); }
}

tagRow.addEventListener("click", () => tagInput.focus());

const addFormAC = attachAutocomplete(tagInput, tagRow, tag => addPendingTag(tag));

tagInput.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); addFormAC.navigate(1); return; }
  if (e.key === "ArrowUp")   { e.preventDefault(); addFormAC.navigate(-1); return; }
  if (e.key === "Escape" && addFormAC.isOpen()) { e.preventDefault(); addFormAC.hide(); return; }
  if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
    if (!tagInput.value.trim()) return;
    e.preventDefault();
    const tag = addFormAC.getActive() ?? resolveTag(tagInput.value);
    if (tag && !tagsConflict(tag, pendingTags)) { pendingTags.push(tag); renderPendingChips(); }
    tagInput.value = "";
    addFormAC.hide();
  }
  if (e.key === "Backspace" && tagInput.value === "" && pendingTags.length > 0) {
    pendingTags.pop();
    renderPendingChips();
  }
});

tagInput.addEventListener("blur", () => {
  if (tagInput.value.trim()) { addPendingTag(tagInput.value); tagInput.value = ""; }
});

// ── Generic tag-row builder (edit mode) ──

function buildTagRow(tagsArr, onChipsChange) {
  const row = document.createElement("div");
  row.className = "tag-row";

  const icon = document.createElement("span");
  icon.className = "tag-row-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "#";

  const chips = document.createElement("div");
  chips.className = "pending-chips";

  const ti = document.createElement("input");
  ti.type = "text";
  ti.className = "tag-input";
  ti.placeholder = "etiqueta…";
  ti.autocomplete = "off";
  ti.maxLength = 30;

  row.append(icon, chips, ti);
  row.addEventListener("click", () => ti.focus());

  function renderChips() {
    chips.innerHTML = "";
    tagsArr.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.style.setProperty("--tag-hue", tagHue(tag));
      const label = document.createElement("span");
      label.textContent = tag;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "tag-chip-remove";
      rm.textContent = "×";
      rm.addEventListener("click", () => { tagsArr.splice(i, 1); renderChips(); onChipsChange?.(); });
      chip.append(label, rm);
      chips.appendChild(chip);
    });
  }

  function addTag(raw) {
    const tag = resolveTag(raw);
    if (tag && !tagsConflict(tag, tagsArr)) { tagsArr.push(tag); renderChips(); onChipsChange?.(); }
  }

  const ac = attachAutocomplete(ti, row, tag => addTag(tag));

  ti.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); ac.navigate(1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); ac.navigate(-1); return; }
    if (e.key === "Escape" && ac.isOpen()) { e.preventDefault(); ac.hide(); return; }
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      if (!ti.value.trim()) return;
      e.preventDefault();
      const tag = ac.getActive() ?? resolveTag(ti.value);
      if (tag && !tagsConflict(tag, tagsArr)) { tagsArr.push(tag); renderChips(); onChipsChange?.(); }
      ti.value = "";
      ac.hide();
    }
    if (e.key === "Backspace" && ti.value === "" && tagsArr.length > 0) {
      tagsArr.pop(); renderChips(); onChipsChange?.();
    }
  });

  ti.addEventListener("blur", () => {
    if (ti.value.trim()) { addTag(ti.value); ti.value = ""; }
  });

  renderChips();
  return { row, focusInput: () => ti.focus() };
}

// ── Firestore CRUD ──

function addTask(text, tags) {
  addDoc(tasksCol, { text, tags, done: false, todayFlag: false, tomorrowDate: null, date: null, createdAt: Date.now() });
}

function setTaskDate(id, dateStr) {
  updateDoc(doc(db, "tasks", id), { date: dateStr ?? null });
}

function toggleToday(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  if (t.todayFlag) {
    updateDoc(doc(db, "tasks", id), { todayFlag: false });
  } else {
    updateDoc(doc(db, "tasks", id), { todayFlag: true, tomorrowDate: null, tomorrow: false });
  }
}

function toggleTomorrow(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  const inAmanha = isInAmanha(t);
  if (inAmanha) {
    updateDoc(doc(db, "tasks", id), { tomorrowDate: null, tomorrow: false });
  } else {
    updateDoc(doc(db, "tasks", id), { tomorrowDate: getTomorrowStr(), todayFlag: false, tomorrow: false });
  }
}

function deleteTask(id) {
  if (editingId === id) { editingId = null; editingTags = []; }
  deleteDoc(doc(db, "tasks", id));
}

function startEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId   = id;
  editingTags = [...(task.tags ?? [])];
  render();
}

function saveEdit(id, newText) {
  if (!newText.trim()) return;
  const updates = { text: newText.trim(), tags: [...editingTags] };
  editingId = null; editingTags = [];
  updateDoc(doc(db, "tasks", id), updates);
}

function cancelEdit() { editingId = null; editingTags = []; render(); }

// ── Filters ──

function setFilter(value) { currentFilter = value; renderFilters(); render(); }

function renderFilters() {
  filtersEl.innerHTML = "";
  const allTags = getAllTags();
  if (allTags.length === 0) return;

  const tagGroup = document.createElement("div");
  tagGroup.className = "filter-group";
  allTags.forEach(tag => {
    const value = `tag:${tag}`;
    const btn = document.createElement("button");
    btn.className = "filter-btn filter-tag" + (currentFilter === value ? " active" : "");
    btn.style.setProperty("--tag-hue", tagHue(tag));
    btn.textContent = tag;
    btn.addEventListener("click", () => setFilter(currentFilter === value ? "all" : value));
    tagGroup.appendChild(btn);
  });
  filtersEl.appendChild(tagGroup);

  if (currentFilter.startsWith("tag:") && !allTags.includes(currentFilter.slice(4))) {
    currentFilter = "all"; renderFilters();
  }
}

// ── Panel renderers ──

function buildPanelItem(task) {
  const li = document.createElement("li");
  li.className = "panel-item";

  const body = document.createElement("div");
  body.className = "panel-item-body";

  const text = document.createElement("span");
  text.className = "panel-item-text";
  text.textContent = task.text;
  body.appendChild(text);

  if ((task.tags ?? []).length > 0) {
    const tagsEl = document.createElement("div");
    tagsEl.className = "panel-item-tags";
    task.tags.forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.style.setProperty("--tag-hue", tagHue(tag));
      chip.textContent = tag;
      tagsEl.appendChild(chip);
    });
    body.appendChild(tagsEl);
  }

  const del = document.createElement("button");
  del.className = "panel-delete-btn";
  del.textContent = "×";
  del.setAttribute("aria-label", `Apagar "${task.text}"`);
  del.addEventListener("click", () => deleteTask(task.id));

  li.append(body, del);
  return li;
}

function renderHoje() {
  const hojeTasks = tasks.filter(isInHoje);
  hojePanel.hidden = hojeTasks.length === 0;
  hojeList.innerHTML = "";
  hojeTasks.forEach(task => hojeList.appendChild(buildPanelItem(task)));
}

function renderAmanha() {
  const amanhaTasks = tasks.filter(isInAmanha);
  amanhaPanel.hidden = amanhaTasks.length === 0;
  amanhaList.innerHTML = "";
  amanhaTasks.forEach(task => amanhaList.appendChild(buildPanelItem(task)));
}

// ── Render tasks ──

function visibleTasks() {
  if (currentFilter.startsWith("tag:")) {
    const tag = currentFilter.slice(4);
    return tasks.filter(t => (t.tags ?? []).includes(tag));
  }
  return tasks;
}

function render() {
  const visible = visibleTasks();
  taskList.innerHTML = "";

  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = currentFilter.startsWith("tag:")
      ? `Nenhuma tarefa com a etiqueta "${currentFilter.slice(4)}".`
      : "Adiciona a tua primeira tarefa acima.";
    taskList.appendChild(empty);
    return;
  }

  visible.forEach(task => {
    const li = document.createElement("li");

    if (task.id === editingId) {
      li.className = "task-item editing";
      const editBody = document.createElement("div");
      editBody.className = "edit-body";
      const editInput = document.createElement("input");
      editInput.type = "text";
      editInput.className = "edit-text-input";
      editInput.value = task.text;
      editInput.autocomplete = "off";
      editInput.maxLength = 200;
      const { row: editTagRow } = buildTagRow(editingTags);
      const actions = document.createElement("div");
      actions.className = "edit-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "edit-save-btn";
      saveBtn.textContent = "Guardar";
      saveBtn.addEventListener("click", () => saveEdit(task.id, editInput.value));
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "edit-cancel-btn";
      cancelBtn.textContent = "Cancelar";
      cancelBtn.addEventListener("click", cancelEdit);
      actions.append(saveBtn, cancelBtn);
      editBody.append(editInput, editTagRow, actions);
      li.appendChild(editBody);
      editInput.addEventListener("keydown", e => {
        if (e.key === "Enter")  { e.preventDefault(); saveEdit(task.id, editInput.value); }
        if (e.key === "Escape") cancelEdit();
      });
      requestAnimationFrame(() => { editInput.focus(); editInput.select(); });

    } else {
      li.className = "task-item";

      const body = document.createElement("div");
      body.className = "task-body";
      const span = document.createElement("span");
      span.className = "task-text";
      span.textContent = task.text;
      body.appendChild(span);

      if ((task.tags ?? []).length > 0) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "task-tags";
        task.tags.forEach(tag => {
          const chip = document.createElement("span");
          chip.className = "tag-chip";
          chip.style.setProperty("--tag-hue", tagHue(tag));
          chip.textContent = tag;
          tagsEl.appendChild(chip);
        });
        body.appendChild(tagsEl);
      }

      // Date area
      const dateArea = document.createElement("div");
      dateArea.className = "date-area" + (task.date ? " date-chip-wrap" : "");

      function showInlineInput(initialValue) {
        dateArea.innerHTML = "";
        dateArea.className = "date-area";
        const inp = document.createElement("input");
        inp.type = "date";
        inp.className = "date-input-inline";
        if (initialValue) inp.value = initialValue;
        let saved = false;
        inp.addEventListener("change", () => {
          saved = true;
          setTaskDate(task.id, inp.value || null);
        });
        inp.addEventListener("blur", () => {
          inp.style.opacity = "0";
          setTimeout(() => { if (!saved) render(); }, 250);
        });
        dateArea.appendChild(inp);
        requestAnimationFrame(() => {
          inp.focus();
          try { inp.showPicker(); } catch(e) {}
        });
      }

      if (task.date) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "date-chip";
        chip.textContent = formatDate(task.date);
        chip.addEventListener("click", () => showInlineInput(task.date));

        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "date-chip-remove";
        rm.textContent = "×";
        rm.setAttribute("aria-label", "Remover data");
        rm.addEventListener("click", e => { e.stopPropagation(); setTaskDate(task.id, null); });

        dateArea.append(chip, rm);
      } else {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "date-btn";
        addBtn.textContent = "agendar";
        addBtn.setAttribute("aria-label", "Adicionar data");
        addBtn.addEventListener("click", () => showInlineInput(null));
        dateArea.append(addBtn);
      }

      // Hoje button
      const hojeBtn = document.createElement("button");
      hojeBtn.className = "hoje-btn" + (isInHoje(task) ? " active" : "");
      hojeBtn.textContent = "hoje";
      hojeBtn.setAttribute("aria-label", `Marcar "${task.text}" para hoje`);
      hojeBtn.addEventListener("click", () => toggleToday(task.id));

      // Amanhã button
      const amanhaBtn = document.createElement("button");
      amanhaBtn.className = "amanha-btn" + (isInAmanha(task) ? " active" : "");
      amanhaBtn.textContent = "amanhã";
      amanhaBtn.setAttribute("aria-label", `Marcar "${task.text}" para amanhã`);
      amanhaBtn.addEventListener("click", () => toggleTomorrow(task.id));

      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", () => startEdit(task.id));

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.textContent = "×";
      del.addEventListener("click", () => deleteTask(task.id));

      li.append(body, dateArea, hojeBtn, amanhaBtn, editBtn, del);
    }

    taskList.appendChild(li);
  });
}

// ── Add form ──

form.addEventListener("submit", e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (tagInput.value.trim()) {
    const tag = addFormAC.getActive() ?? resolveTag(tagInput.value);
    if (tag && !tagsConflict(tag, pendingTags)) pendingTags.push(tag);
    tagInput.value = "";
    addFormAC.hide();
  }
  const tagsToAdd = [...pendingTags];
  input.value = "";
  pendingTags = [];
  renderPendingChips();
  input.focus();
  addTask(text, tagsToAdd);
});

// ── Background blobs ──

function cycleBlobs() {
  const t = performance.now() * 0.000003;
  root.style.setProperty("--blob-a", `hsl(${(220 + Math.sin(t) * 40).toFixed(1)} 70% 28%)`);
  root.style.setProperty("--blob-b", `hsl(${(280 + Math.cos(t * 0.7) * 50).toFixed(1)} 65% 22%)`);
  root.style.setProperty("--blob-c", `hsl(${(190 + Math.sin(t * 0.5 + 1) * 45).toFixed(1)} 60% 20%)`);
  root.style.setProperty("--accent",   `hsl(${(206 + Math.sin(t * 0.9) * 30).toFixed(1)} 92% 79%)`);
  root.style.setProperty("--accent-2", `hsl(${(234 + Math.cos(t * 0.6) * 25).toFixed(1)} 84% 76%)`);
  requestAnimationFrame(cycleBlobs);
}

cycleBlobs();

// ── Migration from localStorage ──

async function migrateFromLocalStorage() {
  if (localStorage.getItem("bps-migrated")) return;
  localStorage.setItem("bps-migrated", "1");
  const stored = localStorage.getItem("bps-lista-tasks");
  if (!stored) return;
  let localTasks;
  try { localTasks = JSON.parse(stored); } catch { return; }
  if (!localTasks?.length || tasks.length > 0) return;

  const batch = writeBatch(db);
  const now = Date.now();
  [...localTasks].reverse().forEach((task, i) => {
    const ref = doc(tasksCol);
    batch.set(ref, {
      text:        task.text      ?? "",
      tags:        task.tags      ?? [],
      done:        task.done      ?? false,
      todayFlag:   false,
      tomorrowDate: task.tomorrow ? getTomorrowStr() : null,
      tomorrow:    false,
      date:        task.date      ?? null,
      createdAt:   now - (localTasks.length - i) * 1000
    });
  });
  await batch.commit();
}

// ── Auto-refresh when date changes ──

let _lastKnownDate = getTodayStr();

function checkDateChange() {
  const today = getTodayStr();
  if (today !== _lastKnownDate) {
    _lastKnownDate = today;
    render();
    renderHoje();
    renderAmanha();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkDateChange();
});

setInterval(checkDateChange, 60_000);

// ── Firestore listener ──

let initialized = false;
const q = query(tasksCol, orderBy("createdAt", "desc"));
onSnapshot(q, snapshot => {
  tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!initialized) {
    initialized = true;
    migrateFromLocalStorage();
  }
  renderFilters();
  render();
  renderHoje();
  renderAmanha();
});
