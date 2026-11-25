/* =============================================================================
   LexoFrag Ops — Orders page (orders.html)
   Order capture, order book, status flow. State lives in common.js.
   ============================================================================= */

// ORDER MANAGEMENT (TikTok Shop / COD / Direct Message / Website)
// =========================================================================
const NEXT_STATUS = { New: "Packed", Packed: "Shipped", Shipped: "Delivered" };
const ORDER_FILTERS = ["All", "New", "Packed", "Shipped", "Delivered", "Cancelled"];
let orderDraft = [];
let orderFilter = "All";

async function loadOrders() {
  await fetchOrders();
  renderOrders();
  renderOrderSelect();
}

function showOrderFeedback(message, isError) {
  const box = document.getElementById("order-feedback");
  box.textContent = message;
  box.className = "p-3 rounded-xl text-xs font-semibold border " +
    (isError ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200");
}

function renderOrderSelect() {
  const sel = document.getElementById("order-sku-select");
  const keep = sel.value;
  sel.innerHTML = Object.values(inventoryDB).map(p =>
    `<option value="${esc(p.sku)}" ${p.stock < 1 ? "disabled" : ""}>${esc(p.name)} — ${RM(p.sale_price)} · ${p.stock} left</option>`
  ).join("");
  if (keep && inventoryDB[keep]) sel.value = keep;
}

function addDraftLine(sku, qty) {
  const p = inventoryDB[sku];
  if (!p) return;
  const existing = orderDraft.find(l => l.sku === sku && l.price === p.sale_price);
  if (existing) existing.qty += qty;
  else orderDraft.push({ sku, qty, price: p.sale_price });
}

function addOrderLine() {
  const sku = document.getElementById("order-sku-select").value;
  const qty = parseInt(document.getElementById("order-qty").value, 10) || 0;
  if (!sku || qty < 1) return showOrderFeedback("Pick a fragrance and a quantity of at least 1.", true);
  addDraftLine(sku, qty);
  document.getElementById("order-qty").value = 1;
  document.getElementById("order-feedback").classList.add("hidden");
  renderOrderLines();
}

function addCombo(size) {
  const deluxe = Object.values(inventoryDB).filter(p => p.line === "Deluxe Edition" && p.size_ml === size);
  if (!deluxe.length) return showOrderFeedback(`No Deluxe ${size}ml SKUs found for the combo.`, true);
  deluxe.forEach(p => addDraftLine(p.sku, 1));
  document.getElementById("order-feedback").classList.add("hidden");
  renderOrderLines();
}

function updateOrderLine(i, field, value) {
  const line = orderDraft[i];
  if (!line) return;
  if (field === "qty") line.qty = Math.max(1, parseInt(value, 10) || 1);
  else line.price = Math.max(0, parseFloat(value) || 0);
  renderOrderLines();
}

function removeOrderLine(i) { orderDraft.splice(i, 1); renderOrderLines(); }

function renderOrderLines() {
  const ul = document.getElementById("order-lines");
  ul.innerHTML = orderDraft.length ? orderDraft.map((l, i) => {
    const p = inventoryDB[l.sku] || { name: l.sku };
    return `
      <li class="flex items-center gap-2 py-2 border-b border-slate-100">
        <div class="flex-1 min-w-0">
          <span class="block text-xs font-semibold text-slate-800 truncate">${esc(p.name)}</span>
          <span class="block text-[11px] text-slate-400 font-mono">${esc(l.sku)}</span>
        </div>
        <input type="number" min="1" value="${l.qty}" onchange="updateOrderLine(${i}, 'qty', this.value)" aria-label="Quantity" class="w-12 text-center text-sm" />
        <input type="number" min="0" step="0.01" value="${l.price.toFixed(2)}" onchange="updateOrderLine(${i}, 'price', this.value)" aria-label="Unit price in RM" class="w-16 text-right text-sm" />
        <button type="button" onclick="removeOrderLine(${i})" aria-label="Remove item" class="px-1 text-slate-400 hover:text-red-600 cursor-pointer">✕</button>
      </li>`;
  }).join("") : '<li class="py-3 text-center text-xs text-slate-400">No items yet. Pick a fragrance above.</li>';
  document.getElementById("order-total").textContent = RM(orderDraft.reduce((t, l) => t + l.qty * l.price, 0));
}

async function handlePlaceOrder(event) {
  event.preventDefault();
  if (!isOwnerUser()) return;
  if (!orderDraft.length) return showOrderFeedback("Add at least one item to the order.", true);

  const order = {
    customer_name: document.getElementById("order-customer").value.trim(),
    phone: document.getElementById("order-phone").value.trim(),
    address: document.getElementById("order-address").value.trim(),
    channel: document.getElementById("order-channel").value,
    notes: document.getElementById("order-notes").value.trim(),
    items: orderDraft.map(l => ({ sku: l.sku, qty: l.qty, price: l.price }))
  };
  let orderNo;

  if (apiOnline) {
    try {
      orderNo = (await api("order_create", order)).order_no;
      await syncFromServer();
    } catch (e) { return showOrderFeedback(e.message, true); }
  } else {
    const need = {};
    order.items.forEach(i => { need[i.sku] = (need[i.sku] || 0) + i.qty; });
    for (const sku in need) {
      const have = inventoryDB[sku] ? inventoryDB[sku].stock : null;
      if (have === null) return showOrderFeedback("SKU not found.", true);
      if (have < need[sku]) return showOrderFeedback(`Not enough stock for ${sku} (${have} left).`, true);
    }
    for (const sku in need) {
      const old = inventoryDB[sku].stock;
      inventoryDB[sku].stock = old - need[sku];
      addAuditEntry(sku, old, old - need[sku], -need[sku]);
    }
    const id = ordersDB.reduce((m, o) => Math.max(m, o.id), 0) + 1;
    orderNo = "ORD-" + String(id).padStart(5, "0");
    ordersDB.unshift({
      id, order_no: orderNo, customer_name: order.customer_name, phone: order.phone, address: order.address,
      channel: order.channel, status: "New", notes: order.notes,
      total: order.items.reduce((t, i) => t + i.qty * i.price, 0),
      staff: currentUser.name,
      time_label: new Date().toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      items: order.items.map(i => ({ sku: i.sku, name: inventoryDB[i.sku].name, qty: i.qty, unit_price: i.price }))
    });
    persistOrders();
    persistDB();
  }

  event.target.reset();
  orderDraft = [];
  renderOrderSelect();
  renderOrderLines();
  await loadOrders();
  showOrderFeedback(`Order ${orderNo} placed. Stock deducted.`, false);
}

async function setOrderStatus(id, status) {
  id = Number(id);
  const order = ordersDB.find(o => o.id === id);
  if (!order) return;
  if (status === "Cancelled" && !confirm(`Cancel ${order.order_no} and return its items to stock?`)) return;

  if (apiOnline) {
    try {
      await api("order_status", { id, status });
      await syncFromServer();
    } catch (e) { return showOrderFeedback(e.message, true); }
  } else {
    if (order.status === "Cancelled") return showOrderFeedback("Cancelled orders cannot be changed.", true);
    if (status === "Cancelled") {
      if (!isOwnerUser()) return showOrderFeedback("Owner access required to cancel orders.", true);
      if (order.status === "Delivered") return showOrderFeedback("Delivered orders cannot be cancelled.", true);
      order.items.forEach(i => {
        if (!inventoryDB[i.sku]) return;
        const old = inventoryDB[i.sku].stock;
        inventoryDB[i.sku].stock = old + i.qty;
        addAuditEntry(i.sku, old, old + i.qty, i.qty);
      });
      persistDB();
    }
    order.status = status;
    persistOrders();
  }
  await loadOrders();
  showOrderFeedback(`${order.order_no} is now ${status}.` + (status === "Cancelled" ? " Stock returned." : ""), false);
}

function setOrderFilter(f) { orderFilter = f; renderOrders(); }

function renderOrders() {
  const counted = ordersDB.filter(o => o.status !== "Cancelled");
  document.getElementById("stat-open").textContent = ordersDB.filter(o => ["New", "Packed", "Shipped"].includes(o.status)).length;
  document.getElementById("stat-orders").textContent = counted.length;
  document.getElementById("stat-sales").textContent = RM(counted.reduce((t, o) => t + o.total, 0));

  updateOrdersBadge();

  document.getElementById("order-filters").innerHTML = ORDER_FILTERS.map(f =>
    `<button type="button" data-f="${f}" aria-pressed="${f === orderFilter}" onclick="setOrderFilter(this.dataset.f)" class="btn btn-ghost btn-sm">${f}</button>`
  ).join("");

  const shown = orderFilter === "All" ? ordersDB : ordersDB.filter(o => o.status === orderFilter);
  const list = document.getElementById("orders-list");
  if (!shown.length) {
    list.innerHTML = '<li class="py-6 text-center text-xs text-slate-400">No orders here yet.</li>';
    return;
  }
  list.innerHTML = shown.map(o => {
    const next = NEXT_STATUS[o.status];
    const canCancel = isOwnerUser() && ["New", "Packed", "Shipped"].includes(o.status);
    const items = o.items.map(i =>
      `<li class="flex justify-between gap-3"><span>${i.qty}× ${esc(i.name)}</span><span class="text-slate-500">${RM(i.qty * i.unit_price)}</span></li>`).join("");
    return `
      <li class="border border-slate-200 rounded-xl p-3.5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="font-mono font-semibold text-sm text-blue-700">${esc(o.order_no)}</span>
            <span class="text-[11px] text-slate-400 ml-1">${esc(o.time_label)} · ${esc(o.channel)} · ${esc(o.staff)}</span>
          </div>
          <span class="order-status inline-block px-2 py-0.5 text-[11px] font-semibold border" data-status="${esc(o.status)}">${esc(o.status)}</span>
        </div>
        <p class="mt-2 text-sm font-semibold text-slate-900">${esc(o.customer_name)}
          ${o.phone ? `<a href="tel:${esc(o.phone)}" class="order-link ml-1 text-xs font-medium">${esc(o.phone)}</a>` : ""}</p>
        ${o.address ? `<p class="text-xs text-slate-500">${esc(o.address)}</p>` : ""}
        ${o.notes ? `<p class="text-xs text-slate-500 italic">${esc(o.notes)}</p>` : ""}
        <ul class="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1 text-xs text-slate-700">${items}</ul>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-bold text-slate-900">${RM(o.total)}</span>
          <div class="flex gap-2">
            ${next ? `<button type="button" data-id="${o.id}" data-status="${next}" onclick="setOrderStatus(this.dataset.id, this.dataset.status)" class="btn btn-primary btn-sm">Mark ${next}</button>` : ""}
            ${canCancel ? `<button type="button" data-id="${o.id}" data-status="Cancelled" onclick="setOrderStatus(this.dataset.id, this.dataset.status)" class="btn btn-danger btn-sm">Cancel</button>` : ""}
          </div>
        </div>
      </li>`;
  }).join("");
}

// -----------------------------------------------------------------------------
// PAGE INIT
// -----------------------------------------------------------------------------
(async () => {
  mountOpsChrome("orders");
  if (!(await requireLogin())) return;
  fillOpsHeader();

  const isOwner = isOwnerUser();
  document.getElementById("new-order-card").classList.toggle("hidden", !isOwner);
  const listCard = document.getElementById("orders-list-card");
  listCard.classList.toggle("lg:col-span-12", !isOwner);
  listCard.classList.toggle("lg:col-span-7", isOwner);

  renderOrderSelect();
  renderOrderLines();
  await loadOrders();
})();
