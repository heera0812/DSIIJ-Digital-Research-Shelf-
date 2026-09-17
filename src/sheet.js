/**
 * sheet.js — Fetches JOURNALS and ARTICLES from Google Sheets as CSV,
 * parses volumes and articles, correlates them, and returns structured data.
 */

import { parseCSV, normalise } from "./csv.js";

/** Extract the sheet ID from a full Google Sheets URL. */
export function extractSheetId(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error("Cannot extract sheet ID from URL: " + url);
  return m[1];
}

/** Build the gviz CSV export URL for a given tab, with cache-bust. */
export function csvUrl(sheetId, tabName) {
  const encoded = encodeURIComponent(tabName);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encoded}&_t=${Date.now()}`;
}

/** Column aliases for JOURNALS tab */
const JOURNAL_FIELDS = {
  order:           ["order", "sno", "id"],
  volume:          ["volume", "vol", "volume name", "journal volume", "book name", "bookname"],
  year:            ["year"],
  publicationdate: ["publication date", "pub date", "date", "published"],
  subheading:      ["subheading", "sub heading"],
  description:     ["description", "desc"],
  coverimage:      ["cover image", "cover", "image", "coverimage"],
  buttontext:      ["button text", "buttontext"],
  buttonlink:      ["button link", "buttonlink"],
  category:        ["category"],
};

/** Column aliases for ARTICLES tab */
const ARTICLE_FIELDS = {
  volume:      ["volume", "vol", "journal volume"],
  articletype: ["article type", "articletype", "type", "category", "section"],
  authors:     ["authors", "author"],
  title:       ["article title", "title", "articletitle"],
  doi:         ["doi", "doi link", "doilink"],
  pdflink:     ["pdf link", "pdflink", "pdf", "link", "read pdf"],
};

/** Find the column header that matches any of the aliases. */
function findCol(headers, aliases) {
  for (const alias of aliases) {
    const norm = normalise(alias);
    const found = headers.find(h => h === norm);
    if (found) return found;
  }
  return null;
}

/** Extract clean volume identifier (e.g. "Vol. 28" -> "28") */
export function cleanVolumeSlug(volStr) {
  if (!volStr) return "";
  const num = volStr.match(/\d+/);
  if (num) return num[0];
  return volStr.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Ensure a URL starts with a protocol */
function ensureProtocol(url) {
  if (!url) return "";
  url = url.trim();
  if (url === "") return "";
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url;
}

/** Rich scholarly palettes for journal covers/spines */
const ACADEMIC_PALETTES = [
  { cover: "#102a43", text: "#e0b970", spineRib: "#e0b97044", accent: "#d4af37" }, // Oxford Sapphire & Gold
  { cover: "#40131e", text: "#f6d89b", spineRib: "#f6d89b44", accent: "#f59e0b" }, // Imperial Burgundy
  { cover: "#133527", text: "#e8dcbe", spineRib: "#e8dcbe44", accent: "#10b981" }, // Emerald & Parchment
  { cover: "#1e1b4b", text: "#fcd34d", spineRib: "#fcd34d44", accent: "#6366f1" }, // Midnight Indigo
  { cover: "#351e10", text: "#fde68a", spineRib: "#fde68a44", accent: "#d97706" }, // Antique Leather
  { cover: "#0d353f", text: "#e2e8f0", spineRib: "#e2e8f044", accent: "#38bdf8" }, // Academic Teal
  { cover: "#262626", text: "#e5e7eb", spineRib: "#e5e7eb44", accent: "#9ca3af" }, // Classic Charcoal
];

/**
 * Fetch and parse JOURNALS and ARTICLES sheets.
 * Returns { journals, articles, error }.
 */
export async function fetchSheetData(config) {
  const sheetId = extractSheetId(config.sheet);
  const journalsUrl = csvUrl(sheetId, config.journalsTab || "JOURNALS");
  const articlesUrl = csvUrl(sheetId, config.articlesTab || "ARTICLES");

  let journalsText, articlesText;
  try {
    const opts = { cache: "no-store" };
    const [jRes, aRes] = await Promise.all([
      fetch(journalsUrl, opts),
      fetch(articlesUrl, opts),
    ]);

    journalsText = await jRes.text();
    articlesText = await aRes.text();
  } catch (e) {
    console.error("[DSVV Shelf] Network fetch error:", e);
    return { journals: [], articles: [], error: "network" };
  }

  // Check for HTML (sheet not public)
  if (
    journalsText.trim().startsWith("<!") ||
    journalsText.trim().startsWith("<html") ||
    articlesText.trim().startsWith("<!") ||
    articlesText.trim().startsWith("<html")
  ) {
    return { journals: [], articles: [], error: "not-public" };
  }

  // 1. Parse Articles
  const articlesParsed = parseCSV(articlesText);
  const aCols = {};
  for (const [key, aliases] of Object.entries(ARTICLE_FIELDS)) {
    aCols[key] = findCol(articlesParsed.headers, aliases);
  }

  const articles = [];
  for (const row of articlesParsed.rows) {
    const title = (row[aCols.title] || "").trim();
    const volume = (row[aCols.volume] || "").trim();
    if (!title && !volume) continue;

    articles.push({
      volume,
      volumeSlug: cleanVolumeSlug(volume),
      articleType: (row[aCols.articletype] || "Research Article").trim(),
      authors: (row[aCols.authors] || "").trim(),
      title,
      doi: ensureProtocol(row[aCols.doi] || ""),
      pdfLink: ensureProtocol(row[aCols.pdflink] || ""),
    });
  }

  // 2. Parse Journals
  const journalsParsed = parseCSV(journalsText);
  const jCols = {};
  for (const [key, aliases] of Object.entries(JOURNAL_FIELDS)) {
    jCols[key] = findCol(journalsParsed.headers, aliases);
  }

  const journals = [];
  let paletteIdx = 0;

  for (const row of journalsParsed.rows) {
    const volume = (row[jCols.volume] || "").trim();
    if (!volume) continue;

    const slug = cleanVolumeSlug(volume);
    const matchedArticles = articles.filter(a =>
      (a.volume && volume && a.volume.toLowerCase() === volume.toLowerCase()) ||
      (a.volumeSlug && slug && a.volumeSlug === slug)
    );

    const p = ACADEMIC_PALETTES[paletteIdx % ACADEMIC_PALETTES.length];
    paletteIdx++;

    const year = (row[jCols.year] || "").trim();
    const pubDate = (row[jCols.publicationdate] || "").trim();

    journals.push({
      order: parseFloat(row[jCols.order]) || (journals.length + 1),
      volume,
      slug,
      year: year || (pubDate.match(/\b(20\d\d)\b/)?.[1] || ""),
      publicationDate: pubDate,
      subheading: (row[jCols.subheading] || "").trim(),
      description: (row[jCols.description] || "Research and scholarly publications from Dev Sanskriti Vishwavidyalaya").trim(),
      coverImage: (row[jCols.coverimage] || "").trim(),
      buttonText: (row[jCols.buttontext] || "Explore Volume").trim(),
      buttonLink: `/volume/${slug}`,
      category: (row[jCols.category] || year).trim(),
      coverColour: p.cover,
      textColour: p.text,
      accentColour: p.accent,
      articleCount: matchedArticles.length,
      articles: matchedArticles,
    });
  }

  journals.sort((a, b) => a.order - b.order);

  return { journals, articles, error: null };
}

/**
 * Fingerprint covering all journals and articles for live update detection.
 */
export function dataFingerprint(journals, articles) {
  const jFp = journals.map(j =>
    `${j.order}|${j.volume}|${j.year}|${j.publicationDate}|${j.subheading}|${j.description}|${j.articleCount}`
  ).join("\n");

  const aFp = articles.map(a =>
    `${a.volume}|${a.articleType}|${a.authors}|${a.title}|${a.doi}|${a.pdfLink}`
  ).join("\n");

  return `${jFp}===ARTICLES===\n${aFp}`;
}
