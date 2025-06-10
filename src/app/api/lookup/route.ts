import { NextRequest, NextResponse } from 'next/server';
import { token_set_ratio } from 'fuzzball';
import * as XLSX from 'xlsx';
import { getDataSource, extractFullName } from '@/lib/dataSource'; // Import our new module functions

// --- Type Definitions ---
type LookupItem = { ssid: string; nameToVerify?: string; };
type ResultItem = { ssid: string; nameToVerify: string; correctNameInSystem: string; nameSimilarity?: number; status: 'Match' | 'Mismatch' | 'Not Found' | 'Lookup Success'; };
type Entry = { [key: string]: any; };

// --- Helper functions for this route (batch file parsing) ---
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

// --- MAIN POST HANDLER ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let lookups: LookupItem[] = body.lookups;
    const customSourceUrl: string | null | undefined = body.sourceUrl;
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
        const name = extractFullName(row);
        return { ssid, nameToVerify: name };
      }).filter(item => item.ssid);
    }

    if (!Array.isArray(lookups) || lookups.length === 0) {
      return NextResponse.json({ error: 'No valid lookup data provided.' }, { status: 400 });
    }

    // This call is now safe, as getDataSource handles null/undefined internally
    const dataSource = await getDataSource(customSourceUrl);
    
    const results: ResultItem[] = [];

    for (const item of lookups) {
      const normalizedSsid = normalize(item.ssid);
      const sourceRecord = dataSource.get(normalizedSsid);

      if (!sourceRecord) {
        results.push({ ssid: item.ssid, nameToVerify: item.nameToVerify || 'N/A', correctNameInSystem: '---', status: 'Not Found' });
        continue;
      }

      const correctName = extractFullName(sourceRecord);

      if (item.nameToVerify && item.nameToVerify.trim()) {
        const nameSimilarity = token_set_ratio(item.nameToVerify, correctName);
        results.push({ ssid: item.ssid, nameToVerify: item.nameToVerify, correctNameInSystem: correctName || '---', nameSimilarity, status: nameSimilarity >= 90 ? 'Match' : 'Mismatch' });
      } else {
        results.push({ ssid: item.ssid, nameToVerify: 'N/A', correctNameInSystem: correctName || '---', status: 'Lookup Success' });
      }
    }

    return NextResponse.json({
      results,
      sourceRecordCount: dataSource.size,
      sourceUsed: customSourceUrl ? 'Custom Source' : 'Default Master List',
    });

  } catch (error) {
    console.error('Lookup API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}