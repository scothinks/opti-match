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
const MAX_ENTRIES_LIMIT = 20000;
const MAX_SOURCE_LIMIT = 500000;

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

// Improved header detection - look for meaningful text patterns
function isLikelyHeaderRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map(String).map(v => v.toLowerCase());
  
  // Check for common header patterns
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
    value.length > 0 && 
    isNaN(Number(value)) && 
    !/^\d+$/.test(value) &&
    value !== 'null' &&
    value !== 'undefined'
  );

  const hasReasonableLength = values.some(value => 
    value.length >= 2 && value.length <= 50
  );

  return hasHeaderPattern || (hasTextContent && hasReasonableLength);
}

// Enhanced header detection with better logic
function findHeaderRow(rows: Entry[]): number {
  if (rows.length === 0) return 0;

  if (isLikelyHeaderRow(rows[0])) {
    return 0;
  }

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (isLikelyHeaderRow(rows[i])) {
      return i;
    }
  }

  if (rows.length > 1) {
    const firstRowValues = Object.values(rows[0]).map(String);
    const secondRowValues = Object.values(rows[1]).map(String);
    
    const firstRowHasText = firstRowValues.some(v => 
      v.length > 0 && isNaN(Number(v)) && !/^\d+$/.test(v)
    );
    const secondRowHasMoreNumbers = secondRowValues.filter(v => 
      !isNaN(Number(v)) || /^\d+$/.test(v)
    ).length > firstRowValues.filter(v => 
      !isNaN(Number(v)) || /^\d+$/.test(v)
    ).length;

    if (firstRowHasText && secondRowHasMoreNumbers) {
      return 0;
    }
  }

  return 0;
}

// Enhanced field extraction with better column mapping
function extractField(entry: Entry, possibleFieldNames: string[], headerRow?: Entry): string {
  const normalizeKey = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^_+|_+$/g, '')
      .replace('fullname', 'name')
      .replace('beneficiaryname', 'name')
      .replace('customername', 'name')
      .replace('personname', 'name')
      .replace('nin', 'nationalid')
      .replace('ssid', 'socialsecurity')
      .replace('socialsecurityid', 'socialsecurity')
      .replace('ssn', 'socialsecurity');

  if (headerRow) {
    const fieldMap: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headerRow)) {
      if (value !== null && value !== undefined) {
        const normalizedValue = normalizeKey(String(value));
        if (normalizedValue) {
          fieldMap[normalizedValue] = key;
        }
      }
    }

    for (const field of possibleFieldNames) {
      const normalizedField = normalizeKey(field);
      if (fieldMap[normalizedField]) {
        const value = entry[fieldMap[normalizedField]];
        if (value !== null && value !== undefined) {
          const stringValue = String(value).trim();
          if (stringValue) {
            return normalize(stringValue);
          }
        }
      }
    }
  }

  for (const field of possibleFieldNames) {
    if (entry[field] !== undefined && entry[field] !== null) {
      const stringValue = String(entry[field]).trim();
      if (stringValue) {
        return normalize(stringValue);
      }
    }

    const normalizedField = normalizeKey(field);
    for (const [key, value] of Object.entries(entry)) {
      if (normalizeKey(key) === normalizedField && value !== null && value !== undefined) {
        const stringValue = String(value).trim();
        if (stringValue) {
          return normalize(stringValue);
        }
      }
    }
  }

  return '';
}

// *** NEW FUNCTION TO HANDLE SPLIT NAMES ***
function extractFullName(entry: Entry, headerRow?: Entry): string {
  // First, try to find a single "full name" column for backward compatibility.
  const singleFullName = extractField(
    entry,
    ['FULL NAME', 'Full Name', 'full name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name', 'Customer Name', 'Person Name'],
    headerRow
  );
  if (singleFullName) {
    return singleFullName;
  }

  // If not found, look for individual parts and combine them.
  const firstName = extractField(entry, ['firstname', 'first_name', 'first'], headerRow);
  const middleName = extractField(entry, ['middlename', 'middle_name', 'middle'], headerRow);
  const lastName = extractField(entry, ['lastname', 'last_name', 'last', 'surname'], headerRow);

  const nameParts = [firstName, middleName, lastName].filter(Boolean); // filter(Boolean) removes any empty parts

  if (nameParts.length > 0) {
    return normalize(nameParts.join(' '));
  }

  return '';
}


// Safe string extraction for return values
function safeStringExtract(entry: Entry, fieldNames: string[], headerRow?: Entry): string {
    // For name, use the new intelligent extraction
    if (fieldNames.some(name => name.toLowerCase().includes('name'))) {
        return extractFullName(entry, headerRow);
    }

    // For other fields, use the original logic
    for (const fieldName of fieldNames) {
        const value = entry[fieldName];
        if (value !== null && value !== undefined) {
        const stringValue = String(value).trim();
        if (stringValue) return stringValue;
        }
    }
    return '';
}

// Enhanced request payload validation
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

  const sourceRows = payload.source as Entry[];
  const entryRows = payload.entries as Entry[];

  const sourceHeaderRowIndex = findHeaderRow(sourceRows);
  const entriesHeaderRowIndex = findHeaderRow(entryRows);

  const sourceDataRows = sourceRows.slice(sourceHeaderRowIndex + 1);
  const entryDataRows = entryRows.slice(entriesHeaderRowIndex + 1);

  if (sourceDataRows.length === 0) {
    throw new Error('No data rows found in source after header detection');
  }

  if (entryDataRows.length === 0) {
    throw new Error('No data rows found in entries after header detection');
  }

  return {
    source: sourceDataRows,
    entries: entryDataRows,
    sourceHeaderRow: sourceRows[sourceHeaderRowIndex],
    entriesHeaderRow: entryRows[entriesHeaderRowIndex]
  };
}

// ** MODIFIED FUNCTION SIGNATURE **
function getMatchStatus(
  entry: Entry,
  sourceBySSID: Map<string, Entry>,
  sourceByNIN: Map<string, Entry>,
  sourceHeaderRow?: Entry,
  entryHeaderRow?: Entry
): ValidationResult {
  try {
    const entrySSID = extractField(
      entry, 
      ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN', 'Social Security Number', 'Social Security ID', '__EMPTY_1', '__EMPTY_2', '__EMPTY_3', '__EMPTY_4', '__EMPTY_5', '__EMPTY_6'], 
      entryHeaderRow
    );
    
    const entryNIN = extractField(
      entry, 
      ['NIN', 'nin', 'Nin', 'NationalID', 'National ID', 'National Identification Number', '__EMPTY_1', '__EMPTY_2', '__EMPTY_3', '__EMPTY_4', '__EMPTY_5', '__EMPTY_6'], 
      entryHeaderRow
    );
    
    // ** USE THE NEW NAME EXTRACTION FUNCTION **
    const entryName = extractFullName(entry, entryHeaderRow);

    if (!entryName) {
      const availableFields = Object.entries(entry)
        .filter(([key, value]) => value !== null && value !== undefined && String(value).trim())
        .map(([key, value]) => `${key}: "${value}"`)
        .join(', ');
      
      return {
        status: 'Invalid',
        reason: `Missing name field. Available fields: ${availableFields}`
      };
    }

    if (!entrySSID && !entryNIN) {
      return {
        status: 'Invalid',
        reason: 'Missing both SSID and NIN - at least one required for identity verification'
      };
    }

    // ** REPLACED SLOW FILTER WITH FAST MAP LOOKUP **
    const potentialMatches: Entry[] = [];
    const foundMatches = new Set<Entry>(); // Use a Set to handle records found by both SSID and NIN

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

    // This logic remains the same, but now runs on a tiny array (0-2 items) instead of the whole source
    let bestMatch = potentialMatches[0];
    let bestScore = 0;

    for (const match of potentialMatches) {
      const srcSSID = extractField(match, ['SSID', 'ssid', 'Ssid'], sourceHeaderRow);
      const srcNIN = extractField(match, ['NIN', 'nin', 'Nin'], sourceHeaderRow);
      // ** USE THE NEW NAME EXTRACTION FUNCTION **
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
    // ** USE THE NEW NAME EXTRACTION FUNCTION **
    const srcName = extractFullName(bestMatch, sourceHeaderRow);

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
        matchedName: srcName,
        matchedSSID: safeStringExtract(bestMatch, ['SSID', 'ssid', 'Ssid']),
        matchedNIN: safeStringExtract(bestMatch, ['NIN', 'nin', 'Nin']),
        similarity: nameSimilarity
      };
    }

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
      mismatches.push(`Name similarity: ${nameSimilarity}% (${entryName} vs ${srcName})`);
    }

    return {
      status: 'Partial Match',
      reason: `Verification issues - ${mismatches.join('; ')}`,
      matchedName: srcName,
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
    
    // ** ADDED SOURCE DATA INDEXING **
    const sourceBySSID = new Map<string, Entry>();
    const sourceByNIN = new Map<string, Entry>();

    for (const srcRecord of source) {
        const ssid = extractField(srcRecord, ['SSID', 'ssid', 'Ssid', 'SocialSecurity', 'SSN'], sourceHeaderRow);
        const nin = extractField(srcRecord, ['NIN', 'nin', 'Nin', 'NationalID'], sourceHeaderRow);

        if (ssid) {
            sourceBySSID.set(ssid, srcRecord);
        }
        if (nin) {
            sourceByNIN.set(nin, srcRecord);
        }
    }

    const results: ProcessedEntry[] = [];
    const processingErrors: Array<{ index: number; error: string }> = [];

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      try {
        // ** PASSING INDEX MAPS TO FUNCTION **
        const matchResult = getMatchStatus(
          entries[i],
          sourceBySSID,
          sourceByNIN,
          sourceHeaderRow,
          entriesHeaderRow
        );
        results.push({
          ...entries[i], // Preserve all original fields
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
          ...entries[i], // Preserve all original fields
          'Match Status': 'Invalid',
          'Match Reason': `Processing error: ${errorMessage}`,
          'Matched Name': '',
          'Correct SSID': '',
          'Correct NIN': ''
        });
      }
    }

    // Build response with proper headers
    const responseHeaders = entriesHeaderRow 
      ? Object.keys(entriesHeaderRow).concat(['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN'])
      : (entries[0] ? Object.keys(entries[0]).concat(['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']) 
         : ['Match Status', 'Match Reason', 'Matched Name', 'Correct SSID', 'Correct NIN']);

    const response = {
      headers: responseHeaders,
      results: entries.map((entry, i) => ({
        ...entry, // Preserve all original fields
        'Match Status': results[i]['Match Status'],
        'Match Reason': results[i]['Match Reason'],
        'Matched Name': results[i]['Matched Name'] || '',
        'Correct SSID': results[i]['Correct SSID'] || '',
        'Correct NIN': results[i]['Correct NIN'] || ''
      })),
      summary: {
        total: results.length,
        valid: results.filter(r => r['Match Status'] === 'Valid').length,
        invalid: results.filter(r => r['Match Status'] === 'Invalid').length,
        partialMatch: results.filter(r => r['Match Status'] === 'Partial Match').length,
        processingErrors: processingErrors.length
      },
      ...(processingErrors.length > 0 && { processingErrors }),
      debug: process.env.NODE_ENV === 'development' ? {
        sourceHeaderDetected: sourceHeaderRow ? Object.keys(sourceHeaderRow) : 'None',
        entriesHeaderDetected: entriesHeaderRow ? Object.keys(entriesHeaderRow) : 'None',
        sourceDataRows: source.length,
        entryDataRows: entries.length
      } : undefined
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
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}