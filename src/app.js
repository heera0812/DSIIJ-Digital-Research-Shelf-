/**
 * app.js — DSVV Digital Research Shelf
 * Handles shelf rendering, year filters, routing (/volume/:volId),
 * grouped articles rendering, PDF links, and live Google Sheets sync.
 */

import { fetchSheetData, dataFingerprint, cleanVolumeSlug } from "./sheet.js";
import { initAudio, playClick, playOpen, playClose, playNav } from "./audio.js";

/* ───────────── State ───────────── */
let journals = [];
let articles = [];
let activeFilter = "ALL";
let openJournalIndex = -1;
let lastFingerprint = "";
let syncTimer = null;
let lastSyncTime = null;
let syncOk = true;

const FILTER_YEARS = ["ALL", "2026", "2025", "2024", "2023", "ARCHIVE"];

/* ───────────── DOM References ───────────── */
const $ = (s) => document.querySelector(s);
const shelfView         = $("#shelf-view");
const volumeView        = $("#volume-view");
const shelfWrapper     = $(".shelf-wrapper");
const shelf             = $("#shelf");
const shelfStats        = $("#shelf-stats");
const chipsWrap         = $("#chips");
const openView          = $("#open-view");
const loadingEl         = $("#loading");
const errorEl           = $("#error-msg");
const syncEl            = $("#sync-status");
const toastEl           = $("#toast");
const srList            = $("#sr-book-list");
const headerName        = $("#header-name");
const headerSub         = $("#header-subtitle");
const liveRegion        = $("#live-region");
const volBackBtn        = $("#vol-back-btn");
const brandLink         = $("#brand-link");

// Volume View DOM
const volTitle          = $("#vol-title");
const volBadge          = $("#vol-badge");
const volSubheading     = $("#vol-subheading");
const volDesc           = $("#vol-desc");
const volMetaPills      = $("#vol-meta-pills");
const volCoverArt       = $("#vol-cover-art");
const coverVolTitle     = $("#cover-vol-title");
const coverYear         = $("#cover-year");
const articlesContainer = $("#volume-articles-container");
const articlesBadge     = $("#articles-count-badge");

/* ───────────── Initialization ───────────── */
export async function init() {
  if (CONFIG.name) headerName.textContent = CONFIG.name;
  if (CONFIG.subtitle) headerSub.textContent = CONFIG.subtitle;
  document.title = CONFIG.name || "DSVV Digital Research Shelf";

  if (CONFIG.background) {
    document.documentElement.style.setProperty("--bg", CONFIG.background);
  }
  if (CONFIG.shelfTone) {
    document.documentElement.style.setProperty("--shelf-tone", CONFIG.shelfTone);
  }

  // Audio start on first interaction
  document.addEventListener("click", () => initAudio(), { once: true });

  // Navigation handlers
  volBackBtn.addEventListener("click", (e) => {
    e.preventDefault();
    playClick();
    navigateTo("/");
  });

  brandLink.addEventListener("click", (e) => {
    e.preventDefault();
    playClick();
    navigateTo("/");
  });

  // Enable horizontal mouse wheel scrolling across the bookshelf
  if (shelfWrapper) {
    shelfWrapper.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        shelfWrapper.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  window.addEventListener("popstate", () => {
    handleRoute();
  });

  // Keyboard navigation
  document.addEventListener("keydown", onKeyDown);

  // Initial Year Filter Chips
  buildFilterChips();

  // Load Google Sheet data
  await loadData();

  // Polling for live updates
  startPolling();

  // Handle current URL route
  handleRoute();

  // Visibility change
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadData();
  });
}

/* ───────────── Data Loading & Sync ───────────── */
async function loadData() {
  const result = await fetchSheetData(CONFIG);

  if (result.error === "network") {
    syncOk = false;
    updateSyncUI();
    return;
  }

  if (result.error === "not-public") {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = "The Google Sheet is not shared. Click Share → Anyone with the link → Viewer, then reload.";
    return;
  }

  syncOk = true;
  lastSyncTime = new Date();
  updateSyncUI();

  const fp = dataFingerprint(result.journals, result.articles);
  if (fp === lastFingerprint && journals.length > 0) return; // No change

  applyData(result.journals, result.articles, fp);
}

function applyData(newJournals, newArticles, fp) {
  const isFirstLoad = journals.length === 0;
  journals = newJournals;
  articles = newArticles;
  lastFingerprint = fp || dataFingerprint(journals, articles);

  loadingEl.hidden = true;
  errorEl.hidden = true;

  buildShelf();
  buildSRList();
  applyFilter();

  // If currently on a volume route, re-render it
  handleRoute();

  if (!isFirstLoad) {
    showToast(`Research Shelf updated · ${journals.length} volumes`);
    announce(`Research shelf updated. ${journals.length} volumes loaded.`);
  }
}

function startPolling() {
  if (syncTimer) clearInterval(syncTimer);
  const interval = (CONFIG.refreshSeconds || 15) * 1000;
  syncTimer = setInterval(loadData, interval);
}

/* ───────────── Routing ───────────── */
function getRouteSlug() {
  const path = window.location.pathname;
  const hash = window.location.hash;

  const pathMatch = path.match(/\/volume\/([^\/]+)/i);
  if (pathMatch) return pathMatch[1];

  const hashMatch = hash.match(/#\/volume\/([^\/]+)/i);
  if (hashMatch) return hashMatch[1];

  return null;
}

export function navigateTo(url) {
  if (url === "/" || url === "") {
    window.history.pushState(null, "", "/");
  } else {
    window.history.pushState(null, "", url);
  }
  handleRoute();
}

function handleRoute() {
  const volSlug = getRouteSlug();

  if (volSlug) {
    closeModal(false);
    renderVolumePage(volSlug);
  } else {
    showShelfView();
  }
}

function showShelfView() {
  volumeView.hidden = true;
  shelfView.hidden = false;
  chipsWrap.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ───────────── Shelf Rendering ───────────── */
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildShelf() {
  shelf.innerHTML = "";
  shelfStats.textContent = `${journals.length} Volumes Available`;
  if (shelfWrapper) shelfWrapper.scrollLeft = 0;

  journals.forEach((j, i) => {
    const h = hashStr(j.volume);
    const width = 58 + (h % 18);          // 58–75px
    const height = 300 + (h % 35);        // 300–334px
    const tilt = ((h % 5) - 2) * 0.45;    // -0.9° to +0.9°

    const spine = document.createElement("button");
    spine.className = "spine";
    spine.setAttribute("role", "button");
    spine.setAttribute("aria-label", `Open ${j.volume} (${j.year}) - ${j.articleCount} articles`);
    spine.setAttribute("data-index", i);
    spine.setAttribute("data-year", j.year);
    spine.setAttribute("data-volume", j.volume);
    spine.setAttribute("data-slug", j.slug);
    spine.style.width = width + "px";
    spine.style.height = height + "px";
    spine.style.transform = `rotate(${tilt}deg)`;
    spine.style.background = j.coverColour;
    spine.style.color = j.textColour;

    // Head insignia
    const insignia = document.createElement("span");
    insignia.className = "spine-header-insignia";
    insignia.textContent = "DSVV";

    // Title (vertical)
    const titleContainer = document.createElement("div");
    titleContainer.className = "spine-title-container";
    const title = document.createElement("span");
    title.className = "spine-title";
    title.textContent = j.volume;
    titleContainer.appendChild(title);

    // Footer metadata (Year & Articles)
    const footerMeta = document.createElement("div");
    footerMeta.className = "spine-footer-meta";

    const yearBadge = document.createElement("span");
    yearBadge.className = "spine-year-badge";
    yearBadge.textContent = j.year || "DSVV";

    const countBadge = document.createElement("span");
    countBadge.className = "spine-articles-badge";
    countBadge.textContent = `${j.articleCount} Art.`;

    footerMeta.appendChild(yearBadge);
    footerMeta.appendChild(countBadge);

    spine.appendChild(insignia);
    spine.appendChild(titleContainer);
    spine.appendChild(footerMeta);

    spine.addEventListener("click", () => {
      playClick();
      openJournalModal(i);
    });

    shelf.appendChild(spine);
  });
}

/* ───────────── Year Filter Chips ───────────── */
function buildFilterChips() {
  chipsWrap.innerHTML = "";

  FILTER_YEARS.forEach(label => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = label;
    chip.setAttribute("aria-pressed", label === activeFilter ? "true" : "false");
    if (label === activeFilter) chip.classList.add("active");

    chip.addEventListener("click", () => {
      playClick();
      activeFilter = label;
      applyFilter();
    });

    chipsWrap.appendChild(chip);
  });
}

function applyFilter() {
  chipsWrap.querySelectorAll(".chip").forEach(c => {
    const isActive = c.textContent === activeFilter;
    c.setAttribute("aria-pressed", isActive ? "true" : "false");
    c.classList.toggle("active", isActive);
  });

  // Filter spines
  shelf.querySelectorAll(".spine").forEach(s => {
    const year = s.getAttribute("data-year") || "";
    let matches = false;

    if (activeFilter === "ALL") {
      matches = true;
    } else if (activeFilter === "ARCHIVE") {
      const yNum = parseInt(year, 10);
      matches = (!isNaN(yNum) && yNum < 2023) || year.toLowerCase().includes("archive");
    } else {
      matches = year === activeFilter;
    }

    s.classList.toggle("faded", !matches);
  });

  announce(`Showing ${activeFilter === "ALL" ? "all" : activeFilter} volumes.`);
}

/* ───────────── Volume Exploration Page (/volume/:volId) ───────────── */
function renderVolumePage(slug) {
  shelfView.hidden = true;
  chipsWrap.hidden = true;
  volumeView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Find matching journal
  const cleanSlug = cleanVolumeSlug(slug);
  const journal = journals.find(j =>
    j.slug === slug ||
    j.slug === cleanSlug ||
    cleanVolumeSlug(j.volume) === cleanSlug ||
    j.volume.toLowerCase() === slug.toLowerCase()
  ) || {
    volume: `Vol. ${slug}`,
    slug: cleanSlug,
    year: "",
    publicationDate: "",
    subheading: "DSVV Scholarly Collection",
    description: "Scholarly publications from Dev Sanskriti Vishwavidyalaya.",
    coverColour: "#102a43",
    textColour: "#dfba73",
    articleCount: 0,
    articles: [],
  };

  // Get articles for this volume
  const volArticles = articles.filter(a =>
    a.volumeSlug === cleanSlug ||
    (a.volume && journal.volume && a.volume.toLowerCase() === journal.volume.toLowerCase())
  );

  // Update Hero elements
  volBadge.textContent = journal.volume;
  volTitle.textContent = `${journal.volume} — Research Issues`;
  volSubheading.textContent = journal.subheading || "Dev Sanskriti Interdisciplinary International Journal";
  volDesc.textContent = journal.description || "Research and scholarly publications from Dev Sanskriti Vishwavidyalaya.";

  // Meta pills
  volMetaPills.innerHTML = `
    <span class="meta-pill">📅 Published: <strong>${journal.publicationDate || journal.year || "Recent"}</strong></span>
    <span class="meta-pill">🏛️ Publisher: <strong>DSVV Press</strong></span>
    <span class="meta-pill">📚 Total Articles: <strong>${volArticles.length}</strong></span>
    <span class="meta-pill">🏷️ Issue Year: <strong>${journal.year || "2026"}</strong></span>
  `;

  // Cover card inside hero
  volCoverArt.style.background = journal.coverColour || "#102a43";
  coverVolTitle.textContent = journal.volume;
  coverYear.textContent = journal.year || "DSVV";

  articlesBadge.textContent = `${volArticles.length} ${volArticles.length === 1 ? 'Article' : 'Articles'}`;

  // Render articles grouped by Article Type
  renderGroupedArticles(volArticles);

  announce(`Loaded volume ${journal.volume} with ${volArticles.length} articles.`);
}

function renderGroupedArticles(volArticles) {
  articlesContainer.innerHTML = "";

  if (volArticles.length === 0) {
    articlesContainer.innerHTML = `
      <div class="articles-empty">
        <p>No articles found for this volume in the Google Sheet yet.</p>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Adding articles with this volume in Google Sheets will display them here automatically.</p>
      </div>
    `;
    return;
  }

  // Group by Article Type
  const groups = {};
  volArticles.forEach(a => {
    const type = a.articleType || "Research Article";
    if (!groups[type]) groups[type] = [];
    groups[type].push(a);
  });

  // Render each group
  Object.entries(groups).forEach(([type, items]) => {
    const groupEl = document.createElement("div");
    groupEl.className = "article-type-group";

    const header = document.createElement("div");
    header.className = "article-type-header";
    header.innerHTML = `
      <h4 class="article-type-title">${type}</h4>
      <span class="article-type-count">${items.length}</span>
    `;
    groupEl.appendChild(header);

    items.forEach(article => {
      const card = document.createElement("div");
      card.className = "article-card";

      const doiHtml = article.doi
        ? `<a href="${article.doi}" target="_blank" rel="noopener noreferrer" class="doi-link">
             <span>DOI</span>
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
               <polyline points="15 3 21 3 21 9"></polyline>
               <line x1="10" y1="14" x2="21" y2="3"></line>
             </svg>
           </a>`
        : "";

      const pdfButton = article.pdfLink
        ? `<a href="${article.pdfLink}" target="_blank" rel="noopener noreferrer" class="read-pdf-btn">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
               <polyline points="14 2 14 8 20 8"></polyline>
               <line x1="16" y1="13" x2="8" y2="13"></line>
               <line x1="16" y1="17" x2="8" y2="17"></line>
               <polyline points="10 9 9 9 8 9"></polyline>
             </svg>
             <span>Read PDF</span>
           </a>`
        : `<span class="read-pdf-btn" style="opacity: 0.5; cursor: not-allowed;">PDF Pending</span>`;

      card.innerHTML = `
        <div class="article-info">
          <h5 class="article-title">${article.title || "Untitled Article"}</h5>
          <div class="article-authors">
            <span class="author-icon">✍️</span>
            <span>${article.authors || "Dev Sanskriti Vishwavidyalaya Faculty & Researchers"}</span>
          </div>
          <div class="article-meta-row">
            <span class="article-type-tag">${type}</span>
            ${doiHtml}
          </div>
        </div>
        ${pdfButton}
      `;

      groupEl.appendChild(card);
    });

    articlesContainer.appendChild(groupEl);
  });
}

/* ───────────── Modal Preview View (From Shelf Click) ───────────── */
function openJournalModal(index) {
  openJournalIndex = index;
  const journal = journals[index];
  playOpen();

  openView.hidden = false;
  document.body.classList.add("modal-open");

  renderModalView(journal, index);
  openView.focus();

  announce(`Opened preview for ${journal.volume}. ${index + 1} of ${journals.length}.`);
}

function renderModalView(journal, index) {
  openView.innerHTML = `
    <div class="ov-content">
      <button class="ov-close" aria-label="Close preview" id="ov-close-btn">&times;</button>
      <div class="ov-left">
        <div class="ov-cover" style="background:${journal.coverColour}; color:${journal.textColour};">
          <div class="cover-gold-border"></div>
          <span class="cover-dsvv-insignia">DSVV</span>
          <span class="cover-vol-title">${journal.volume}</span>
          <span class="cover-year">${journal.year || "2026"}</span>
        </div>
      </div>
      <div class="ov-right">
        <span class="ov-badge">${journal.volume} • ${journal.year || "2026"}</span>
        <h2 class="ov-title">${journal.volume}</h2>
        <p class="ov-subheading">${journal.subheading || "Research Collection"}</p>
        <p class="ov-description">${journal.description}</p>
        <div class="ov-meta">
          <span>📅 ${journal.publicationDate || journal.year}</span>
          <span>📚 ${journal.articleCount} ${journal.articleCount === 1 ? 'Article' : 'Articles'}</span>
        </div>
        <button class="ov-explore-btn" id="ov-explore-btn">
          <span>Explore Volume</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
        <div class="ov-nav">
          <button class="ov-nav-btn" id="ov-prev" aria-label="Previous volume" ${index === 0 ? "disabled" : ""}>&larr;</button>
          <span class="ov-counter">( ${index + 1} / ${journals.length} )</span>
          <button class="ov-nav-btn" id="ov-next" aria-label="Next volume" ${index === journals.length - 1 ? "disabled" : ""}>&rarr;</button>
        </div>
      </div>
    </div>
  `;

  // Modal interactions
  openView.querySelector("#ov-close-btn").addEventListener("click", () => closeModal(true));
  
  openView.querySelector("#ov-explore-btn").addEventListener("click", () => {
    playClick();
    closeModal(false);
    navigateTo(`/volume/${journal.slug}`);
  });

  openView.querySelector("#ov-prev")?.addEventListener("click", () => {
    playNav();
    navigateModal(-1);
  });

  openView.querySelector("#ov-next")?.addEventListener("click", () => {
    playNav();
    navigateModal(1);
  });
}

function closeModal(playSound = true) {
  if (playSound) playClose();
  openView.hidden = true;
  document.body.classList.remove("modal-open");
  openJournalIndex = -1;
}

function navigateModal(dir) {
  const newIdx = openJournalIndex + dir;
  if (newIdx < 0 || newIdx >= journals.length) return;
  openJournalIndex = newIdx;
  renderModalView(journals[newIdx], newIdx);
}

/* ───────────── Keyboard Handlers ───────────── */
function onKeyDown(e) {
  if (openJournalIndex >= 0) {
    if (e.key === "Escape") {
      closeModal(true);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      playNav();
      navigateModal(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      playNav();
      navigateModal(1);
      e.preventDefault();
    }
  }
}

/* ───────────── Sync Status UI ───────────── */
function updateSyncUI() {
  if (syncOk && lastSyncTime) {
    const t = lastSyncTime.toLocaleTimeString("en-GB", { hour12: false });
    syncEl.innerHTML = `<span class="sync-dot ok"></span> Synced with Sheet ${t}`;
  } else {
    syncEl.innerHTML = `<span class="sync-dot err"></span> Sheet unreachable, retrying…`;
  }
}

setInterval(() => {
  if (syncOk && lastSyncTime) {
    const t = lastSyncTime.toLocaleTimeString("en-GB", { hour12: false });
    syncEl.innerHTML = `<span class="sync-dot ok"></span> Synced with Sheet ${t}`;
  }
}, 1000);

/* ───────────── Helpers ───────────── */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3500);
}

function buildSRList() {
  srList.innerHTML = "";
  journals.forEach(j => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${j.volume} (${j.year})</strong>: ${j.description} — ${j.articleCount} articles`;
    srList.appendChild(li);
  });
}

function announce(msg) {
  liveRegion.textContent = msg;
}

/* ───────────── Start ───────────── */
init();
