/**
 * config.js — DSVV Digital Research Shelf Configuration
 *
 * sheet          → Full Google Sheets URL (Shared as "Anyone with the link: Viewer")
 * journalsTab    → Name of the tab with journal volumes
 * articlesTab    → Name of the tab with articles
 * coloursTab     → Name of the tab with colour definitions (optional)
 * refreshSeconds → How often (in seconds) to re-fetch from the sheet
 * name           → University bookshelf title
 * subtitle       → Header subtitle
 * background     → Page background colour (hex)
 * shelfTone      → Colour of the wooden plank (hex)
 */
const CONFIG = Object.freeze({
  sheet: "https://docs.google.com/spreadsheets/d/1zjr_VBl-oKUvJ5kM-Ifx0bTJQmbTnc64EHJr_4KsYJE/edit?usp=sharing",
  journalsTab: "JOURNALS",
  articlesTab: "ARTICLES",
  coloursTab: "Colours",
  refreshSeconds: 15,
  name: "DSVV DIGITAL RESEARCH SHELF",
  subtitle: "Explore Research • Journals • Scholarly Publications",
  background: "#0d1117",
  shelfTone: "#4a2e18",
});
