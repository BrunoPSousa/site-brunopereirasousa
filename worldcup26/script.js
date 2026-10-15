import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteField, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBX2_w_7Xj5hsZ_EwSgDwsBmgsQFsLrRA0",
  authDomain: "brunopereirasousa-lista.firebaseapp.com",
  projectId: "brunopereirasousa-lista",
  storageBucket: "brunopereirasousa-lista.firebasestorage.app",
  messagingSenderId: "1039062641862",
  appId: "1:1039062641862:web:1ccaa4af5352a366e9bbc7"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const PLAYERS   = ["rui", "bruno", "fil"];
const CACHE_KEY = "wc26_matches";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const TEAM_PT = {
  "Algeria": "Argélia",
  "Argentina": "Argentina",
  "Australia": "Austrália",
  "Austria": "Áustria",
  "Belgium": "Bélgica",
  "Bosnia-Herzegovina": "Bósnia-Herz.",
  "Brazil": "Brasil",
  "Canada": "Canadá",
  "Cape Verde Islands": "Cabo Verde",
  "Colombia": "Colômbia",
  "Congo DR": "RD Congo",
  "Croatia": "Croácia",
  "Curaçao": "Curaçau",
  "Czechia": "Rep. Checa",
  "Ecuador": "Equador",
  "Egypt": "Egito",
  "England": "Inglaterra",
  "France": "França",
  "Germany": "Alemanha",
  "Ghana": "Gana",
  "Haiti": "Haiti",
  "Iran": "Irão",
  "Iraq": "Iraque",
  "Ivory Coast": "Costa do Marfim",
  "Japan": "Japão",
  "Jordan": "Jordânia",
  "Mexico": "México",
  "Morocco": "Marrocos",
  "Netherlands": "Países Baixos",
  "New Zealand": "Nova Zelândia",
  "Norway": "Noruega",
  "Panama": "Panamá",
  "Paraguay": "Paraguai",
  "Portugal": "Portugal",
  "Qatar": "Qatar",
  "Saudi Arabia": "Arábia Saudita",
  "Scotland": "Escócia",
  "Senegal": "Senegal",
  "South Africa": "África do Sul",
  "South Korea": "Coreia do Sul",
  "Spain": "Espanha",
  "Sweden": "Suécia",
  "Switzerland": "Suíça",
  "Tunisia": "Tunísia",
  "Turkey": "Turquia",
  "United States": "EUA",
  "Uruguay": "Uruguai",
  "Uzbekistan": "Uzbequistão",
};

const PHASE_LABEL = {
  GROUP_STAGE:    "Fase de Grupos",
  LAST_32:        "Ronda de 32",
  LAST_16:        "Oitavos de Final",
  QUARTER_FINALS: "Quartos de Final",
  SEMI_FINALS:    "Meias-Finais",
  THIRD_PLACE:    "3.º / 4.º Lugar",
  FINAL:          "Final",
};

const PHASE_ORDER = ["GROUP_STAGE","LAST_32","LAST_16","QUARTER_FINALS","SEMI_FINALS","THIRD_PLACE","FINAL"];

let allMatches   = [];
let predictions  = {};
let activePlayer = null; // começa sempre sem editar — exige palavra-passe para entrar
let activePhase  = "GROUP_J1";
let activeView   = "apostas";
let isSaving     = false;

// ── helpers ──────────────────────────────────────────────────────────────────

function teamName(name) { return TEAM_PT[name] || name || "?"; }

function formatDate(utcDate) {
  const d = new Date(utcDate);
  return d.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit"
  }).replace(",", " ·");
}

// Período de carência inicial: até esta data/hora, os jogos a partir de 12/06 ficam abertos
// (excepto jogos já a decorrer/terminados), para dar tempo a todos de apostarem.
// Depois desta data, aplica-se a regra normal (fecho à meia-noite do dia do jogo).
const GRACE_UNTIL = new Date("2026-06-11T23:59:00+01:00"); // 11/06/2026, 23h59 (hora de Lisboa)
// Jogos do dia de arranque (11/06/2026) têm prazo próprio: fecham às 19h00 de Lisboa.
const DAY1_CUTOFF = new Date("2026-06-11T19:00:00+01:00");
// Exceção pontual: os jogos deste(s) dia(s) ficam abertos durante todo o dia
// (não se aplica o fecho à meia-noite). Apagar quando deixar de ser preciso.
const OPEN_ALL_DAY = [];

function isPredictionOpen(utcDate, status) {
  if (status === "FINISHED" || status === "IN_PLAY" || status === "PAUSED") return false;
  const matchDay = new Date(utcDate).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
  // Jogos de 11/06/2026: válidos até às 18h59, bloqueados às 19h00
  if (matchDay === "11/06/2026") return Date.now() < DAY1_CUTOFF.getTime();
  // Exceção: jogos abertos todo o dia (sem fecho à meia-noite)
  if (OPEN_ALL_DAY.includes(matchDay)) return true;
  // Restantes jogos: carência até 23h59 de 11/06
  if (Date.now() < GRACE_UNTIL.getTime()) return true;
  // Regra normal: fecha à meia-noite do dia do jogo
  const todayLisbon = new Date().toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
  const parseDate = s => { const [d,m,y] = s.split("/"); return new Date(+y, +m-1, +d); };
  return parseDate(todayLisbon) < parseDate(matchDay);
}

function getResult(match) {
  const s = match.score;
  if (!s) return null;
  // Resultado aos 120 min (o que conta para a aposta) = tempo regulamentar + prolongamento.
  // Ignora as grandes penalidades — na football-data o fullTime chega a incluí-las.
  const reg = s.regularTime;
  if (reg && reg.home != null && reg.away != null) {
    let home = reg.home, away = reg.away;
    const et = s.extraTime;
    if (et && et.home != null && et.away != null) { home += et.home; away += et.away; }
    return { home, away };
  }
  // Sem regularTime (ex.: fase de grupos) → usar fullTime
  const ft = s.fullTime;
  if (ft && ft.home != null && ft.away != null) return { home: ft.home, away: ft.away };
  return null;
}

function calcPoints(pred, result) {
  if (!pred || !result) return null;
  if (pred.home === result.home && pred.away === result.away) return 3;
  const predOut = Math.sign(pred.home - pred.away);
  const realOut = Math.sign(result.home - result.away);
  return predOut === realOut ? 1 : 0;
}

function updateProgress() {
  const phaseMatches = allMatches.filter(m => {
    if (activePhase === "GROUP_J1") return m.stage === "GROUP_STAGE" && m.matchday === 1;
    if (activePhase === "GROUP_J2") return m.stage === "GROUP_STAGE" && m.matchday === 2;
    if (activePhase === "GROUP_J3") return m.stage === "GROUP_STAGE" && m.matchday === 3;
    if (activePhase === "FINAL") return m.stage === "FINAL" || m.stage === "THIRD_PLACE";
    return m.stage === activePhase;
  });
  const total = phaseMatches.length;
  for (const p of PLAYERS) {
    const filled = phaseMatches.filter(m => (predictions[m.id] || {})[p] != null).length;
    const el = document.querySelector(`.pred-col-pts[data-player="${p}"]`);
    if (el) {
      el.textContent = `${filled}/${total}`;
      el.style.color = filled === total ? "var(--green)" : "var(--red)";
    }
  }
}

// ── fetch matches ─────────────────────────────────────────────────────────────

async function fetchMatches({ fresh = false } = {}) {
  // Em carregamentos normais (fresh=true) vai sempre à rede; a cache de sessão só é usada
  // como atalho para chamadas repetidas muito seguidas (ex.: auto-refresh).
  if (!fresh) {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL && data.length) return data;
    }
  }
  try {
    // Use CF Worker proxy (handles CORS). O ?t= fura a cache HTTP do browser (Firefox mobile).
    const url = "https://wc26-api.conta-do-bruno.workers.dev/?t=" + Date.now();
    const res  = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    const data = json.matches || [];
    if (data.length) {
      // Guarda a última lista boa: sessão (rápido) + persistente (sobrevive a reloads/falhas)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      return data;
    }
  } catch (err) {
    console.warn("Falha ao obter jogos da API:", err);
  }
  // Fallback: última lista guardada (mesmo que antiga) para nunca ficar em branco
  const persisted = localStorage.getItem(CACHE_KEY);
  if (persisted) return JSON.parse(persisted).data;
  return [];
}

// ── autenticação por jogador ──────────────────────────────────────────────────

const PLAYER_LABEL = { rui: "Rui", bruno: "Bruno", fil: "Fil" };

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getStoredHash(player) {
  const snap = await getDoc(doc(db, "wc26_auth", player));
  return snap.exists() ? snap.data().hash : null;
}

async function setStoredHash(player, hash) {
  await setDoc(doc(db, "wc26_auth", player), { hash });
}

// Modal de palavra-passe (janela própria, não usa prompt nativo)
// opts: { title, message, confirm (bool), error (string) }
function showPasswordModal(opts) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const inputType = opts.visible ? "text" : "password";
    overlay.innerHTML = `
      <div class="modal" data-player="${opts.player || ""}">
        <h3 class="modal-title">${opts.title}</h3>
        <p class="modal-msg">${opts.message}</p>
        <input type="${inputType}" class="modal-input" id="mpw1" placeholder="${opts.placeholder || "Palavra-passe"}" autocomplete="off" autocapitalize="off" spellcheck="false" />
        ${opts.confirm ? `<input type="${inputType}" class="modal-input" id="mpw2" placeholder="Confirma a palavra-passe" autocomplete="off" autocapitalize="off" spellcheck="false" />` : ""}
        <div class="modal-error" id="mErr">${opts.error || ""}</div>
        <div class="modal-actions">
          <button class="modal-btn cancel" id="mCancel">Cancelar</button>
          <button class="modal-btn ok" id="mOk">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pw1 = overlay.querySelector("#mpw1");
    const pw2 = overlay.querySelector("#mpw2");
    const err = overlay.querySelector("#mErr");
    setTimeout(() => pw1.focus(), 50);

    const close = val => { overlay.remove(); resolve(val); };
    const submit = () => {
      const v1 = pw1.value.trim();
      if (!v1) { err.textContent = "Introduz a palavra-passe."; return; }
      if (opts.confirm && v1 !== pw2.value.trim()) {
        err.textContent = "As palavras-passe não coincidem."; return;
      }
      close(v1);
    };
    overlay.querySelector("#mCancel").onclick = () => close(null);
    overlay.querySelector("#mOk").onclick = submit;
    overlay.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close(null);
    });
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(null); });
  });
}

// Devolve true se o jogador ficar autenticado. Pede a palavra-passe SEMPRE que se entra em edição.
async function authenticatePlayer(player) {
  const name = PLAYER_LABEL[player] || player;
  let stored;
  try {
    stored = await getStoredHash(player);
  } catch (err) {
    await showPasswordModal({ title: "Erro", message: "Não foi possível verificar a palavra-passe. Tenta novamente.", confirm: false });
    return false;
  }

  if (!stored) {
    // Primeira vez: definir palavra-passe
    const pw = await showPasswordModal({
      title: name,
      message: `Ainda não tens palavra-passe, ${name}. Define uma (apenas UMA palavra) para protegeres as tuas apostas:`,
      confirm: true,
      visible: true,
      placeholder: "Uma palavra"
    });
    if (pw == null) return false;
    await setStoredHash(player, await sha256(pw));
    return true;
  }

  // Já existe: pedir palavra-passe (repete enquanto estiver errada)
  let error = "";
  while (true) {
    const input = await showPasswordModal({
      title: name,
      message: `Introduz a tua palavra-passe:`,
      confirm: false,
      error
    });
    if (input == null) return false;
    if (await sha256(input) === stored) return true;
    error = "Palavra-passe incorreta. Tenta de novo.";
  }
}

// ── Firebase ──────────────────────────────────────────────────────────────────

function subscribePredictions() {
  const col = collection(db, "worldcup26");
  onSnapshot(col, snap => {
    snap.forEach(d => { predictions[d.id] = d.data(); });
    updateProgress();
    if (!isSaving) renderView();
  });
}

async function savePrediction(matchId, player, home, away) {
  await setDoc(doc(db, "worldcup26", String(matchId)), {
    [player]: { home, away }
  }, { merge: true });
}

async function clearPrediction(matchId, player) {
  await setDoc(doc(db, "worldcup26", String(matchId)), {
    [player]: deleteField()
  }, { merge: true });
}

// ── render ────────────────────────────────────────────────────────────────────

// Fases em que as previsões ficam ocultas enquanto o jogo está aberto (revelam ao bloquear)
const HIDDEN_PRED_STAGES = ["LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];

function renderPredCell(match, player, result, open) {
  const isMe = player === activePlayer;
  const pred = (predictions[match.id] || {})[player];
  const pts  = calcPoints(pred, result);
  // Esconder previsões dos outros enquanto o jogo está aberto (só nas fases a eliminar a partir dos oitavos)
  const hidden = open && HIDDEN_PRED_STAGES.includes(match.stage);

  let ptsHtml = "";
  if (pts === 3)    ptsHtml = `<span class="pred-pts pts-3">+3 pts</span>`;
  else if (pts === 1) ptsHtml = `<span class="pred-pts pts-1">+1 pt</span>`;
  else if (result)  ptsHtml = `<span class="pred-pts pts-0">0 pts</span>`;

  if (isMe && open) {
    const hVal = pred ? pred.home : "";
    const aVal = pred ? pred.away : "";
    return `
      <div class="pred-cell" data-player="${player}">
        <div class="pred-inputs">
          <input class="pred-input my-input" type="number" min="0" max="20"
            value="${hVal}" placeholder="—" data-mid="${match.id}" data-player="${player}" data-side="home" />
          <span class="pred-sep">-</span>
          <input class="pred-input my-input" type="number" min="0" max="20"
            value="${aVal}" placeholder="—" data-mid="${match.id}" data-player="${player}" data-side="away" />
        </div>
      </div>`;
  }

  const scoreDisplay = hidden
    ? `<span class="pred-empty">🔒 oculta</span>`
    : pred != null
      ? `<span class="pred-score-display">${pred.home} - ${pred.away}</span>`
      : `<span class="pred-empty">sem aposta</span>`;

  return `
    <div class="pred-cell" data-player="${player}">
      <div class="pred-result">${scoreDisplay}</div>
      <div class="pred-right">${ptsHtml}</div>
    </div>`;
}

function renderMatchCard(match, showGroup = false) {
  const result = getResult(match);
  const open   = isPredictionOpen(match.utcDate, match.status);
  const status = match.status;
  const isLive = status === "IN_PLAY" || status === "PAUSED";
  const isDone = status === "FINISHED";

  const home = teamName(match.homeTeam?.name);
  const away = teamName(match.awayTeam?.name);
  const hCrest = match.homeTeam?.crest;
  const aCrest = match.awayTeam?.crest;

  const isKnockout = match.stage !== "GROUP_STAGE";
  const homeIsUnknown = !match.homeTeam?.name;

  const scoreHtml = result
    ? `<span class="match-score-inline">${result.home} — ${result.away}</span>`
    : `<span class="match-score-inline tbd">${isLive ? "⏱" : "vs"}</span>`;

  let statusHtml = "";
  if (isLive)      statusHtml = `<span class="status-badge status-live"><span class="live-dot"></span> Em jogo</span>`;
  else if (isDone) statusHtml = `<span class="status-badge status-finished">Terminado</span>`;
  else if (!open)  statusHtml = `<span class="status-badge status-closed">Fechado</span>`;

  const groupLabel = showGroup && match.group
    ? `<span class="match-group-label">${match.group.replace("GROUP_", "Gr. ")}</span>` : "";

  const stageLabel = match.stage === "FINAL"
    ? `<span class="match-group-label">Final</span>`
    : match.stage === "THIRD_PLACE"
    ? `<span class="match-group-label">3.º / 4.º</span>`
    : "";

  const knockoutNote = isKnockout && !homeIsUnknown
    ? `<div style="font-size:0.6rem;color:var(--muted);text-align:right;padding:0 0.875rem 0.2rem;">⚠️ resultado aos 120 min</div>` : "";

  return `
    <div class="match-card ${isLive ? "live" : ""} ${isDone ? "finished" : ""}" data-mid="${match.id}">
      <div class="match-top">
        <div class="match-info">
          <div class="match-info-top">
            <span class="match-info-date">${formatDate(match.utcDate)}</span>
            ${groupLabel}
            ${stageLabel}
            ${statusHtml}
          </div>
        </div>
        <div class="match-main">
          <div class="team home">
            <span class="team-name">${home}</span>
            ${hCrest ? `<img class="team-crest" src="${hCrest}" alt="${home}" onerror="this.style.display='none'" />` : ""}
          </div>
          ${scoreHtml}
          <div class="team away">
            ${aCrest ? `<img class="team-crest" src="${aCrest}" alt="${away}" onerror="this.style.display='none'" />` : ""}
            <span class="team-name">${away}</span>
          </div>
        </div>
      </div>
      ${knockoutNote}
      <div class="predictions">
        ${PLAYERS.map(p => renderPredCell(match, p, result, open)).join("")}
      </div>
    </div>`;
}

function renderMatches() {
  const main   = document.getElementById("main");
  const phase  = activePhase;
  let matches;
  if (phase === "GROUP_J1") matches = allMatches.filter(m => m.stage === "GROUP_STAGE" && m.matchday === 1);
  else if (phase === "GROUP_J2") matches = allMatches.filter(m => m.stage === "GROUP_STAGE" && m.matchday === 2);
  else if (phase === "GROUP_J3") matches = allMatches.filter(m => m.stage === "GROUP_STAGE" && m.matchday === 3);
  else if (phase === "FINAL") matches = allMatches.filter(m => m.stage === "FINAL" || m.stage === "THIRD_PLACE");
  else matches = allMatches.filter(m => m.stage === phase);

  if (matches.length === 0) {
    main.innerHTML = `<p style="color:var(--muted);text-align:center;padding:3rem 0">Sem jogos nesta fase ainda.</p>`;
    return;
  }

  let html = "";

  if (phase === "GROUP_J1" || phase === "GROUP_J2" || phase === "GROUP_J3") {
    html += `<div class="group-section">
      ${matches.map(m => renderMatchCard(m, true)).join("")}
    </div>`;
  } else {
    html += `<div class="group-section">
      ${matches.map(renderMatchCard).join("")}
    </div>`;
  }

  main.innerHTML = html;
  attachEvents();
}

// ── events ────────────────────────────────────────────────────────────────────

function attachEvents() {
  // Gravação automática: ao sair de cada campo (blur/Enter), grava se ambos forem válidos
  document.querySelectorAll(".pred-input.my-input").forEach(input => {
    input.addEventListener("change", async () => {
      const mid    = input.dataset.mid;
      const player = input.dataset.player;
      const card   = input.closest(".match-card");
      const hInput = card.querySelector(`.pred-input[data-side="home"]`);
      const aInput = card.querySelector(`.pred-input[data-side="away"]`);
      const saved = (predictions[mid] || {})[player];
      // Ambos os campos vazios → apagar a previsão (se existir)
      if (hInput.value.trim() === "" && aInput.value.trim() === "") {
        if (!saved) return;
        isSaving = true;
        await clearPrediction(mid, player);
        if (predictions[mid]) delete predictions[mid][player];
        isSaving = false;
        updateProgress();
        return;
      }
      const h = parseInt(hInput.value, 10);
      const a = parseInt(aInput.value, 10);
      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
      if (saved && saved.home === h && saved.away === a) return; // sem alterações
      isSaving = true;
      await savePrediction(mid, player, h, a);
      if (!predictions[mid]) predictions[mid] = {};
      predictions[mid][player] = { home: h, away: a };
      isSaving = false;
      updateProgress();
    });
  });
}

// Grava todas as previsões pendentes do jogador activo (antes de sair do modo editar)
async function flushActivePlayerInputs() {
  if (!activePlayer) return;
  const cards = document.querySelectorAll(".match-card");
  for (const card of cards) {
    const hInput = card.querySelector(`.pred-input[data-side="home"][data-player="${activePlayer}"]`);
    const aInput = card.querySelector(`.pred-input[data-side="away"][data-player="${activePlayer}"]`);
    if (!hInput || !aInput) continue;
    const mid = hInput.dataset.mid;
    const saved = (predictions[mid] || {})[activePlayer];
    // Ambos os campos vazios → apagar a previsão (se existir)
    if (hInput.value.trim() === "" && aInput.value.trim() === "") {
      if (!saved) continue;
      isSaving = true;
      await clearPrediction(mid, activePlayer);
      if (predictions[mid]) delete predictions[mid][activePlayer];
      isSaving = false;
      continue;
    }
    const h = parseInt(hInput.value, 10);
    const a = parseInt(aInput.value, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) continue;
    if (saved && saved.home === h && saved.away === a) continue;
    isSaving = true;
    await savePrediction(mid, activePlayer, h, a);
    if (!predictions[mid]) predictions[mid] = {};
    predictions[mid][activePlayer] = { home: h, away: a };
    isSaving = false;
  }
}

function setupUI() {
  // player column header buttons
  document.querySelectorAll(".pred-col-btn").forEach(btn => {
    if (btn.dataset.player === activePlayer) btn.classList.add("active");
    btn.addEventListener("click", async () => {
      // Grava o que o jogador activo tem em edição antes de mudar de estado
      await flushActivePlayerInputs();
      if (activePlayer === btn.dataset.player) {
        // Sair do modo de edição — não precisa de palavra-passe
        activePlayer = null;
        document.querySelectorAll(".pred-col-btn").forEach(b => b.classList.remove("active"));
      } else {
        // Entrar no modo de edição — exige palavra-passe sempre
        const ok = await authenticatePlayer(btn.dataset.player);
        if (!ok) return;
        activePlayer = btn.dataset.player;
        document.querySelectorAll(".pred-col-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }
      renderMatches();
    });
  });

  // phase buttons
  document.querySelectorAll(".phase-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activePhase = btn.dataset.phase;
      document.querySelectorAll(".phase-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderMatches();
      updateProgress();
    });
  });

  // view buttons (Apostas / Classificação / Regras)
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await flushActivePlayerInputs();
      activeView = btn.dataset.view;
      document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderView();
    });
  });
}

// ── view switching ──────────────────────────────────────────────────────────

function renderView() {
  const phaseNav = document.getElementById("phaseNav");
  const colHeaders = document.getElementById("predColHeaders");
  const showApostas = activeView === "apostas";
  phaseNav.style.display   = showApostas ? "" : "none";
  colHeaders.style.display = showApostas ? "" : "none";

  if (showApostas)              renderMatches();
  else if (activeView === "classificacao") renderClassificacao();
  else if (activeView === "regras")        renderRegras();
}

const PLAYER_COLOR = { rui: "#15803d", bruno: "#7b1e3a", fil: "#1d4ed8" };

function renderClassificacao() {
  const main = document.getElementById("main");

  // Jogos terminados (com resultado), por ordem cronológica
  const finished = allMatches
    .filter(m => getResult(m))
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const n = finished.length;

  // Estatísticas por jogador
  const stats = {};
  for (const p of PLAYERS) stats[p] = { pts: 0, c3: 0, c1: 0, c0: 0, cum: [0] };
  for (const m of finished) {
    const res = getResult(m);
    for (const p of PLAYERS) {
      const pred = (predictions[m.id] || {})[p];
      const pt = calcPoints(pred, res); // 3 / 1 / 0 ou null (sem previsão)
      if (pt === 3) stats[p].c3++;
      else if (pt === 1) stats[p].c1++;
      else stats[p].c0++;            // 0 pontos ou sem previsão
      stats[p].pts += (pt || 0);
      stats[p].cum.push(stats[p].pts);
    }
  }

  // Ordenar por pontos (desc) para a posição/medalhas
  const order = [...PLAYERS].sort((a, b) => stats[b].pts - stats[a].pts);
  const medals = ["🥇", "🥈", "🥉"];

  const rows = order.map((p, i) => `
    <tr>
      <td class="cl-pos">${medals[i] || (i + 1)}</td>
      <td class="cl-name" data-player="${p}">${PLAYER_LABEL[p]}</td>
      <td class="cl-pts">${stats[p].pts}</td>
      <td>${n}</td>
      <td>${stats[p].c3}</td>
      <td>${stats[p].c1}</td>
      <td>${stats[p].c0}</td>
    </tr>`).join("");

  const table = `
    <table class="cl-table">
      <thead>
        <tr>
          <th><span class="cl-full">Posição</span><span class="cl-short">Pos.</span></th>
          <th><span class="cl-full">Jogador</span><span class="cl-short">Jog.</span></th>
          <th><span class="cl-full">Pontos</span><span class="cl-short">Pts</span></th>
          <th><span class="cl-full">Jogos</span><span class="cl-short">J</span></th>
          <th class="cl-h3"><span class="cl-full">Acertou no resultado<br><small>(3 pontos)</small></span><span class="cl-short">3&nbsp;pts</span></th>
          <th class="cl-h1"><span class="cl-full">Acertou no desfecho<br><small>(1 ponto)</small></span><span class="cl-short">1&nbsp;pt</span></th>
          <th class="cl-h0"><span class="cl-full">Não acertou / sem previsão<br><small>(0 pontos)</small></span><span class="cl-short">0&nbsp;pts</span></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const chart = n > 0
    ? buildPointsChart(stats, n)
    : `<p class="cl-empty">Ainda não há jogos terminados. A classificação aparece assim que os primeiros resultados forem conhecidos.</p>`;

  main.innerHTML = `
    <div class="classif">
      <h2 class="cl-title">Quadro de Pontuação</h2>
      <p class="cl-games">Jogos realizados: <strong>${n}</strong></p>
      ${table}
      ${chart}
    </div>`;
}

// Gráfico de evolução dos pontos acumulados (SVG, sem bibliotecas)
function buildPointsChart(stats, n) {
  const W = 1000, H = 360, padL = 44, padR = 24, padT = 20, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let maxY = 1;
  for (const p of PLAYERS) maxY = Math.max(maxY, stats[p].pts);

  const xFor = k => padL + (k / n) * plotW;
  const yFor = v => padT + plotH - (v / maxY) * plotH;

  // Linhas de grelha horizontais + rótulos do eixo Y
  const ticks = 4;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const val = Math.round((maxY * t) / ticks);
    const y = yFor(val);
    grid += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#e3e7ec" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${y + 4}" font-size="11" fill="#9aa1ab" text-anchor="end">${val}</text>`;
  }

  const lines = PLAYERS.map(p => {
    const pts = stats[p].cum.map((v, k) => `${xFor(k).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
    return `<polyline fill="none" stroke="${PLAYER_COLOR[p]}" stroke-width="2.5" stroke-linejoin="round" points="${pts}" />`;
  }).join("");

  const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#cbd2da" stroke-width="1.5"/>`;

  const legend = PLAYERS.map(p =>
    `<span class="cl-leg-item">
       <span class="cl-leg-line" style="background:${PLAYER_COLOR[p]}"></span>
       <span class="cl-leg-name" style="color:${PLAYER_COLOR[p]}">${PLAYER_LABEL[p]}</span>
     </span>`).join("");

  return `
    <div class="cl-chart">
      <h3 class="cl-chart-title">Evolução dos pontos</h3>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
        ${grid}${axis}${lines}
      </svg>
      <div class="cl-legend">${legend}</div>
    </div>`;
}

function renderRegras() {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="regras">
      <h2 class="regras-title">Regras e Instruções</h2>
      <ol class="regras-list">
        <li>
          <span class="regra-h">Prazo das previsões</span>
          As previsões de cada jogador devem ser introduzidas ou alteradas até às
          <strong>23h59 do dia anterior</strong> ao jogo. Não é possível registar ou alterar
          previsões no próprio dia da partida, uma vez que os jogos passam ao estado
          <em>“fechado”</em>, com ou sem previsões feitas. <strong>Exceções para o arranque do
          Mundial (11/06/2026):</strong> as previsões dos jogos desse mesmo dia mantêm-se abertas
          até às <strong>18h59</strong> (sendo bloqueadas às 19h00); as previsões dos restantes
          jogos (de 12/06 em diante) permanecem abertas até às <strong>23h59</strong> desse dia,
          de modo a permitir que todos os jogadores registem as suas apostas antes do início da
          competição.
        </li>
        <li>
          <span class="regra-h">Pontuação</span>
          Cada jogador recebe <strong>3 pontos</strong> caso acerte no resultado exato,
          <strong>1 ponto</strong> caso acerte apenas na tendência do jogo (vitória, empate ou
          derrota) e <strong>0 pontos</strong> caso não acerte em nenhum dos casos ou caso não
          tenha registado a sua previsão.
        </li>
        <li>
          <span class="regra-h">Jogos com prolongamento</span>
          Nas partidas que tenham prolongamento, as previsões registadas são válidas para os
          <strong>120 minutos</strong> e não apenas para os 90 minutos regulamentares.
        </li>
        <li>
          <span class="regra-h">Como registar as previsões</span>
          O jogador deverá selecionar cada uma das fases (Grupos J1, Grupos J2, etc.) e efetuar as
          suas previsões. Para tal, deverá clicar no seu nome para colocar o quadro de previsões em
          <strong>modo de edição</strong> e introduzir as suas apostas. Concluído o registo, deverá
          clicar novamente no seu nome para <strong>encerrar o modo de edição</strong>.
        </li>
      </ol>
    </div>`;
}

// ── auto-refresh live results ─────────────────────────────────────────────────

function hasLiveMatch() {
  return allMatches.some(m => m.status === "IN_PLAY" || m.status === "PAUSED");
}

function scheduleRefresh() {
  // Refresh every 5 min; every 1 min if a game is live
  const delay = hasLiveMatch() ? 60_000 : 5 * 60_000;
  setTimeout(async () => {
    try { allMatches = await fetchMatches({ fresh: true }); renderView(); updateProgress(); } catch {}
    scheduleRefresh();
  }, delay);
}

// ── init ──────────────────────────────────────────────────────────────────────

// Qual a fase de um jogo (igual aos data-phase dos botões)
function phaseKeyOf(m) {
  if (m.stage === "GROUP_STAGE") return "GROUP_J" + m.matchday;
  if (m.stage === "THIRD_PLACE" || m.stage === "FINAL") return "FINAL";
  return m.stage; // LAST_32, LAST_16, QUARTER_FINALS, SEMI_FINALS
}

// Fase do próximo jogo ainda não terminado (a "fase atual" do torneio)
function getCurrentPhase() {
  const upcoming = allMatches
    .filter(m => m.status !== "FINISHED")
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  if (upcoming.length) return phaseKeyOf(upcoming[0]);
  // Tudo terminado → última fase com jogos
  const sorted = [...allMatches].sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));
  return sorted.length ? phaseKeyOf(sorted[0]) : "GROUP_J1";
}

function syncPhaseButtons() {
  document.querySelectorAll(".phase-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.phase === activePhase));
}

async function init() {
  setupUI();
  subscribePredictions();
  try {
    allMatches = await fetchMatches({ fresh: true });
    activePhase = getCurrentPhase();   // abre na fase atual do torneio
    syncPhaseButtons();
    renderMatches();
    updateProgress();
    scheduleRefresh();
  } catch (err) {
    document.getElementById("main").innerHTML =
      `<p style="color:var(--red);text-align:center;padding:3rem 0">Erro ao carregar jogos. Tenta recarregar a página.</p>`;
  }
}

init();
