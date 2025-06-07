import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';
import * as XLSX from 'xlsx';

// Types and interfaces
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
  'Matched Name': string;
  'Correct SSID': string;
  'Correct NIN': string;
};

// Configuration constants
const SIMILARITY_THRESHOLD = 90;
const MAX_ENTRIES_LIMIT = 20000;
const MAX_SOURCE_LIMIT = 500000;

// HELPER FUNCTIONS (normalize, isLikelyHeaderRow, findHeaderRow, extractField, etc.)

function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

function isLikelyHeaderRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map(String).map(v => v.toLowerCase());
  const headerPatterns = [
    /^(ssid|nin|id|number|no\.?|ref|reference)$/,
    /^(name|full.?name|beneficiary|customer|person)$/,
    /^(status|state|condition|result)$/,
    /^(bank|account|acct|institution)$/,
    /^(date|time|created|updated|modified)$/,
    /^(column|field|data|info|details)$/
  ];
  const hasHeaderPattern = values.some(value => 
    headerPatterns.some(pattern => pattern.test(value))
  );
  const hasTextContent = values.some(value => 
    value.length > 0 && isNaN(Number(value)) && !/^\d+$/.test(value) && value !== 'null' && value !== 'undefined'
  );
  const hasReasonableLength = values.some(value => value.length >= 2 && value.length <= 50);
  return hasHeaderPattern || (hasTextContent && hasReasonableLength);
}

function findHeaderRow(rows: Entry[]): number {
  if (rows.length === 0) return 0;
  if (isLikelyHeaderRow(rows[0])) return 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (isLikelyHeaderRow(rows[i])) return i;
  }
  if (rows.length > 1) {
    const firstRowValues = Object.values(rows[0]).map(String);
    const secondRowValues = Object.values(rows[1]).map(String);
    const firstRowHasText = firstRowValues.some(v => v.length > 0 && isNaN(Number(v)) && !/^\d+$/.test(v));
    const secondRowHasMoreNumbers = secondRowValues.filter(v => !isNaN(Number(v)) || /^\d+$/.test(v)).length > firstRowValues.filter(v => !isNaN(Number(v)) || /^\d+$/.test(v)).length;
    if (firstRowHasText && secondRowHasMoreNumbers) return 0;
  }
  return 0;
}

function extractField(entry: Entry, possibleFieldNames: string[], headerRow?: Entry): string {
  const normalizeKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^_+|_+$/g, '').replace('fullname', 'name').replace('beneficiaryname', 'name').replace('customername', 'name').replace('personname', 'name').replace('nin', 'nationalid').replace('ssid', 'socialsecurity').replace('socialsecurityid', 'socialsecurity').replace('ssn', 'socialsecurity');
  if (headerRow) {
    const fieldMap: Record<string, string> = {};
    for (const [key, value] of Object.entries(headerRow)) {
      if (value !== null && value !== undefined) {
        const normalizedValue = normalizeKey(String(value));
        if (normalizedValue) fieldMap[normalizedValue] = key;
      }
    }
    for (const field of possibleFieldNames) {
      const normalizedField = normalizeKey(field);
      if (fieldMap[normalizedField]) {
        const value = entry[fieldMap[normalizedField]];
        if (value !== null && value !== undefined) {
          const stringValue = String(value).trim();
          if (stringValue) return normalize(stringValue);
        }
      }
    }
  }
  for (const field of possibleFieldNames) {
    if (entry[field] !== undefined && entry[field] !== null) {
      const stringValue = String(entry[field]).trim();
      if (stringValue) return normalize(stringValue);
    }
    const normalizedField = normalizeKey(field);
    for (const [key, value] of Object.entries(entry)) {
      if (normalizeKey(key) === normalizedField && value !== null && value !== undefined) {
        const stringValue = String(value).trim();
        if (stringValue) return normalize(stringValue);
      }
    }
  }
  return '';
}

function extractFullName(entry: Entry, headerRow?: Entry): string {
  const singleFullName = extractField(entry, ['FULL NAME', 'Full Name', 'full name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name', 'Customer Name', 'Person Name'], headerRow);
  if (singleFullName) return singleFullName;
  const firstName = extractField(entry, ['firstname', 'first_name', 'first'], headerRow);
  const middleName = extractField(entry, ['middlename', 'middle_name', 'middle'], headerRow);
  const lastName = extractField(entry, ['lastname', 'last_name', 'last', 'surname'], headerRow);
  const nameParts = [firstName, middleName, lastName].filter(Boolean);
  if (nameParts.length > 0) return normalize(nameParts.join(' '));
  return '';
}

function getMatchStatus(entry: Entry, sourceBySSID: Map<string, Entry>, sourceByNIN: Map<string, Entry>, sourceHeaderRow?: Entry, entryHeaderRow?: Entry): ValidationResult {
  try {
    const entrySSID = extractField(entry, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], entryHeaderRow);
    const entryNIN = extractField(entry, ['NIN', 'nin', 'Nin', 'NationalID'], entryHeaderRow);
    const entryName = extractFullName(entry, entryHeaderRow);

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
      const srcSSID = extractField(match, ['SSID', 'ssid'], sourceHeaderRow);
      const srcNIN = extractField(match, ['NIN', 'nin'], sourceHeaderRow);
      const srcName = extractFullName(match, sourceHeaderRow);
      let score = 0;
      if (entrySSID && srcSSID && srcSSID === entrySSID) score += 40;
      if (entryNIN && srcNIN && srcNIN === entryNIN) score += 40;
      if (srcName) score += token_set_ratio(entryName, srcName) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    const srcSSID = extractField(bestMatch, ['SSID', 'ssid', 'Ssid'], sourceHeaderRow);
    const srcNIN = extractField(bestMatch, ['NIN', 'nin', 'Nin'], sourceHeaderRow);
    const srcName = extractFullName(bestMatch, sourceHeaderRow);

    if (!srcName) return { status: 'Invalid', reason: 'Source record missing name' };

    const ssidMatches = !entrySSID || !srcSSID || entrySSID === srcSSID;
    const ninMatches = !entryNIN || !srcNIN || entryNIN === srcNIN;
    const nameSimilarity = token_set_ratio(entryName, srcName);
    const nameMatches = nameSimilarity >= SIMILARITY_THRESHOLD;

    if (ssidMatches && ninMatches && nameMatches) {
      return { 
        status: 'Valid', 
        reason: `Verified (${nameSimilarity}% name match)`, 
        matchedName: srcName, 
        matchedSSID: extractField(bestMatch, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], sourceHeaderRow), 
        matchedNIN: extractField(bestMatch, ['NIN', 'nin', 'Nin', 'NationalID'], sourceHeaderRow), 
        similarity: nameSimilarity 
      };
    }

    const mismatches: string[] = [];
    if (!ssidMatches) mismatches.push(`SSID mismatch`);
    if (!ninMatches) mismatches.push(`NIN mismatch`);
    if (!nameMatches) mismatches.push(`Name similarity: ${nameSimilarity}%`);

    return { 
      status: 'Partial Match', 
      reason: `Issues: ${mismatches.join('; ')}`, 
      matchedName: srcName, 
      matchedSSID: extractField(bestMatch, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], sourceHeaderRow), 
      matchedNIN: extractField(bestMatch, ['NIN', 'nin', 'Nin', 'NationalID'], sourceHeaderRow), 
      similarity: nameSimilarity 
    };
  } catch (error) {
    return { status: 'Invalid', reason: `System error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function parseFileFromUrl(url: string): Promise<Entry[]> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch file from blob storage: ${response.statusText}`);
        }
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(sheet);
    } catch (error) {
        console.error(`Error parsing file from URL ${url}:`, error);
        throw new Error('Could not read or parse the file from storage.');
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { sourceUrl, toValidateUrl } = body;

    if (!sourceUrl || !toValidateUrl || typeof sourceUrl !== 'string' || typeof toValidateUrl !== 'string') {
      return NextResponse.json({ error: 'Request body must include sourceUrl and toValidateUrl strings.' }, { status: 400 });
    }

    const [sourceWithHeader, entriesWithHeader] = await Promise.all([
      parseFileFromUrl(sourceUrl),
      parseFileFromUrl(toValidateUrl),
    ]);

    if (sourceWithHeader.length > MAX_SOURCE_LIMIT) throw new Error(`Source file exceeds limit of ${MAX_SOURCE_LIMIT} records.`);
    if (entriesWithHeader.length > MAX_ENTRIES_LIMIT) throw new Error(`Validation file exceeds limit of ${MAX_ENTRIES_LIMIT} records.`);

    const sourceHeaderRowIndex = findHeaderRow(sourceWithHeader);
    const sourceHeaderRow = sourceWithHeader[sourceHeaderRowIndex];
    const source = sourceWithHeader.slice(sourceHeaderRowIndex + 1);

    const entriesHeaderRowIndex = findHeaderRow(entriesWithHeader);
    const entriesHeaderRow = entriesWithHeader[entriesHeaderRowIndex];
    const entries = entriesWithHeader.slice(entriesHeaderRowIndex + 1);

    const sourceBySSID = new Map<string, Entry>();
    const sourceByNIN = new Map<string, Entry>();

    for (const srcRecord of source) {
      const ssid = extractField(srcRecord, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], sourceHeaderRow);
      const nin = extractField(srcRecord, ['NIN', 'nin', 'Nin', 'NationalID'], sourceHeaderRow);
      if (ssid) sourceBySSID.set(ssid, srcRecord);
      if (nin) sourceByNIN.set(nin, srcRecord);
    }

    const results: ProcessedEntry[] = [];
    for (const entry of entries) {
      const matchResult = getMatchStatus(entry, sourceBySSID, sourceByNIN, sourceHeaderRow, entriesHeaderRow);
      results.push({ ...entry, 'Match Status': matchResult.status, 'Match Reason': matchResult.reason, 'Matched Name': matchResult.matchedName || '', 'Correct SSID': matchResult.matchedSSID || '', 'Correct NIN': matchResult.matchedNIN || '' });
    }

    const responseHeaders = entriesHeaderRow ? Object.keys(entriesHeaderRow).concat(['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']) : (entries[0] ? Object.keys(entries[0]).concat(['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']) : ['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']);
    
    const response = {
      headers: responseHeaders,
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

// Other HTTP methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}