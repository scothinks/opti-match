'use client';

import { useState, useRef, ChangeEvent, FormEvent, Ref } from 'react';
import Link from 'next/link'; // **NEW**: Import Link for navigation
import { upload } from '@vercel/blob/client';
import { Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Database, UploadCloud, File as FileIcon, X, FileUp, List, Download, Home, RefreshCcw } from 'lucide-react'; // **NEW**: Import Home and RefreshCcw icons

// --- Type Definitions ---
type ResultItem = {
  ssid: string;
  nameToVerify: string;
  correctNameInSystem: string;
  status: 'Match' | 'Mismatch' | 'Not Found' | 'Lookup Success';
};
type ActiveTab = 'single' | 'batch';

// --- Main Page Component ---
export default function LookupPage() {
  // UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>('single');
  const [showCustomSource, setShowCustomSource] = useState(false);

  // Form Input State
  const [singleSsid, setSingleSsid] = useState('');
  const [singleName, setSingleName] = useState('');
  const [batchFile, setBatchFile] = useState<File | null>(null);
  
  // Custom Source File State
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [customSourceUrl, setCustomSourceUrl] = useState<string | null>(null);

  // API & Results State
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Checking...');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [sourceRecordCount, setSourceRecordCount] = useState<number | null>(null);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  
  // Refs for file inputs
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // --- Logic ---
  const handleSourceFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSourceFile(file); setCustomSourceUrl(null); }
  };
  const clearSourceFile = () => {
    setSourceFile(null); setCustomSourceUrl(null);
    if(sourceFileInputRef.current) sourceFileInputRef.current.value = "";
  };
  const handleBatchFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBatchFile(e.target.files?.[0] || null);
  };
  const clearBatchFile = () => {
    setBatchFile(null); if(batchFileInputRef.current) batchFileInputRef.current.value = "";
  };
  
  // **NEW**: Function to reset the entire form and results state
  const handleReset = () => {
    setResults([]);
    setError(null);
    setSourceUsed(null);
    setSourceRecordCount(null);
    setSingleSsid('');
    setSingleName('');
    clearBatchFile();
    // Optionally, you can also clear the custom source file
    // clearSourceFile(); 
    // setShowCustomSource(false);
  };

  const performLookup = async (payload: object) => {
    const lookupResponse = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!lookupResponse.ok) { const errorData = await lookupResponse.json(); throw new Error(errorData.details || 'An error occurred during lookup.'); }
    const data = await lookupResponse.json();
    setResults(data.results); setSourceRecordCount(data.sourceRecordCount); setSourceUsed(data.sourceUsed);
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); 
    handleReset(); // Clear previous results before starting
    setIsLoading(true);
    let tempSourceUrl = customSourceUrl;
    try {
      if (sourceFile && !tempSourceUrl) {
        setStatusText('Uploading source file...');
        const newBlob = await upload(`${Date.now()}-${sourceFile.name}`, sourceFile, { access: 'public', handleUploadUrl: '/api/upload' });
        tempSourceUrl = newBlob.url; setCustomSourceUrl(tempSourceUrl);
      }
      if (activeTab === 'single') {
        if (!singleSsid.trim()) throw new Error('SSID field cannot be empty.');
        setStatusText('Checking single entry...');
        await performLookup({ lookups: [{ ssid: singleSsid, nameToVerify: singleName }], sourceUrl: tempSourceUrl });
      } else if (activeTab === 'batch') {
        if (!batchFile) throw new Error('Please select a batch file to upload.');
        setStatusText('Uploading batch file...');
        const newBlob = await upload(`${Date.now()}-${batchFile.name}`, batchFile, { access: 'public', handleUploadUrl: '/api/upload' });
        setStatusText('Processing batch file...');
        await performLookup({ batchFileUrl: newBlob.url, sourceUrl: tempSourceUrl });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDownload = () => {
    if (results.length === 0) return;
    const headers = ['Status', 'SSID', 'Name Checked', 'Name in System'];
    const escapeCsvCell = (cell: string | number) => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const csvContent = [
      headers.join(','),
      ...results.map(row => [
        escapeCsvCell(row.status),
        escapeCsvCell(row.ssid),
        escapeCsvCell(row.nameToVerify),
        escapeCsvCell(row.correctNameInSystem)
      ].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lookup_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- UI Rendering Components ---
  // (renderStatusBadge and renderFileUploader remain unchanged)
  const renderStatusBadge = (status: ResultItem['status']) => {
    const styles = {
      Match: "bg-emerald-100 text-emerald-800",
      Mismatch: "bg-amber-100 text-amber-800",
      'Lookup Success': "bg-sky-100 text-sky-800",
      'Not Found': "bg-slate-200 text-slate-700",
    };
    const icons = {
      Match: <CheckCircle2 size={14}/>,
      Mismatch: <AlertTriangle size={14}/>,
      'Lookup Success': <CheckCircle2 size={14}/>,
      'Not Found': <XCircle size={14}/>,
    };
    return <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{icons[status]} {status === 'Lookup Success' ? 'Found' : status}</span>;
  };
  
  const renderFileUploader = (file: File | null, handler: (e: ChangeEvent<HTMLInputElement>) => void, clearer: () => void, ref: Ref<HTMLInputElement>, id: string, title: string, subtitle: string) => (
    file ? (
        <div className="flex items-center justify-between p-3 pl-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 text-sm text-slate-800 font-medium overflow-hidden"><FileIcon className="w-5 h-5 flex-shrink-0 text-slate-500"/><span className="truncate">{file.name}</span></div>
            <button type="button" onClick={clearer} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"><X className="w-4 h-4" /></button>
        </div>
    ) : (
        <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors duration-300">
            <UploadCloud className="mx-auto h-10 w-10 text-slate-400" />
            <label htmlFor={id} className="relative cursor-pointer mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                <span>{title}</span>
                <input id={id} ref={ref} name={id} type="file" className="sr-only" onChange={handler} accept=".csv,.xlsx,.xls"/>
            </label>
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
    )
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* **NEW**: Home navigation link */}
        <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                <Home size={16} />
                <span>Return to Home</span>
            </Link>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent">Smart SSID Lookup</h1>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">Look up single entries or process batch files against a default or custom data source.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* --- Input Form Column --- */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-slate-200 self-start">
            <form onSubmit={handleSubmit}>
              <div className="flex border-b border-slate-200">
                <TabButton icon={<List size={16}/>} label="Single Lookup" tabName="single" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton icon={<FileUp size={16}/>} label="Batch Lookup" tabName="batch" activeTab={activeTab} setActiveTab={setActiveTab} />
              </div>
              
              <div className="mt-6">
                {activeTab === 'single' ? (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="ssid-input" className="block text-sm font-medium text-slate-700 mb-1">SSID</label>
                            <input id="ssid-input" type="text" value={singleSsid} onChange={(e) => setSingleSsid(e.target.value)} placeholder="Enter SSID to look up" className="w-full p-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" />
                        </div>
                        <div>
                            <label htmlFor="name-input" className="block text-sm font-medium text-slate-700 mb-1">Name to Verify <span className="text-slate-400">(Optional)</span></label>
                            <input id="name-input" type="text" value={singleName} onChange={(e) => setSingleName(e.target.value)} placeholder="Enter name to reconcile" className="w-full p-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" />
                        </div>
                    </div>
                ) : (
                    <div>
                      {renderFileUploader(batchFile, handleBatchFileChange, clearBatchFile, batchFileInputRef, 'batch-file-upload', 'Click to upload a batch file', 'File with SSIDs and optional names')}
                      <div className="mt-3 text-center p-3 bg-slate-50 rounded-md border border-slate-200">
                        <p className="text-xs text-slate-600">File should have headers: <code className="font-mono text-slate-800">SSID</code> & <code className="font-mono text-slate-800">FULL NAME</code> (optional).</p>
                        <a href="/sample-batch.csv" download="OptiMatch_Batch_Sample.csv" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition">
                          <Download size={12} /> Download Sample
                        </a>
                      </div>
                    </div>
                )}
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <button type="submit" disabled={isLoading} className="w-full inline-flex justify-center items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all duration-300">
                  {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> {statusText}</> : <><Search className="w-5 h-5" />Look Up</>}
                </button>
              </div>

              <div className="mt-6 text-center">
                  <button type="button" onClick={() => setShowCustomSource(!showCustomSource)} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
                      {showCustomSource ? 'Use default data source' : 'Use a custom data source?'}
                  </button>
              </div>
              {showCustomSource && (
                  <div className="mt-4 pt-4 border-t border-dashed">
                      {renderFileUploader(sourceFile, handleSourceFileChange, clearSourceFile, sourceFileInputRef, 'source-file-upload', 'Upload a source file', 'This will override the default list')}
                  </div>
              )}
            </form>
          </div>

          {/* --- Results Column --- */}
          <div className="lg:col-span-3 h-full">
              {error && <div className="flex items-center gap-3 p-4 bg-red-100 text-red-800 border-red-200 rounded-lg"><AlertTriangle className="w-5 h-5 flex-shrink-0" /><p><span className="font-semibold">Error:</span> {error}</p></div>}
              
              {!error && sourceUsed && (
                  <div className="p-4 bg-green-100 text-green-800 border-green-200 rounded-lg mb-6 text-sm flex items-center gap-3 shadow-sm">
                      <Database className="w-5 h-5 flex-shrink-0" />
                      <div>
                          <p>Checked against a list of <strong>{sourceRecordCount?.toLocaleString()}</strong> records.</p>
                          <p className="text-xs mt-1">Source: <span className="font-mono bg-green-200 py-0.5 px-1 rounded">{customSourceUrl ? (sourceFile?.name || 'Custom Source') : 'Default Master List'}</span></p>
                      </div>
                  </div>
              )}

              {results.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
                          <h3 className="text-lg font-semibold text-slate-800">Results <span className="text-base font-normal text-slate-500">({results.length})</span></h3>
                          <div className="flex items-center gap-2">
                              {/* **NEW**: Button to reset the form and start a new lookup */}
                              <button 
                                  onClick={handleReset}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all"
                                  aria-label="Start a new lookup"
                              >
                                  <RefreshCcw size={14} />
                                  <span>New Lookup</span>
                              </button>
                              <button 
                                  onClick={handleDownload}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                                  aria-label="Download results as CSV"
                              >
                                  <Download size={14} />
                                  <span>Download CSV</span>
                              </button>
                          </div>
                      </div>
                      <div className="overflow-y-auto max-h-[60vh]">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">SSID</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name Checked</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name in System</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-200">
                            {results.map((result, index) => (
                              <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">{renderStatusBadge(result.status)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-slate-600">{result.ssid}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 italic">{result.nameToVerify || 'N/A'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-800 font-semibold">{result.correctNameInSystem || 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                  </div>
              ) : !isLoading && <div className="text-center p-10 border-2 border-dashed border-slate-200 rounded-lg text-slate-500">Results will appear here</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A helper component for clean tabs
const TabButton = ({ icon, label, tabName, activeTab, setActiveTab }: { icon: React.ReactNode, label: string, tabName: ActiveTab, activeTab: ActiveTab, setActiveTab: (tab: ActiveTab) => void }) => {
  const isActive = activeTab === tabName;
  return (
    <button type="button" onClick={() => setActiveTab(tabName)} className={`flex items-center justify-center gap-2 w-1/2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${isActive ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
      {icon} {label}
    </button>
  );
};