'use client';

import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Upload,
  Zap,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Shield,
  FileText,
  BarChart3,
  Target,
  ArrowRight,
  Info,
  X,
  Clock,
  Database,
  Download,
} from 'lucide-react';

// Import components (these would be in separate files)
import FileUploader from '@/components/FileUploader';
import ResultTable from '@/components/ResultTable';
import MatchChart from '@/components/MatchChart';
import DownloadButtons from '@/components/DownloadButtons';

// Define types for better type safety
interface ValidationResult {
  status: 'Valid' | 'Partial Match' | 'Invalid';
  [key: string]: any;
}

interface ValidationStats {
  total: number;
  exact: number;
  partial: number;
  none: number;
  accuracy: string;
}

interface ApiResponse {
  results: ValidationResult[];
  headers?: string[];
  summary?: {
    total: number;
    valid: number;
    invalid: number;
    partialMatch: number;
    processingErrors: number;
  };
}

export default function Home() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [toValidateFile, setToValidateFile] = useState<File | null>(null);
  
  // State for Vercel Blob URLs
  const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);
  const [toValidateFileUrl, setToValidateFileUrl] = useState<string | null>(null);

  // State to track upload progress
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isUploadingValidation, setIsUploadingValidation] = useState(false);

  const [results, setResults] = useState<ValidationResult[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [currentStep, setCurrentStep] = useState(0);
  const [validationStats, setValidationStats] = useState<ValidationStats | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const uploaderWarning = "For best results, please ensure the header is the first row.";

  const steps = ['Upload Files', 'Configure', 'Validate', 'Results'];

  // This effect now only triggers when the file URLs are available.
  useEffect(() => {
    if (sourceFileUrl && toValidateFileUrl) {
      setShowPreview(true);
      setCurrentStep(1);
    } else {
      setShowPreview(false);
      setCurrentStep(0);
    }
  }, [sourceFileUrl, toValidateFileUrl]);

  // This separate effect handles advancing to the results step.
  useEffect(() => {
    if (results.length > 0) {
      setCurrentStep(3);
    }
  }, [results]);


  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const calculateStats = (data: ValidationResult[]): ValidationStats => {
    if (data.length === 0) {
      return { total: 0, exact: 0, partial: 0, none: 0, accuracy: '0.0' };
    }
    const totalEntries = data.length;
    const exactMatches = data.filter((item) => item.status === 'Valid').length;
    const partialMatches = data.filter((item) => item.status === 'Partial Match').length;
    const noMatches = data.filter((item) => item.status === 'Invalid').length;

    return {
      total: totalEntries,
      exact: exactMatches,
      partial: partialMatches,
      none: noMatches,
      accuracy: ((exactMatches / totalEntries) * 100).toFixed(1),
    };
  };
  
  // REWRITTEN to use client-side direct upload
  const handleFileSelectAndUpload = async (file: File | null, fileType: 'source' | 'validation') => {
    if (fileType === 'source') {
      setSourceFile(file);
      setSourceFileUrl(null);
    } else {
      setToValidateFile(file);
      setToValidateFileUrl(null);
    }
    if (!file) return;

    if (fileType === 'source') setIsUploadingSource(true);
    else setIsUploadingValidation(true);
    showNotification(`Uploading ${file.name}...`, 'info');

    try {
      const newBlob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        allowOverwrite: true,
      } as any); // <-- The fix is applied here

      if (fileType === 'source') {
        setSourceFileUrl(newBlob.url);
      } else {
        setToValidateFileUrl(newBlob.url);
      }
      showNotification(`${file.name} uploaded successfully.`, 'success');
    } catch (error) {
      console.error('An error occurred during upload:', error);
      showNotification(`Failed to upload ${file.name}. Please try again.`, 'error');
      if (fileType === 'source') setSourceFile(null);
      else setToValidateFile(null);
    } finally {
      if (fileType === 'source') setIsUploadingSource(false);
      else setIsUploadingValidation(false);
    }
  };


  const handleValidation = async () => {
    if (!sourceFileUrl || !toValidateFileUrl) {
      showNotification('Please ensure both files are uploaded successfully before validation.', 'error');
      return;
    }
    setIsLoading(true);
    setCurrentStep(2);
    const startTime = Date.now();
    setStatus('Initializing validation process...');
    showNotification('Starting comprehensive validation...', 'info');

    try {
      setStatus('Processing data with our matching algorithms...');
      const res = await fetch('/api/validate', {
        method: 'POST',
        body: JSON.stringify({ sourceUrl: sourceFileUrl, toValidateUrl: toValidateFileUrl }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        let errorDetails = 'Validation failed on server.';
        try {
          const errorData = await res.json();
          errorDetails = errorData.details || errorData.error || errorDetails;
        } catch (jsonError) {
          errorDetails = await res.text();
        }
        throw new Error(errorDetails);
      }

      const result: ApiResponse = await res.json();
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      setResults(result.results);
      setDetectedHeaders(result.headers || []);
      setValidationStats(calculateStats(result.results));
      setProcessingTime(parseFloat(duration));
      setStatus('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      showNotification(`Validation failed: ${errorMessage}`, 'error');
      setStatus('');
      setCurrentStep(1);
      console.error('Validation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResults([]);
    setSourceFile(null);
    setToValidateFile(null);
    setSourceFileUrl(null);
    setToValidateFileUrl(null);
    setDetectedHeaders([]);
    setStatus('');
    setShowPreview(false);
    setValidationStats(null);
    setProcessingTime(0);
    showNotification('Session cleared - ready for new validation', 'info');
  };

  const handleEditFiles = () => {
    setShowPreview(false);
    setCurrentStep(0);
  };

  const isValidationDisabled = isUploadingSource || isUploadingValidation || isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-6 right-6 z-50 max-w-md transition-all duration-500 transform ${ showToast ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'}`}>
          <div className={`px-6 py-4 rounded-2xl text-white font-medium shadow-2xl border backdrop-blur-sm ${ toastType === 'success' ? 'bg-emerald-500/90 border-emerald-400' : toastType === 'error' ? 'bg-red-500/90 border-red-400' : 'bg-blue-500/90 border-blue-400'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {toastType === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                {toastType === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                {toastType === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
                <span className="text-sm">{toastMessage}</span>
              </div>
              <button onClick={() => setShowToast(false)} className="text-white/80 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-br from-emerald-400/20 to-teal-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-2xl" />
      </div>
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-slate-200 mb-6">
            <Shield className="w-5 h-5 text-indigo-600" /><span className="text-sm font-medium text-slate-700">Internal Tool</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-slate-800 via-indigo-700 to-purple-800 bg-clip-text text-transparent mb-4 tracking-tight">OptiMatch</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">Intelligent ID validation with advanced matching algorithms, real-time analytics, and comprehensive reporting</p>
        </div>
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center space-x-2 md:space-x-6 bg-white/60 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border border-slate-200">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-2 transition-all duration-500 ${ index < currentStep ? 'bg-emerald-500 border-emerald-500 text-white scale-110' : index === currentStep ? 'bg-indigo-500 border-indigo-500 text-white scale-110 animate-pulse' : 'bg-white border-slate-300 text-slate-400' }`}>
                  {index < currentStep ? <CheckCircle className="w-4 h-4 md:w-5 md:h-5" /> : <span className="text-xs md:text-sm font-semibold">{index + 1}</span>}
                </div>
                <span className={`hidden md:inline ml-2 text-sm font-medium transition-colors duration-300 ${ index <= currentStep ? 'text-slate-700' : 'text-slate-400' }`}>{step}</span>
                {index < steps.length - 1 && <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-slate-300 mx-2 md:mx-4" />}
              </div>
            ))}
          </div>
        </div>
        {/* File Upload Section */}
        {!showPreview && (
          <div className="max-w-4xl mx-auto mb-12">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Database className="w-5 h-5 text-blue-600" /></div><div><h2 className="text-xl font-semibold text-slate-800">Source of Truth</h2><p className="text-sm text-slate-500">Your master reference dataset (Optima)</p></div></div>
                <FileUploader onFileSelect={(file) => handleFileSelectAndUpload(file, 'source')} file={sourceFile} label={''} warningText={uploaderWarning} />
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Target className="w-5 h-5 text-amber-600" /></div><div><h2 className="text-xl font-semibold text-slate-800">Validation Data</h2><p className="text-sm text-slate-500">Entries to validate against source</p></div></div>
                <FileUploader onFileSelect={(file) => handleFileSelectAndUpload(file, 'validation')} file={toValidateFile} label={''} warningText={uploaderWarning} />
              </div>
            </div>
          </div>
        )}
        {/* Validation Preview */}
        {showPreview && !isLoading && results.length === 0 && (
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-slate-200 p-8">
              <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-3"><CheckCircle className="w-6 h-6 text-emerald-500" />Ready to Validate</h3><button onClick={handleEditFiles} className="text-indigo-600 hover:text-indigo-700 font-medium text-sm hover:underline transition-colors">Change Files</button></div>
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="flex items-start space-x-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 overflow-hidden"><div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><Database className="w-6 h-6 text-blue-600" /></div><div className="min-w-0 flex-1"><h4 className="font-semibold text-slate-800 mb-1">Source File</h4><p className="text-sm text-slate-600 truncate" title={sourceFile?.name}>{sourceFile?.name}</p><p className="text-xs text-slate-500 mt-1">{sourceFile?.size ? (sourceFile.size / 1024 / 1024).toFixed(2) : '0'} MB</p></div></div>
                <div className="flex items-start space-x-4 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 overflow-hidden"><div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0"><Target className="w-6 h-6 text-amber-600" /></div><div className="min-w-0 flex-1"><h4 className="font-semibold text-slate-800 mb-1">Validation File</h4><p className="text-sm text-slate-600 truncate" title={toValidateFile?.name}>{toValidateFile?.name}</p><p className="text-xs text-slate-500 mt-1">{toValidateFile?.size ? (toValidateFile.size / 1024 / 1024).toFixed(2) : '0'} MB</p></div></div>
              </div>
              <div className="text-center">
                <button onClick={handleValidation} disabled={isValidationDisabled} className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
                    {isLoading ? 'Validating...' : isUploadingSource ? 'Uploading Source...' : isUploadingValidation ? 'Uploading Validation...' : 'Start Validation'}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <p className="text-sm text-slate-500 mt-3">Click to begin validation against the source file.</p>
              </div>
            </div>
          </div>
        )}
        {/* Loading State */}
        {isLoading && (
          <div className="max-w-2xl mx-auto mb-12"><div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-slate-200 p-8 text-center"><div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse"><RefreshCw className="w-10 h-10 text-white animate-spin" /></div><h3 className="text-xl font-semibold text-slate-800 mb-3">Processing Your Data</h3><p className="text-slate-600 mb-6">{status}</p><div className="w-full bg-slate-200 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div></div><div className="flex items-center justify-center gap-4 text-sm text-slate-500"><div className="flex items-center gap-2"><Clock className="w-4 h-4" /><span>Processing time varies by file size</span></div></div></div></div>
        )}
        {/* Results Section */}
        {results.length > 0 && validationStats && (
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="flex items-center gap-2 text-sm text-slate-600"><Clock className="w-4 h-4" /><span>Processed in {processingTime}s</span></div><div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle className="w-4 h-4" /><span>Validation Complete</span></div></div><div className="flex items-center gap-3"><button onClick={handleReset} className="text-red-500 hover:text-red-600 font-medium hover:underline transition-all duration-200 flex items-center gap-2"><RefreshCw className="w-4 h-4" />New Validation</button></div></div></div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6"><div className="flex items-center gap-3 mb-6"><BarChart3 className="w-6 h-6 text-indigo-600" /><h3 className="text-xl font-semibold text-slate-800">Match Distribution</h3></div><MatchChart data={results} /></div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6"><div className="flex items-center gap-3 mb-4"><Download className="w-6 h-6 text-indigo-600" /><h3 className="text-xl font-semibold text-slate-800">Export Results</h3></div><DownloadButtons data={results}  originalFileName={toValidateFile?.name}/></div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6"><div className="flex items-center gap-3 mb-6"><FileText className="w-6 h-6 text-indigo-600" /><h3 className="text-xl font-semibold text-slate-800">Detailed Results</h3></div><ResultTable data={results} responseHeaders={detectedHeaders} /></div>
          </div>
        )}
        {/* Empty State */}
        {!sourceFile && !toValidateFile && !isLoading && (
          <div className="text-center py-16"><div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-slate-200 p-12 max-w-2xl mx-auto"><div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg"><Upload className="w-12 h-12 text-white" /></div><h3 className="text-2xl font-bold text-slate-800 mb-4">Welcome to OptiMatch</h3><p className="text-slate-600 mb-8 leading-relaxed">Upload your CSV or Excel files to begin intelligent ID validation with advanced matching algorithms. Get detailed insights, accuracy metrics, and comprehensive reports.</p><div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left"><div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100"><div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-3"><Upload className="w-4 h-4 text-blue-600" /></div><h4 className="font-semibold text-slate-800 mb-2">Easy Upload</h4><p className="text-sm text-slate-600">Drag & drop CSV or Excel files or click to browse</p></div><div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100"><div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-3"><Zap className="w-4 h-4 text-purple-600" /></div><h4 className="font-semibold text-slate-800 mb-2">Intelligent Processing</h4><p className="text-sm text-slate-600">Advanced algorithms for accurate matching</p></div><div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100"><div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mb-3"><BarChart3 className="w-4 h-4 text-emerald-600" /></div><h4 className="font-semibold text-slate-800 mb-2">Rich Analytics</h4><p className="text-sm text-slate-600">Comprehensive reports and insights</p></div></div></div></div>
        )}
      </div>
    </div>
  );
}