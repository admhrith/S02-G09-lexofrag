/* =============================================================================
   LexoFrag — shared page chrome
   The storefront header/footer/drawers and the Ops header/nav are identical on
   every page of their area, so they live here once and are injected into the
   page skeleton. Pages only contain their own content.
   ============================================================================= */

const STORE_HEADER_HTML = `
    <header id="store-header" class="is-hero z-30 px-5 sm:px-8 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <!-- Left: Byredo-style MENU trigger -->
        <button
          type="button"
          onclick="toggleMenuDrawer(true)"
          class="hero-bar-btn flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.18em] cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />
          </svg>
          <span>Menu</span>
        </button>

        <!-- Center: Compact Brand Link (shown when header is solid) -->
        <a id="header-compact-brand" href="index.html" class="hidden text-xs sm:text-sm font-medium tracking-[0.34em] uppercase text-slate-900 cursor-pointer">
          LEXOFRAG.
        </a>

        <!-- Right: CART (0) -->
        <button
          type="button"
          onclick="toggleBagDrawer(true)"
          class="hero-bar-btn text-[11px] font-medium uppercase tracking-[0.18em] cursor-pointer">
          Cart (<span id="bag-count">0</span>)
        </button>
      </div>
    </header>
`;

const STORE_FOOTER_HTML = `
    <footer class="border-t border-slate-200 bg-white px-4 sm:px-8 py-8">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          <span class="font-medium tracking-[0.26em] uppercase text-slate-900">LEXOFRAG.</span>
          <span class="block sm:inline sm:ml-3">Heat-Resistant Automotive Fragrances • Malaysia</span>
        </div>
        <div class="flex items-center gap-6">
          <a href="index.html" class="hover:text-slate-900 cursor-pointer">Home</a>
          <a href="shop.html" class="hover:text-slate-900 cursor-pointer">Shop</a>
          <a href="about.html" class="hover:text-slate-900 cursor-pointer">About</a>
          <a href="login.html" class="text-slate-700 underline underline-offset-4 hover:text-blue-700 cursor-pointer">
            Admin &amp; Owner Access
          </a>
        </div>
      </div>
    </footer>
`;

/* Menu drawer + product-detail modal + shopping-bag drawer (shared by all storefront pages) */
const STORE_OVERLAYS_HTML = `
  <div id="menu-drawer" class="hidden fixed inset-0 z-50 drawer-backdrop justify-start">
    <div class="w-full max-w-sm bg-white h-full border-r border-slate-200 flex flex-col justify-between p-6 sm:p-8">
      <div>
        <div class="flex items-center justify-between pb-6 border-b border-slate-200">
          <span class="text-xs font-medium tracking-[0.34em] uppercase text-slate-900">LEXOFRAG.</span>
          <button type="button" onclick="toggleMenuDrawer(false)" class="text-slate-500 hover:text-slate-900 text-lg cursor-pointer">✕</button>
        </div>

        <nav class="mt-8 flex flex-col space-y-5" aria-label="Primary Menu">
          <a href="index.html" class="text-left text-2xl font-light text-slate-900 hover:text-blue-700 transition cursor-pointer">
            Home
          </a>
          <a href="shop.html" class="text-left text-2xl font-light text-slate-900 hover:text-blue-700 transition cursor-pointer">
            Shop All
          </a>
          <a href="shop.html?filter=Signature" class="text-left text-base font-light text-slate-600 hover:text-slate-900 pl-3 border-l border-slate-200 cursor-pointer">
            Signature 50ml
          </a>
          <a href="shop.html?filter=Deluxe%20Edition" class="text-left text-base font-light text-slate-600 hover:text-slate-900 pl-3 border-l border-slate-200 cursor-pointer">
            Deluxe Edition
          </a>
          <a href="shop.html?filter=Classic%20Edition" class="text-left text-base font-light text-slate-600 hover:text-slate-900 pl-3 border-l border-slate-200 cursor-pointer">
            Classic 10ml
          </a>
          <a href="about.html" class="text-left text-2xl font-light text-slate-900 hover:text-blue-700 transition cursor-pointer pt-2">
            About Us
          </a>
        </nav>
      </div>

      <div class="pt-6 border-t border-slate-200">
        <span class="block text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Internal Operations</span>
        <a href="login.html" class="btn btn-ghost btn-sm w-full">
          Admin &amp; Owner Portal
        </a>
      </div>
    </div>
  </div>

  <div id="product-detail-modal" class="hidden fixed inset-0 z-50 drawer-backdrop items-center justify-center p-4">
    <div class="w-full max-w-2xl bg-white border border-slate-200 overflow-hidden">
      <div class="grid grid-cols-1 sm:grid-cols-2">
        <div id="pdp-media" class="aspect-square sm:aspect-auto bg-[#f5f5f2] border-b sm:border-b-0 sm:border-r border-slate-200 min-h-[260px]"></div>
        <div class="p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2 mb-3">
              <span id="pdp-line" class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Signature • 50ml</span>
              <button type="button" onclick="closeProductDetail()" class="text-slate-500 hover:text-slate-900 text-lg leading-none cursor-pointer">✕</button>
            </div>
            <h3 id="pdp-name" class="text-2xl font-light normal-case tracking-normal text-slate-900 mb-2">Breezy Sea</h3>
            <div class="flex items-baseline gap-2.5 mb-4">
              <span id="pdp-price" class="text-lg font-medium text-blue-700">RM 15.34</span>
              <span id="pdp-regular" class="text-xs text-slate-400 line-through">RM 26.99</span>
            </div>
            <p id="pdp-desc" class="text-xs text-slate-600 leading-relaxed mb-4"></p>
            <p id="pdp-stock" class="text-[11px] uppercase tracking-[0.12em] text-slate-500 mb-6"></p>
          </div>
          <div class="space-y-2">
            <button id="pdp-add-btn" type="button" class="btn btn-primary w-full py-3">Add to Bag</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="bag-drawer" class="hidden fixed inset-0 z-50 drawer-backdrop justify-end">
    <div class="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col overflow-y-auto">
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <span class="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Storefront</span>
          <h3 class="text-sm font-medium">Shopping Bag</h3>
        </div>
        <button type="button" onclick="toggleBagDrawer(false)" class="text-slate-500 hover:text-slate-900 text-lg cursor-pointer">✕</button>
      </div>

      <div class="p-6 flex-1 space-y-6">
        <div id="bag-feedback" class="hidden p-3 border text-xs font-medium"></div>

        <div>
          <ul id="bag-items-list" class="divide-y divide-slate-200"></ul>

          <!-- SULAM Charity Round-Up Menu -->
          <div id="sulam-donation-box" class="mt-4 pt-4 border-t border-slate-200">
            <div class="flex items-center justify-between mb-2">
              <span class="block text-[10px] uppercase tracking-[0.16em] font-medium text-slate-900">
                SULAM Charity Round-Up
              </span>
              <span id="sulam-amount-label" class="text-xs font-medium text-blue-700">+ RM 0.00</span>
            </div>
            <p class="text-[11px] text-slate-500 mb-2.5">
              Optional community contribution added to your order total before payment.
            </p>
            <div id="sulam-options" class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="SULAM Charity Donation">
              <button type="button" data-sulam="none" aria-pressed="true" onclick="setSulamOption('none')" class="btn btn-ghost btn-sm text-center">
                No, thanks
              </button>
              <button type="button" data-sulam="0.50" aria-pressed="false" onclick="setSulamOption('0.50')" class="btn btn-ghost btn-sm text-center">
                50 Sen (+RM 0.50)
              </button>
              <button type="button" data-sulam="1.00" aria-pressed="false" onclick="setSulamOption('1.00')" class="btn btn-ghost btn-sm text-center">
                RM 1 (+RM 1.00)
              </button>
              <button type="button" id="sulam-nearest-btn" data-sulam="nearest" aria-pressed="false" onclick="setSulamOption('nearest')" class="btn btn-ghost btn-sm text-center">
                Nearest RM (+RM 0.00)
              </button>
            </div>
          </div>

          <!-- Subtotal, Donation & Final Total -->
          <div class="pt-4 mt-4 border-t border-slate-900 space-y-1.5">
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span>Subtotal</span>
              <span id="bag-subtotal">RM 0.00</span>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-600">
              <span>SULAM Charity Donation</span>
              <span id="bag-donation">RM 0.00</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-200">
              <span class="text-xs uppercase tracking-[0.14em] font-medium text-slate-900">Total Payable</span>
              <span id="bag-total" class="text-lg font-medium text-slate-900">RM 0.00</span>
            </div>
          </div>
        </div>

        <form id="bag-checkout-form" onsubmit="handleCustomerCheckout(event)" class="space-y-4 pt-4 border-t border-slate-200">          <span class="block text-[11px] uppercase tracking-[0.16em] font-medium text-slate-900">Delivery Details</span>
          <div>
            <label class="block text-xs text-slate-600 mb-1">Full Name</label>
            <input id="cust-name" type="text" required placeholder="e.g. Aina Sofea" class="w-full py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">Phone / WhatsApp</label>
            <input id="cust-phone" type="text" required placeholder="e.g. 012-345 6789" class="w-full py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">Delivery Address</label>
            <input id="cust-address" type="text" required placeholder="Street, city, postcode, state" class="w-full py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">Order Notes (Optional)</label>
            <input id="cust-notes" type="text" placeholder="e.g. Leave at guardhouse" class="w-full py-2 text-sm" />
          </div>
          <button type="submit" class="btn btn-primary w-full py-3.5">Complete Order</button>
        </form>
      </div>
    </div>
  </div>
`;

function mountStoreChrome() {
  const shell = document.getElementById("storefront-shell");
  shell.insertAdjacentHTML("afterbegin", STORE_HEADER_HTML);
  shell.insertAdjacentHTML("beforeend", STORE_FOOTER_HTML);
  document.body.insertAdjacentHTML("beforeend", STORE_OVERLAYS_HTML);
}

const OPS_HEADER_HTML = `
    <header class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3">
      <div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <img src="images/logo.png" alt="LexoFrag logo" class="w-9 h-9 rounded-full" />
          <div>
            <h1 class="text-sm sm:text-base font-bold tracking-tight text-slate-900">LexoFrag Ops</h1>
            <p class="text-[11px] text-slate-500 hidden sm:block">Storeroom Barcode Audit, Stock &amp; Orders</p>
          </div>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="index.html" class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 transition cursor-pointer">
            Storefront
          </a>
          <div class="text-right">
            <p id="nav-user-name" class="text-xs font-semibold text-slate-800">Encik Saif</p>
            <span id="nav-user-role" class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Owner
            </span>
          </div>
          <button
            type="button"
            onclick="handleLogout()"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition cursor-pointer">
            Logout
          </button>
        </div>
      </div>
    </header>
`;

/* Workspace navigation: real links between the Ops pages (was in-page tabs). */
function opsNavHTML(active) {
  const tab = (key, href, label, extra) =>
    `<a id="tab-btn-${key}" href="${href}" class="tab-btn" aria-selected="${key === active}"${key === active ? ' aria-current="page"' : ""}>${label}${extra || ""}</a>`;
  return `<nav class="flex gap-6 border-b border-slate-200" aria-label="Workspace">` +
    tab("inventory", "dashboard.html", "Stock Audit") +
    tab("orders", "orders.html", "Orders ", `<span id="orders-badge" class="hidden tab-badge">0</span>`) +
    `</nav>`;
}

function mountOpsChrome(active) {
  const app = document.getElementById("app-view");
  app.insertAdjacentHTML("afterbegin", OPS_HEADER_HTML);
  document.querySelector("#app-view > main").insertAdjacentHTML("afterbegin", opsNavHTML(active));
}

/* Called once the signed-in user is known. */
function fillOpsHeader() {
  document.getElementById("nav-user-name").textContent = currentUser.name;
  document.getElementById("nav-user-role").textContent = currentUser.role;
}
