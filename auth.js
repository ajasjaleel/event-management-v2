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

export const can = { manage: () => isAdmin() };

// ── UI gating helper ─────────────────────────────────────────
export function applyRoleGating() {
  document.querySelectorAll("[data-admin]").forEach(el => {
    el.style.display = isAdmin() ? "" : "none";
  });
  document.querySelectorAll("[data-user-only]").forEach(el => {
    el.style.display = isUser() ? "" : "none";
  });
  document.querySelectorAll("[data-admin-action]").forEach(el => {
    if (!isAdmin()) {
      el.disabled = true;
      el.title = "Admin access required";
      el.style.opacity = "0.4";
      el.style.cursor = "not-allowed";
    }
  });
}
