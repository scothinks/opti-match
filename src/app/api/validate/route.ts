import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';
import * as XLSX from 'xlsx';

// Types and interfaces (unchanged)
type Entry = {
  [key: string]: string | number | null | undefined;
};

type ValidationResult = {
  status: 'Valid' | 'Invalid' | 'Partial Match';
  reason: string;
  matchedName?: string;
  matchedSSID?: string;
  matchedNIN?: string;
  similarity?: number;
};

type ProcessedEntry = Entry & {
  'Match Status': string;
  'Match Reason': string;
  'Matched Name':string;
  'Correct SSID': string;
  'Correct NIN': string;
};

// Configuration constants (unchanged)
const SIMILARITY_THRESHOLD = 90;
const MAX_ENTRIES_LIMIT = 20000;
const MAX_SOURCE_LIMIT = 500000;

// --- HELPER FUNCTIONS ---

function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

/**
 * **MODIFIED:** Simplified to no longer need the headerRow parameter.
 * It now reliably works on objects that have been correctly parsed.
 */
function extractField(entry: Entry, possibleFieldNames: string[]): string {
    const entryKeys = Object.keys(entry);
    const normalizeKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const possibleNormalizedNames = possibleFieldNames.map(normalizeKey);

    for (const key of entryKeys) {
        const normalizedKey = normalizeKey(key);
        if (possibleNormalizedNames.includes(normalizedKey)) {
            const value = entry[key];
            if (value !== null && value !== undefined) {
                return normalize(value);
            }
        }
    }
    return '';
}

/**
 * **MODIFIED:** Simplified to no longer need the headerRow parameter.
 */
function extractFullName(entry: Entry): string {
  const singleFullName = extractField(entry, ['FULL NAME', 'Full Name', 'full name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name', 'Customer Name', 'Person Name']);
  if (singleFullName) return singleFullName;
  const firstName = extractField(entry, ['firstname', 'first_name', 'first']);
  const middleName = extractField(entry, ['middlename', 'middle_name', 'middle']);
  const lastName = extractField(entry, ['lastname', 'last_name', 'last', 'surname']);
  const nameParts = [firstName, middleName, lastName].filter(Boolean);
  if (nameParts.length > 0) return normalize(nameParts.join(' '));
  return '';
}

/**
 * **MODIFIED:** Simplified to no longer need headerRow parameters.
 */
function getMatchStatus(entry: Entry, sourceBySSID: Map<string, Entry>, sourceByNIN: Map<string, Entry>): ValidationResult {
  try {
    const entrySSID = extractField(entry, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);
    const entryNIN = extractField(entry, ['NIN', 'nin', 'Nin', 'NationalID']);
    const entryName = extractFullName(entry);

    if (!entryName) return { status: 'Invalid', reason: `Missing name field.` };
    if (!entrySSID && !entryNIN) return { status: 'Invalid', reason: 'Missing both SSID and NIN' };

    const potentialMatches: Entry[] = [];
    const foundMatches = new Set<Entry>();

    if (entrySSID && sourceBySSID.has(entrySSID)) {
      const match = sourceBySSID.get(entrySSID)!;
      if (!foundMatches.has(match)) {
        potentialMatches.push(match);
        foundMatches.add(match);
      }
    }
    if (entryNIN && sourceByNIN.has(entryNIN)) {
      const match = sourceByNIN.get(entryNIN)!;
      if (!foundMatches.has(match)) {
        potentialMatches.push(match);
        foundMatches.add(match);
      }
    }

    if (potentialMatches.length === 0) return { status: 'Invalid', reason: 'No record found' };

    let bestMatch = potentialMatches[0];
    let bestScore = 0;
    for (const match of potentialMatches) {
      const srcSSID = extractField(match, ['SSID', 'ssid']);
      const srcNIN = extractField(match, ['NIN', 'nin']);
      const srcName = extractFullName(match);
      let score = 0;
      if (entrySSID && srcSSID && srcSSID === entrySSID) score += 40;
      if (entryNIN && srcNIN && srcNIN === entryNIN) score += 40;
      if (srcName) score += token_set_ratio(entryName, srcName) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    const srcSSID = extractField(bestMatch, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);
    const srcNIN = extractField(bestMatch, ['NIN', 'nin', 'Nin', 'NationalID']);
    const srcName = extractFullName(bestMatch);

    if (!srcName) return { status: 'Invalid', reason: 'Source record missing name' };

    const ssidMatches = !entrySSID || !srcSSID || entrySSID === srcSSID;
    const ninMatches = !entryNIN || !srcNIN || entryNIN === srcNIN;
    const nameSimilarity = token_set_ratio(entryName, srcName);
    const nameMatches = nameSimilarity >= SIMILARITY_THRESHOLD;

    if (ssidMatches && ninMatches && nameMatches) {
      return { status: 'Valid', reason: `Verified (${nameSimilarity}% name match)`, matchedName: srcName, matchedSSID: srcSSID, matchedNIN: srcNIN, similarity: nameSimilarity };
    }

    const mismatches: string[] = [];
    if (!ssidMatches) mismatches.push(`SSID mismatch`);
    if (!ninMatches) mismatches.push(`NIN mismatch`);
    if (!nameMatches) mismatches.push(`Name similarity: ${nameSimilarity}%`);

    return { status: 'Partial Match', reason: `Issues: ${mismatches.join('; ')}`, matchedName: srcName, matchedSSID: srcSSID, matchedNIN: srcNIN, similarity: nameSimilarity };
  } catch (error) {
    return { status: 'Invalid', reason: `System error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * **NEW:** Helper function to find the best header row from raw data.
 */
function findBestHeaderRowIndex(rows: any[][]): number {
    let headerRowIndex = 0;
    let maxKeywords = 0;

    const headerKeywords = ['ssid', 'nin', 'name', 'id', 'pension', 'account', 'bank', 'verification', 'no', 's/n'];

    // Check the first 10 rows for the best candidate
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        // A good header row should contain mostly strings
        const stringCellCount = row.filter(cell => typeof cell === 'string').length;
        const totalCellCount = row.filter(cell => cell != null && cell !== '').length;

        if (totalCellCount < 2 || (stringCellCount / totalCellCount < 0.5)) {
            continue;
        }

        const rowStr = row.join(' ').toLowerCase();
        const keywordMatches = headerKeywords.filter(k => rowStr.includes(k)).length;

        if (keywordMatches > maxKeywords) {
            maxKeywords = keywordMatches;
            headerRowIndex = i;
        }
    }
    return headerRowIndex;
}

/**
 * **REWRITTEN:** This function now correctly finds the header before parsing.
 */
async function parseFileFromUrl(url: string): Promise<{ data: Entry[], headers: string[] }> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 1. Get ALL rows as raw arrays to inspect them
        const rowsAsArrays: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        if (rowsAsArrays.length === 0) {
            return { data: [], headers: [] };
        }
        
        // 2. Find the best header row from the raw data
        const headerRowIndex = findBestHeaderRowIndex(rowsAsArrays);
        const headerArray: string[] = rowsAsArrays[headerRowIndex].map(h => String(h || '').trim());
        
        // 3. The actual data starts on the row *after* the header
        const dataRowsAsArrays = rowsAsArrays.slice(headerRowIndex + 1);

        // 4. Manually create objects using the correct headers as keys
        const jsonData: Entry[] = dataRowsAsArrays.map(rowArray => {
            const entry: Entry = {};
            headerArray.forEach((header, index) => {
                if (header) { // Only use non-empty header cells as keys
                    entry[header] = rowArray[index];
                }
            });
            return entry;
        }).filter(obj => Object.values(obj).some(val => val !== null && val !== '')); // Filter out completely empty data rows

        return { data: jsonData, headers: headerArray.filter(h => h) }; // Return clean data and headers

    } catch (error) {
        console.error(`Error parsing file from URL ${url}:`, error);
        throw new Error('Could not read or parse the file from storage.');
    }
}


// --- MAIN POST HANDLER ---
/**
 * **MODIFIED:** Simplified to use the new robust parsing logic.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { sourceUrl, toValidateUrl } = body;

    if (!sourceUrl || !toValidateUrl || typeof sourceUrl !== 'string' || typeof toValidateUrl !== 'string') {
      return NextResponse.json({ error: 'Request body must include sourceUrl and toValidateUrl strings.' }, { status: 400 });
    }
    
    // The new parseFileFromUrl handles all header detection and data slicing internally.
    const [{ data: source, headers: sourceHeaders }, { data: entries, headers: entriesHeaders }] = await Promise.all([
      parseFileFromUrl(sourceUrl),
      parseFileFromUrl(toValidateUrl),
    ]);

    if (source.length > MAX_SOURCE_LIMIT) throw new Error(`Source file exceeds limit of ${MAX_SOURCE_LIMIT} records.`);
    if (entries.length > MAX_ENTRIES_LIMIT) throw new Error(`Validation file exceeds limit of ${MAX_ENTRIES_LIMIT} records.`);

    // The rest of the logic proceeds with correctly parsed data.
    const sourceBySSID = new Map<string, Entry>();
    const sourceByNIN = new Map<string, Entry>();

    for (const srcRecord of source) {
      const ssid = extractField(srcRecord, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);
      const nin = extractField(srcRecord, ['NIN', 'nin', 'Nin', 'NationalID']);
      if (ssid) sourceBySSID.set(ssid, srcRecord);
      if (nin) sourceByNIN.set(nin, srcRecord);
    }

    const results: ProcessedEntry[] = [];
    for (const entry of entries) {
      const matchResult = getMatchStatus(entry, sourceBySSID, sourceByNIN);
      results.push({ ...entry, 'Match Status': matchResult.status, 'Match Reason': matchResult.reason, 'Matched Name': matchResult.matchedName || '', 'Correct SSID': matchResult.matchedSSID || '', 'Correct NIN': matchResult.matchedNIN || '' });
    }

    // Use a Set to ensure final headers are unique
    const finalHeaders = Array.from(new Set([
        ...entriesHeaders, 
        'Match Status', 
        'Match Reason', 
        'Matched Name', 
        'Correct SSID', 
        'Correct NIN'
    ]));
    
    const response = {
      headers: finalHeaders,
      results: results,
      summary: {
        total: results.length,
        valid: results.filter(r => r['Match Status'] === 'Valid').length,
        invalid: results.filter(r => r['Match Status'] === 'Invalid').length,
        partialMatch: results.filter(r => r['Match Status'] === 'Partial Match').length,
      }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Other HTTP methods (unchanged)
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
