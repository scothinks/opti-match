// File: app/lib/dataSource.ts

import * as XLSX from 'xlsx';

// --- Type Definitions & Constants ---
type Entry = { [key: string]: any; };
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_SOURCE_URL = 'https://qrh5x6rq2hazm8xn.public.blob.vercel-storage.com/25May2025_Optima-isGNe7J4aB874HzHPCmIZbCAOldMjM.csv';

// --- Caching Logic ---
const dataCache = new Map<string, { dataMap: Map<string, Entry>, timestamp: number }>();

// --- Helper Functions ---
function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function extractField(entry: Entry, possibleFieldNames: string[]): string {
    const entryKeys = Object.keys(entry);
    const normalizeKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const possibleNormalizedNames = possibleFieldNames.map(normalizeKey);
    for (const key of entryKeys) {
        const normalizedKey = normalizeKey(key);
        if (possibleNormalizedNames.includes(normalizedKey)) {
            const value = entry[key];
            if (value !== null && value !== undefined) return String(value).trim();
        }
    }
    return '';
}

// Note: This function is now only needed here, not in the API route.
export function extractFullName(entry: Entry): string {
  const singleFullName = extractField(entry, ['FULL NAME', 'Full Name', 'full name', 'name', 'Name', 'FULLNAME', 'FullName', 'fullname', 'Beneficiary Name']);
  if (singleFullName) return singleFullName;
  const firstName = extractField(entry, ['firstname', 'first_name', 'first']);
  const middleName = extractField(entry, ['middlename', 'middle_name', 'middle']);
  const lastName = extractField(entry, ['lastname', 'last_name', 'last', 'surname']);
  const nameParts = [firstName, middleName, lastName].filter(Boolean);
  if (nameParts.length > 0) return nameParts.join(' ');
  return '';
}

function findBestHeaderRowIndex(rows: any[][]): number {
    let headerRowIndex = 0;
    let maxKeywords = 0;
    const headerKeywords = ['ssid', 'nin', 'name', 'id', 'pension', 'account', 'bank', 'verification', 'no', 's/n', 'firstname', 'lastname'];
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

// --- Core Data Function ---
export async function getDataSource(url?: string | null): Promise<Map<string, Entry>> {
    // **THE FIX IS HERE**: We now handle null or undefined URLs gracefully.
    const urlToUse = url || DEFAULT_SOURCE_URL;

    const now = Date.now();
    // Use urlToUse for caching
    const cachedEntry = dataCache.get(urlToUse);

    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        console.log(`CACHE HIT: Returning data for ${urlToUse}.`);
        return cachedEntry.dataMap;
    }
    
    console.log(`CACHE MISS: Fetching and parsing new data source: ${urlToUse}`);
    // Use urlToUse for fetching
    const response = await fetch(urlToUse);
    if (!response.ok) throw new Error(`Failed to fetch data source: ${response.statusText}`);
    
    const data = await response.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const rowsAsArrays: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rowsAsArrays.length === 0) throw new Error("The data source file is empty.");
    
    const headerRowIndex = findBestHeaderRowIndex(rowsAsArrays);
    const headerArray: string[] = rowsAsArrays[headerRowIndex].map(h => String(h || '').trim());
    const dataRowsAsArrays = rowsAsArrays.slice(headerRowIndex + 1);
    
    const jsonData: Entry[] = dataRowsAsArrays.map(rowArray => {
        const entry: Entry = {};
        headerArray.forEach((header, index) => { if (header) entry[header] = rowArray[index]; });
        return entry;
    }).filter(obj => Object.values(obj).some(val => val !== null && val !== ''));
    
    const dataMap = new Map<string, Entry>();
    for (const record of jsonData) {
        const ssid = normalize(extractField(record, ['SSID', 'ssid']));
        if (ssid) dataMap.set(ssid, record);
    }
    
    // Use urlToUse for setting the cache
    dataCache.set(urlToUse, { dataMap, timestamp: now });
    console.log(`CACHE POPULATED: Source ${urlToUse} parsed. ${dataMap.size} records loaded.`);
    return dataMap;
}

// --- CACHE WARMING LOGIC ---
// This self-invoking async function runs ONLY when the module is first loaded.
(async () => {
    try {
        console.log('CACHE WARMER: Initializing default data source...');
        await getDataSource(); // Fetches the DEFAULT_SOURCE_URL
    } catch (error) {
        console.error('CACHE WARMER FAILED:', error);
    }
})();