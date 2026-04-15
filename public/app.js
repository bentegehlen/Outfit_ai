const DB_NAME = "outfit_v4_db";
const DB_VERSION = 1;

const STORES = {
  items: "items",
  looks: "looks"
};

const SUBCATEGORIES = {
  upper: ["base top", "second top", "corsage", "cardigan", "jacket", "coat", "bodysuit", "mesh top"],
  bottom: ["skirt", "shorts", "trousers"],
  dress: ["dress"],
  legwear: ["fishnets", "tights", "socks", "legwarmers"],
  shoes: ["shoes", "boots"],
  accessories: ["bag", "necklace", "choker", "earrings", "harness", "belt", "gloves / armwarmers"]
};

let db = null;
let batchItems = [];
let generatedLooks = [];
let outfitSeed = 0;
let activePresets = new Set();

init();

async function init() {
  await openDB();
  setupTabs();
  setupScan();
  setupCatalog();
  setupOutfits();
  setupGlobal();
  await renderCatalog();
  await renderLooks();
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const upgradeDb = e.target.result;
      if (!upgradeDb.objectStoreNames.contains(STORES.items)) {
        upgradeDb.createObjectStore(STORES.items, { keyPath: "id" });
      }
      if (!upgradeDb.objectStoreNames.contains(STORES.looks)) {
        upgradeDb.createObjectStore(STORES.looks, { keyPath: "id" });
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(data);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMsg(text, type = "success") {
  const el = document.getElementById("globalMessage");
  el.innerHTML = `<div class="message message-${type}">${escapeHtml(text)}</div>`;
  setTimeout(() => {
    el.innerHTML = "";
  }, 3500);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    };
  });

  document.querySelectorAll("[data-scroll-top]").forEach(btn => {
    btn.onclick = scrollTop;
  });
}

function setupScan() {
  const input = document.getElementById("fileInput");

  input.onchange = async () => {
    batchItems = [...input.files].map(file => ({
      id: uid(),
      file,
      preview: URL.createObjectURL(file),
      state: "pending",
      dataUrl: null,
      analysis: null,
      error: ""
    }));
    renderScan();
  };

  document.getElementById("analyzeAllBtn").onclick = analyzeAll;
  document.getElementById("saveAllBtn").onclick = saveAll;
  document.getElementById("clearScanBtn").onclick = () => {
    batchItems = [];
    renderScan();
    document.getElementById("scanStatus").textContent = "Bereit.";
  };
}

async function analyzeAll() {
  if (!batchItems.length) {
    showMsg("Bitte zuerst Bilder auswählen.", "error");
    return;
  }

  document.getElementById("scanStatus").textContent = "Analysiere Bilder...";

  for (const item of batchItems) {
    if (item.state === "success") continue;

    item.state = "loading";
    item.error = "";
    renderScan();

    try {
      item.dataUrl = await fileToDataUrl(item.file);

      const res = await fetch("/.netlify/functions/analyze-garment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: item.dataUrl })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Analyse fehlgeschlagen.");
      }

      if (!data.analysis) {
        throw new Error("Keine Analyse-Daten erhalten.");
      }

      item.analysis = normalizeAnalysis(data.analysis);
      item.state = "success";
    } catch (err) {
      item.state = "error";
      item.error = err.message || "Analyse fehlgeschlagen.";
    }

    renderScan();
  }

  document.getElementById("scanStatus").textContent = "Analyse abgeschlossen.";
}

function normalizeAnalysis(analysis) {
  const category = analysis.category || "";
  let subcategory = analysis.subcategory || "";

  if (!subcategory) {
    if (category === "top") subcategory = "base top";
    else if (category === "bottom") subcategory = "skirt";
    else if (category === "dress") subcategory = "dress";
    else if (category === "outerwear") subcategory = "jacket";
    else if (category === "shoes") subcategory = "shoes";
    else if (category === "accessory") subcategory = "necklace";
  }

  return {
    ...analysis,
    subcategory,
    archived: false,
    favorite: false
  };
}

async function saveAll() {
  const valid = batchItems.filter(item => item.state === "success" && item.analysis && item.dataUrl);

  if (!valid.length) {
    showMsg("Keine erfolgreichen Analysen zum Speichern.", "error");
    return;
  }

  let savedCount = 0;

  for (const item of valid) {
    try {
      await dbPut(STORES.items, {
        id: uid(),
        ...item.analysis,
        img: item.dataUrl,
        archived: false,
        favorite: false
      });
      savedCount++;
    } catch (err) {
      console.error("Save item failed", err);
    }
  }

  batchItems = [];
  renderScan();
  document.getElementById("scanStatus").textContent = "Bereit.";
  await renderCatalog();

  if (savedCount) {
    showMsg(`${savedCount} Teil(e) gespeichert.`, "success");
  } else {
    showMsg("Keine Teile konnten gespeichert werden.", "error");
  }
}

function renderScan() {
  const grid = document.getElementById("scanGrid");

  if (!batchItems.length) {
    grid.innerHTML = `<div class="empty-state">Keine Bilder</div>`;
    return;
  }

  grid.innerHTML = batchItems.map(item => `
    <div class="scan-card">
      <img class="scan-thumb" src="${item.preview}" alt="Scan Vorschau">
      <div class="scan-state state-${item.state}">
        ${item.state === "pending" ? "Noch nicht analysiert" :
          item.state === "loading" ? "Analysiere..." :
          item.state === "success" ? "Analyse erfolgreich" :
          "Analyse fehlgeschlagen"}
      </div>
      ${item.analysis ? `
        <div class="badge-row">
          <span class="badge badge-primary">${escapeHtml(item.analysis.category || "-")}</span>
          <span class="badge">${escapeHtml(item.analysis.subcategory || "-")}</span>
          <span class="badge">${escapeHtml(item.analysis.suggestedName || "-")}</span>
        </div>
      ` : ""}
      ${item.error ? `<div class="message message-error">${escapeHtml(item.error)}</div>` : ""}
    </div>
  `).join("");
}

function setupCatalog() {
  document.getElementById("catalogSearch").oninput = renderCatalog;
  document.getElementById("catalogFilter").onchange = renderCatalog;

  document.getElementById("exportCatalogBtn").onclick = exportCatalog;
  document.getElementById("importCatalogBtn").onclick = () => {
    document.getElementById("importCatalogInput").click();
  };
  document.getElementById("importCatalogInput").onchange = importCatalog;
}

async function renderCatalog() {
  const allItems = await dbGetAll(STORES.items);
  const search = (document.getElementById("catalogSearch").value || "").trim().toLowerCase();
  const filter = document.getElementById("catalogFilter").value;

  let items = allItems.filter(item => {
    const searchable = [
      item.suggestedName,
      item.category,
      item.subcategory,
      item.color,
      ...(item.styleTags || []),
      ...(item.occasionFit || [])
    ].join(" ").toLowerCase();

    if (search && !searchable.includes(search)) return false;
    if (filter === "favorites" && !item.favorite) return false;
    if (filter === "active" && item.archived) return false;
    if (filter === "archived" && !item.archived) return false;
    return true;
  });

  document.getElementById("catalogCount").textContent = `${items.length} Teile`;

  const list = document.getElementById("catalogList");

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Keine Teile gefunden.</div>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="catalog-item">
      <div class="catalog-top">
        <img class="catalog-thumb" src="${item.img}" alt="${escapeHtml(item.suggestedName || "Teil")}">
        <div class="catalog-content">
          <h3>${escapeHtml(item.suggestedName || "Teil")}</h3>

          <div class="badge-row">
            <span class="badge badge-primary">${escapeHtml(item.category || "-")}</span>
            <span class="badge">${escapeHtml(item.subcategory || "-")}</span>
            <span class="badge">${escapeHtml(item.color || "-")}</span>
            ${item.favorite ? `<span class="badge">★ Favorit</span>` : ""}
            ${item.archived ? `<span class="badge">Archiviert</span>` : ""}
          </div>

          <div class="inline-actions">
            <button class="btn btn-small btn-secondary" onclick="toggleFav('${item.id}')">${item.favorite ? "Favorit entfernen" : "Favorit"}</button>
            <button class="btn btn-small btn-secondary" onclick="toggleArchive('${item.id}')">${item.archived ? "Aktivieren" : "Archivieren"}</button>
            <button class="btn btn-small btn-danger" onclick="delItem('${item.id}')">Löschen</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

window.toggleFav = async (id) => {
  const items = await dbGetAll(STORES.items);
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.favorite = !item.favorite;
  await dbPut(STORES.items, item);
  await renderCatalog();
};

window.toggleArchive = async (id) => {
  const items = await dbGetAll(STORES.items);
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.archived = !item.archived;
  await dbPut(STORES.items, item);
  await renderCatalog();
};

window.delItem = async (id) => {
  await dbDelete(STORES.items, id);
  await renderCatalog();
};

async function exportCatalog() {
  const items = await dbGetAll(STORES.items);
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "outfitfinder-v4-katalog.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importCatalog(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Ungültige Datei.");

    for (const item of parsed) {
      await dbPut(STORES.items, item);
    }

    showMsg("Import erfolgreich.", "success");
    await renderCatalog();
  } catch (err) {
    showMsg(err.message || "Import fehlgeschlagen.", "error");
  } finally {
    event.target.value = "";
  }
}

function setupOutfits() {
  document.getElementById("generateLooksBtn").onclick = () => generateLooks("fresh");
  document.getElementById("generateMoreBtn").onclick = () => generateLooks("more");

  document.querySelectorAll(".chip").forEach(chip => {
    chip.onclick = () => {
      const preset = chip.dataset.preset;
      if (activePresets.has(preset)) {
        activePresets.delete(preset);
        chip.classList.remove("active");
      } else {
        activePresets.add(preset);
        chip.classList.add("active");
      }
    };
  });
}

async function generateLooks(mode) {
  const allItems = await dbGetAll(STORES.items);
  const items = allItems.filter(item => !item.archived);

  if (!items.length) {
    document.getElementById("outfitList").innerHTML = `<div class="empty-state">Speichere zuerst Teile im Katalog.</div>`;
    return;
  }

  if (mode === "more") {
    outfitSeed += 3;
  } else {
    outfitSeed = 0;
  }

  generatedLooks = [];

  for (let i = 0; i < 3; i++) {
    const look = buildLook(items, outfitSeed + i);
    generatedLooks.push(look);
  }

  renderOutfits();
}

function buildLook(items, seed) {
  const filtered = applyPresetFiltering(items);

  const pool = {
    dresses: filtered.filter(i => SUBCATEGORIES.dress.includes(i.subcategory)),
    uppers: filtered.filter(i => SUBCATEGORIES.upper.includes(i.subcategory)),
    bottoms: filtered.filter(i => SUBCATEGORIES.bottom.includes(i.subcategory)),
    legwear: filtered.filter(i => SUBCATEGORIES.legwear.includes(i.subcategory)),
    shoes: filtered.filter(i => SUBCATEGORIES.shoes.includes(i.subcategory)),
    accessories: filtered.filter(i => SUBCATEGORIES.accessories.includes(i.subcategory))
  };

  const useDress = !activePresets.has("no_dress") && (
    (seed % 4 === 0 && pool.dresses.length) ||
    (pool.uppers.length === 0 && pool.bottoms.length === 0 && pool.dresses.length)
  );

  const selected = {
    dress: null,
    upper1: null,
    upper2: null,
    upper3: null,
    bottom: null,
    legwear1: null,
    legwear2: null,
    legwear3: null,
    shoes: null,
    accessory1: null,
    accessory2: null,
    accessory3: null,
    accessory4: null
  };

  if (useDress) {
    selected.dress = pickBySeed(pool.dresses, seed);
  } else {
    selected.upper1 = pickPreferredUpper(pool.uppers, seed);
    selected.bottom = pickPreferredBottom(pool.bottoms, seed);

    if (activePresets.has("more_layering")) {
      selected.upper2 = pickSecondDistinct(pool.uppers, seed + 1, [selected.upper1]);
      selected.upper3 = pickSecondDistinct(pool.uppers, seed + 2, [selected.upper1, selected.upper2]);
    } else if (seed % 2 === 0) {
      selected.upper2 = pickSecondDistinct(pool.uppers, seed + 1, [selected.upper1]);
    }
  }

  selected.legwear1 = pickLegwear(pool.legwear, seed, []);
  selected.legwear2 = pickLegwear(pool.legwear, seed + 1, [selected.legwear1]);
  if (activePresets.has("more_layering")) {
    selected.legwear3 = pickLegwear(pool.legwear, seed + 2, [selected.legwear1, selected.legwear2]);
  }

  selected.shoes = pickPreferredShoes(pool.shoes, seed);

  const lessAccessories = activePresets.has("less_accessories");
  selected.accessory1 = pickAccessory(pool.accessories, seed, []);
  selected.accessory2 = lessAccessories ? null : pickAccessory(pool.accessories, seed + 1, [selected.accessory1]);
  selected.accessory3 = lessAccessories ? null : pickAccessory(pool.accessories, seed + 2, [selected.accessory1, selected.accessory2]);
  selected.accessory4 = lessAccessories ? null : pickAccessory(pool.accessories, seed + 3, [selected.accessory1, selected.accessory2, selected.accessory3]);

  const itemsForLook = [
    selected.dress,
    selected.upper1,
    selected.upper2,
    selected.upper3,
    selected.bottom,
    selected.legwear1,
    selected.legwear2,
    selected.legwear3,
    selected.shoes,
    selected.accessory1,
    selected.accessory2,
    selected.accessory3,
    selected.accessory4
  ].filter(Boolean);

  return {
    id: uid(),
    slots: selected,
    items: dedupeById(itemsForLook),
    rendered: null,
    renderError: "",
    rendering: false
  };
}

function applyPresetFiltering(items) {
  let next = [...items];

  if (activePresets.has("with_skirt")) {
    next = next.filter(i => i.subcategory !== "trousers" && i.subcategory !== "shorts" || !SUBCATEGORIES.bottom.includes(i.subcategory) || i.subcategory === "skirt");
  }

  return next;
}

function pickBySeed(arr, seed) {
  if (!arr.length) return null;
  const ordered = prioritizeFavorites(arr);
  return ordered[seed % ordered.length];
}

function prioritizeFavorites(arr) {
  const favs = arr.filter(i => i.favorite);
  const rest = arr.filter(i => !i.favorite);
  return [...favs, ...rest];
}

function pickSecondDistinct(arr, seed, exclude) {
  const excludeIds = new Set(exclude.filter(Boolean).map(i => i.id));
  return pickBySeed(arr.filter(i => !excludeIds.has(i.id)), seed);
}

function pickPreferredUpper(arr, seed) {
  if (!arr.length) return null;

  const preferSexy = activePresets.has("more_sexy");
  const preferLayering = activePresets.has("more_layering");

  let scored = [...arr].sort((a, b) => scoreUpper(b, preferSexy, preferLayering) - scoreUpper(a, preferSexy, preferLayering));
  return scored[seed % scored.length];
}

function scoreUpper(item, preferSexy, preferLayering) {
  let score = (item.confidence || 0) * 100;
  if (item.favorite) score += 30;
  if (preferSexy && ["corsage", "mesh top", "bodysuit"].includes(item.subcategory)) score += 25;
  if (preferLayering && ["base top", "mesh top", "cardigan", "jacket", "coat", "corsage"].includes(item.subcategory)) score += 10;
  return score;
}

function pickPreferredBottom(arr, seed) {
  if (!arr.length) return null;
  let scored = [...arr].sort((a, b) => scoreBottom(b) - scoreBottom(a));
  return scored[seed % scored.length];
}

function scoreBottom(item) {
  let score = (item.confidence || 0) * 100;
  if (item.favorite) score += 30;
  if (activePresets.has("with_skirt") && item.subcategory === "skirt") score += 40;
  return score;
}

function pickLegwear(arr, seed, exclude) {
  const excludeIds = new Set(exclude.filter(Boolean).map(i => i.id));
  const filtered = arr.filter(i => !excludeIds.has(i.id));
  if (!filtered.length) return null;
  return pickBySeed(filtered, seed);
}

function pickPreferredShoes(arr, seed) {
  if (!arr.length) return null;

  let scored = [...arr].sort((a, b) => scoreShoes(b) - scoreShoes(a));
  return scored[seed % scored.length];
}

function scoreShoes(item) {
  let score = (item.confidence || 0) * 100;
  if (item.favorite) score += 30;
  if (activePresets.has("mary_janes") && /mary jane/i.test(item.suggestedName || "")) score += 60;
  if (activePresets.has("prefer_boots") && item.subcategory === "boots") score += 40;
  return score;
}

function pickAccessory(arr, seed, exclude) {
  const excludeIds = new Set(exclude.filter(Boolean).map(i => i.id));
  const filtered = arr.filter(i => !excludeIds.has(i.id));
  if (!filtered.length) return null;
  return pickBySeed(filtered, seed);
}

function dedupeById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function renderOutfits() {
  const list = document.getElementById("outfitList");

  if (!generatedLooks.length) {
    list.innerHTML = `<div class="empty-state">Noch keine Looks erzeugt.</div>`;
    return;
  }

  list.innerHTML = generatedLooks.map((look, index) => `
    <div class="outfit-card">
      <div class="outfit-layout">
        <div class="render-box">
          ${
            look.rendered
              ? `<img src="${look.rendered}" alt="Look Rendering">`
              : `<div class="render-placeholder">${look.rendering ? "Rendering läuft..." : "Noch kein Bild gerendert."}</div>`
          }

          ${look.renderError ? `<div class="message message-error" style="margin-top:10px;">${escapeHtml(look.renderError)}</div>` : ""}

          <div class="action-row" style="margin-top:12px;">
            <button class="btn" onclick="renderLook(${index})">${look.rendering ? "Rendering..." : "Render"}</button>
            <button class="btn btn-secondary" onclick="saveLook(${index})">Speichern</button>
          </div>
        </div>

        <div class="look-meta">
          ${renderLookSlotCard("Kleid", look.slots.dress)}
          ${renderLookSlotCard("Top 1", look.slots.upper1)}
          ${renderLookSlotCard("Top 2", look.slots.upper2)}
          ${renderLookSlotCard("Top 3", look.slots.upper3)}
          ${renderLookSlotCard("Bottom", look.slots.bottom)}
          ${renderLookSlotCard("Legwear 1", look.slots.legwear1)}
          ${renderLookSlotCard("Legwear 2", look.slots.legwear2)}
          ${renderLookSlotCard("Legwear 3", look.slots.legwear3)}
          ${renderLookSlotCard("Schuhe", look.slots.shoes)}
          ${renderLookSlotCard("Accessoire 1", look.slots.accessory1)}
          ${renderLookSlotCard("Accessoire 2", look.slots.accessory2)}
          ${renderLookSlotCard("Accessoire 3", look.slots.accessory3)}
          ${renderLookSlotCard("Accessoire 4", look.slots.accessory4)}
        </div>
      </div>
    </div>
  `).join("");
}

function renderLookSlotCard(label, item) {
  return `
    <div class="piece-card">
      <strong>${escapeHtml(label)}</strong>
      <span class="muted">${escapeHtml(item?.suggestedName || "-")}</span>
    </div>
  `;
}

window.renderLook = async (index) => {
  const look = generatedLooks[index];
  if (!look) return;

  look.rendering = true;
  look.renderError = "";
  renderOutfits();

  try {
    const res = await fetch("/.netlify/functions/generate-outfit-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: look.items })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Rendering fehlgeschlagen.");
    }

    if (!data.image) {
      throw new Error("Kein Bild erhalten.");
    }

    look.rendered = data.image;
  } catch (err) {
    look.renderError = err.message || "Rendering fehlgeschlagen.";
  } finally {
    look.rendering = false;
    renderOutfits();
  }
};

window.saveLook = async (index) => {
  const look = generatedLooks[index];
  if (!look) return;

  try {
    await dbPut(STORES.looks, {
      id: uid(),
      createdAt: new Date().toISOString(),
      rendered: look.rendered || null,
      items: look.items.map(item => ({
        id: item.id,
        suggestedName: item.suggestedName || "-",
        subcategory: item.subcategory || "",
        color: item.color || ""
      }))
    });

    await renderLooks();
    showMsg("Look gespeichert.", "success");
  } catch (err) {
    showMsg("Look konnte nicht gespeichert werden.", "error");
  }
};

async function renderLooks() {
  const looks = await dbGetAll(STORES.looks);
  looks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  document.getElementById("looksCount").textContent = `${looks.length} Looks`;

  const list = document.getElementById("looksList");

  if (!looks.length) {
    list.innerHTML = `<div class="empty-state">Noch keine gespeicherten Looks.</div>`;
    return;
  }

  list.innerHTML = looks.map(look => `
    <div class="look-card">
      <div class="outfit-layout">
        <div class="render-box">
          ${
            look.rendered
              ? `<img src="${look.rendered}" alt="Gespeicherter Look">`
              : `<div class="render-placeholder">Kein gespeichertes Renderbild.</div>`
          }
        </div>

        <div class="piece-card">
          <strong>Teileliste</strong>
          <ul class="look-list-pieces">
            ${look.items.map(item => `<li>${escapeHtml(item.suggestedName)}${item.subcategory ? ` · ${escapeHtml(item.subcategory)}` : ""}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `).join("");
}

function setupGlobal() {
  document.getElementById("persistBtn").onclick = async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        showMsg(granted ? "Speicher gesichert." : "Persistenz nicht bestätigt.", granted ? "success" : "error");
      }
    } catch (err) {
      showMsg("Persistenz konnte nicht gesetzt werden.", "error");
    }
  };

  document.getElementById("storageInfoBtn").onclick = async () => {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMb = ((estimate.usage || 0) / 1024 / 1024).toFixed(1);
        const quotaMb = ((estimate.quota || 0) / 1024 / 1024).toFixed(1);
        showMsg(`Genutzt: ${usedMb} MB / ${quotaMb} MB`, "success");
      }
    } catch {
      showMsg("Speicherinfo nicht verfügbar.", "error");
    }
  };
}

function setupGlobalPlaceholders() {
  document.getElementById("scanStatus").textContent = "Bereit.";
  document.getElementById("scanGrid").innerHTML = `<div class="empty-state">Keine Bilder</div>`;
  document.getElementById("outfitList").innerHTML = `<div class="empty-state">Noch keine Looks erzeugt.</div>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

setupGlobalPlaceholders();
