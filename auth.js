// ============================================================
// auth.js — Role definitions and permission checks
// ============================================================
// ROLE SYSTEM (simple, two roles):
//   admin → full control: add/edit/delete everything, enter marks,
//           declare results, manage settings
//   user  → VIEW ONLY: can see the dashboard, programs, teams,
//           students, assignment lists, marks and results, and can
//           download any CSV — but cannot create, edit, or delete
//           anything, and cannot see Settings.
//
// Roles live in Firestore at /roles/{uid} = { role: "admin" | "user" }.
// If no role document exists for a signed-in user, they default to
// "user" (least privilege / fail-safe).
//
// QUICK SETUP:
//   Firebase console → Firestore → collection "roles"
//   → doc ID = the user's UID → field role = "admin" or "user"
//
// NOTE: this file only controls what the UI shows. It cannot stop
// someone from calling the Firestore SDK directly from devtools. The
// actual enforcement has to live in firestore.rules (included next to
// this project) — deploy it before going live.
// ============================================================

import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

let _currentRole = null;

export async function fetchUserRole(uid) {
  try {
    const db = getFirestore(getApp());
    const snap = await getDoc(doc(db, "roles", uid));
    _currentRole = snap.exists() ? snap.data().role : "user";
  } catch (e) {
    _currentRole = "user"; // fail safe — least privilege
  }
  return _currentRole;
}

export function getRole() { return _currentRole; }
export function isAdmin() { return _currentRole === "admin"; }
export function isUser() { return _currentRole !== "admin"; }
export function clearRole() { _currentRole = null; }

// Everything that mutates data requires admin. Kept as a single
// switch so permission logic lives in exactly one place.
export const can = { manage: () => isAdmin() };

// ── UI gating helper ─────────────────────────────────────────
export function applyRoleGating() {
  // Elements with data-admin are hidden entirely from non-admins
  document.querySelectorAll("[data-admin]").forEach(el => {
    el.style.display = isAdmin() ? "" : "none";
  });
  // Elements with data-user-only are hidden from admins
  document.querySelectorAll("[data-user-only]").forEach(el => {
    el.style.display = isUser() ? "" : "none";
  });
  // Disable-only elements (kept visible, but non-interactive for users)
  document.querySelectorAll("[data-admin-action]").forEach(el => {
    if (!isAdmin()) {
      el.disabled = true;
      el.title = "Admin access required";
      el.style.opacity = "0.4";
      el.style.cursor = "not-allowed";
    }
  });
}
