// ============================================================
// app.js — ArtsFest main application logic
// ============================================================
import {
  login, logout, onAuthChange, currentUser,
  getSettings, saveSettings,
  getPrograms, addProgram, updateProgram, deleteProgramCascade,
  getTeams, addTeam, updateTeam, deleteTeamCascade,
  getStudents, addStudent, updateStudent, deleteStudentCascade,
  getAssignments, addAssignment, updateAssignment, deleteAssignmentCascade,
  getMarks, setMark, deleteMark,
  getResults, setResult, deleteResult,
  logActivity, getRecentActivity, downloadCSV,
  listenToPrograms, listenToTeams, listenToStudents, listenToAssignments,
  listenToMarks, listenToResults, listenToActivity
} from "./db.js";
import { fetchUserRole, isAdmin, clearRole, applyRoleGating } from "./auth.js";

// ══════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════
let state = {
  programs: [], teams: [], students: [], assignments: [], marks: [], results: [],
  settings: { eventName: "ArtsFest", pts1: 5, pts2: 3, pts3: 1, regOpen: true, resultsPublic: false },
  activity: [], userEmail: ""
};
let unsub = [];

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
onAuthChange(async (user) => {
  hideLoading();
  if (user) {
    state.userEmail = user.email;
    await fetchUserRole(user.uid);
    await bootstrap();
  } else {
    clearRole(); stopListeners(); showLogin();
  }
});

async function bootstrap() {
  const [programs, teams, students, assignments, marks, results, settings, activity] = await Promise.all([
    getPrograms(), getTeams(), getStudents(), getAssignments(), getMarks(), getResults(), getSettings(), getRecentActivity(20)
  ]);
  Object.assign(state, { programs, teams, students, assignments, marks, results, settings, activity });
  applyRoleToUI();
  showDashboard();
  startListeners();
  updateNavCounts();
  navigateTo("view-dashboard");
}

function startListeners() {
  stopListeners();
  unsub = [
    listenToPrograms(d => { state.programs = d; updateNavCounts(); rerenderIf(["view-programs","view-dashboard"]); refreshAllSelects(); }),
    listenToTeams(d => { state.teams = d; updateNavCounts(); rerenderIf(["view-teams","view-dashboard","view-leaderboard"]); refreshAllSelects(); }),
    listenToStudents(d => { state.students = d; updateNavCounts(); rerenderIf(["view-students","view-dashboard"]); refreshAllSelects(); }),
    listenToAssignments(d => { state.assignments = d; rerenderIf(["view-assign-individual","view-assign-group","view-list-program","view-list-student","view-marks"]); }),
    listenToMarks(d => { state.marks = d; rerenderIf(["view-marks"]); }),
    listenToResults(d => { state.results = d; rerenderIf(["view-results","view-leaderboard","view-dashboard"]); }),
    listenToActivity(d => { state.activity = d; rerenderIf(["view-dashboard"]); })
  ];
}
function stopListeners() { unsub.forEach(u => u && u()); unsub = []; }
function rerenderIf(views) { if (views.includes(currentView())) renderView(currentView()); }

// ══════════════════════════════════════════════════════
// ROLE GATING
// ══════════════════════════════════════════════════════
function applyRoleToUI() {
  const badge = document.getElementById("sidebar-role-badge");
  if (isAdmin()) { badge.className = "sidebar-role-badge admin"; badge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Admin`; }
  else           { badge.className = "sidebar-role-badge user";  badge.innerHTML = `<i class="fa-solid fa-eye"></i> Viewer`; }

  document.getElementById("topbar-username").textContent = state.userEmail;
  document.getElementById("topbar-role-label").textContent = isAdmin() ? "Administrator" : "Viewer (read-only)";
  const av = document.getElementById("topbar-avatar");
  av.textContent = state.userEmail.slice(0, 2).toUpperCase();
  av.classList.toggle("user-avatar", !isAdmin());

  document.querySelector('.nav-link[data-view="view-settings"]')?.classList.toggle("locked", !isAdmin());
  applyRoleGating();
}

// ══════════════════════════════════════════════════════
// PAGE SWITCH / NAV
// ══════════════════════════════════════════════════════
function showLogin()     {
  document.getElementById("login-page").style.display = "flex"; document.getElementById("dashboard-page").style.display = "none";
  const btn = document.getElementById("loginBtn");
  if (btn) { btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'; btn.disabled = false; }
}
function showDashboard() { document.getElementById("login-page").style.display = "none"; document.getElementById("dashboard-page").style.display = "block"; }
function hideLoading()   { document.getElementById("app-loading")?.remove(); }

const PAGE_TITLES = {
  "view-dashboard": "Dashboard", "view-programs": "Programs", "view-teams": "Teams",
  "view-students": "Students", "view-assign-individual": "Assign Individual Program",
  "view-assign-group": "Assign Group Program", "view-list-program": "List by Program",
  "view-list-student": "List by Student", "view-marks": "Marks", "view-results": "Results & Scoring",
  "view-leaderboard": "Leaderboard", "view-settings": "Settings"
};

export function navigateTo(viewId) {
  if (viewId === "view-settings" && !isAdmin()) { toast("Settings are for admins only.", "warn"); return; }
  document.querySelectorAll(".section-view").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-link[data-view]").forEach(l => l.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
  document.querySelector(`.nav-link[data-view="${viewId}"]`)?.classList.add("active");
  document.getElementById("page-title").textContent = PAGE_TITLES[viewId] || "";
  renderView(viewId);
  closeMobileSidebar();
}
function currentView() { return document.querySelector(".section-view.active")?.id || "view-dashboard"; }

function renderView(id) {
  ({
    "view-dashboard": renderDashboard, "view-programs": renderPrograms, "view-teams": renderTeams,
    "view-students": renderStudents, "view-assign-individual": renderAssignIndividual,
    "view-assign-group": renderAssignGroup, "view-list-program": renderListProgram,
    "view-list-student": renderListStudent, "view-marks": renderMarks, "view-results": renderResults,
    "view-leaderboard": renderLeaderboard, "view-settings": renderSettings
  }[id] || (() => {}))();
}

function updateNavCounts() {
  setText("count-programs", state.programs.length);
  setText("count-teams", state.teams.length);
  setText("count-students", state.students.length);
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// ══════════════════════════════════════════════════════
// LOOKUPS
// ══════════════════════════════════════════════════════
const teamById    = id => state.teams.find(t => t.id === id);
const studentById = id => state.students.find(s => s.id === id);

function normalizeChest(v) { return String(v ?? "").replace(/\s+/g, "").trim(); }
function findStudentByChest(raw) {
  const key = normalizeChest(raw);
  if (!key) return null;
  return state.students.find(s => normalizeChest(s.chestNumber) === key) || null;
}
const progById    = id => state.programs.find(p => p.id === id);

// A "participant key" unifies individual (student) & group (team) competitors
// so marks/results can reference either uniformly: "s_<studentId>" | "t_<teamId>"
function participantLabel(key) {
  if (!key) return "—";
  const [kind, id] = [key.slice(0, 2), key.slice(2)];
  if (kind === "s_") { const s = studentById(id); return s ? `#${esc(s.chestNumber)} ${esc(s.name)}` : "—"; }
  if (kind === "t_") { const t = teamById(id); return t ? esc(t.name) : "—"; }
  return "—";
}
function participantTeamId(key) {
  if (!key) return null;
  if (key.startsWith("s_")) return studentById(key.slice(2))?.teamId || null;
  if (key.startsWith("t_")) return key.slice(2);
  return null;
}
// All participants eligible for a given program, derived from assignments
function participantsForProgram(programId) {
  const list = [];
  const seen = new Set();
  state.assignments.filter(a => a.programId === programId).forEach(a => {
    if (a.type === "individual") {
      (a.studentIds || []).forEach(sid => {
        const key = "s_" + sid;
        if (!seen.has(key)) { seen.add(key); list.push({ key, label: participantLabel(key) }); }
      });
    } else if (a.type === "group" && a.teamId) {
      const key = "t_" + a.teamId;
      if (!seen.has(key)) { seen.add(key); list.push({ key, label: participantLabel(key) }); }
    }
  });
  return list;
}

// ══════════════════════════════════════════════════════
// POINTS ENGINE (drives Leaderboard)
// ══════════════════════════════════════════════════════
function computePoints() {
  const pts = {}, medals = {};
  state.teams.forEach(t => { pts[t.id] = 0; medals[t.id] = { g: 0, s: 0, b: 0 }; });
  const p1 = state.settings.pts1 || 5, p2 = state.settings.pts2 || 3, p3 = state.settings.pts3 || 1;
  state.results.forEach(r => {
    [[r.first, p1, "g"], [r.second, p2, "s"], [r.third, p3, "b"]].forEach(([key, p, medal]) => {
      if (!key) return;
      const tid = participantTeamId(key);
      if (tid && pts[tid] !== undefined) { pts[tid] += p; medals[tid][medal]++; }
    });
  });
  return { pts, medals };
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard() {
  setText("stat-participants", state.students.length);
  setText("stat-teams", state.teams.length);
  setText("stat-programs", state.programs.length);
  setText("stat-results", state.results.length);

  const af = document.getElementById("activity-feed");
  af.innerHTML = state.activity.length ? state.activity.slice(0, 8).map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.type || "green"}"></div>
      <div><div class="activity-text">${a.msg}</div><div class="activity-time">${a.time}${a.user ? ` · ${esc(a.user)}` : ""}</div></div>
    </div>`).join("") : `<p class="text-muted" style="font-size:0.82rem;">No activity yet.</p>`;

  const { pts } = computePoints();
  const ml = document.getElementById("mini-leaderboard");
  const sorted = state.teams.map(t => ({ ...t, pts: pts[t.id] || 0 })).sort((a, b) => b.pts - a.pts).slice(0, 5);
  if (!sorted.length || sorted.every(t => t.pts === 0)) {
    ml.innerHTML = `<p class="text-muted" style="font-size:0.82rem;">Enter results to see standings.</p>`;
  } else {
    const max = Math.max(...sorted.map(t => t.pts), 1);
    ml.innerHTML = sorted.map((t, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--slate-50);">
        <div class="rank-badge rank-${i < 3 ? i + 1 : "n"}">${i + 1}</div>
        <div style="flex:1;min-width:0;font-size:0.82rem;font-weight:600;color:var(--slate-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name)}</div>
        <div class="pts-bar-bg" style="width:90px;"><div class="pts-bar" style="width:${Math.round(t.pts / max * 100)}%"></div></div>
        <div style="font-size:0.82rem;font-weight:700;color:var(--green-700);min-width:40px;text-align:right;">${t.pts}pts</div>
      </div>`).join("");
  }
}

// ══════════════════════════════════════════════════════
// PROGRAMS
// ══════════════════════════════════════════════════════
function filteredPrograms() {
  const search = val("prog-search").toLowerCase();
  const catF = val("prog-filter-cat"), typeF = val("prog-filter-type"), stageF = val("prog-filter-stage");
  return state.programs.filter(p =>
    (p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)) &&
    (!catF || p.category === catF) && (!typeF || p.type === typeF) &&
    (!stageF || p.stage === stageF));
}
function renderPrograms() {
  const filtered = filteredPrograms();

  const tbody = document.getElementById("programs-tbody");
  tbody.innerHTML = filtered.length ? filtered.map((p, i) => `
    <tr>
      <td class="text-muted">${i + 1}</td>
      <td class="primary-col">${esc(p.name)}</td>
      <td><span class="badge badge-blue">${esc(p.category)}</span></td>
      <td><span class="badge ${p.type === "Individual" ? "badge-amber" : "badge-green"}">${esc(p.type)}</span></td>
      <td>${p.maxTeam || '<span class="text-muted">—</span>'}</td>
      <td>${p.stage ? `<span class="badge ${p.stage === "On-Stage" ? "badge-purple" : "badge-slate"}">${esc(p.stage)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${p.time ? formatTime(p.time) : '<span class="text-muted">—</span>'}</td>
      <td class="actions" data-admin>
        <button class="btn-icon info" title="Edit" onclick="window._editProgram('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon danger" title="Delete" onclick="window._deleteProgram('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join("") : emptyRow(8, state.programs.length ? "No programs match your search." : "No programs yet.", "fa-clipboard-list");
  applyRoleGating();
}

on("btn-add-program", "click", () => {
  if (!isAdmin()) return;
  setText("modal-program-title", "Add Program");
  document.getElementById("form-program").reset();
  val("prog-id", "");
  clearErrors("form-program");
  openModal("modal-program");
});
window._editProgram = (id) => {
  if (!isAdmin()) return;
  const p = progById(id); if (!p) return;
  setText("modal-program-title", "Edit Program");
  val("prog-id", id); val("prog-name", p.name); val("prog-cat", p.category);
  val("prog-type", p.type); val("prog-stage", p.stage || ""); val("prog-time", p.time || "");
  val("prog-maxteam", p.maxTeam || "");
  clearErrors("form-program");
  openModal("modal-program");
};
window._deleteProgram = async (id) => {
  if (!isAdmin()) return;
  const p = progById(id); if (!p) return;
  if (!await showConfirm("Delete Program", `Delete "${p.name}"? All related assignments, marks and results will also be removed.`)) return;
  try {
    await deleteProgramCascade(id);
    state.programs = state.programs.filter(x => x.id !== id);
    await logActivity(`Deleted program <strong>${esc(p.name)}</strong>`, "red");
    toast("Program deleted.");
  } catch (e) { toast("Failed to delete program.", "error"); }
};
on("btn-save-program", "click", async () => {
  if (!isAdmin()) return;
  clearErrors("form-program");
  const name = val("prog-name").trim(), cat = val("prog-cat"), type = val("prog-type");
  let valid = true;
  if (!name) { showError("prog-name-err"); mark("prog-name"); valid = false; }
  if (!cat)  { showError("prog-cat-err");  mark("prog-cat");  valid = false; }
  if (!type) { showError("prog-type-err"); mark("prog-type"); valid = false; }
  if (!valid) return;
  const id = val("prog-id");
  const data = { name, category: cat, type, stage: val("prog-stage"), time: val("prog-time"), maxTeam: parseInt(val("prog-maxteam")) || null };
  try {
    setBtnLoading("btn-save-program", true);
    if (id) { await updateProgram(id, data); await logActivity(`Updated program <strong>${esc(name)}</strong>`, "blue"); toast("Program updated."); }
    else    { await addProgram(data); await logActivity(`Added program <strong>${esc(name)}</strong>`); toast("Program added!"); }
    closeModal("modal-program");
  } catch (e) { toast("Failed to save program.", "error"); }
  finally { setBtnLoading("btn-save-program", false); }
});
on("prog-search", "input", renderPrograms);
on("prog-filter-cat", "change", renderPrograms);
on("prog-filter-type", "change", renderPrograms);
on("prog-filter-stage", "change", renderPrograms);
on("btn-export-programs", "click", () => {
  // Same rows (respecting the active search/filters) and the same column
  // order as the on-screen table: #, Program Name, Category, Type, Max
  // Team, Stage, Time, Actions — minus the row number and Actions column,
  // which don't make sense in a CSV.
  downloadCSV("programs", ["Program Name", "Category", "Type", "Max Team", "Stage", "Time"],
    filteredPrograms().map(p => [p.name, p.category, p.type, p.maxTeam || "", p.stage || "", p.time || ""]));
});

// ══════════════════════════════════════════════════════
// TEAMS
// ══════════════════════════════════════════════════════
function filteredSortedTeams() {
  const search = val("team-search").toLowerCase();
  const { pts, medals } = computePoints();
  const sorted = [...state.teams].map(t => ({ ...t, pts: pts[t.id] || 0, medals: medals[t.id] || { g: 0, s: 0, b: 0 } })).sort((a, b) => b.pts - a.pts);
  return sorted.filter(t => t.name.toLowerCase().includes(search) || (t.leader || "").toLowerCase().includes(search));
}
function renderTeams() {
  const filtered = filteredSortedTeams();

  const tbody = document.getElementById("teams-tbody");
  tbody.innerHTML = filtered.length ? filtered.map((t, i) => {
    const memberCount = state.students.filter(s => s.teamId === t.id).length;
    return `<tr>
      <td><div class="rank-badge rank-${i < 3 ? i + 1 : "n"}">${i + 1}</div></td>
      <td class="primary-col">${esc(t.name)}</td>
      <td>${esc(t.leader)}</td>
      <td>${memberCount}</td>
      <td><span class="points-pill">${t.pts} pts</span> <span class="text-muted text-sm">🥇${t.medals.g} 🥈${t.medals.s} 🥉${t.medals.b}</span></td>
      <td class="actions">
        <button class="btn-icon info" title="View Team" onclick="window._viewTeam('${t.id}')"><i class="fa-solid fa-table-list"></i></button>
        <span data-admin style="display:inline-flex;">
          <button class="btn-icon info" title="Edit" onclick="window._editTeam('${t.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" title="Delete" onclick="window._deleteTeam('${t.id}')"><i class="fa-solid fa-trash"></i></button>
        </span>
      </td>
    </tr>`;
  }).join("") : emptyRow(6, state.teams.length ? "No teams match your search." : "No teams yet.", "fa-flag");
  applyRoleGating();
}

on("btn-add-team", "click", () => {
  if (!isAdmin()) return;
  setText("modal-team-title", "Register Team");
  document.getElementById("form-team").reset(); val("team-id", "");
  clearErrors("form-team"); openModal("modal-team");
});
window._editTeam = (id) => {
  if (!isAdmin()) return;
  const t = teamById(id); if (!t) return;
  setText("modal-team-title", "Edit Team");
  val("team-id", id); val("team-name", t.name); val("team-leader", t.leader);
  clearErrors("form-team"); openModal("modal-team");
};
window._deleteTeam = async (id) => {
  if (!isAdmin()) return;
  const t = teamById(id); if (!t) return;
  const sIds = state.students.filter(s => s.teamId === id).map(s => s.id);
  if (!await showConfirm("Delete Team", `Delete "${t.name}"? ${sIds.length} student(s) will also be removed.`)) return;
  try {
    await deleteTeamCascade(id, sIds);
    state.teams = state.teams.filter(x => x.id !== id);
    state.students = state.students.filter(s => s.teamId !== id);
    await logActivity(`Deleted team <strong>${esc(t.name)}</strong>`, "red");
    toast("Team deleted.");
  } catch (e) { toast("Failed to delete team.", "error"); }
};
on("btn-save-team", "click", async () => {
  if (!isAdmin()) return;
  clearErrors("form-team");
  const name = val("team-name").trim(), leader = val("team-leader").trim();
  let valid = true;
  if (!name)   { showError("team-name-err");   mark("team-name");   valid = false; }
  if (!leader) { showError("team-leader-err"); mark("team-leader"); valid = false; }
  if (!valid) return;
  const id = val("team-id"), data = { name, leader };
  try {
    setBtnLoading("btn-save-team", true);
    if (id) { await updateTeam(id, data); await logActivity(`Updated team <strong>${esc(name)}</strong>`, "blue"); toast("Team updated."); }
    else    { await addTeam(data); await logActivity(`Registered team <strong>${esc(name)}</strong>`); toast("Team registered!"); }
    closeModal("modal-team");
  } catch (e) { toast("Failed to save team.", "error"); }
  finally { setBtnLoading("btn-save-team", false); }
});
on("team-search", "input", renderTeams);
on("btn-export-teams", "click", () => {
  // Same rows (respecting the active search) and rank order as the
  // on-screen table, with an explicit Rank column added since a CSV
  // can't show the rank badge.
  const filtered = filteredSortedTeams();
  downloadCSV("teams", ["Rank", "Team Name", "Leader", "Members", "Points", "Gold", "Silver", "Bronze"],
    filtered.map((t, i) => [i + 1, t.name, t.leader, state.students.filter(s => s.teamId === t.id).length, t.pts, t.medals.g, t.medals.s, t.medals.b]));
});

// View Team roster (Excel-style table + CSV)
window._viewTeam = (id) => {
  const t = teamById(id); if (!t) return;
  const roster = state.students.filter(s => s.teamId === id);
  setText("modal-view-team-title", `${t.name} — Roster`);
  document.getElementById("view-team-body").innerHTML = roster.length ? `
    <table class="data-table"><thead><tr><th>Chest No.</th><th>Name</th><th>Category</th></tr></thead>
    <tbody>${roster.map(s => `<tr><td>${esc(s.chestNumber)}</td><td class="primary-col">${esc(s.name)}</td><td><span class="badge badge-blue">${esc(s.category)}</span></td></tr>`).join("")}</tbody></table>
  ` : `<p class="text-muted" style="padding:20px;text-align:center;">No students in this team yet.</p>`;
  document.getElementById("btn-export-team-roster").onclick = () => {
    downloadCSV(`${t.name}-roster`, ["Chest No.", "Name", "Category"], roster.map(s => [s.chestNumber, s.name, s.category]));
  };
  openModal("modal-view-team");
};

// ══════════════════════════════════════════════════════
// STUDENTS
// ══════════════════════════════════════════════════════
function filteredStudents() {
  const search = val("student-search").toLowerCase();
  const catF = val("student-filter-cat"), teamF = val("student-filter-team");
  return state.students.filter(s =>
    (s.name.toLowerCase().includes(search) || String(s.chestNumber).includes(search)) &&
    (!catF || s.category === catF) && (!teamF || s.teamId == teamF));
}
function renderStudents() {
  const teamSel = document.getElementById("student-filter-team");
  const curTeam = teamSel.value;
  teamSel.innerHTML = '<option value="">All Teams</option>' + state.teams.map(t => `<option value="${t.id}" ${curTeam == t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");

  const filtered = filteredStudents();

  const tbody = document.getElementById("students-tbody");
  tbody.innerHTML = filtered.length ? filtered.map((s, i) => {
    const team = teamById(s.teamId);
    return `<tr>
      <td class="text-muted">${i + 1}</td>
      <td class="primary-col">#${esc(s.chestNumber)}</td>
      <td>${esc(s.name)}</td>
      <td>${team ? `<span class="badge badge-slate">${esc(team.name)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td><span class="badge badge-blue">${esc(s.category)}</span></td>
      <td class="actions" data-admin>
        <button class="btn-icon info" title="Edit" onclick="window._editStudent('${s.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon danger" title="Remove" onclick="window._deleteStudent('${s.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join("") : emptyRow(6, state.students.length ? "No matches." : "No students yet.", "fa-user-check");
  applyRoleGating();
}

on("btn-add-student", "click", () => {
  if (!isAdmin()) return;
  if (!state.teams.length) { toast("Register at least one team first.", "error"); return; }
  setText("modal-student-title", "Add Student");
  document.getElementById("form-student").reset(); val("student-id", "");
  populateSelect("student-team", state.teams, "");
  clearErrors("form-student"); openModal("modal-student");
});
window._editStudent = (id) => {
  if (!isAdmin()) return;
  const s = studentById(id); if (!s) return;
  setText("modal-student-title", "Edit Student");
  val("student-id", id); val("student-name", s.name); val("student-chest", s.chestNumber);
  val("student-category", s.category);
  populateSelect("student-team", state.teams, s.teamId);
  clearErrors("form-student"); openModal("modal-student");
};
window._deleteStudent = async (id) => {
  if (!isAdmin()) return;
  const s = studentById(id); if (!s) return;
  if (!await showConfirm("Remove Student", `Remove "${s.name}" (#${s.chestNumber}) from the event? Their assignments, marks and result placements will also be cleared.`, "Remove")) return;
  try {
    await deleteStudentCascade(id);
    state.students = state.students.filter(x => x.id !== id);
    await logActivity(`Removed student <strong>${esc(s.name)}</strong>`, "red");
    toast("Student removed.");
  } catch (e) { toast("Failed to remove student.", "error"); }
};
on("btn-save-student", "click", async () => {
  if (!isAdmin()) return;
  clearErrors("form-student");
  const name = val("student-name").trim(), chest = val("student-chest").trim(), cat = val("student-category"), teamId = val("student-team");
  let valid = true;
  if (!name)   { showError("student-name-err");   mark("student-name");   valid = false; }
  if (!chest)  { showError("student-chest-err");  mark("student-chest");  valid = false; }
  if (!cat)    { showError("student-category-err"); mark("student-category"); valid = false; }
  if (!teamId) { showError("student-team-err");   mark("student-team");   valid = false; }
  if (!valid) return;
  const id = val("student-id");
  const dup = state.students.find(s => s.id !== id && normalizeChest(s.chestNumber) === normalizeChest(chest));
  if (dup) { showError("student-chest-err"); document.getElementById("student-chest-err").textContent = "Chest number already in use."; mark("student-chest"); return; }
  const data = { name, chestNumber: chest, category: cat, teamId };
  try {
    setBtnLoading("btn-save-student", true);
    if (id) { await updateStudent(id, data); await logActivity(`Updated student <strong>${esc(name)}</strong>`, "blue"); toast("Student updated."); }
    else    { await addStudent(data); await logActivity(`Added student <strong>${esc(name)}</strong>`); toast("Student added!"); }
    closeModal("modal-student");
  } catch (e) { toast("Failed to save student.", "error"); }
  finally { setBtnLoading("btn-save-student", false); }
});
on("student-search", "input", renderStudents);
on("student-filter-cat", "change", renderStudents);
on("student-filter-team", "change", renderStudents);
on("btn-export-students", "click", () => {
  // Same rows (respecting the active search/filters) and the same column
  // order as the on-screen table: #, Chest No., Name, Team, Category,
  // Actions — minus the row number and Actions column.
  downloadCSV("students", ["Chest No.", "Name", "Team", "Category"],
    filteredStudents().map(s => [s.chestNumber, s.name, teamById(s.teamId)?.name || "", s.category]));
});

// ══════════════════════════════════════════════════════
// ASSIGN INDIVIDUAL PROGRAM (by chest number)
// ══════════════════════════════════════════════════════
function renderAssignIndividual() {
  populateAiProgramOptions();
  const rows = state.assignments.filter(a => a.type === "individual").flatMap(a =>
    (a.studentIds || []).map(sid => ({ a, sid })));
  const tbody = document.getElementById("assign-individual-tbody");
  tbody.innerHTML = rows.length ? rows.map(({ a, sid }) => {
    const s = studentById(sid), p = progById(a.programId), t = s ? teamById(s.teamId) : null;
    if (!s || !p) return "";
    return `<tr>
      <td class="primary-col">#${esc(s.chestNumber)}</td><td>${esc(s.name)}</td>
      <td>${t ? esc(t.name) : "—"}</td><td><span class="badge badge-blue">${esc(s.category)}</span></td>
      <td>${esc(p.name)}</td>
      <td class="actions" data-admin><button class="btn-icon danger" title="Remove" onclick="window._deleteAssignIndividual('${a.id}','${a.programId}','${sid}')"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`;
  }).join("") : emptyRow(6, "No individual assignments yet.", "fa-user-check");
  applyRoleGating();
}
function populateAiProgramOptions() {
  const s = findStudentByChest(val("ai-chest"));
  const pool = state.programs.filter(p => p.type === "Individual" && (!s || p.category === s.category));
  populateSelect("ai-program", pool, "", p => `${p.name} (${p.category})`);
}
// Debounced so the "not found" message doesn't flash on every keystroke
// while the user is still in the middle of typing a valid chest number —
// it only appears once they've paused, and disappears immediately (no
// delay) the moment a real match is typed.
let aiChestNotFoundTimer = null;
on("ai-chest", "input", () => {
  clearTimeout(aiChestNotFoundTimer);
  const raw = val("ai-chest");
  const s = findStudentByChest(raw);
  const preview = document.getElementById("ai-preview");
  if (s) {
    preview.innerHTML = `<strong>${esc(s.name)}</strong> · ${esc(teamById(s.teamId)?.name || "—")} · <span class="badge badge-blue">${esc(s.category)}</span>`;
  } else if (!raw.trim()) {
    preview.innerHTML = "";
  } else {
    aiChestNotFoundTimer = setTimeout(() => {
      preview.innerHTML = `<span class="text-muted">No student found with that chest number.</span>`;
    }, 500);
  }
  populateAiProgramOptions();
});
on("btn-assign-individual", "click", async () => {
  if (!isAdmin()) return;
  const chest = val("ai-chest").trim(), programId = val("ai-program");
  const err = document.getElementById("ai-err"); err.style.display = "none";
  const s = findStudentByChest(chest);
  if (!s) { err.textContent = "No student found with that chest number."; err.style.display = "block"; return; }
  if (!programId) { err.textContent = "Please select a program."; err.style.display = "block"; return; }
  const prog = progById(programId);
  // Defense in depth: the dropdown is already filtered to matching-category
  // programs, but re-check here too in case of a stale selection.
  if (prog && prog.category !== s.category) {
    err.textContent = `Category mismatch: ${s.name} is ${s.category}, but this program is for ${prog.category}.`;
    err.style.display = "block"; return;
  }
  const dup = state.assignments.find(a => a.type === "individual" && a.programId === programId && (a.studentIds || []).includes(s.id));
  if (dup) { err.textContent = "This student is already assigned to that program."; err.style.display = "block"; return; }
  try {
    await addAssignment({ programId, type: "individual", teamId: null, studentIds: [s.id] });
    await logActivity(`Assigned <strong>${esc(s.name)}</strong> to <strong>${esc(progById(programId)?.name)}</strong>`);
    val("ai-chest", ""); document.getElementById("ai-preview").innerHTML = "";
    populateAiProgramOptions();
    toast("Assigned!");
  } catch (e) { toast("Failed to assign.", "error"); }
});
// Individual assignments always contain exactly one student (see addAssignment
// above), so removing the student's assignment always means removing the whole
// assignment doc — use the cascade delete so leftover marks/result placements
// for that student in that program don't linger after the assignment is gone.
window._deleteAssignIndividual = async (assignId, programId, studentId) => {
  if (!isAdmin()) return;
  if (!await showConfirm("Remove Assignment", "Remove this student from the program? Their marks and result placement for this program will also be cleared.", "Remove")) return;
  try {
    await deleteAssignmentCascade(assignId, programId, "s_" + studentId);
    toast("Assignment removed.");
  } catch (e) { toast("Failed to remove assignment.", "error"); }
};
on("btn-export-assign-individual", "click", () => {
  const rows = state.assignments.filter(a => a.type === "individual").flatMap(a => (a.studentIds || []).map(sid => {
    const s = studentById(sid), p = progById(a.programId), t = s ? teamById(s.teamId) : null;
    return s && p ? [s.chestNumber, s.name, t?.name || "", s.category, p.name] : null;
  })).filter(Boolean);
  downloadCSV("individual-assignments", ["Chest No.", "Name", "Team", "Category", "Program"], rows);
});

// ══════════════════════════════════════════════════════
// ASSIGN GROUP PROGRAM
// ══════════════════════════════════════════════════════
function renderAssignGroup() {
  populateSelect("ag-program", state.programs.filter(p => p.type !== "Individual"), "", p => `${p.name} (${p.category})`);
  populateSelect("ag-team", state.teams, "");
  refreshGroupMemberList();

  const rows = state.assignments.filter(a => a.type === "group");
  const tbody = document.getElementById("assign-group-tbody");
  tbody.innerHTML = rows.length ? rows.map(a => {
    const p = progById(a.programId), t = teamById(a.teamId);
    if (!p || !t) return "";
    const members = (a.studentIds || []).map(sid => studentById(sid)).filter(Boolean);
    return `<tr>
      <td class="primary-col">${esc(p.name)}</td><td>${esc(t.name)}</td>
      <td><div class="participant-programs">${members.map(m => `<span class="prog-chip">#${esc(m.chestNumber)} ${esc(m.name)}</span>`).join("") || '<span class="text-muted text-sm">None</span>'}</div></td>
      <td class="actions" data-admin>
        <button class="btn-icon info" title="Edit" onclick="window._editAssignGroup('${a.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon danger" title="Remove" onclick="window._deleteAssignGroup('${a.id}','${a.programId}','${a.teamId}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join("") : emptyRow(4, "No group assignments yet.", "fa-people-group");
  applyRoleGating();
}
function refreshGroupMemberList(selected = []) {
  const teamId = val("ag-team"), programId = val("ag-program");
  const container = document.getElementById("ag-members-list");
  if (!programId) { container.innerHTML = '<p class="text-muted" style="grid-column:span 2;font-size:0.8rem;">Select a program first.</p>'; return; }
  if (!teamId) { container.innerHTML = '<p class="text-muted" style="grid-column:span 2;font-size:0.8rem;">Select a team first.</p>'; return; }
  const prog = progById(programId);
  const members = state.students.filter(s => s.teamId === teamId && (!prog || s.category === prog.category));
  if (!members.length) { container.innerHTML = `<p class="text-muted" style="grid-column:span 2;font-size:0.8rem;">No ${prog ? esc(prog.category) + " " : ""}students in this team.</p>`; return; }
  container.innerHTML = members.map(m => `
    <label style="display:flex;align-items:center;gap:7px;font-size:0.8rem;cursor:pointer;padding:4px 0;">
      <input type="checkbox" value="${m.id}" ${selected.includes(m.id) ? "checked" : ""} style="accent-color:var(--green-600);width:14px;height:14px;">
      <span>#${esc(m.chestNumber)} ${esc(m.name)}</span>
    </label>`).join("");
}
on("ag-team", "change", () => refreshGroupMemberList());
on("ag-program", "change", () => refreshGroupMemberList());
on("btn-add-assign-group", "click", () => {
  if (!isAdmin()) return;
  setText("modal-assign-group-title", "Assign Group Program");
  val("ag-id", ""); val("ag-program", ""); val("ag-team", "");
  document.getElementById("ag-err").style.display = "none";
  refreshGroupMemberList();
  openModal("modal-assign-group");
});
window._editAssignGroup = (id) => {
  if (!isAdmin()) return;
  const a = state.assignments.find(x => x.id === id); if (!a) return;
  setText("modal-assign-group-title", "Edit Group Assignment");
  val("ag-id", id); val("ag-program", a.programId); val("ag-team", a.teamId);
  document.getElementById("ag-err").style.display = "none";
  refreshGroupMemberList(a.studentIds || []);
  openModal("modal-assign-group");
};
window._deleteAssignGroup = async (id, programId, teamId) => {
  if (!isAdmin()) return;
  if (!await showConfirm("Remove Assignment", "Remove this group assignment? The team's marks and result placement for this program will also be cleared.", "Remove")) return;
  try {
    await deleteAssignmentCascade(id, programId, "t_" + teamId);
    toast("Assignment removed.");
  } catch (e) { toast("Failed to remove.", "error"); }
};
on("btn-save-assign-group", "click", async () => {
  if (!isAdmin()) return;
  const programId = val("ag-program"), teamId = val("ag-team");
  const studentIds = [...document.querySelectorAll("#ag-members-list input:checked")].map(cb => cb.value);
  const err = document.getElementById("ag-err"); err.style.display = "none";
  if (!programId || !teamId) { err.textContent = "Program and team are required."; err.style.display = "block"; return; }
  if (!studentIds.length) { err.textContent = "Select at least one member."; err.style.display = "block"; return; }
  const prog = progById(programId);
  if (prog?.maxTeam && studentIds.length > prog.maxTeam) {
    err.textContent = `This program allows a maximum of ${prog.maxTeam} member(s) — you selected ${studentIds.length}.`;
    err.style.display = "block"; return;
  }
  const id = val("ag-id");
  const dup = state.assignments.find(a => a.type === "group" && a.programId === programId && a.teamId === teamId && a.id !== id);
  if (dup) { err.textContent = "This team is already assigned to that program."; err.style.display = "block"; return; }
  try {
    setBtnLoading("btn-save-assign-group", true);
    if (id) await updateAssignment(id, { programId, teamId, studentIds });
    else await addAssignment({ programId, type: "group", teamId, studentIds });
    await logActivity(`Assigned <strong>${esc(teamById(teamId)?.name)}</strong> to <strong>${esc(progById(programId)?.name)}</strong>`);
    closeModal("modal-assign-group");
    toast("Group assigned!");
  } catch (e) { toast("Failed to save assignment.", "error"); }
  finally { setBtnLoading("btn-save-assign-group", false); }
});
on("btn-export-assign-group", "click", () => {
  const rows = state.assignments.filter(a => a.type === "group").map(a => {
    const p = progById(a.programId), t = teamById(a.teamId);
    const members = (a.studentIds || []).map(sid => studentById(sid)).filter(Boolean).map(m => `#${m.chestNumber} ${m.name}`).join("; ");
    return p && t ? [p.name, t.name, members] : null;
  }).filter(Boolean);
  downloadCSV("group-assignments", ["Program", "Team", "Members"], rows);
});

// ══════════════════════════════════════════════════════
// LIST BY PROGRAM
// ══════════════════════════════════════════════════════
function renderListProgram() {
  populateSelect("lp-program", state.programs, "", p => `${p.name} (${p.category})`, true);
  const catF = val("lp-category"), progF = val("lp-program");
  const progs = state.programs.filter(p => (!catF || p.category === catF) && (!progF || p.id === progF));

  const rows = [];
  progs.forEach(p => {
    state.assignments.filter(a => a.programId === p.id).forEach(a => {
      if (a.type === "individual") {
        (a.studentIds || []).forEach(sid => {
          const s = studentById(sid); if (!s) return;
          rows.push({ program: p.name, category: p.category, type: "Individual", who: `#${s.chestNumber}`, name: s.name, team: teamById(s.teamId)?.name || "" });
        });
      } else if (a.type === "group") {
        const t = teamById(a.teamId); if (!t) return;
        const members = (a.studentIds || []).map(sid => studentById(sid)).filter(Boolean).map(m => m.name).join(", ");
        rows.push({ program: p.name, category: p.category, type: "Group", who: t.name, name: members, team: t.name });
      }
    });
  });

  const tbody = document.getElementById("list-program-tbody");
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr><td class="primary-col">${esc(r.program)}</td><td><span class="badge badge-blue">${esc(r.category)}</span></td>
    <td><span class="badge ${r.type === "Individual" ? "badge-amber" : "badge-green"}">${esc(r.type)}</span></td>
    <td>${esc(r.who)}</td><td>${esc(r.name)}</td><td>${esc(r.team)}</td></tr>`).join("")
    : emptyRow(6, "No assignments found.", "fa-clipboard-list");

  document.getElementById("btn-export-list-program").onclick = () => {
    const eventName = state.settings.eventName || "ArtsFest";
    const blocks = [];
    progs.forEach(p => {
      const slNo = state.programs.findIndex(x => x.id === p.id) + 1;
      const participants = [];
      state.assignments.filter(a => a.programId === p.id).forEach(a => {
        if (a.type === "individual") {
          (a.studentIds || []).forEach(sid => {
            const s = studentById(sid); if (!s) return;
            participants.push({ chest: s.chestNumber, name: s.name, team: teamById(s.teamId)?.name || "" });
          });
        } else if (a.type === "group") {
          const t = teamById(a.teamId);
          (a.studentIds || []).forEach(sid => {
            const s = studentById(sid); if (!s) return;
            participants.push({ chest: s.chestNumber, name: s.name, team: t?.name || "" });
          });
        }
      });
      blocks.push([eventName, "", "", "", ""]);
      blocks.push([slNo, p.name, p.category, "", ""]);
      blocks.push(["Sl No", "Chest Number", "Code Letter", "Name", "Team"]);
      if (participants.length) participants.forEach((pt, i) => blocks.push([i + 1, pt.chest, "", pt.name, pt.team]));
      else blocks.push(["", "No participants assigned yet.", "", "", ""]);
      blocks.push([]);
    });
    if (!blocks.length) { toast("No programs to export.", "warn"); return; }
    downloadCSV("chest-number-list", blocks[0], blocks.slice(1));
  };
}
on("lp-category", "change", renderListProgram);
on("lp-program", "change", renderListProgram);

// ══════════════════════════════════════════════════════
// LIST BY STUDENT
// ══════════════════════════════════════════════════════
function renderListStudent() {
  const search = val("ls-search").toLowerCase();
  const filtered = state.students.filter(s => String(s.chestNumber).includes(search) || s.name.toLowerCase().includes(search));

  const rows = filtered.map(s => {
    const indiv = state.assignments.filter(a => a.type === "individual" && (a.studentIds || []).includes(s.id)).map(a => progById(a.programId)?.name).filter(Boolean);
    const group = state.assignments.filter(a => a.type === "group" && a.teamId === s.teamId && (a.studentIds || []).includes(s.id)).map(a => progById(a.programId)?.name).filter(Boolean);
    return { s, programs: [...indiv, ...group] };
  });

  const tbody = document.getElementById("list-student-tbody");
  tbody.innerHTML = rows.length ? rows.map(({ s, programs }) => `
    <tr><td class="primary-col">#${esc(s.chestNumber)}</td><td>${esc(s.name)}</td>
    <td>${teamById(s.teamId)?.name ? esc(teamById(s.teamId).name) : "—"}</td>
    <td><div class="participant-programs">${programs.length ? programs.map(p => `<span class="prog-chip">${esc(p)}</span>`).join("") : '<span class="text-muted text-sm">None</span>'}</div></td></tr>`).join("")
    : emptyRow(4, "No students found.", "fa-user-check");

  document.getElementById("btn-export-list-student").onclick = () => {
    downloadCSV("list-by-student", ["Chest No.", "Name", "Team", "Programs"],
      rows.map(({ s, programs }) => [s.chestNumber, s.name, teamById(s.teamId)?.name || "", programs.join("; ")]));
  };
}
on("ls-search", "input", renderListStudent);

// ══════════════════════════════════════════════════════
// MARKS
// ══════════════════════════════════════════════════════
function renderMarks() {
  populateSelect("marks-program", state.programs, "", p => `${p.name} (${p.category})`, false);
  const programId = val("marks-program");
  const judgeCount = Math.max(1, parseInt(val("marks-judges")) || 3);
  const wrap = document.getElementById("marks-body");
  if (!programId) { wrap.innerHTML = `<p class="text-muted" style="padding:24px;text-align:center;">Select a program to enter or view marks.</p>`; return; }

  const participants = participantsForProgram(programId);
  if (!participants.length) { wrap.innerHTML = `<p class="text-muted" style="padding:24px;text-align:center;">No one is assigned to this program yet.</p>`; return; }

  const judgeHeaders = Array.from({ length: judgeCount }, (_, i) => `<th>J${i + 1}</th>`).join("");
  const rows = participants.map(p => {
    const existing = state.marks.find(m => m.programId === programId && m.participantKey === p.key);
    const judgeInputs = Array.from({ length: judgeCount }, (_, i) => `
      <td><input type="number" class="form-control jmark" data-key="${p.key}" data-idx="${i}" style="width:60px;text-align:center;" min="0" max="100"
        value="${existing?.judgeMarks?.[i] ?? ""}" ${!isAdmin() ? "disabled" : ""}></td>`).join("");
    return `<tr>
      <td class="primary-col">${p.label}</td>
      ${judgeInputs}
      <td class="mark-avg" data-key="${p.key}" style="font-weight:700;color:var(--green-700);">${existing ? existing.average.toFixed(1) : "—"}</td>
      <td data-admin><button class="btn btn-sm btn-primary" onclick="window._saveMark('${programId}','${p.key}')"><i class="fa-solid fa-floppy-disk"></i> Save</button></td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Participant</th>${judgeHeaders}<th>Average</th><th data-admin>Action</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  applyRoleGating();

  document.querySelectorAll(".jmark").forEach(inp => inp.addEventListener("input", () => updateAvgPreview(inp.dataset.key, judgeCount)));
}
function updateAvgPreview(key, judgeCount) {
  const vals = Array.from({ length: judgeCount }, (_, i) => parseFloat(document.querySelector(`.jmark[data-key="${key}"][data-idx="${i}"]`)?.value)).filter(v => !isNaN(v));
  const avgCell = document.querySelector(`.mark-avg[data-key="${key}"]`);
  if (avgCell) avgCell.textContent = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
}
window._saveMark = async (programId, key) => {
  if (!isAdmin()) return;
  const judgeCount = Math.max(1, parseInt(val("marks-judges")) || 3);
  const judgeMarks = Array.from({ length: judgeCount }, (_, i) => parseFloat(document.querySelector(`.jmark[data-key="${key}"][data-idx="${i}"]`)?.value)).filter(v => !isNaN(v));
  if (!judgeMarks.length) { toast("Enter at least one judge's mark.", "warn"); return; }
  const average = judgeMarks.reduce((a, b) => a + b, 0) / judgeMarks.length;
  const id = `${programId}_${key}`;
  try {
    await setMark(id, { programId, participantKey: key, judgeMarks, average });
    await logActivity(`Marks saved for <strong>${participantLabel(key)}</strong> in <strong>${esc(progById(programId)?.name)}</strong>`, "amber");
    toast("Marks saved.");
  } catch (e) { toast("Failed to save marks.", "error"); }
};
on("marks-program", "change", renderMarks);
on("marks-judges", "input", renderMarks);
on("btn-export-marks", "click", () => {
  const programId = val("marks-program");
  const filtered = state.marks.filter(m => !programId || m.programId === programId);
  if (!filtered.length) { toast("No marks to export.", "warn"); return; }
  const maxJudges = Math.max(1, ...filtered.map(m => (m.judgeMarks || []).length));
  const judgeHeaders = Array.from({ length: maxJudges }, (_, i) => `J${i + 1}`);
  const headers = programId ? ["Participant", ...judgeHeaders, "Average"] : ["Program", "Participant", ...judgeHeaders, "Average"];
  const rows = filtered.map(m => {
    const judgeCols = Array.from({ length: maxJudges }, (_, i) => m.judgeMarks?.[i] ?? "");
    const row = [participantLabel(m.participantKey).replace(/<[^>]*>/g, ""), ...judgeCols, m.average.toFixed(1)];
    return programId ? row : [progById(m.programId)?.name || "", ...row];
  });
  downloadCSV("marks", headers, rows);
});

// ══════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════
function filteredResults() {
  const search = val("result-search").toLowerCase();
  const catF = val("result-filter-cat"), statF = val("result-filter-status");
  return state.programs.filter(p => {
    const r = state.results.find(x => x.id === p.id);
    const has = r && (r.first || r.second || r.third);
    return (p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)) &&
      (!catF || p.category === catF) && (!statF || (statF === "entered" && has) || (statF === "pending" && !has));
  });
}
function renderResults() {
  const filtered = filteredResults();

  const tbody = document.getElementById("results-tbody");
  tbody.innerHTML = filtered.length ? filtered.map(p => {
    const r = state.results.find(x => x.id === p.id);
    const has = r && (r.first || r.second || r.third);
    return `<tr>
      <td class="primary-col">${esc(p.name)}</td><td><span class="badge badge-blue">${esc(p.category)}</span></td>
      <td>${r?.first  ? `<span class="result-indicator ri-winner">🥇 ${participantLabel(r.first)}</span>`  : '<span class="text-muted">—</span>'}</td>
      <td>${r?.second ? `<span class="result-indicator ri-runner">🥈 ${participantLabel(r.second)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${r?.third  ? `<span class="result-indicator ri-third">🥉 ${participantLabel(r.third)}</span>`   : '<span class="text-muted">—</span>'}</td>
      <td>${has ? '<span class="badge badge-green">Declared</span>' : '<span class="badge badge-slate">Pending</span>'}</td>
      <td class="actions" data-admin>
        <button class="btn btn-sm ${has ? "btn-secondary" : "btn-primary"}" onclick="window._openResultModal('${p.id}')">${has ? '<i class="fa-solid fa-pen"></i> Edit' : '<i class="fa-solid fa-plus"></i> Declare'}</button>
        ${has ? `<button class="btn-icon danger" title="Delete Result" onclick="window._deleteResult('${p.id}')"><i class="fa-solid fa-trash"></i></button>` : ""}
      </td>
    </tr>`;
  }).join("") : emptyRow(7, "No programs yet.", "fa-trophy");
  applyRoleGating();
}
window._openResultModal = (programId) => {
  if (!isAdmin()) return;
  const p = progById(programId); if (!p) return;
  const participants = participantsForProgram(programId);
  if (!participants.length) { toast("No participants assigned to this program yet.", "warn"); return; }
  const r = state.results.find(x => x.id === programId) || {};
  setText("modal-result-title", `Result — ${p.name}`);
  val("result-prog-id", programId);
  document.getElementById("modal-result-prog-info").innerHTML = `<strong>${esc(p.name)}</strong> &nbsp;·&nbsp; ${esc(p.category)} &nbsp;·&nbsp; ${esc(p.type)}`;
  const opts = '<option value="">— None —</option>' + participants.map(pt => `<option value="${pt.key}">${pt.label.replace(/<[^>]*>/g, "")}</option>`).join("");
  ["result-1st", "result-2nd", "result-3rd"].forEach(id => document.getElementById(id).innerHTML = opts);
  val("result-1st", r.first || ""); val("result-2nd", r.second || ""); val("result-3rd", r.third || "");
  document.getElementById("result-dup-err").style.display = "none";
  updatePointsPreview();
  document.getElementById("btn-auto-from-marks").onclick = () => {
    const ranked = participants.map(pt => ({ ...pt, avg: state.marks.find(m => m.programId === programId && m.participantKey === pt.key)?.average ?? -1 }))
      .sort((a, b) => b.avg - a.avg).filter(pt => pt.avg >= 0);
    if (!ranked.length) { toast("No marks entered yet for this program.", "warn"); return; }
    val("result-1st", ranked[0]?.key || ""); val("result-2nd", ranked[1]?.key || ""); val("result-3rd", ranked[2]?.key || "");
    updatePointsPreview();
  };
  openModal("modal-result");
};
["result-1st", "result-2nd", "result-3rd"].forEach(id => document.getElementById(id)?.addEventListener("change", updatePointsPreview));
function updatePointsPreview() {
  const v1 = val("result-1st"), v2 = val("result-2nd"), v3 = val("result-3rd");
  const pv = document.getElementById("points-preview"), pc = document.getElementById("points-preview-content");
  const lines = [];
  if (v1) lines.push(`<span class="badge badge-green">🥇 ${participantLabel(v1)} +${state.settings.pts1}pts</span>`);
  if (v2) lines.push(`<span class="badge badge-slate">🥈 ${participantLabel(v2)} +${state.settings.pts2}pts</span>`);
  if (v3) lines.push(`<span class="badge badge-amber">🥉 ${participantLabel(v3)} +${state.settings.pts3}pts</span>`);
  pv.style.display = lines.length ? "block" : "none";
  pc.innerHTML = lines.join("");
}
on("btn-save-result", "click", async () => {
  if (!isAdmin()) return;
  const programId = val("result-prog-id");
  const first = val("result-1st") || null, second = val("result-2nd") || null, third = val("result-3rd") || null;
  const errEl = document.getElementById("result-dup-err");
  const placed = [first, second, third].filter(Boolean);
  if (new Set(placed).size !== placed.length) { errEl.textContent = "A participant cannot be placed more than once."; errEl.style.display = "block"; return; }
  errEl.style.display = "none";
  try {
    setBtnLoading("btn-save-result", true);
    await setResult(programId, { programId, first, second, third });
    await logActivity(`Declared result for <strong>${esc(progById(programId)?.name)}</strong>`, "amber");
    closeModal("modal-result");
    toast("Result declared!");
  } catch (e) { toast("Failed to save result.", "error"); }
  finally { setBtnLoading("btn-save-result", false); }
});
window._deleteResult = async (programId) => {
  if (!isAdmin()) return;
  const p = progById(programId); if (!p) return;
  if (!await showConfirm("Delete Result", `Delete the declared result for "${p.name}"? This program will go back to Pending.`, "Delete")) return;
  try {
    await deleteResult(programId);
    state.results = state.results.filter(r => r.id !== programId);
    await logActivity(`Deleted result for <strong>${esc(p.name)}</strong>`, "red");
    toast("Result deleted.");
  } catch (e) { toast("Failed to delete result.", "error"); }
};
on("result-search", "input", renderResults);
on("result-filter-cat", "change", renderResults);
on("result-filter-status", "change", renderResults);
on("btn-export-results", "click", () => {
  // Same rows (respecting the active search/filters) as the on-screen
  // table. Status/Actions are left out since they're UI-only concepts.
  downloadCSV("results", ["Program", "Category", "1st", "2nd", "3rd"],
    filteredResults().map(p => { const r = state.results.find(x => x.id === p.id); return [p.name, p.category,
      r?.first ? participantLabel(r.first).replace(/<[^>]*>/g, "") : "", r?.second ? participantLabel(r.second).replace(/<[^>]*>/g, "") : "", r?.third ? participantLabel(r.third).replace(/<[^>]*>/g, "") : ""]; }));
});

// ══════════════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════════════
function renderLeaderboard() {
  const { pts, medals } = computePoints();
  const sorted = [...state.teams].map(t => ({ ...t, pts: pts[t.id] || 0, medals: medals[t.id] || { g: 0, s: 0, b: 0 } }))
    .sort((a, b) => b.pts - a.pts || b.medals.g - a.medals.g || b.medals.s - a.medals.s);
  const max = Math.max(...sorted.map(t => t.pts), 1);
  const tbody = document.getElementById("leaderboard-tbody");
  tbody.innerHTML = sorted.length ? sorted.map((t, i) => `
    <tr><td><div class="rank-badge rank-${i < 3 ? i + 1 : "n"}" style="width:28px;height:28px;font-size:0.8rem;">${i + 1}</div></td>
    <td class="primary-col">${esc(t.name)}</td><td><strong>${t.medals.g}</strong> 🥇</td><td><strong>${t.medals.s}</strong> 🥈</td><td><strong>${t.medals.b}</strong> 🥉</td>
    <td><span class="points-pill">${t.pts} pts</span></td>
    <td style="min-width:120px;"><div class="pts-bar-bg"><div class="pts-bar" style="width:${Math.round(t.pts / max * 100)}%"></div></div></td></tr>`).join("")
    : emptyRow(7, "No teams registered yet.", "fa-ranking-star");
}
document.getElementById("btn-export-leaderboard")?.addEventListener("click", () => {
  const { pts, medals } = computePoints();
  const sorted = [...state.teams].map(t => ({ ...t, pts: pts[t.id] || 0, medals: medals[t.id] })).sort((a, b) => b.pts - a.pts);
  downloadCSV("leaderboard", ["Rank", "Team", "Gold", "Silver", "Bronze", "Points"],
    sorted.map((t, i) => [i + 1, t.name, t.medals.g, t.medals.s, t.medals.b, t.pts]));
});

// ══════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════
function renderSettings() {
  val("setting-event-name", state.settings.eventName || "");
  val("setting-pts-1", state.settings.pts1 || 5);
  val("setting-pts-2", state.settings.pts2 || 3);
  val("setting-pts-3", state.settings.pts3 || 1);
  document.getElementById("setting-reg-open").checked = state.settings.regOpen !== false;
  document.getElementById("setting-results-public").checked = !!state.settings.resultsPublic;
}
on("btn-save-settings", "click", async () => {
  if (!isAdmin()) return;
  const data = {
    eventName: val("setting-event-name").trim() || "ArtsFest",
    pts1: parseInt(val("setting-pts-1")) || 5, pts2: parseInt(val("setting-pts-2")) || 3, pts3: parseInt(val("setting-pts-3")) || 1,
    regOpen: document.getElementById("setting-reg-open").checked, resultsPublic: document.getElementById("setting-results-public").checked
  };
  try { await saveSettings(data); state.settings = data; toast("Settings saved."); } catch (e) { toast("Failed to save settings.", "error"); }
});
on("btn-export", "click", () => {
  if (!isAdmin()) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "artsfest-export.json"; a.click(); URL.revokeObjectURL(url);
  toast("Data exported.", "info");
});
on("btn-change-pw", "click", () => {
  val("pw-current", ""); val("pw-new", ""); val("pw-confirm", "");
  clearErrors("form-change-pw"); openModal("modal-change-pw");
});
on("btn-save-pw", "click", async () => {
  clearErrors("form-change-pw");
  const cur = val("pw-current"), nw = val("pw-new"), conf = val("pw-confirm");
  let valid = true;
  if (!cur) { showError("pw-current-err"); valid = false; }
  if (nw.length < 6) { showError("pw-new-err"); valid = false; }
  if (nw !== conf) { showError("pw-confirm-err"); valid = false; }
  if (!valid) return;
  try {
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const user = currentUser();
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
    await updatePassword(user, nw);
    closeModal("modal-change-pw"); toast("Password updated.");
  } catch (e) { document.getElementById("pw-current").classList.add("error"); showError("pw-current-err"); document.getElementById("pw-current-err").textContent = "Incorrect current password."; }
});

// ══════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════════════════
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors("loginForm");
  const email = val("uname").trim(), pass = val("upass");
  let valid = true;
  if (!email) { showError("uname-err"); valid = false; }
  if (!pass)  { showError("upass-err"); valid = false; }
  if (!valid) return;
  const btn = document.getElementById("loginBtn");
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Signing in…'; btn.disabled = true;
  try { await login(email, pass); }
  catch (err) {
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'; btn.disabled = false;
    document.getElementById("login-error").classList.add("visible");
    val("upass", ""); document.getElementById("upass").focus();
    setTimeout(() => document.getElementById("login-error").classList.remove("visible"), 5000);
  }
});
on("togglePw", "click", () => {
  const inp = document.getElementById("upass"), icon = document.getElementById("togglePwIcon");
  inp.type = inp.type === "password" ? "text" : "password";
  icon.className = inp.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
});
on("logoutBtn", "click", async () => {
  if (!await showConfirm("Sign Out", "Are you sure you want to sign out?", "Sign Out")) return;
  stopListeners(); await logout();
});

// ══════════════════════════════════════════════════════
// NAV / SIDEBAR
// ══════════════════════════════════════════════════════
document.querySelectorAll(".nav-link[data-view]").forEach(link => link.addEventListener("click", () => {
  if (link.classList.contains("locked")) return;
  navigateTo(link.dataset.view);
}));
on("mobile-menu-btn", "click", () => { document.getElementById("sidebar").classList.toggle("open"); document.getElementById("sidebar-overlay").classList.toggle("open"); });
on("sidebar-overlay", "click", closeMobileSidebar);
function closeMobileSidebar() { document.getElementById("sidebar")?.classList.remove("open"); document.getElementById("sidebar-overlay")?.classList.remove("open"); }

// ══════════════════════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add("open"); document.body.style.overflow = "hidden"; }
function closeModal(id) { document.getElementById(id).classList.remove("open"); document.body.style.overflow = ""; }
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modal-overlay").forEach(ov => ov.addEventListener("click", e => { if (e.target === ov) closeModal(ov.id); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(m => closeModal(m.id)); });

function showConfirm(title, msg, okLabel = "Delete") {
  return new Promise(resolve => {
    setText("confirm-title", title); setText("confirm-msg", msg); setText("confirm-ok", okLabel);
    openModal("confirm-dialog");
    const ok = document.getElementById("confirm-ok"), ca = document.getElementById("confirm-cancel");
    function done(v) { closeModal("confirm-dialog"); ok.removeEventListener("click", yes); ca.removeEventListener("click", no); resolve(v); }
    function yes() { done(true); } function no() { done(false); }
    ok.addEventListener("click", yes); ca.addEventListener("click", no);
  });
}

// ══════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════
function toast(msg, type = "success", dur = 3500) {
  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info", warn: "fa-triangle-exclamation" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  document.getElementById("toast-container").appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, dur);
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function on(id, evt, fn) { document.getElementById(id)?.addEventListener(evt, fn); }
function val(id, set) { const el = document.getElementById(id); if (!el) return ""; if (set !== undefined) { el.value = set; return; } return el.value; }
function mark(id) { document.getElementById(id)?.classList.add("error"); }
function showError(id) { document.getElementById(id)?.classList.add("visible"); }
function clearErrors(scopeId) {
  const scope = document.getElementById(scopeId); if (!scope) return;
  scope.querySelectorAll(".field-error").forEach(el => el.classList.remove("visible"));
  scope.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
}
function esc(s) { if (s === null || s === undefined) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function emptyRow(cols, heading, icon) { return `<tr><td colspan="${cols}"><div class="empty-state"><div class="ei"><i class="fa-solid ${icon}"></i></div><h4>${heading}</h4></div></td></tr>`; }
function formatTime(t) { if (!t) return ""; const [h, m] = t.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; }
function setBtnLoading(id, on) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.origText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Saving…'; }
  else btn.innerHTML = btn.dataset.origText || "Save";
}
function populateSelect(id, items, selected, labelFn = (i) => i.name, withAll = false) {
  const sel = document.getElementById(id); if (!sel) return;
  const cur = selected !== "" ? selected : sel.value;
  sel.innerHTML = (withAll ? '<option value="">All Programs</option>' : '<option value="">Select…</option>') +
    items.map(i => `<option value="${i.id}" ${i.id === cur ? "selected" : ""}>${esc(labelFn(i))}</option>`).join("");
}
function refreshAllSelects() {
  // Refresh dropdowns that depend on live-updated collections, if their view is open
  const v = currentView();
  if (v === "view-assign-individual") renderAssignIndividual();
  if (v === "view-assign-group") renderAssignGroup();
  if (v === "view-list-program") renderListProgram();
  if (v === "view-marks") renderMarks();
}
