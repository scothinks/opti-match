// Import necessary modules for Next.js API route, fuzzy matching, and Excel file handling.
import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';
import * as XLSX from 'xlsx';
// Import our custom data source module, which handles fetching and caching the master list.
import { getDataSource } from '@/lib/dataSource';

// --- Type Definitions ---
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

// --- Configuration Constants ---
const SIMILARITY_THRESHOLD = 90; // Name similarity score threshold.
const MAX_ENTRIES_LIMIT = 20000; // Max records in validation file.
const MAX_SOURCE_LIMIT = 500000; // Max records in default source file.

// --- HELPER FUNCTIONS ---

function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

function extractField(entry: Entry, possibleFieldNames: string[]): string {
    const normalizeKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const possibleNormalizedNames = possibleFieldNames.map(normalizeKey);

    for (const key of Object.keys(entry)) {
        if (possibleNormalizedNames.includes(normalizeKey(key))) {
            const value = entry[key];
            if (value !== null && value !== undefined) {
                return normalize(value);
            }
        }
    }
    return '';
}

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
 * Determines the validation status for a single entry against the source data.
 * IMPORTANT: This function now includes stricter identifier matching.
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

    // Look up by SSID and NIN to find all potential source matches.
    if (entrySSID && sourceBySSID.has(entrySSID)) {
      const match = sourceBySSID.get(entrySSID)!;
      if (!foundMatches.has(match)) { potentialMatches.push(match); foundMatches.add(match); }
    }
    if (entryNIN && sourceByNIN.has(entryNIN)) {
      const match = sourceByNIN.get(entryNIN)!;
      if (!foundMatches.has(match)) { potentialMatches.push(match); foundMatches.add(match); }
    }

    if (potentialMatches.length === 0) return { status: 'Invalid', reason: 'No record found in source' };

    // Select the best match based on a scoring system.
    let bestMatch = potentialMatches[0];
    let bestScore = 0;
    for (const match of potentialMatches) {
      const srcSSID = extractField(match, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);
      const srcNIN = extractField(match, ['NIN', 'nin', 'Nin', 'NationalID']);
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

    // --- UPDATED LOGIC FOR STRICTER IDENTIFIER MATCHING ---
    // If an identifier is present in BOTH entry and source, they MUST be equal.
    // If an identifier is present in ONE but missing in the OTHER, it's a mismatch.
    // If an identifier is missing in BOTH, it does not cause a mismatch.

    let ssidMatches = true; // Assume true initially
    const entrySSIDPresent = !!entrySSID;
    const srcSSIDPresent = !!srcSSID;

    if (entrySSIDPresent && srcSSIDPresent) {
        // Both present: they must be equal
        ssidMatches = (entrySSID === srcSSID);
    } else if (entrySSIDPresent !== srcSSIDPresent) {
        // One is present, the other is missing: this is a mismatch
        ssidMatches = false;
    }
    // If both are missing (else case), ssidMatches remains true, meaning no mismatch caused by absence.

    let ninMatches = true; // Assume true initially
    const entryNINPresent = !!entryNIN;
    const srcNINPresent = !!srcNIN;

    if (entryNINPresent && srcNINPresent) {
        // Both present: they must be equal
        ninMatches = (entryNIN === srcNIN);
    } else if (entryNINPresent !== srcNINPresent) {
        // One is present, the other is missing: this is a mismatch
        ninMatches = false;
    }
    // If both are missing (else case), ninMatches remains true, meaning no mismatch caused by absence.
    
    // --- END UPDATED LOGIC ---


    const nameSimilarity = token_set_ratio(entryName, srcName);
    const nameMatches = nameSimilarity >= SIMILARITY_THRESHOLD;

    // Final determination of 'Valid' or 'Partial Match'
    if (ssidMatches && ninMatches && nameMatches) {
      return { status: 'Valid', reason: `Verified (${nameSimilarity}% name match)`, matchedName: srcName, matchedSSID: srcSSID, matchedNIN: srcNIN, similarity: nameSimilarity };
    }

    // If not 'Valid', it's a 'Partial Match'. Collect reasons.
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
 * Parses an Excel/CSV file from a URL into an array of data Entry objects, 
 * with robust header detection and empty row filtering.
 */
async function parseFileFromUrl(url: string): Promise<{ data: Entry[], headers: string[] }> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName: string = workbook.SheetNames[0]; // Get the name of the first sheet.
        const sheet: XLSX.WorkSheet = workbook.Sheets[sheetName]; // Access the sheet using its name.

        const rowsAsArrays: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        if (rowsAsArrays.length === 0) {
            return { data: [], headers: [] };
        }
        
        const headerRowIndex = findBestHeaderRowIndex(rowsAsArrays);
        const headerArray: string[] = rowsAsArrays[headerRowIndex].map(h => String(h || '').trim());
        const dataRowsAsArrays = rowsAsArrays.slice(headerRowIndex + 1);

        const jsonData: Entry[] = dataRowsAsArrays
            .map(rowArray => {
                const entry: Entry = {};
                headerArray.forEach((header, index) => {
                    if (header) { 
                        entry[header] = rowArray[index];
                    }
                });
                return entry;
            })
            // Filter out rows that are entirely empty after mapping.
            .filter(obj => 
                Object.values(obj).some(value => value !== null && value !== undefined && String(value).trim() !== '')
            );

        return { data: jsonData, headers: headerArray.filter(h => h) };
    } catch (error) {
        console.error(`Error parsing file from URL ${url}:`, error);
        throw new Error('Could not read or parse the file from storage.');
    }
}

/**
 * Identifies the most probable header row in a spreadsheet.
 */
function findBestHeaderRowIndex(rows: any[][]): number {
    let headerRowIndex = 0;
    let maxKeywords = 0;
    const headerKeywords = ['ssid', 'nin', 'name', 'id', 'pension', 'account', 'bank', 'verification', 'no', 's/n'];

    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        const stringCellCount = row.filter(cell => typeof cell === 'string').length;
        const totalCellCount = row.filter(cell => cell != null && cell !== '').length;

        if (totalCellCount < 2 || (stringCellCount / totalCellCount < 0.5)) continue;

        const rowStr = row.join(' ').toLowerCase();
        const keywordMatches = headerKeywords.filter(k => rowStr.includes(k)).length;

        if (keywordMatches > maxKeywords) {
            maxKeywords = keywordMatches;
            headerRowIndex = i;
        }
    }
    return headerRowIndex;
}

// --- MAIN POST HANDLER ---
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { toValidateUrl } = body; 

    if (!toValidateUrl || typeof toValidateUrl !== 'string') {
      return NextResponse.json({ error: 'Request body must include toValidateUrl string.' }, { status: 400 });
    }
    
    // Fetch the default source data, leveraging caching.
    const sourceMap = await getDataSource(null); 
    const source = Array.from(sourceMap.values());

    // Parse the user's validation file.
    const { data: entries, headers: entriesHeaders } = await parseFileFromUrl(toValidateUrl);

    // Enforce file size limits.
    if (source.length > MAX_SOURCE_LIMIT) throw new Error(`Default source file exceeds limit of ${MAX_SOURCE_LIMIT} records.`);
    if (entries.length > MAX_ENTRIES_LIMIT) throw new Error(`Validation file exceeds limit of ${MAX_ENTRIES_LIMIT} records.`);

    // Prepare lookup maps and track duplicates in the source.
    const sourceBySSID = new Map<string, Entry>();
    const sourceByNIN = new Map<string, Entry>();
    const seenInSource = new Set<string>();
    const sourceWarnings: string[] = [];

    for (const srcRecord of source) {
      const ssid = extractField(srcRecord, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);
      if (ssid) {
        if (seenInSource.has(ssid)) {
          sourceWarnings.push(`Warning: Duplicate SSID '${ssid}' in source file for entry '${extractFullName(srcRecord) || 'N/A'}'. This record was ignored.`);
        } else {
          seenInSource.add(ssid);
          sourceBySSID.set(ssid, srcRecord);
        }
      }
      const nin = extractField(srcRecord, ['NIN', 'nin', 'Nin', 'NationalID']);
      if (nin) {
        if (!sourceByNIN.has(nin)) {
            sourceByNIN.set(nin, srcRecord);
        }
      }
    }

    // Process each entry in the validation file and check for duplicates within it.
    const results: ProcessedEntry[] = [];
    const seenInValidation = new Set<string>();
    
    for (const entry of entries) {
      const entrySSID = extractField(entry, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN']);

      if (entrySSID) {
        if (seenInValidation.has(entrySSID)) {
          results.push({
            ...entry,
            'Match Status': 'Invalid',
            'Match Reason': `Duplicate request in validation file (SSID: ${entrySSID}).`,
            'Matched Name': '',
            'Correct SSID': '',
            'Correct NIN': ''
          });
          continue; 
        }
        seenInValidation.add(entrySSID);
      }
      
      // Get the match status against the source data.
      const matchResult = getMatchStatus(entry, sourceBySSID, sourceByNIN);
      results.push({
        ...entry,
        'Match Status': matchResult.status,
        'Match Reason': matchResult.reason,
        'Matched Name': matchResult.matchedName || '',
        'Correct SSID': matchResult.matchedSSID || '',
        'Correct NIN': matchResult.matchedNIN || ''
      });
    }

    // Prepare final headers and results summary.
    const finalHeaders = Array.from(new Set([...entriesHeaders, 'Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']));
    
    const summary = {
      total: results.length,
      valid: results.filter(r => r['Match Status'] === 'Valid').length,
      invalid: results.filter(r => r['Match Status'] === 'Invalid').length,
      partialMatch: results.filter(r => r['Match Status'] === 'Partial Match').length,
      duplicatesInValidationFile: results.filter(r => r['Match Reason'].startsWith('Duplicate request in validation file')).length,
      sourceFileWarnings: sourceWarnings,
    };

    return NextResponse.json({ headers: finalHeaders, results, summary }, { status: 200 });

  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// --- Other HTTP Methods ---
// Disallow GET, PUT, and DELETE for this endpoint.
export async function GET() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function PUT() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }