import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── YOUR FIREBASE CONFIG ─────────────────────────────────────
// Replace with your own project config from the Firebase console
const firebaseConfig = {
  apiKey: "",
  authDomain: "eventmanagementdb-96827.firebaseapp.com",
  projectId: "eventmanagementdb-96827",
  storageBucket: "eventmanagementdb-96827.firebasestorage.app",
  messagingSenderId: "389609505903",
  appId: "1:389609505903:web:94bc753b4ce5bfc025f99a",
  measurementId: "G-17EV9PH07L"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── COLLECTION NAMES ─────────────────────────────────────────
const PROGRAMS     = "programs";
const TEAMS        = "teams";
const STUDENTS     = "students";
const ASSIGNMENTS  = "assignments";
const MARKS        = "marks";
const RESULTS      = "results";
const SETTINGS     = "settings";
const ACTIVITY     = "activity";

// ── AUTH ──────────────────────────────────────────────────────
export async function login(email, password) { return signInWithEmailAndPassword(auth, email, password); }
export async function logout() { return signOut(auth); }
export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
export function currentUser() { return auth.currentUser; }

// ── SETTINGS ─────────────────────────────────────────────────
export async function getSettings() {
  const snap = await getDoc(doc(db, SETTINGS, "main"));
  if (snap.exists()) return snap.data();
  return { eventName: "ArtsFest", pts1: 5, pts2: 3, pts3: 1, regOpen: true, resultsPublic: false };
}
export async function saveSettings(data) { await setDoc(doc(db, SETTINGS, "main"), data, { merge: true }); }

// ── PROGRAMS (admin write, everyone read) ─────────────────────
export async function getPrograms() {
  const snap = await getDocs(query(collection(db, PROGRAMS), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addProgram(data) { return addDoc(collection(db, PROGRAMS), { ...data, createdAt: serverTimestamp() }); }
export async function updateProgram(id, data) { return updateDoc(doc(db, PROGRAMS, id), data); }
export async function deleteProgramCascade(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, PROGRAMS, id));
  batch.delete(doc(db, RESULTS, id));
  const asnaps = await getDocs(query(collection(db, ASSIGNMENTS)));
  asnaps.docs.forEach(d => { if (d.data().programId === id) batch.delete(d.ref); });
  const msnaps = await getDocs(query(collection(db, MARKS)));
  msnaps.docs.forEach(d => { if (d.data().programId === id) batch.delete(d.ref); });
  return batch.commit();
}

// ── TEAMS (admin write, everyone read) ────────────────────────
export async function getTeams() {
  const snap = await getDocs(query(collection(db, TEAMS), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addTeam(data) { return addDoc(collection(db, TEAMS), { ...data, createdAt: serverTimestamp() }); }
export async function updateTeam(id, data) { return updateDoc(doc(db, TEAMS, id), data); }

// Deleting a team must also clean up everything that referenced its
// students so the app never shows dangling "—" participants in Marks
// or Results after the fact: the team's own assignments, any
// individual assignments its students held, marks recorded for the
// team or its students, and any 1st/2nd/3rd placements pointing at
// the team or its students.
export async function deleteTeamCascade(teamId, studentIds) {
  const batch = writeBatch(db);
  batch.delete(doc(db, TEAMS, teamId));
  studentIds.forEach(sid => batch.delete(doc(db, STUDENTS, sid)));

  const participantKeys = new Set(["t_" + teamId, ...studentIds.map(sid => "s_" + sid)]);

  const asnaps = await getDocs(collection(db, ASSIGNMENTS));
  asnaps.docs.forEach(d => {
    const a = d.data();
    if (a.teamId === teamId) { batch.delete(d.ref); return; }
    if (a.type === "individual" && (a.studentIds || []).some(id => studentIds.includes(id))) {
      const remaining = a.studentIds.filter(id => !studentIds.includes(id));
      if (remaining.length) batch.update(d.ref, { studentIds: remaining });
      else batch.delete(d.ref);
    }
  });

  const msnaps = await getDocs(collection(db, MARKS));
  msnaps.docs.forEach(d => { if (participantKeys.has(d.data().participantKey)) batch.delete(d.ref); });

  const rsnaps = await getDocs(collection(db, RESULTS));
  rsnaps.docs.forEach(d => {
    const r = d.data();
    const patch = {};
    if (participantKeys.has(r.first))  patch.first  = null;
    if (participantKeys.has(r.second)) patch.second = null;
    if (participantKeys.has(r.third))  patch.third  = null;
    if (Object.keys(patch).length) batch.update(d.ref, patch);
  });

  return batch.commit();
}

// ── STUDENTS (admin write, everyone read) ─────────────────────
export async function getStudents() {
  const snap = await getDocs(query(collection(db, STUDENTS), orderBy("chestNumber")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addStudent(data) { return addDoc(collection(db, STUDENTS), { ...data, createdAt: serverTimestamp() }); }
export async function updateStudent(id, data) { return updateDoc(doc(db, STUDENTS, id), data); }

// Removing a single student must not leave orphaned references behind:
// pull them out of any individual/group assignment, delete any marks
// recorded for them, and clear them out of any declared result.
export async function deleteStudentCascade(studentId) {
  const batch = writeBatch(db);
  const key = "s_" + studentId;
  batch.delete(doc(db, STUDENTS, studentId));

  const asnaps = await getDocs(collection(db, ASSIGNMENTS));
  asnaps.docs.forEach(d => {
    const a = d.data();
    if (!(a.studentIds || []).includes(studentId)) return;
    if (a.type === "individual") {
      const remaining = a.studentIds.filter(id => id !== studentId);
      if (remaining.length) batch.update(d.ref, { studentIds: remaining });
      else batch.delete(d.ref);
    } else {
      batch.update(d.ref, { studentIds: a.studentIds.filter(id => id !== studentId) });
    }
  });

  const msnaps = await getDocs(collection(db, MARKS));
  msnaps.docs.forEach(d => { if (d.data().participantKey === key) batch.delete(d.ref); });

  const rsnaps = await getDocs(collection(db, RESULTS));
  rsnaps.docs.forEach(d => {
    const r = d.data();
    const patch = {};
    if (r.first === key)  patch.first  = null;
    if (r.second === key) patch.second = null;
    if (r.third === key)  patch.third  = null;
    if (Object.keys(patch).length) batch.update(d.ref, patch);
  });

  return batch.commit();
}
// Kept for backwards compatibility / places that genuinely only want
// the bare delete — prefer deleteStudentCascade everywhere in the app.
export async function deleteStudent(id) { return deleteDoc(doc(db, STUDENTS, id)); }

// ── ASSIGNMENTS (admin write, everyone read) ──────────────────
export async function getAssignments() {
  const snap = await getDocs(collection(db, ASSIGNMENTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addAssignment(data) { return addDoc(collection(db, ASSIGNMENTS), { ...data, createdAt: serverTimestamp() }); }
export async function updateAssignment(id, data) { return updateDoc(doc(db, ASSIGNMENTS, id), data); }
export async function deleteAssignment(id) { return deleteDoc(doc(db, ASSIGNMENTS, id)); }

// Removing a participant's assignment to a program should also drop any
// marks entered for them in that program and clear them from that
// program's declared result, otherwise Marks/Results keep showing a
// participant who is no longer actually assigned.
export async function deleteAssignmentCascade(assignmentId, programId, participantKey) {
  const batch = writeBatch(db);
  batch.delete(doc(db, ASSIGNMENTS, assignmentId));
  batch.delete(doc(db, MARKS, `${programId}_${participantKey}`));

  const resultRef = doc(db, RESULTS, programId);
  const rSnap = await getDoc(resultRef);
  if (rSnap.exists()) {
    const r = rSnap.data();
    const patch = {};
    if (r.first === participantKey)  patch.first  = null;
    if (r.second === participantKey) patch.second = null;
    if (r.third === participantKey)  patch.third  = null;
    if (Object.keys(patch).length) batch.update(resultRef, patch);
  }
  return batch.commit();
}

// ── MARKS (admin write, everyone read) ────────────────────────
export async function getMarks() {
  const snap = await getDocs(collection(db, MARKS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function setMark(id, data) {
  return setDoc(doc(db, MARKS, id), { ...data, updatedAt: serverTimestamp(), updatedBy: currentUser()?.uid || "unknown" });
}
export async function deleteMark(id) { return deleteDoc(doc(db, MARKS, id)); }

// ── RESULTS (admin write, everyone read) ──────────────────────
export async function getResults() {
  const snap = await getDocs(collection(db, RESULTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function setResult(programId, data) {
  return setDoc(doc(db, RESULTS, programId), { ...data, updatedAt: serverTimestamp(), updatedBy: currentUser()?.uid || "unknown" });
}
export async function deleteResult(programId) { return deleteDoc(doc(db, RESULTS, programId)); }

// ── ACTIVITY LOG ───────────────────────────────────────────────
export async function logActivity(msg, type = "green") {
  return addDoc(collection(db, ACTIVITY), {
    msg, type,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    createdAt: serverTimestamp(),
    user: currentUser()?.email || "unknown"
  });
}
// Bounded at the query level (not just sliced client-side afterwards)
// so the activity log doesn't turn into an ever-growing full-collection
// read as the event goes on.
export async function getRecentActivity(limitCount = 20) {
  const snap = await getDocs(query(collection(db, ACTIVITY), orderBy("createdAt", "desc"), limit(limitCount)));
  return snap.docs.map(d => d.data());
}

// ── REAL-TIME LISTENERS ────────────────────────────────────────
export function listenToPrograms(cb)    { return onSnapshot(query(collection(db, PROGRAMS), orderBy("name")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToTeams(cb)       { return onSnapshot(query(collection(db, TEAMS), orderBy("name")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToStudents(cb)    { return onSnapshot(query(collection(db, STUDENTS), orderBy("chestNumber")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToAssignments(cb) { return onSnapshot(collection(db, ASSIGNMENTS), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToMarks(cb)       { return onSnapshot(collection(db, MARKS), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToResults(cb)     { return onSnapshot(collection(db, RESULTS), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToActivity(cb)    { return onSnapshot(query(collection(db, ACTIVITY), orderBy("createdAt", "desc"), limit(20)), s => cb(s.docs.map(d => d.data()))); }

// ── CSV EXPORT HELPER ──────────────────────────────────────────
export function downloadCSV(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) v = "";
    v = String(v).replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  };
  const lines = [headers.map(esc).join(",")].concat(rows.map(r => r.map(esc).join(",")));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
