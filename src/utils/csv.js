/**
 * CSV Parser Utility
 */

/**
 * Parse CSV text into array of objects
 * @param {string} text - Raw CSV text
 * @returns {Array<Object>} Parsed rows
 */
export function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0 || (values.length === 1 && !values[0].trim())) continue;

        const row = {};
        headers.forEach((h, idx) => {
            row[h] = (values[idx] || '').trim();
        });
        rows.push(row);
    }

    return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

/**
 * Validate CSV has required columns
 */
export function validateCSV(rows) {
    if (rows.length === 0) return { valid: false, error: 'CSV 文件为空' };

    const first = rows[0];
    if (!first.word) {
        return { valid: false, error: '缺少必需的 "word" 列' };
    }

    return { valid: true, error: null };
}
