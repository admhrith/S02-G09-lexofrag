/* =============================================================================
   LexoFrag — storefront (index.html, shop.html, about.html)
   Header chrome, catalogue, product modal, shopping bag, SULAM round-up, checkout.
   ============================================================================= */

// =========================================================================
// COMMERCIAL STOREFRONT LOGIC (BYREDO HERO, MENU, SHOP, ABOUT, BAG)
// =========================================================================
const PRODUCT_IMAGES = {
  "LF-10C-MIX": "images/CE_Mixed_Fruit.jpeg",
  "LF-10C-VAN": "images/CE_Vanilla_Ice.jpeg",
  "LF-10C-GUM": "images/CE_Sweet_Gummy.jpeg",
  "LF-50S-SEA": "images/Breezy_Sea.jpeg",
  "LF-50S-MIX": "images/Mixed_Fruit.jpeg",
  "LF-50S-VAN": "images/Vanilla_Ice.jpeg",
  "LF-50S-FLO": "images/Warm_Floral.jpeg",
  "LF-50S-GUM": "images/Sweet_Gummy.jpeg"
};

const SCENT_NOTES = {
  "LF-50S-SEA": "Crisp marine air, coastal salt mist, and clean mineral wood.",
  "LF-50S-MIX": "Sun-ripened tropical orchard fruits balanced with a light citrus lift.",
  "LF-50S-VAN": "Creamy Madagascar vanilla bean tempered for warm cabin conditions.",
  "LF-50S-FLO": "Velvety white petals, soft amber warmth, and subtle musk.",
  "LF-50S-GUM": "Playful berry-sugar accord with a clean, lingering finish."
};

const storePage = document.body.dataset.page || "home";
const SHOP_FILTERS = ["All", "Signature", "Deluxe Edition", "Classic Edition", "10", "50"];
// The shop page reads its starting filter from the link, e.g. shop.html?filter=Signature
let shopFilter = (() => {
  const f = new URLSearchParams(window.location.search).get("filter");
  return SHOP_FILTERS.includes(f) ? f : "All";
})();
let shoppingBag = JSON.parse(localStorage.getItem("lexofrag_bag") || "[]");
let sulamOption = "none";

function getBagSubtotal() {
  return shoppingBag.reduce((sum, item) => {
    const p = inventoryDB[item.sku];
    return sum + (p ? p.sale_price * item.qty : 0);
  }, 0);
}

function getNearestRinggitAmount(subtotal) {
  if (subtotal <= 0) return 0;
  const frac = Number((subtotal - Math.floor(subtotal)).toFixed(2));
  return frac === 0 ? 1.00 : Number((1 - frac).toFixed(2));
}

function getSulamDonation(subtotal) {
  if (subtotal <= 0 || sulamOption === "none") return 0;
  if (sulamOption === "0.50") return 0.50;
  if (sulamOption === "1.00") return 1.00;
  if (sulamOption === "nearest") return getNearestRinggitAmount(subtotal);
  return 0;
}

function setSulamOption(opt) {
  sulamOption = opt;
  renderBagDrawer();
}

function initHeroCarousel() {
  const carousel = document.getElementById("hero-carousel");
  const track = document.getElementById("hero-track");
  if (!carousel || !track) return;

  const slides = Array.from(track.querySelectorAll(".hero-slide"));
  const dots = Array.from(document.querySelectorAll("#hero-dots .hero-dot"));
  const prevBtn = document.getElementById("hero-prev-btn");
  const nextBtn = document.getElementById("hero-next-btn");
  const playToggle = document.getElementById("hero-play-toggle");
  const iconPause = document.getElementById("hero-icon-pause");
  const iconPlay = document.getElementById("hero-icon-play");

  let current = 0;
  let isPlaying = true;
  let timer = null;
  const DURATION = 5000;

  function getStepWidth() {
    const slideWidth = slides[0].offsetWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    return slideWidth + gap;
  }

  function applyOffset(extraPx = 0) {
    const baseOffset = -current * getStepWidth();
    track.style.transform = `translate3d(${baseOffset + extraPx}px, 0, 0)`;
  }

  function renderSlide(index) {
    current = (index + slides.length) % slides.length;
    applyOffset(0);

    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === current);
    });

    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
      const fill = dot.querySelector(".hero-dot-fill");
      if (fill) {
        fill.style.animation = "none";
        void fill.offsetWidth;
        fill.style.animation = "";
      }
    });

    restartTimer();
  }

  function restartTimer() {
    clearInterval(timer);
    if (!isPlaying) return;
    timer = setInterval(() => renderSlide(current + 1), DURATION);
  }

  function setPlaying(state) {
    isPlaying = state;
    carousel.classList.toggle("is-paused", !isPlaying);
    iconPause.classList.toggle("hidden", !isPlaying);
    iconPlay.classList.toggle("hidden", isPlaying);
    playToggle.setAttribute("aria-label", isPlaying ? "Pause campaign autoplay" : "Play campaign autoplay");
    if (isPlaying) renderSlide(current);
    else clearInterval(timer);
  }

  if (prevBtn) prevBtn.addEventListener("click", () => renderSlide(current - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => renderSlide(current + 1));

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => renderSlide(i));
  });

  playToggle.addEventListener("click", () => setPlaying(!isPlaying));

  // Real-time interactive pointer drag / touch swipe
  let isDragging = false;
  let startX = 0;
  let deltaX = 0;
  let didDrag = false;

  track.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    isDragging = true;
    didDrag = false;
    startX = e.clientX;
    deltaX = 0;
    track.classList.add("is-dragging");
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 6) didDrag = true;
    applyOffset(deltaX);
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    track.classList.remove("is-dragging");
    if (track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }

    const threshold = Math.min(80, getStepWidth() * 0.18);
    if (deltaX < -threshold) {
      renderSlide(current + 1);
    } else if (deltaX > threshold) {
      renderSlide(current - 1);
    } else {
      applyOffset(0);
    }
  }

  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  // Clicking a peeking adjacent slide focuses it (ignored if user just dragged)
  slides.forEach((slide, i) => {
    slide.addEventListener("click", (e) => {
      if (didDrag) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (i !== current) {
        e.stopPropagation();
        renderSlide(i);
      }
    });
  });

  // Keyboard Left/Right support when focused
  carousel.setAttribute("tabindex", "0");
  carousel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") renderSlide(current - 1);
    if (e.key === "ArrowRight") renderSlide(current + 1);
  });

  window.addEventListener("resize", () => applyOffset(0), { passive: true });

  renderSlide(0);
}

function updateHeaderChrome() {
  const hdr = document.getElementById("store-header");
  const compactBrand = document.getElementById("header-compact-brand");
  if (!hdr || !compactBrand) return;

  const onHeroTop = storePage === "home" && window.scrollY < window.innerHeight * 0.72;
  hdr.classList.toggle("is-hero", onHeroTop);
  hdr.classList.toggle("is-solid", !onHeroTop);
  compactBrand.classList.toggle("hidden", onHeroTop);
}

window.addEventListener("scroll", updateHeaderChrome, { passive: true });

function toggleMenuDrawer(show) {
  const drawer = document.getElementById("menu-drawer");
  if (show) {
    drawer.classList.remove("hidden");
    drawer.classList.add("flex");
  } else {
    drawer.classList.add("hidden");
    drawer.classList.remove("flex");
  }
}

function persistBag() {
  localStorage.setItem("lexofrag_bag", JSON.stringify(shoppingBag));
  updateBagBadge();
}

function updateBagBadge() {
  const count = shoppingBag.reduce((s, i) => s + i.qty, 0);
  document.getElementById("bag-count").textContent = count;
}

function setShopFilter(f) {
  shopFilter = f;
  renderShopGrid();
  // keep the address bar shareable without reloading
  if (window.history && history.replaceState) {
    history.replaceState(null, "", f === "All" ? window.location.pathname : `${window.location.pathname}?filter=${encodeURIComponent(f)}`);
  }
}

function productCardHTML(p) {
  const img = PRODUCT_IMAGES[p.sku];
  const soldOut = p.stock < 1;
  const mediaHTML = img
    ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />`
    : `<div class="product-media-blank" aria-hidden="true"></div>`;

  return `
    <article class="product-tile">
      <div onclick="openProductDetail('${esc(p.sku)}')" class="product-media cursor-pointer">
        ${mediaHTML}
      </div>
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div onclick="openProductDetail('${esc(p.sku)}')" class="cursor-pointer">
          <span class="block text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">${esc(p.line)} • ${p.size_ml}ml</span>
          <h4 class="text-sm font-medium text-slate-900 mb-1">${esc(p.name.replace(/\s*\(.*?\)\s*/, ""))}</h4>
          <div class="flex items-baseline gap-2 mb-4">
            <span class="text-sm font-medium text-blue-700">${RM(p.sale_price)}</span>
            ${p.regular_price > p.sale_price ? `<span class="text-[11px] text-slate-400 line-through">${RM(p.regular_price)}</span>` : ""}
          </div>
        </div>
        <button
          type="button"
          ${soldOut ? "disabled" : ""}
          onclick="addToBag('${esc(p.sku)}', 1)"
          class="btn ${soldOut ? 'btn-ghost opacity-40 cursor-not-allowed' : 'btn-ghost'} btn-sm w-full">
          ${soldOut ? "Out of Stock" : "Add to Bag"}
        </button>
      </div>
    </article>
  `;
}

function renderStorefront() {
  const items = Object.values(inventoryDB);

  const sigGrid = document.getElementById("home-signature-grid");
  if (sigGrid) {
    const sigItems = items.filter(p => p.line === "Signature");
    sigGrid.innerHTML = sigItems.map(productCardHTML).join("");
  }

  renderShopGrid();
  updateBagBadge();
}

function renderShopGrid() {
  const grid = document.getElementById("shop-catalog-grid");
  if (!grid) return;

  document.querySelectorAll("#shop-filters button").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === shopFilter));
  });

  const items = Object.values(inventoryDB);
  const filtered = items.filter(p => {
    if (shopFilter === "All") return true;
    if (shopFilter === "10" || shopFilter === "50") return String(p.size_ml) === shopFilter;
    return p.line === shopFilter;
  });

  grid.innerHTML = filtered.map(productCardHTML).join("");
}

function openProductDetail(sku) {
  const p = inventoryDB[sku];
  if (!p) return;
  const img = PRODUCT_IMAGES[p.sku];
  const mediaEl = document.getElementById("pdp-media");
  mediaEl.innerHTML = img
    ? `<img src="${esc(img)}" alt="${esc(p.name)}" class="w-full h-full object-cover" />`
    : `<div class="product-media-blank" aria-hidden="true"></div>`;

  document.getElementById("pdp-line").textContent = `${p.line} • ${p.size_ml}ml Vessel`;
  document.getElementById("pdp-name").textContent = p.name;
  document.getElementById("pdp-price").textContent = RM(p.sale_price);
  const reg = document.getElementById("pdp-regular");
  reg.textContent = p.regular_price > p.sale_price ? RM(p.regular_price) : "";
  document.getElementById("pdp-desc").textContent =
    SCENT_NOTES[p.sku] || `Heat-resistant liquid fragrance formulated for consistent diffusion in warm vehicle cabins (${p.size_ml}ml vessel).`;
  document.getElementById("pdp-stock").textContent =
    p.stock > 0 ? `In Stock — ${p.stock} units available` : "Currently Out of Stock";

  const addBtn = document.getElementById("pdp-add-btn");
  addBtn.disabled = p.stock < 1;
  addBtn.textContent = p.stock > 0 ? "Add to Bag" : "Out of Stock";
  addBtn.onclick = () => {
    addToBag(p.sku, 1);
    closeProductDetail();
  };

  const modal = document.getElementById("product-detail-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeProductDetail() {
  const modal = document.getElementById("product-detail-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function addToBag(sku, qty) {
  const p = inventoryDB[sku];
  if (!p || p.stock < 1) return;
  const existing = shoppingBag.find(i => i.sku === sku);
  const nextQty = (existing ? existing.qty : 0) + qty;
  if (nextQty > p.stock) {
    toggleBagDrawer(true);
    return showBagFeedback(`Only ${p.stock} units of ${p.name} left in stock.`, true);
  }
  if (existing) existing.qty = nextQty;
  else shoppingBag.push({ sku, qty: 1 });
  persistBag();
  document.getElementById("bag-feedback").classList.add("hidden");
  toggleBagDrawer(true);
}

function updateBagQty(sku, delta) {
  const idx = shoppingBag.findIndex(i => i.sku === sku);
  if (idx === -1) return;
  const p = inventoryDB[sku];
  const next = shoppingBag[idx].qty + delta;
  if (next <= 0) {
    shoppingBag.splice(idx, 1);
  } else if (p && next > p.stock) {
    return showBagFeedback(`Maximum available stock reached (${p.stock}).`, true);
  } else {
    shoppingBag[idx].qty = next;
  }
  persistBag();
  renderBagDrawer();
}

function toggleBagDrawer(show) {
  const drawer = document.getElementById("bag-drawer");
  if (show) {
    renderBagDrawer();
    drawer.classList.remove("hidden");
    drawer.classList.add("flex");
  } else {
    drawer.classList.add("hidden");
    drawer.classList.remove("flex");
  }
}

function showBagFeedback(msg, isError) {
  const box = document.getElementById("bag-feedback");
  box.textContent = msg;
  box.className = "p-3 border text-xs font-medium " +
    (isError ? "border-red-700 text-red-700 bg-red-50/40" : "border-slate-900 text-slate-900 bg-[#f5f5f2]");
  box.classList.remove("hidden");
}

function renderBagDrawer() {
  const list = document.getElementById("bag-items-list");
  let subtotal = 0;

  if (!shoppingBag.length) {
    list.innerHTML = '<li class="py-8 text-center text-xs text-slate-500">Your shopping bag is currently empty.</li>';
    document.getElementById("sulam-nearest-btn").textContent = "Nearest RM (+RM 0.00)";
    document.getElementById("sulam-amount-label").textContent = "+ RM 0.00";
    document.getElementById("bag-subtotal").textContent = RM(0);
    document.getElementById("bag-donation").textContent = RM(0);
    document.getElementById("bag-total").textContent = RM(0);
    document.querySelectorAll("#sulam-options button").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.sulam === sulamOption));
    });
    return;
  }

  list.innerHTML = shoppingBag.map(item => {
    const p = inventoryDB[item.sku];
    if (!p) return "";
    const lineTotal = p.sale_price * item.qty;
    subtotal += lineTotal;
    return `
      <li class="py-3.5 flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-slate-900 truncate">${esc(p.name)}</span>
          <span class="block text-[11px] text-slate-500">${RM(p.sale_price)} each</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="updateBagQty('${esc(p.sku)}', -1)" class="w-7 h-7 border border-slate-300 text-xs cursor-pointer">−</button>
          <span class="w-5 text-center text-xs font-medium">${item.qty}</span>
          <button type="button" onclick="updateBagQty('${esc(p.sku)}', 1)" class="w-7 h-7 border border-slate-300 text-xs cursor-pointer">+</button>
        </div>
        <span class="text-xs font-medium text-slate-900 w-16 text-right">${RM(lineTotal)}</span>
      </li>
    `;
  }).join("");

  const nearestAmt = getNearestRinggitAmount(subtotal);
  const donation = getSulamDonation(subtotal);
  const finalTotal = subtotal + donation;

  document.getElementById("sulam-nearest-btn").textContent = `Nearest RM (+${RM(nearestAmt)})`;
  document.getElementById("sulam-amount-label").textContent = `+ ${RM(donation)}`;
  document.getElementById("bag-subtotal").textContent = RM(subtotal);
  document.getElementById("bag-donation").textContent = RM(donation);
  document.getElementById("bag-total").textContent = RM(finalTotal);

  document.querySelectorAll("#sulam-options button").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.sulam === sulamOption));
  });
}

async function handleCustomerCheckout(event) {
  event.preventDefault();
  if (!shoppingBag.length) return showBagFeedback("Add at least one fragrance to your bag first.", true);

  const subtotal = getBagSubtotal();
  const donation = getSulamDonation(subtotal);
  const rawNotes = document.getElementById("cust-notes").value.trim();
  const sulamTag = donation > 0 ? `[SULAM Charity Donation: ${RM(donation)}]` : "";
  const combinedNotes = [rawNotes, sulamTag].filter(Boolean).join(" • ");

  const payload = {
    customer_name: document.getElementById("cust-name").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    address: document.getElementById("cust-address").value.trim(),
    notes: combinedNotes,
    donation: donation,
    items: shoppingBag.map(i => ({
      sku: i.sku,
      qty: i.qty,
      price: inventoryDB[i.sku] ? inventoryDB[i.sku].sale_price : 0
    }))
  };

  let orderNo;
  if (apiOnline) {
    try {
      orderNo = (await api("public_order", payload)).order_no;
      const pub = await api("public_catalog");
      inventoryDB = {};
      pub.products.forEach(p => { inventoryDB[p.sku] = p; });
    } catch (e) {
      return showBagFeedback(e.message, true);
    }
  } else {
    for (const it of payload.items) {
      const p = inventoryDB[it.sku];
      if (!p || p.stock < it.qty) {
        return showBagFeedback(`Not enough stock for ${it.sku}.`, true);
      }
    }
    for (const it of payload.items) {
      const old = inventoryDB[it.sku].stock;
      inventoryDB[it.sku].stock = old - it.qty;
      addAuditEntry(it.sku, old, old - it.qty, -it.qty);
    }
    const id = ordersDB.reduce((m, o) => Math.max(m, o.id), 0) + 1;
    orderNo = "ORD-" + String(id).padStart(5, "0");
    ordersDB.unshift({
      id,
      order_no: orderNo,
      customer_name: payload.customer_name,
      phone: payload.phone,
      address: payload.address,
      channel: "Website",
      status: "New",
      notes: payload.notes,
      total: payload.items.reduce((t, i) => t + i.qty * i.price, 0) + donation,
      staff: "Online Storefront",
      time_label: new Date().toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      items: payload.items.map(i => ({
        sku: i.sku,
        name: inventoryDB[i.sku].name,
        qty: i.qty,
        unit_price: i.price
      }))
    });
    persistOrders();
    persistDB();
  }

  shoppingBag = [];
  sulamOption = "none";
  persistBag();
  event.target.reset();
  renderBagDrawer();
  renderStorefront();
  const donationMsg = donation > 0 ? ` (includes ${RM(donation)} SULAM charity donation)` : "";
  showBagFeedback(`Thank you, ${payload.customer_name}. Order ${orderNo}${donationMsg} has been received and sent to our dispatch team.`, false);
}

// -----------------------------------------------------------------------------
// PAGE INIT
// -----------------------------------------------------------------------------
(async () => {
  mountStoreChrome();
  onInventoryChange(renderStorefront);
  initHeroCarousel();
  renderStorefront();            // paint immediately from the local catalogue…
  updateHeaderChrome();
  await initData();              // …then refresh from the server when it is available
  renderStorefront();
})();
