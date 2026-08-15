/* ---------- IndexedDB layer ---------- */

const DB_NAME = "pegboard";
const DB_VERSION = 1;
const STORE = "cars";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("series", "series", { unique: false });
        store.createIndex("dateAdded", "dateAdded", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(car) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(car);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- App state ---------- */

let allCars = [];
let searchTerm = "";
let seriesFilter = "";
let pendingScan = null; // { imageDataUrl }
let activeDetailId = null;

/* ---------- DOM refs ---------- */

const grid = document.getElementById("grid");
const emptyState = document.getElementById("emptyState");
const countBadge = document.getElementById("countBadge");
const searchInput = document.getElementById("searchInput");
const seriesFilterEl = document.getElementById("seriesFilter");
const seriesSuggestions = document.getElementById("seriesSuggestions");

const scanBtn = document.getElementById("scanBtn");
const cameraInput = document.getElementById("cameraInput");
const scanSheet = document.getElementById("scanSheet");
const scanCloseBtn = document.getElementById("scanCloseBtn");
const scanPreview = document.getElementById("scanPreview");
const scanStatus = document.getElementById("scanStatus");
const scanForm = document.getElementById("scanForm");
const fieldName = document.getElementById("fieldName");
const fieldNumber = document.getElementById("fieldNumber");
const fieldSeries = document.getElementById("fieldSeries");
const rawOcrText = document.getElementById("rawOcrText");
const rescanBtn = document.getElementById("rescanBtn");

const detailSheet = document.getElementById("detailSheet");
const detailCloseBtn = document.getElementById("detailCloseBtn");
const detailTitle = document.getElementById("detailTitle");
const detailImage = document.getElementById("detailImage");
const detailForm = document.getElementById("detailForm");
const detailName = document.getElementById("detailName");
const detailNumber = document.getElementById("detailNumber");
const detailSeries = document.getElementById("detailSeries");
const detailMeta = document.getElementById("detailMeta");
const deleteBtn = document.getElementById("deleteBtn");

const toastEl = document.getElementById("toast");

/* ---------- Rendering ---------- */

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function getFilteredCars() {
  return allCars
    .filter((c) => !seriesFilter || c.series === seriesFilter)
    .filter((c) => {
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      return (
        (c.name || "").toLowerCase().includes(t) ||
        (c.number || "").toLowerCase().includes(t)
      );
    })
    .sort((a, b) => b.dateAdded - a.dateAdded);
}

function renderGrid() {
  const cars = getFilteredCars();
  countBadge.textContent = `${allCars.length} in the case`;

  if (allCars.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  if (cars.length === 0) {
    grid.innerHTML = `<p style="grid-column:1/-1;color:var(--muted);text-align:center;padding:40px 12px;">No matches. Try a different search or series.</p>`;
    return;
  }

  grid.innerHTML = cars.map((c) => `
    <div class="car-card" data-id="${c.id}">
      <img class="car-card-img" src="${c.image}" alt="${escapeHtml(c.name)}">
      <div class="card-corner"></div>
      <div class="car-card-body">
        <p class="car-card-name">${escapeHtml(c.name)}</p>
        <div class="car-card-meta">
          ${c.number ? `<span class="car-card-number">${escapeHtml(c.number)}</span>` : "<span></span>"}
          <span class="car-card-series">${escapeHtml(c.series)}</span>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".car-card").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

function renderSeriesOptions() {
  const seriesList = [...new Set(allCars.map((c) => c.series).filter(Boolean))].sort();

  const currentFilter = seriesFilterEl.value;
  seriesFilterEl.innerHTML = `<option value="">All series</option>` +
    seriesList.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  seriesFilterEl.value = seriesList.includes(currentFilter) ? currentFilter : "";

  seriesSuggestions.innerHTML = seriesList.map((s) => `<option value="${escapeHtml(s)}">`).join("");
}

async function refresh() {
  allCars = await dbGetAll();
  renderSeriesOptions();
  renderGrid();
}

/* ---------- Toast ---------- */

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

/* ---------- Image helpers ---------- */

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize/compress to keep IndexedDB storage lean
function compressImage(dataUrl, maxWidth = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/* ---------- OCR parsing heuristics ---------- */

const IGNORE_LINES = /^(hot\s*wheels|mattel|1:64|die[\s-]?cast|made in|china|malaysia|thailand|vietnam|indonesia|\d{4}\s*mattel|www\.|choking hazard|www)/i;

function parseOcrText(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !IGNORE_LINES.test(l));

  // Number pattern like "180/250" or "180 / 250"
  let number = "";
  const numMatch = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (numMatch) number = `${numMatch[1]}/${numMatch[2]}`;

  // Name guess: longest remaining line that isn't purely the number/series noise,
  // preferring lines with mostly letters.
  const nameCandidates = lines
    .filter((l) => !/^\d{1,4}\s*\/\s*\d{1,4}$/.test(l))
    .filter((l) => /[a-zA-Z]{3,}/.test(l))
    .sort((a, b) => b.length - a.length);
  const name = nameCandidates[0] || "";

  // Series guess: a remaining line different from the name, often shorter, all-caps-ish
  const seriesCandidates = nameCandidates.filter((l) => l !== name);
  const series = seriesCandidates[0] || "";

  return { name, number, series };
}

/* ---------- Scan flow ---------- */

scanBtn.addEventListener("click", () => cameraInput.click());

cameraInput.addEventListener("change", async () => {
  const file = cameraInput.files[0];
  cameraInput.value = "";
  if (!file) return;

  const rawDataUrl = await fileToDataUrl(file);
  const compressed = await compressImage(rawDataUrl);
  pendingScan = { image: compressed };

  scanPreview.src = compressed;
  fieldName.value = "";
  fieldNumber.value = "";
  fieldSeries.value = "";
  rawOcrText.textContent = "";
  scanStatus.textContent = "Reading package…";
  scanStatus.classList.remove("hidden");
  scanSheet.classList.remove("hidden");

  try {
    const result = await Tesseract.recognize(compressed, "eng");
    const text = result.data.text || "";
    rawOcrText.textContent = text.trim() || "(no text detected)";
    const guess = parseOcrText(text);
    fieldName.value = guess.name;
    fieldNumber.value = guess.number;
    fieldSeries.value = guess.series;
    scanStatus.classList.add("hidden");
    if (!guess.name) fieldName.focus();
  } catch (err) {
    console.error(err);
    scanStatus.textContent = "Couldn't read the text — fill in the details manually.";
    setTimeout(() => scanStatus.classList.add("hidden"), 1800);
  }
});

rescanBtn.addEventListener("click", () => {
  scanSheet.classList.add("hidden");
  cameraInput.click();
});

scanCloseBtn.addEventListener("click", () => {
  scanSheet.classList.add("hidden");
  pendingScan = null;
});

scanForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingScan) return;

  const car = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: fieldName.value.trim(),
    number: fieldNumber.value.trim(),
    series: fieldSeries.value.trim(),
    image: pendingScan.image,
    dateAdded: Date.now(),
  };

  await dbPut(car);
  pendingScan = null;
  scanSheet.classList.add("hidden");
  await refresh();
  showToast(`Added ${car.name || "car"} to the collection`);
});

/* ---------- Detail / edit flow ---------- */

function openDetail(id) {
  const car = allCars.find((c) => c.id === id);
  if (!car) return;
  activeDetailId = id;

  detailTitle.textContent = car.name || "Car";
  detailImage.src = car.image;
  detailName.value = car.name || "";
  detailNumber.value = car.number || "";
  detailSeries.value = car.series || "";
  detailMeta.textContent = `Added ${new Date(car.dateAdded).toLocaleDateString()}`;

  detailSheet.classList.remove("hidden");
}

detailCloseBtn.addEventListener("click", () => {
  detailSheet.classList.add("hidden");
  activeDetailId = null;
});

detailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeDetailId) return;
  const car = allCars.find((c) => c.id === activeDetailId);
  if (!car) return;

  car.name = detailName.value.trim();
  car.number = detailNumber.value.trim();
  car.series = detailSeries.value.trim();

  await dbPut(car);
  detailSheet.classList.add("hidden");
  activeDetailId = null;
  await refresh();
  showToast("Saved changes");
});

deleteBtn.addEventListener("click", async () => {
  if (!activeDetailId) return;
  if (!confirm("Remove this car from your collection?")) return;
  await dbDelete(activeDetailId);
  detailSheet.classList.add("hidden");
  activeDetailId = null;
  await refresh();
  showToast("Removed from collection");
});

/* ---------- Search / filter ---------- */

let searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchTerm = searchInput.value.trim();
    renderGrid();
  }, 120);
});

seriesFilterEl.addEventListener("change", () => {
  seriesFilter = seriesFilterEl.value;
  renderGrid();
});

/* ---------- Service worker ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

/* ---------- Init ---------- */

refresh();
