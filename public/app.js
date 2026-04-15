// ==========================
// CONFIG
// ==========================
const DB_NAME = "outfit_v4_db";
const DB_VERSION = 1;

const STORES = {
  items: "items",
  looks: "looks"
};

let db = null;
let batchItems = [];
let generatedLooks = [];
let outfitSeed = 0;
let activePresets = new Set();

// ==========================
// INIT
// ==========================
init();

async function init() {
  await openDB();
  setupTabs();
  setupScan();
  setupCatalog();
  setupOutfits();
  setupGlobal();
  renderCatalog();
  renderLooks();
}

// ==========================
// DATABASE (IndexedDB)
// ==========================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.items)) {
        db.createObjectStore(STORES.items, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.looks)) {
        db.createObjectStore(STORES.looks, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

function dbPut(store, data) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(data);
    tx.oncomplete = resolve;
  });
}

function dbDelete(store, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = resolve;
  });
}

// ==========================
// UTILS
// ==========================
const uid = () => Math.random().toString(36).slice(2);

function scrollTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showMsg(text, type = "success") {
  const el = document.getElementById("globalMessage");
  el.innerHTML = `<div class="message message-${type}">${text}</div>`;
  setTimeout(() => el.innerHTML = "", 3000);
}

// ==========================
// TABS
// ==========================
function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    };
  });

  document.querySelectorAll("[data-scroll-top]").forEach(b => {
    b.onclick = scrollTop;
  });
}

// ==========================
// SCAN
// ==========================
function setupScan() {
  const input = document.getElementById("fileInput");

  input.onchange = async () => {
    batchItems = await Promise.all([...input.files].map(async file => ({
      id: uid(),
      file,
      preview: URL.createObjectURL(file),
      state: "pending",
      dataUrl: null,
      analysis: null
    })));
    renderScan();
  };

  document.getElementById("analyzeAllBtn").onclick = analyzeAll;
  document.getElementById("saveAllBtn").onclick = saveAll;
  document.getElementById("clearScanBtn").onclick = () => {
    batchItems = [];
    renderScan();
  };
}

async function analyzeAll() {
  for (let item of batchItems) {
    if (item.state === "success") continue;

    item.state = "loading";
    renderScan();

    try {
      item.dataUrl = await fileToDataUrl(item.file);

      const res = await fetch("/.netlify/functions/analyze-garment", {
        method: "POST",
        body: JSON.stringify({ imageDataUrl: item.dataUrl })
      });

      const data = await res.json();
      item.analysis = data.analysis;
      item.state = "success";

    } catch {
      item.state = "error";
    }

    renderScan();
  }
}

async function saveAll() {
  const valid = batchItems.filter(i => i.state === "success");

  for (let item of valid) {
    await dbPut(STORES.items, {
      id: uid(),
      ...item.analysis,
      img: item.dataUrl,
      archived: false,
      favorite: false
    });
  }

  batchItems = [];
  renderScan();
  renderCatalog();
}

function renderScan() {
  const grid = document.getElementById("scanGrid");

  if (!batchItems.length) {
    grid.innerHTML = `<div class="empty-state">Keine Bilder</div>`;
    return;
  }

  grid.innerHTML = batchItems.map(i => `
    <div class="scan-card">
      <img class="scan-thumb" src="${i.preview}">
      <div class="scan-state state-${i.state}">${i.state}</div>
    </div>
  `).join("");
}

function fileToDataUrl(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });
}

// ==========================
// CATALOG
// ==========================
function setupCatalog() {
  document.getElementById("catalogSearch").oninput = renderCatalog;
  document.getElementById("catalogFilter").onchange = renderCatalog;
}

async function renderCatalog() {
  const items = await dbGetAll(STORES.items);
  document.getElementById("catalogCount").textContent = items.length + " Teile";

  const list = document.getElementById("catalogList");

  list.innerHTML = items.map(i => `
    <div class="catalog-item">
      <div class="catalog-top">
        <img class="catalog-thumb" src="${i.img}">
        <div class="catalog-content">
          <h3>${i.suggestedName || "Teil"}</h3>
          <div class="inline-actions">
            <button class="btn-small btn-secondary" onclick="toggleFav('${i.id}')">★</button>
            <button class="btn-small btn-danger" onclick="delItem('${i.id}')">Löschen</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

window.toggleFav = async (id) => {
  const items = await dbGetAll(STORES.items);
  const item = items.find(i => i.id === id);
  item.favorite = !item.favorite;
  await dbPut(STORES.items, item);
  renderCatalog();
};

window.delItem = async (id) => {
  await dbDelete(STORES.items, id);
  renderCatalog();
};

// ==========================
// OUTFITS
// ==========================
function setupOutfits() {
  document.getElementById("generateLooksBtn").onclick = () => generateLooks("fresh");
  document.getElementById("generateMoreBtn").onclick = () => generateLooks("more");

  document.querySelectorAll(".chip").forEach(chip => {
    chip.onclick = () => {
      chip.classList.toggle("active");
      const key = chip.dataset.preset;
      activePresets.has(key) ? activePresets.delete(key) : activePresets.add(key);
    };
  });
}

async function generateLooks(mode) {
  const items = await dbGetAll(STORES.items);

  if (mode === "more") outfitSeed += 3;
  else outfitSeed = 0;

  generatedLooks = [];

  for (let i = 0; i < 3; i++) {
    generatedLooks.push({
      id: uid(),
      items: shuffle(items).slice(0, 6),
      rendered: null
    });
  }

  renderOutfits();
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function renderOutfits() {
  const list = document.getElementById("outfitList");

  list.innerHTML = generatedLooks.map((l, i) => `
    <div class="outfit-card">
      <div class="outfit-layout">
        <div class="render-box">
          ${
            l.rendered
              ? `<img src="${l.rendered}">`
              : `<div class="render-placeholder">Kein Bild</div>`
          }

          <div class="action-row">
            <button onclick="renderLook(${i})">Render</button>
            <button class="btn-secondary" onclick="saveLook(${i})">Speichern</button>
          </div>
        </div>

        <div class="look-meta">
          ${l.items.map(p => `<div class="piece-card">${p.suggestedName || "-"}</div>`).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

window.renderLook = async (i) => {
  const look = generatedLooks[i];

  const res = await fetch("/.netlify/functions/generate-outfit-image", {
    method: "POST",
    body: JSON.stringify({ items: look.items })
  });

  const data = await res.json();
  look.rendered = data.image;
  renderOutfits();
};

window.saveLook = async (i) => {
  await dbPut(STORES.looks, {
    id: uid(),
    ...generatedLooks[i]
  });
  renderLooks();
};

// ==========================
// LOOKS
// ==========================
async function renderLooks() {
  const looks = await dbGetAll(STORES.looks);

  document.getElementById("looksCount").textContent = looks.length + " Looks";

  const list = document.getElementById("looksList");

  list.innerHTML = looks.map(l => `
    <div class="look-card">
      <div class="outfit-layout">
        <div class="render-box">
          ${l.rendered ? `<img src="${l.rendered}">` : ""}
        </div>

        <ul class="look-list-pieces">
          ${l.items.map(i => `<li>${i.suggestedName || "-"}</li>`).join("")}
        </ul>
      </div>
    </div>
  `).join("");
}

// ==========================
// GLOBAL
// ==========================
function setupGlobal() {
  document.getElementById("persistBtn").onclick = async () => {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
      showMsg("Speicher gesichert");
    }
  };
}
