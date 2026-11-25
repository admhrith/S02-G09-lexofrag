/* =============================================================================
   LexoFrag Ops — Stock Audit page (dashboard.html)
   Scanner, SKU lookup, stock adjuster, rack list, add-SKU, audit log.
   ============================================================================= */

let activeSku = "LF-10C-VAN";
let html5QrCode = null;
let isScanning = false;
let lookupScrollEnabled = false;

function refreshInventoryUI() {
  const items = Object.values(inventoryDB);
  const totalSkus = items.length;
  const totalUnits = items.reduce((sum, item) => sum + item.stock, 0);
  const lowStockCount = items.filter(item => item.stock <= 5).length;

  document.getElementById("kpi-total-skus").textContent = totalSkus;
  document.getElementById("kpi-total-units").textContent = totalUnits;
  document.getElementById("kpi-low-stock").textContent = lowStockCount;

  const q = (document.getElementById("inv-filter").value || "").trim().toLowerCase();
  const shown = q ? items.filter(i => `${i.sku} ${i.name} ${i.rack}`.toLowerCase().includes(q)) : items;
  const tbody = document.getElementById("inventory-table-body");
  if (!shown.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400">No matching SKU.</td></tr>';
    return;
  }
  tbody.innerHTML = shown.map(item => {
    const isSelected = item.sku === activeSku;
    const stockBadge = item.stock <= 5
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
    return `
      <tr data-sku="${esc(item.sku)}" onclick="lookupBarcode(this.dataset.sku)" class="cursor-pointer transition ${isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'}">
        <td class="py-2.5 pr-2 font-mono font-semibold text-blue-700">${esc(item.sku)}</td>
        <td class="py-2.5 px-2 font-medium text-slate-800">${esc(item.name)}<span class="block text-[11px] text-slate-400">${RM(item.sale_price)}</span></td>
        <td class="py-2.5 px-2 text-slate-500">${esc(item.rack)}</td>
        <td class="py-2 pl-2 text-right">
          <span class="inline-block px-2 py-0.5 rounded-md font-bold border ${stockBadge}">${item.stock}</span>
        </td>
      </tr>
    `;
  }).join("");
}

async function resetDemoData() {
  if (!currentUser || currentUser.role !== "Owner") return;
  if (apiOnline) {
    try { await api("reset"); await syncFromServer(); } catch (e) { return showFeedback(e.message, true); }
    refreshInventoryUI();
  } else {
    inventoryDB = structuredClone(DEFAULT_INVENTORY);
    ordersDB = [];
    persistOrders();
    clearOfflineAudit();
    persistDB();
  }
  await lookupBarcode("LF-10C-VAN");
  await fetchOrders();
  document.getElementById("audit-log").innerHTML =
    '<li class="py-2 text-center text-slate-400">Demo database reset to initial quantities.</li>';
}

// =========================================================================
// ADD NEW SKU MODAL (OWNER FEATURE)
// =========================================================================
function toggleAddSkuModal(show) {
  const modal = document.getElementById("add-sku-modal");
  if (show) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  } else {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

async function handleAddNewSku(event) {
  event.preventDefault();
  if (!currentUser || currentUser.role !== "Owner") return;
  const code = document.getElementById("new-sku-code").value.trim().toUpperCase();
  const name = document.getElementById("new-sku-name").value.trim();
  const rack = document.getElementById("new-sku-rack").value.trim();
  const stock = parseInt(document.getElementById("new-sku-stock").value, 10) || 0;
  const line = document.getElementById("new-sku-line").value;
  const size_ml = parseInt(document.getElementById("new-sku-size").value, 10) || 10;
  const regular_price = parseFloat(document.getElementById("new-sku-regular").value) || 0;
  const sale_price = parseFloat(document.getElementById("new-sku-sale").value) || 0;

  if (apiOnline) {
    try {
      await api("add", { code, name, rack, stock, line, size_ml, regular_price, sale_price });
      await syncFromServer();
    } catch (e) { return showFeedback(e.message, true); }
    refreshInventoryUI();
  } else {
    inventoryDB[code] = { sku: code, name, rack, stock, line, size_ml, regular_price, sale_price };
    persistDB();
  }
  toggleAddSkuModal(false);
  event.target.reset();
  await lookupBarcode(code);
  showFeedback(`Added new SKU: ${code} (${stock} units).`, false);
}

// =========================================================================
// US01: BARCODE CAMERA SCANNER (MOBILE + LAPTOP/PC + FLIP + ERROR HANDLER)
// =========================================================================
let availableCameras = [];
let currentCameraIndex = -1;
let currentFacingMode = "environment";
let scanWatchdogTimer = null;
let lastDecodedTimestamp = 0;
let decodeErrorCount = 0;

function isMobileDevice() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

function setScannerHint(message, isWarning = false) {
  const alertBox = document.getElementById("camera-alert");
  if (!alertBox) return;
  if (!message) {
    alertBox.classList.add("hidden");
    return;
  }
  alertBox.textContent = message;
  alertBox.classList.remove("hidden");
  if (isWarning) {
    alertBox.classList.remove("bg-red-50", "text-red-700", "border-red-200");
    alertBox.classList.add("bg-amber-50", "text-amber-800", "border-amber-200");
  } else {
    alertBox.classList.remove("bg-amber-50", "text-amber-800", "border-amber-200");
    alertBox.classList.add("bg-red-50", "text-red-700", "border-red-200");
  }
}

function clearScannerWatchdog() {
  if (scanWatchdogTimer) {
    clearInterval(scanWatchdogTimer);
    scanWatchdogTimer = null;
  }
  decodeErrorCount = 0;
}

function startScannerWatchdog() {
  clearScannerWatchdog();
  lastDecodedTimestamp = Date.now();
  decodeErrorCount = 0;

  // Fires an informative diagnostic warning if scanning runs for >5s without detecting a barcode
  scanWatchdogTimer = setInterval(() => {
    if (!isScanning) return;
    const idleMs = Date.now() - lastDecodedTimestamp;
    if (idleMs >= 5000 && decodeErrorCount > 15) {
      setScannerHint(
        "No barcode detected yet: Hold the Code 128 label flat 15–25 cm from the camera with both white margins visible, avoid screen/plastic glare, or enter the SKU manually below.",
        true
      );
    }
  }, 2000);
}

function handleScanFrameError(errorMessage) {
  // Called by html5-qrcode on every frame where a barcode could not be decoded
  decodeErrorCount++;
  const msg = String(errorMessage || "");

  // Surface unexpected decoder/stream faults immediately rather than failing silently
  if (msg && !msg.includes("NotFoundException") && !msg.includes("No MultiFormat Readers")) {
    setScannerHint(`Scanner read error: ${msg}`, false);
  }
}

async function stopScannerInstance() {
  clearScannerWatchdog();
  if (html5QrCode) {
    try {
      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
    } catch (e) {}
  }
  isScanning = false;
}

async function startScannerStream(cameraTarget) {
  const isDesktop = !isMobileDevice();

  // Disable native BarcodeDetector on desktop Chromium where 1D Code 128 frequently hangs
  html5QrCode = new Html5Qrcode("reader", {
    verbose: false,
    experimentalFeatures: { useBarCodeDetectorIfSupported: !isDesktop },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13
    ]
  });

  let lastScan = "", lastTime = 0;

  const scanConfig = {
    fps: isDesktop ? 15 : 25,
    disableFlip: false,
    // Scan full frame on PC/laptop so wide 1D barcodes & quiet zones are never clipped;
    // keep targeted scan box on mobile.
    ...(isDesktop
      ? {}
      : {
          qrbox: (vw, vh) => ({
            width: Math.floor(vw * 0.9),
            height: Math.max(80, Math.floor(vh * 0.3))
          })
        }),
    videoConstraints: typeof cameraTarget === "string"
      ? {
          deviceId: { exact: cameraTarget },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      : {
          facingMode: { ideal: cameraTarget.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
  };

  await html5QrCode.start(
    cameraTarget,
    scanConfig,
    (decodedText) => {
      const code = decodedText.trim().toUpperCase();
      const now = Date.now();
      lastDecodedTimestamp = now;
      decodeErrorCount = 0;
      setScannerHint(""); // Clear any "not detected" warning immediately on read

      if (code === lastScan && now - lastTime < 1500) return;
      lastScan = code;
      lastTime = now;
      if (navigator.vibrate) navigator.vibrate(60);
      lookupBarcode(code);
    },
    handleScanFrameError
  );

  // Keep preview natural (un-mirrored) on front/laptop cameras
  const videoEl = document.querySelector("#reader video");
  if (videoEl) {
    videoEl.style.transform = "scaleX(1)";
    videoEl.style.webkitTransform = "scaleX(1)";
  }

  // Apply slight 1.6x zoom on mobile if supported (skip on fixed-focus laptop webcams)
  if (!isDesktop) {
    try {
      const track = html5QrCode.getRunningTrackCameraCapabilities();
      const zoom = track.zoomFeature();
      if (zoom.isSupported()) {
        await zoom.apply(Math.min(1.6, zoom.max()));
      }
    } catch (e) {}
  }

  startScannerWatchdog();
}

async function toggleCamera() {
  const btn = document.getElementById("toggle-camera-btn");
  const flipBtn = document.getElementById("flip-camera-btn");
  const placeholder = document.getElementById("camera-placeholder");
  setScannerHint("");

  if (isScanning) {
    await stopScannerInstance();
    btn.textContent = "Start Camera";
    btn.classList.remove("bg-red-600", "hover:bg-red-700");
    btn.classList.add("bg-emerald-600", "hover:bg-emerald-700");
    flipBtn.classList.add("hidden");
    placeholder.classList.remove("hidden");
    return;
  }

  if (!window.isSecureContext || !navigator.mediaDevices) {
    setScannerHint(
      "Camera needs a secure (HTTPS or localhost) connection. Open this page via https:// or localhost, or use Manual SKU Entry below.",
      false
    );
    return;
  }

  try {
    placeholder.classList.add("hidden");
    const mobile = isMobileDevice();
    currentFacingMode = mobile ? "environment" : "user";

    try {
      availableCameras = await Html5Qrcode.getCameras();
    } catch (e) {
      availableCameras = [];
    }

    let initialTarget = { facingMode: currentFacingMode };

    if (availableCameras.length > 0) {
      if (mobile) {
        const backIdx = availableCameras.findIndex(c => /back|rear|environment/i.test(c.label));
        currentCameraIndex = backIdx !== -1 ? backIdx : availableCameras.length - 1;
      } else {
        const frontIdx = availableCameras.findIndex(c => /front|user|facetime|integrated|webcam|hd/i.test(c.label));
        currentCameraIndex = frontIdx !== -1 ? frontIdx : 0;
      }
      initialTarget = availableCameras[currentCameraIndex].id;
    }

    try {
      await startScannerStream(initialTarget);
    } catch (primaryErr) {
      await startScannerStream({ facingMode: currentFacingMode });
    }

    try {
      const refreshed = await Html5Qrcode.getCameras();
      if (refreshed.length > 0) availableCameras = refreshed;
    } catch (e) {}

    isScanning = true;
    btn.textContent = "Stop Camera";
    btn.classList.remove("bg-emerald-600", "hover:bg-emerald-700");
    btn.classList.add("bg-red-600", "hover:bg-red-700");

    if (availableCameras.length > 1 || mobile) {
      flipBtn.classList.remove("hidden");
    } else {
      flipBtn.classList.add("hidden");
    }
  } catch (err) {
    await stopScannerInstance();
    placeholder.classList.remove("hidden");
    flipBtn.classList.add("hidden");
    setScannerHint(
      `Camera error (${err?.name || "Permission/Device"}): Unable to start camera stream. Check browser camera permissions or use Manual SKU Entry below.`,
      false
    );
  }
}

async function flipCamera() {
  if (!isScanning) return;
  const flipBtn = document.getElementById("flip-camera-btn");
  setScannerHint("");
  flipBtn.disabled = true;

  try {
    await stopScannerInstance();

    if (availableCameras.length > 1) {
      currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
      await startScannerStream(availableCameras[currentCameraIndex].id);
    } else {
      currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
      await startScannerStream({ facingMode: currentFacingMode });
    }

    isScanning = true;
  } catch (err) {
    setScannerHint(`Unable to switch camera (${err?.message || "device busy"}).`, false);
  } finally {
    flipBtn.disabled = false;
  }
}

function handleManualLookup(event) {
  event.preventDefault();
  const input = document.getElementById("manual-sku");
  const code = input.value.trim().toUpperCase();
  if (code) {
    lookupBarcode(code);
    input.value = "";
  }
}

// =========================================================================
// US01 & US02: SKU LOOKUP & STOCK STEPPER LOGIC
// =========================================================================
async function lookupBarcode(code) {
  const notFoundCard = document.getElementById("not-found-card");
  const feedback = document.getElementById("save-feedback");
  feedback.classList.add("hidden");

  let item = inventoryDB[code];
  if (apiOnline) {
    try {
      item = (await api("lookup", { code })).product || undefined;
      if (item) inventoryDB[item.sku] = item;
    } catch (e) {}
  }
  if (!item) {
    document.getElementById("not-found-text").textContent =
      `SKU Not Found: "${code}" is not registered in the inventory database.`;
    notFoundCard.classList.remove("hidden");
    return;
  }

  notFoundCard.classList.add("hidden");
  activeSku = item.sku;

  document.getElementById("sku-badge").textContent = item.sku;
  document.getElementById("product-name").textContent = item.name;
  document.getElementById("product-meta").textContent = `Heat-Resistant Liquid Formula • ${item.line || "Classic Edition"} ${item.size_ml || 10}ml • ${RM(item.sale_price)} • ${item.rack}`;
  document.getElementById("current-stock-display").textContent = item.stock;
  document.getElementById("stock-input").value = item.stock;
  refreshInventoryUI();
}

function stepQuantity(delta) {
  const input = document.getElementById("stock-input");
  const currentVal = parseInt(input.value, 10) || 0;
  const nextVal = currentVal + delta;

  if (nextVal < 0) {
    showFeedback("Error: Stock quantity cannot be negative (minimum 0).", true);
    input.value = 0;
    return;
  }
  document.getElementById("save-feedback").classList.add("hidden");
  input.value = nextVal;
}

function handleDirectInput() {
  const input = document.getElementById("stock-input");
  if (parseInt(input.value, 10) < 0) {
    showFeedback("Error: Stock quantity cannot be negative.", true);
  } else {
    document.getElementById("save-feedback").classList.add("hidden");
  }
}

async function saveStockUpdate() {
  if (!activeSku || !inventoryDB[activeSku]) return;

  const input = document.getElementById("stock-input");
  const newStock = parseInt(input.value, 10);

  if (isNaN(newStock) || newStock < 0) {
    showFeedback("Save rejected: Stock balance cannot be negative.", true);
    return;
  }

  if (apiOnline) {
    try {
      await api("save", { sku: activeSku, new_stock: newStock });
      await syncFromServer();
    } catch (e) { return showFeedback(e.message, true); }
    refreshInventoryUI();
    document.getElementById("current-stock-display").textContent = newStock;
    showFeedback(`Saved: ${activeSku} updated to ${newStock} units.`, false);
    return;
  }

  const oldStock = inventoryDB[activeSku].stock;
  const diff = newStock - oldStock;
  inventoryDB[activeSku].stock = newStock;
  persistDB();

  document.getElementById("current-stock-display").textContent = newStock;
  showFeedback(`Saved: ${activeSku} updated to ${newStock} units.`, false);
  prependAuditLog(activeSku, oldStock, newStock, diff);
}

function showFeedback(message, isError) {
  const box = document.getElementById("save-feedback");
  box.textContent = message;
  box.classList.remove("hidden", "bg-red-50", "text-red-700", "border-red-200", "bg-emerald-50", "text-emerald-700", "border-emerald-200");
  box.classList.add("border");
  if (isError) {
    box.classList.add("bg-red-50", "text-red-700", "border-red-200");
  } else {
    box.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
  }
}

function buildAuditItem(sku, oldVal, newVal, diff, actor, time) {
  const sign = diff > 0 ? `+${diff}` : `${diff}`;
  const badgeColor = diff < 0 ? "text-red-600 bg-red-50 border-red-200" : "text-emerald-700 bg-emerald-50 border-emerald-200";
  const li = document.createElement("li");
  li.className = "flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200";
  li.innerHTML = `
    <div>
      <span class="font-mono text-slate-900 font-semibold">${esc(sku)}</span>
      <span class="text-slate-600 ml-1">(${oldVal} → ${newVal})</span>
      <span class="block text-[11px] text-slate-400">Updated by ${esc(actor)} at ${esc(time)}</span>
    </div>
    <span class="px-2 py-0.5 rounded-md font-mono font-bold border ${badgeColor}">${sign}</span>
  `;
  return li;
}

function prependAuditLog(sku, oldVal, newVal, diff) {
  addAuditEntry(sku, oldVal, newVal, diff);
  renderAuditFeed(getOfflineAudit());
}

function renderAuditFeed(rows) {
  const log = document.getElementById("audit-log");
  log.innerHTML = "";
  if (!rows.length) {
    log.innerHTML = '<li class="py-2 text-center text-slate-400">No stock updates recorded in this session yet.</li>';
    return;
  }
  rows.forEach(r => log.append(buildAuditItem(r.sku, r.old_stock, r.new_stock, r.diff, r.actor, r.time_label)));
}


// Scroll the looked-up product (or the not-found card) into view and flash it.
(function () {
  const _origLookup = window.lookupBarcode;
  if (typeof _origLookup !== "function") return;

  window.lookupBarcode = async function (code) {
    await _origLookup.apply(this, arguments);
    if (!lookupScrollEnabled) return; // don't jump down the page on first load

    const notFound = document.getElementById("not-found-card");
    const isMissing = notFound && !notFound.classList.contains("hidden");
    const target = isMissing ? notFound : document.getElementById("product-card");
    if (!target) return;

    target.style.scrollMarginTop = "76px";
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    if (!isMissing) {
      target.animate(
        [
          { boxShadow: "0 0 0 0 rgba(0, 1, 207, 0)", borderColor: "#0001cf" },
          { boxShadow: "0 0 0 5px rgba(0, 1, 207, 0.16)", borderColor: "#0001cf" },
          { boxShadow: "0 0 0 0 rgba(0, 1, 207, 0)", borderColor: "" }
        ],
        { duration: 900, easing: "ease-out" }
      );
    }
  };
})();

// -----------------------------------------------------------------------------
// PAGE INIT
// -----------------------------------------------------------------------------
(async () => {
  mountOpsChrome("inventory");
  if (!(await requireLogin())) return;
  fillOpsHeader();

  const isOwner = isOwnerUser();
  document.getElementById("open-add-sku-btn").classList.toggle("hidden", !isOwner);
  document.getElementById("reset-db-btn").classList.toggle("hidden", !isOwner);

  onInventoryChange(refreshInventoryUI);
  refreshInventoryUI();
  if (!apiOnline) renderAuditFeed(getOfflineAudit());   // online: already drawn by syncFromServer
  await lookupBarcode(activeSku || "LF-10C-VAN");
  lookupScrollEnabled = true;
  fetchOrders();                                         // keeps the Orders badge current
})();
