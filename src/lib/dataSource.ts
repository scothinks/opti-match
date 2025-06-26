// File: app/lib/dataSource.ts

import * as XLSX from 'xlsx';

// --- Type Definitions & Constants ---
type Entry = { [key: string]: any; };
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// IMPORTANT: This environment variable will now hold the API endpoint URL,
// NOT the direct Blob storage URL.
const DEFAULT_SOURCE_API_URL = process.env.NEXT_PUBLIC_DEFAULT_SOURCE_URL;

// --- Caching Logic ---
// Cache key will now be the API URL if using default, or the direct URL if provided.
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
export async function getDataSource(providedUrl?: string | null): Promise<Map<string, Entry>> {
    let urlToFetchContent: string;
    let cacheKey: string;

    if (providedUrl) {
        // If a direct file URL is provided (e.g., for custom source uploads in lookup)
        urlToFetchContent = providedUrl;
        cacheKey = providedUrl;
    } else {
        // If no URL is provided, fetch from the default API endpoint first
        const apiEndpoint = DEFAULT_SOURCE_API_URL;

        if (!apiEndpoint) {
            throw new Error('Default source API URL is not configured. Please set NEXT_PUBLIC_DEFAULT_SOURCE_URL environment variable.');
        }

        cacheKey = apiEndpoint; // Cache by the API endpoint URL

        const now = Date.now();
        const cachedEntry = dataCache.get(cacheKey);

        if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION_MS)) {
            console.log(`CACHE HIT: Returning data for API endpoint ${cacheKey}.`);
            return cachedEntry.dataMap;
        }

        console.log(`FETCHING API: ${apiEndpoint}`);
        const apiResponse = await fetch(apiEndpoint);
        if (!apiResponse.ok) {
            throw new Error(`Failed to fetch default source info from API: ${apiResponse.statusText}`);
        }

        const apiData: { responseCode: number; responseMessage: string; data: { fileUrl: string; }; } = await apiResponse.json(); // Type definition adjusted for the API response structure

        if (apiData.responseCode !== 200 || !apiData.data?.fileUrl) { // Check responseCode and existence of fileUrl
            throw new Error(`API response error or missing file URL: ${apiData.responseMessage || 'Unknown API error'}`);
        }
        urlToFetchContent = apiData.data.fileUrl; // Extract the actual file URL from the API response
    }

    console.log(`FETCHING CONTENT: ${urlToFetchContent}`);
    const contentResponse = await fetch(urlToFetchContent);
    if (!contentResponse.ok) throw new Error(`Failed to fetch data source content from ${urlToFetchContent}: ${contentResponse.statusText}`);
    
    const data = await contentResponse.arrayBuffer();
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
    
    dataCache.set(cacheKey, { dataMap, timestamp: Date.now() }); // Cache using the determined cacheKey
    console.log(`CACHE POPULATED: Source ${urlToFetchContent} parsed. ${dataMap.size} records loaded.`);
    return dataMap;
}

// --- CACHE WARMING LOGIC ---
(async () => {
    try {
        console.log('CACHE WARMER: Initializing default data source via API...');
        // Call getDataSource without a URL to trigger loading of the default source via the API
        await getDataSource(); 
    } catch (error) {
        console.error('CACHE WARMER FAILED:', error);
    }
})();