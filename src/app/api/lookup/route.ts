import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';
import * as XLSX from 'xlsx';

// --- Type Definitions ---
type LookupItem = { ssid: string; nameToVerify?: string; };
type ResultItem = { ssid: string; nameToVerify: string; correctNameInSystem: string; nameSimilarity?: number; status: 'Match' | 'Mismatch' | 'Not Found' | 'Lookup Success'; };
type Entry = { [key: string]: any; };

// --- Caching Logic ---
const dataCache = new Map<string, { dataMap: Map<string, Entry>, timestamp: number }>();
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// --- Helper Functions (Defined Once) ---

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

function extractFullName(entry: Entry): string {
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

async function getDataSource(url: string): Promise<Map<string, Entry>> {
    const now = Date.now();
    const cachedEntry = dataCache.get(url);
    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        console.log(`Returning data for ${url} from cache.`);
        return cachedEntry.dataMap;
    }
    
    console.log(`Fetching and parsing new data source: ${url}`);
    const response = await fetch(url);
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
    
    dataCache.set(url, { dataMap, timestamp: now });
    console.log(`Data source ${url} parsed and cached. ${dataMap.size} records loaded.`);
    return dataMap;
}

// --- MAIN POST HANDLER ---

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let lookups: LookupItem[] = body.lookups;
    const customSourceUrl: string | undefined = body.sourceUrl;
    const batchFileUrl: string | undefined = body.batchFileUrl;

    if (batchFileUrl) {
      console.log(`Processing batch file from: ${batchFileUrl}`);
      const response = await fetch(batchFileUrl);
      if (!response.ok) throw new Error('Failed to fetch the uploaded batch file.');
      
      const data = await response.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const batchJson: Entry[] = XLSX.utils.sheet_to_json(sheet);
      
      lookups = batchJson.map(row => {
        const ssid = extractField(row, ['SSID', 'ssid']);
        const nameToVerify = extractFullName(row);
        return { ssid, nameToVerify };
      }).filter(item => item.ssid);
    }

    if (!Array.isArray(lookups) || lookups.length === 0) {
      return NextResponse.json({ error: 'No valid lookup data provided.' }, { status: 400 });
    }

    const defaultSourceUrl = 'https://qrh5x6rq2hazm8xn.public.blob.vercel-storage.com/25May2025_Optima-isGNe7J4aB874HzHPCmIZbCAOldMjM.csv';
    const sourceUrlToUse = customSourceUrl || defaultSourceUrl;
    const dataSource = await getDataSource(sourceUrlToUse);
    
    const results: ResultItem[] = [];

    for (const item of lookups) {
      const normalizedSsid = normalize(item.ssid);
      const sourceRecord = dataSource.get(normalizedSsid);

      if (!sourceRecord) {
        results.push({ ssid: item.ssid, nameToVerify: item.nameToVerify || 'N/A', correctNameInSystem: '---', status: 'Not Found' });
        continue;
      }

      const correctName = extractFullName(sourceRecord);

      if (item.nameToVerify) {
        const nameSimilarity = token_set_ratio(item.nameToVerify, correctName);
        results.push({ ssid: item.ssid, nameToVerify: item.nameToVerify, correctNameInSystem: correctName || '---', nameSimilarity, status: nameSimilarity >= 90 ? 'Match' : 'Mismatch' });
      } else {
        results.push({ ssid: item.ssid, nameToVerify: 'N/A', correctNameInSystem: correctName || '---', status: 'Lookup Success' });
      }
    }

    return NextResponse.json({
      results,
      sourceRecordCount: dataSource.size,
      sourceUsed: sourceUrlToUse,
    });

  } catch (error) {
    console.error('Lookup API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}