/**
 * csv.js — RFC 4180 compliant CSV parser.
 * Handles quoted fields, commas inside quotes, and line breaks inside quotes.
 */

/**
 * Parse a CSV string into an array of objects.
 * Headers are normalised: lowercased, trimmed, punctuation and extra spaces removed.
 * @param {string} raw — The raw CSV text.
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSV(raw) {
  const lines = tokeniseRows(raw);
  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = lines[0];
  const normMap = {};               // normKey → original header text
  const headers = rawHeaders.map(h => {
    const norm = normalise(h);
    normMap[norm] = h;
    return norm;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.length === 0 || cells.every(c => c.trim() === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] || "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Normalise a header: lowercase, strip non-alphanumeric except spaces, collapse spaces.
 */
export function normalise(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenise CSV text into a 2-D array of strings.
 * Fully supports RFC 4180: quoted fields, escaped quotes (""), and newlines inside quotes.
 */
function tokeniseRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = "";
        i++;
      } else if (ch === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else if (ch === '\n') {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field / row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
