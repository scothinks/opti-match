import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';

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
const MAX_ENTRIES_LIMIT = 10000;
const MAX_SOURCE_LIMIT = 50000;

// Enhanced normalization with better safety checks
function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

// Validate individual entry structure
function validateEntry(entry: unknown, context: string): entry is Entry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Invalid ${context}: must be a non-null object`);
  }
  return true;
}

// Helper to detect if a row is likely headers
function isLikelyHeaderRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map(String);
  const headerKeywords = ['name', 'id', 'ssid', 'nin', 'account', 'bank', 'no', 'number'];

  return values.some(value =>
    headerKeywords.some(keyword =>
      value.toLowerCase().includes(keyword)
    )
  );
}

// Find the first row that looks like headers in a dataset
function findHeaderRow(rows: Entry[]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) { // Check first 5 rows max
    if (isLikelyHeaderRow(rows[i])) {
      return i;
    }
  }
  return 0; // Default to first row if no headers found
}

// Enhanced field extractor with optional header row detection
function extractField(entry: Entry, possibleFieldNames: string[], headerRow?: Entry): string {
  const normalizeKey = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace('fullname', 'name')
      .replace('nin', 'nationalid')
      .replace('ssid', 'socialsecurity');

  // If we have a header row, use it to build a field mapping
  if (headerRow) {
    const fieldMap: Record<string, string> = {};
    for (const [key, value] of Object.entries(headerRow)) {
      const normalizedValue = normalizeKey(String(value));
      fieldMap[normalizedValue] = key; // Map normalized header to original key
    }

    for (const field of possibleFieldNames) {
      const normalizedField = normalizeKey(field);
      if (fieldMap[normalizedField]) {
        const value = entry[fieldMap[normalizedField]];
        return value !== null && value !== undefined ? normalize(value) : '';
      }
    }
  }

  // Fallback to original behavior if no header row or no match
  for (const field of possibleFieldNames) {
    const value = entry[field];
    if (value !== null && value !== undefined && String(value).trim()) {
      return normalize(value);
    }
  }
  return '';
}

// Safe string extraction for return values
function safeStringExtract(entry: Entry, fieldNames: string[]): string {
  for (const fieldName of fieldNames) {
    const value = entry[fieldName];
    if (value !== null && value !== undefined) {
      const stringValue = String(value).trim();
      if (stringValue) return stringValue;
    }
  }
  return '';
}

// Validate request payload structure and detect header rows
function validateRequestPayload(body: unknown): {
  source: Entry[];
  entries: Entry[];
  sourceHeaderRow?: Entry;
  entriesHeaderRow?: Entry;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;

  if (!Array.isArray(payload.source)) throw new Error('Source must be an array');
  if (payload.source.length === 0) throw new Error('Source array cannot be empty');
  if (payload.source.length > MAX_SOURCE_LIMIT) throw new Error(`Source array too large. Maximum ${MAX_SOURCE_LIMIT} entries allowed`);

  if (!Array.isArray(payload.entries)) throw new Error('Entries must be an array');
  if (payload.entries.length === 0) throw new Error('Entries array cannot be empty');
  if (payload.entries.length > MAX_ENTRIES_LIMIT) throw new Error(`Entries array too large. Maximum ${MAX_ENTRIES_LIMIT} entries allowed`);

  payload.source.forEach((entry, index) => {
    try {
      validateEntry(entry, `source entry at index ${index}`);
    } catch (error) {
      throw new Error(`Invalid source entry at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  payload.entries.forEach((entry, index) => {
    try {
      validateEntry(entry, `entry at index ${index}`);
    } catch (error) {
      throw new Error(`Invalid entry at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Detect header rows
  const sourceRows = payload.source as Entry[];
  const entryRows = payload.entries as Entry[];

  const sourceHeaderRowIndex = findHeaderRow(sourceRows);
  const entriesHeaderRowIndex = findHeaderRow(entryRows);

  return {
    source: sourceRows.slice(sourceHeaderRowIndex + 1),
    entries: entryRows.slice(entriesHeaderRowIndex + 1),
    sourceHeaderRow: sourceRows[sourceHeaderRowIndex],
    entriesHeaderRow: entryRows[entriesHeaderRowIndex]
  };
}

// Enhanced matching logic with flexible field extraction and header-awareness
function getMatchStatus(
  entry: Entry,
  source: Entry[],
  sourceHeaderRow?: Entry,
  entryHeaderRow?: Entry
): ValidationResult {
  try {
    // Debug: Log detected headers for first entry (development only)
    if (process.env.NODE_ENV === 'development' && source.length > 0) {
      console.log('Detected source headers:', Object.keys(sourceHeaderRow || {}));
      console.log('Detected entry headers:', Object.keys(entryHeaderRow || {}));
    }

    // Extract fields using header-aware extraction
    const entrySSID = extractField(entry, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], entryHeaderRow);
    const entryNIN = extractField(entry, ['NIN', 'nin', 'Nin', 'NationalID', 'National ID'], entryHeaderRow);
    const entryName = extractField(
      entry,
      ['FULL NAME', 'Full Name', 'full name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name'],
      entryHeaderRow
    );

    // Validate required fields
    if (!entryName) {
      return {
        status: 'Invalid',
        reason: `Missing name field. Detected fields: ${Object.keys(entry).join(', ')}`
      };
    }

    if (!entrySSID && !entryNIN) {
      return {
        status: 'Invalid',
        reason: 'Missing both SSID and NIN - at least one required for identity verification'
      };
    }

    // Search for potential matches
    const potentialMatches = source.filter(src => {
      const srcSSID = extractField(src, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], sourceHeaderRow);
      const srcNIN = extractField(src, ['NIN', 'nin', 'Nin', 'NationalID', 'National ID'], sourceHeaderRow);
      const srcName = extractField(
        src,
        ['FULL NAME', 'Full Name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name'],
        sourceHeaderRow
      );

      const ssidMatch = entrySSID && srcSSID && srcSSID === entrySSID;
      const ninMatch = entryNIN && srcNIN && srcNIN === entryNIN;
      const nameMatch = srcName && token_set_ratio(entryName, srcName) >= 70;

      return ssidMatch || ninMatch || nameMatch;
    });

    if (potentialMatches.length === 0) {
      const searchCriteria: string[] = [];
      if (entryName) searchCriteria.push(`Name: "${entryName}"`);
      if (entrySSID) searchCriteria.push(`SSID: ${entrySSID}`);
      if (entryNIN) searchCriteria.push(`NIN: ${entryNIN}`);

      return {
        status: 'Invalid',
        reason: `No record found for ${searchCriteria.join(', ')}`
      };
    }

    // Find best match with scoring
    let bestMatch = potentialMatches[0];
    let bestScore = 0;

    for (const match of potentialMatches) {
      const srcSSID = extractField(match, ['SSID', 'ssid', 'Ssid'], sourceHeaderRow);
      const srcNIN = extractField(match, ['NIN', 'nin', 'Nin'], sourceHeaderRow);
      const srcName = extractField(match, ['FULL NAME', 'Full Name', 'name', 'Name'], sourceHeaderRow);

      let score = 0;
      if (entrySSID && srcSSID && srcSSID === entrySSID) score += 40;
      if (entryNIN && srcNIN && srcNIN === entryNIN) score += 40;
      if (srcName) score += token_set_ratio(entryName, srcName) * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    // Validate match quality
    const srcSSID = extractField(bestMatch, ['SSID', 'ssid', 'Ssid'], sourceHeaderRow);
    const srcNIN = extractField(bestMatch, ['NIN', 'nin', 'Nin'], sourceHeaderRow);
    const srcName = extractField(bestMatch, ['FULL NAME', 'Full Name', 'name', 'Name'], sourceHeaderRow);

    if (!srcName) {
      return {
        status: 'Invalid',
        reason: 'Source record missing name field'
      };
    }

    const ssidMatches = (!entrySSID && !srcSSID) || (entrySSID && srcSSID && entrySSID === srcSSID);
    const ninMatches = (!entryNIN && !srcNIN) || (entryNIN && srcNIN && entryNIN === srcNIN);

    let nameSimilarity: number;
    try {
      nameSimilarity = token_set_ratio(entryName, srcName);
    } catch (error) {
      console.error('Fuzzy matching error:', error);
      nameSimilarity = entryName === srcName ? 100 : 0;
    }

    const nameMatches = nameSimilarity >= SIMILARITY_THRESHOLD;

    if (ssidMatches && ninMatches && nameMatches) {
      return {
        status: 'Valid',
        reason: `Verified (${nameSimilarity}% name match)`,
        matchedName: safeStringExtract(bestMatch, ['FULL NAME', 'Full Name', 'name', 'Name']),
        matchedSSID: safeStringExtract(bestMatch, ['SSID', 'ssid', 'Ssid']),
        matchedNIN: safeStringExtract(bestMatch, ['NIN', 'nin', 'Nin']),
        similarity: nameSimilarity
      };
    }

    // Build mismatch reasons
    const mismatches: string[] = [];
    if (!ssidMatches) {
      if (entrySSID && srcSSID) mismatches.push(`SSID mismatch: "${entrySSID}" vs "${srcSSID}"`);
      else if (entrySSID) mismatches.push(`SSID not in records`);
      else if (srcSSID) mismatches.push(`Missing SSID (we have: ${srcSSID})`);
    }

    if (!ninMatches) {
      if (entryNIN && srcNIN) mismatches.push(`NIN mismatch: "${entryNIN}" vs "${srcNIN}"`);
      else if (entryNIN) mismatches.push(`NIN not in records`);
      else if (srcNIN) mismatches.push(`Missing NIN (we have: ${srcNIN})`);
    }

    if (!nameMatches) {
      mismatches.push(`Name similarity: ${nameSimilarity}%`);
    }

    return {
      status: 'Partial Match',
      reason: `Verification issues - ${mismatches.join('; ')}`,
      matchedName: safeStringExtract(bestMatch, ['FULL NAME', 'Full Name', 'name', 'Name']),
      matchedSSID: safeStringExtract(bestMatch, ['SSID', 'ssid', 'Ssid']),
      matchedNIN: safeStringExtract(bestMatch, ['NIN', 'nin', 'Nin']),
      similarity: nameSimilarity
    };
  } catch (error) {
    console.error('Validation error:', error);
    return {
      status: 'Invalid',
      reason: `System error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Enhanced POST handler
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 }
      );
    }

    let validatedPayload: {
      source: Entry[];
      entries: Entry[];
      sourceHeaderRow?: Entry;
      entriesHeaderRow?: Entry;
    };
    try {
      validatedPayload = validateRequestPayload(requestBody);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error instanceof Error ? error.message : 'Validation failed' },
        { status: 400 }
      );
    }

    const { source, entries, sourceHeaderRow, entriesHeaderRow } = validatedPayload;
    const results: ProcessedEntry[] = [];
    const processingErrors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < entries.length; i++) {
      try {
        const matchResult = getMatchStatus(entries[i], source, sourceHeaderRow, entriesHeaderRow);
        results.push({
          ...entries[i],
          'Match Status': matchResult.status,
          'Match Reason': matchResult.reason,
          'Matched Name': matchResult.matchedName || '',
          'Correct SSID': matchResult.matchedSSID || '',
          'Correct NIN': matchResult.matchedNIN || ''
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        processingErrors.push({ index: i, error: errorMessage });
        results.push({
          ...entries[i],
          'Match Status': 'Invalid',
          'Match Reason': `Processing error: ${errorMessage}`,
          'Matched Name': '',
          'Correct SSID': '',
          'Correct NIN': ''
        });
      }
    }

    const response = {
      results,
      summary: {
        total: results.length,
        valid: results.filter(r => r['Match Status'] === 'Valid').length,
        invalid: results.filter(r => r['Match Status'] === 'Invalid').length,
        partialMatch: results.filter(r => r['Match Status'] === 'Partial Match').length,
        processingErrors: processingErrors.length
      },
      ...(processingErrors.length > 0 && { processingErrors })
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      {
        error: 'Internal error',
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : 'Unknown error')
          : undefined
      },
      { status: 500 }
    );
  }
}

// Other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
