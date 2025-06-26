'use client';

import { useEffect, useState, useCallback } from 'react';

import Link from 'next/link';
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
  Search,
  FileCheck2,
  TrendingUp,
} from 'lucide-react';

// Import components
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
    processingErrors?: number; 
    duplicatesInValidationFile?: number;
    sourceFileWarnings?: string[];
  };
}

// Define the expected response structure from the external upload API
interface ExternalUploadApiResponse {
  responseCode: number;
  responseMessage: string;
  data: string; // The URL is directly under 'data' key
}

export default function Home() {
  const [toValidateFile, setToValidateFile] = useState<File | null>(null);
  const [toValidateFileUrl, setToValidateFileUrl] = useState<string | null>(null);

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

  const steps = ['Upload File', 'Validate', 'Results'];

  useEffect(() => {
    if (toValidateFileUrl) {
      setShowPreview(true);
      setCurrentStep(1); 
    } else {
      setShowPreview(false);
      setCurrentStep(0);
    }
  }, [toValidateFileUrl]);

  useEffect(() => {
    if (results.length > 0) {
      setCurrentStep(2); 
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
  
  const handleFileSelectAndUpload = async (file: File | null) => {
    setToValidateFile(file);
    setToValidateFileUrl(null);
    
    if (!file) return;

    setIsUploadingValidation(true);
    showNotification(`Uploading ${file.name}...`, 'info');

    try {
      const formData = new FormData();
      formData.append('file', file); // Append the File object under the key 'file'

      // --- CRITICAL CHANGE: Upload directly to external API ---
      const response = await fetch('https://staging-api.optima.com.ng/api/v1/beneficiary-validation/upload', {
        method: 'POST',
        body: formData, 
        // No Content-Type header needed for FormData; browser sets it automatically
        // Add Authorization headers here if your team's API requires them
        // For example:
        // headers: {
        //   'Authorization': `Bearer YOUR_API_TOKEN_HERE`, 
        // },
      });

      if (!response.ok) {
        let errorDetails = 'Upload failed on external API.';
        try {
          // Attempt to parse the error response from the external API
          const errorData = await response.json();
          errorDetails = errorData.responseMessage || errorData.message || errorData.error || errorDetails; 
        } catch (jsonError) {
          errorDetails = await response.text(); // Fallback to raw text if JSON parsing fails
        }
        throw new Error(errorDetails);
      }

      // Parse the successful response from the API
      const result: ExternalUploadApiResponse = await response.json(); 
      
      // Extract the file URL from the 'data' key of the API response
      // This URL will be used by our backend /api/validate route
      const newFileUrl = result.data; 

      setToValidateFileUrl(newFileUrl); 
      showNotification(`${file.name} uploaded successfully.`, 'success');

    } catch (error) {
      console.error('An error occurred during upload:', error);
      showNotification(`Failed to upload ${file.name}. Please try again.`, 'error');
      setToValidateFile(null); 
    } finally {
      setIsUploadingValidation(false);
    }
  };

  const handleValidation = async () => {
    if (!toValidateFileUrl) {
      showNotification('Please upload the validation file before proceeding.', 'error');
      return;
    }
    setIsLoading(true);
    setCurrentStep(1); 
    const startTime = Date.now();
    setStatus('Initializing validation process...');
    showNotification('Starting comprehensive validation...', 'info');

    try {
      setStatus('Processing data with our matching algorithms...');
      // Call the backend /api/validate endpoint, passing the URL obtained from the external API
      const res = await fetch('/api/validate', {
        method: 'POST',
        body: JSON.stringify({ toValidateUrl: toValidateFileUrl }), 
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
      setCurrentStep(0); 
      console.error('Validation error:', error);
    } finally {
      setIsLoading(false); 
    }
  };

  const handleReset = () => {
    setResults([]);
    setToValidateFile(null);
    setToValidateFileUrl(null);
    setDetectedHeaders([]);
    setStatus('');
    setShowPreview(false);
    setValidationStats(null);
    setProcessingTime(0);
    showNotification('Session cleared - ready for new validation', 'info');
  };

  const handleApproveMatch = useCallback((indexToUpdate: number) => {
    const updatedResults = [...results];
    const recordToUpdate = updatedResults[indexToUpdate];

    if (recordToUpdate) {
      recordToUpdate['Match Status'] = 'Valid';
      recordToUpdate['Match Reason'] = 'Manually Approved by User';
      
      setResults(updatedResults);
      setValidationStats(calculateStats(updatedResults));
      showNotification('Match has been manually approved.', 'success');
    }
  }, [results]); 

  const handleEditFiles = () => {
    setShowPreview(false);
    setCurrentStep(0);
  };

  const isValidationDisabled = isUploadingValidation || isLoading;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Modern Toast Notification for user feedback */}
      {showToast && (
        <div className={`fixed top-6 right-6 z-50 max-w-md transition-all duration-300`}>
          <div className={`px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
            toastType === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : toastType === 'error' 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {toastType === 'success' && <CheckCircle className="w-4 h-4" />}
                {toastType === 'error' && <AlertCircle className="w-4 h-4" />}
                {toastType === 'info' && <Info className="w-4 h-4" />}
                <span>{toastMessage}</span>
              </div>
              <button onClick={() => setShowToast(false)} className="opacity-70 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Section with Brand and Navigation */}
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            {/* Left side - Brand and Title */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">OptiMatch</h1>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Database className="w-4 h-4" />
                    <span>Validation System</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right side - Quick Lookup Action Button */}
            <div className="flex items-center gap-3">
              <Link href="/lookup" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                <Search className="w-4 h-4" />
                Quick Lookup
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        {/* Progress Steps - Visually indicates the current stage of validation */}
        <div className="mb-12">
          <div className="flex items-center justify-center">
            <div className="flex items-center bg-white rounded-2xl p-2 shadow-sm border border-slate-200">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    index === currentStep 
                      ? 'bg-indigo-50 text-indigo-700' 
                      : index < currentStep 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'text-slate-500'
                  }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      index === currentStep 
                        ? 'bg-indigo-500 text-white' 
                        : index < currentStep 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {index < currentStep ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className="font-medium text-sm">{step}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-300 mx-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area: Conditional rendering based on validation state */}
        {!showPreview && (
          // Initial Upload Section: Displayed when no file is uploaded yet
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Upload Your Validation File</h2>
              <p className="text-lg text-slate-600">
                Validate your beneficiary records against our secure, centralized master data.
                <span className="mt-2 text-sm text-blue-600 flex items-center justify-center gap-1">
                  <Info className="w-4 h-4 flex-shrink-0" /> The Source of Truth is automatically managed for consistency.
                </span>
              </p>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Select Your File</h3>
                <p className="text-slate-600">Upload CSV or Excel files up to 10MB</p>
              </div>
              
              <div className="max-w-sm mx-auto">
                <FileUploader 
                  onFileSelect={handleFileSelectAndUpload} 
                  file={toValidateFile} 
                  label={''} 
                  warningText={uploaderWarning} 
                />
              </div>
            </div>
          </div>
        )}

        {showPreview && !isLoading && results.length === 0 && (
          // File Ready for Validation Preview: Displayed after upload, before validation starts
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <FileCheck2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">File Ready for Validation</h3>
                    <p className="text-sm text-slate-600">Your file has been uploaded successfully</p>
                  </div>
                </div>
                <button 
                  onClick={handleEditFiles}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                >
                  Change File
                </button>
              </div>

              {/* File Info Card */}
              <div className="bg-slate-50 rounded-xl p-4 mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-900 truncate">{toValidateFile?.name}</h4>
                    <p className="text-sm text-slate-600">
                      {toValidateFile?.size ? (toValidateFile.size / 1024 / 1024).toFixed(2) : '0'} MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Validation Button */}
              <div className="text-center">
                <button 
                  onClick={handleValidation}
                  disabled={isValidationDisabled}
                  className="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap className="w-5 h-5" />
                  Start Validation
                </button>
                <p className="text-sm text-slate-500 mt-3">
                  Processing typically takes 10-30 seconds
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State: Displayed while validation is in progress */}
        {isLoading && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Processing Your Data</h3>
              <p className="text-slate-600 mb-6">{status}</p>
              
              {/* Simple Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-1000" 
                     style={{ width: '65%' }}>
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Clock className="w-4 h-4" />
                <span>This may take a few moments...</span>
              </div>
            </div>
          </div>
        )}

        {/* Results Section: Displayed once validation is complete */}
        {results.length > 0 && validationStats && (
          <div className="space-y-8">
            {/* Results Header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">Validation Complete</h3>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Processed in {processingTime}s
                      </span>
                      {/* <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {validationStats.accuracy}% accuracy
                      </span> */}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  New Validation
                </button>
              </div>
            </div>

            {/* Match Distribution Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">Match Distribution</h3>
              </div>
              <MatchChart data={results} />
            </div>

            {/* Download Results Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">Export Results</h3>
              </div>
              <DownloadButtons data={results} originalFileName={toValidateFile?.name} />
            </div>

            {/* Detailed Results Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <FileText className="w-6 h-6 text-indigo-600" />
                <h3 className="text-xl font-semibold text-slate-900">Detailed Results</h3>
              </div>
              <ResultTable 
                data={results} 
                responseHeaders={detectedHeaders}
                onApproveMatch={handleApproveMatch} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
