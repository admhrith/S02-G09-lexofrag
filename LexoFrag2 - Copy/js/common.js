/* =============================================================================
   LexoFrag — shared core (loaded on every page)
   Backend link, session, inventory/orders state, helpers.
   ============================================================================= */

// -----------------------------------------------------------------------------
// USERS & SESSION  (the session survives page changes via sessionStorage)
// -----------------------------------------------------------------------------
const DEMO_USERS = {
  "saif@lexofrag.my": { pass: "lexo123", name: "Encik Saif", role: "Owner" },
  "staff@lexofrag.my": { pass: "staff123", name: "Storeroom Staff", role: "Admin" }
};

let currentUser = JSON.parse(sessionStorage.getItem("lexofrag_user") || "null");
const isOwnerUser = () => !!currentUser && currentUser.role === "Owner";

// -----------------------------------------------------------------------------
// BACKEND LINK (api.php -> lexofrag.sql). Falls back to localStorage if offline.
// -----------------------------------------------------------------------------
const API_URL = "api.php";
let apiOnline = false;

async function api(action, payload) {
  const res = await fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

async function detectBackend() {
  try { await api("ping"); apiOnline = true; } catch (e) { apiOnline = false; }
}

// Every page needs to know once whether the backend is reachable.
let _backendCheck = null;
function ensureBackendChecked() {
  if (!_backendCheck) _backendCheck = detectBackend();
  return _backendCheck;
}

async function syncFromServer() {
  const data = await api("state");
  inventoryDB = {};
  data.products.forEach(p => { inventoryDB[p.sku] = p; });
  // Only the Stock Audit page has an activity log to draw.
  if (typeof renderAuditFeed === "function") renderAuditFeed(data.audit);
}

const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RM = (n) => "RM " + Number(n || 0).toFixed(2);

// -----------------------------------------------------------------------------
// INVENTORY STATE (shared by storefront, Stock Audit and Orders pages)
// -----------------------------------------------------------------------------
const DEFAULT_INVENTORY = {
  "LF-10C-MIX": {"sku": "LF-10C-MIX", "name": "Mix Fruit (Classic 10ml)", "rack": "Rack A1", "stock": 20, "line": "Classic Edition", "size_ml": 10, "regular_price": 9.9, "sale_price": 4.95},
  "LF-10C-VAN": {"sku": "LF-10C-VAN", "name": "Vanilla Ice (Classic 10ml)", "rack": "Rack A2", "stock": 20, "line": "Classic Edition", "size_ml": 10, "regular_price": 9.9, "sale_price": 4.95},
  "LF-10C-GUM": {"sku": "LF-10C-GUM", "name": "Sweet Gummy (Classic 10ml)", "rack": "Rack A3", "stock": 20, "line": "Classic Edition", "size_ml": 10, "regular_price": 9.9, "sale_price": 4.95},
  "LF-10D-APL": {"sku": "LF-10D-APL", "name": "Dark Apple (Deluxe 10ml)", "rack": "Rack B1", "stock": 20, "line": "Deluxe Edition", "size_ml": 10, "regular_price": 12.9, "sale_price": 11.4},
  "LF-10D-SAK": {"sku": "LF-10D-SAK", "name": "Snowy Sakura (Deluxe 10ml)", "rack": "Rack B2", "stock": 20, "line": "Deluxe Edition", "size_ml": 10, "regular_price": 12.9, "sale_price": 11.4},
  "LF-10D-FRO": {"sku": "LF-10D-FRO", "name": "Frosty Dew (Deluxe 10ml)", "rack": "Rack B3", "stock": 20, "line": "Deluxe Edition", "size_ml": 10, "regular_price": 12.9, "sale_price": 11.4},
  "LF-50S-SEA": {"sku": "LF-50S-SEA", "name": "Breezy Sea (Signature 50ml)", "rack": "Rack C1", "stock": 10, "line": "Signature", "size_ml": 50, "regular_price": 26.99, "sale_price": 15.34},
  "LF-50S-MIX": {"sku": "LF-50S-MIX", "name": "Mix Fruit (Signature 50ml)", "rack": "Rack C2", "stock": 10, "line": "Signature", "size_ml": 50, "regular_price": 26.99, "sale_price": 15.34},
  "LF-50S-GUM": {"sku": "LF-50S-GUM", "name": "Sweet Gummy (Signature 50ml)", "rack": "Rack C3", "stock": 10, "line": "Signature", "size_ml": 50, "regular_price": 26.99, "sale_price": 15.34},
  "LF-50S-VAN": {"sku": "LF-50S-VAN", "name": "Vanilla Ice (Signature 50ml)", "rack": "Rack C4", "stock": 10, "line": "Signature", "size_ml": 50, "regular_price": 26.99, "sale_price": 15.34},
  "LF-50S-FLO": {"sku": "LF-50S-FLO", "name": "Warm Floral (Signature 50ml)", "rack": "Rack C5", "stock": 10, "line": "Signature", "size_ml": 50, "regular_price": 26.99, "sale_price": 15.34},
  "LF-50D-APL": {"sku": "LF-50D-APL", "name": "Dark Apple (Deluxe 50ml)", "rack": "Rack D1", "stock": 10, "line": "Deluxe Edition", "size_ml": 50, "regular_price": 29.9, "sale_price": 28.4},
  "LF-50D-SAK": {"sku": "LF-50D-SAK", "name": "Snowy Sakura (Deluxe 50ml)", "rack": "Rack D2", "stock": 10, "line": "Deluxe Edition", "size_ml": 50, "regular_price": 29.9, "sale_price": 28.4},
  "LF-50D-FRO": {"sku": "LF-50D-FRO", "name": "Frosty Dew (Deluxe 50ml)", "rack": "Rack D3", "stock": 10, "line": "Deluxe Edition", "size_ml": 50, "regular_price": 29.9, "sale_price": 28.4}
};

let inventoryDB = JSON.parse(localStorage.getItem("lexofrag_db_v2")) || structuredClone(DEFAULT_INVENTORY);

// Pages register a callback to repaint when the inventory changes.
const inventoryListeners = [];
function onInventoryChange(fn) { inventoryListeners.push(fn); }

function persistDB() {
  if (!apiOnline) localStorage.setItem("lexofrag_db_v2", JSON.stringify(inventoryDB));
  inventoryListeners.forEach(fn => fn());
}

// -----------------------------------------------------------------------------
// ORDERS STATE
// -----------------------------------------------------------------------------
let ordersDB = JSON.parse(localStorage.getItem("lexofrag_orders") || "[]");

function persistOrders() {
  if (!apiOnline) localStorage.setItem("lexofrag_orders", JSON.stringify(ordersDB));
}

function updateOrdersBadge() {
  const badge = document.getElementById("orders-badge");
  if (!badge) return;
  const newCount = ordersDB.filter(o => o.status === "New").length;
  badge.textContent = newCount;
  badge.classList.toggle("hidden", newCount === 0);
}

// Refresh ordersDB from the server (when online) and update the nav badge.
async function fetchOrders() {
  if (apiOnline) {
    try { ordersDB = (await api("orders")).orders; } catch (e) {}
  }
  updateOrdersBadge();
}

// -----------------------------------------------------------------------------
// AUDIT LOG (offline mode only — online, the database records it).
// Kept in localStorage so entries written on one page show on the Stock Audit page.
// -----------------------------------------------------------------------------
const AUDIT_KEY = "lexofrag_audit";

function getOfflineAudit() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch (e) { return []; }
}

function addAuditEntry(sku, oldVal, newVal, diff) {
  const rows = getOfflineAudit();
  rows.unshift({
    sku, old_stock: oldVal, new_stock: newVal, diff,
    actor: currentUser ? currentUser.name : "Staff",
    time_label: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
  localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 50)));
}

function clearOfflineAudit() { localStorage.removeItem(AUDIT_KEY); }

// -----------------------------------------------------------------------------
// PAGE BOOTSTRAP
//   withSession=false : storefront pages (catalogue only)
//   withSession=true  : login / Ops pages (also restores the signed-in user)
// -----------------------------------------------------------------------------
async function initData({ withSession = false } = {}) {
  await ensureBackendChecked();
  if (!apiOnline) return;
  try {
    const pub = await api("public_catalog");
    inventoryDB = {};
    pub.products.forEach(p => { inventoryDB[p.sku] = p; });
  } catch (e) {}
  if (!withSession) return;
  try {
    currentUser = (await api("me")).user;
    if (currentUser) await syncFromServer();
  } catch (e) { currentUser = null; }
  if (currentUser) sessionStorage.setItem("lexofrag_user", JSON.stringify(currentUser));
  else sessionStorage.removeItem("lexofrag_user");
}

// -----------------------------------------------------------------------------
// PWA service worker
// -----------------------------------------------------------------------------
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
