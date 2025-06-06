'use client';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Calendar,
  Settings,
  Loader2,
} from 'lucide-react';

// 1. Update Props to accept the original filename
type Props = {
  data: any[];
  originalFileName?: string;
};

const filters = ['All', 'Valid', 'Partial Match', 'Invalid'] as const;
type Filter = typeof filters[number];

// 2. Update component signature to receive the new prop
export default function DownloadButtons({ data, originalFileName }: Props) {
  const [fileType, setFileType] = useState<'xlsx' | 'csv'>('xlsx');
  const [isDownloading, setIsDownloading] = useState<Filter | null>(null);

  const getFilterIcon = (filter: Filter) => {
    switch (filter) {
      case 'All':
        return <Database className="w-4 h-4" />;
      case 'Valid':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'Partial Match':
        return <AlertTriangle className="w-4 h-4" />;
      case 'Invalid':
        return <XCircle className="w-4 h-4" />;
    }
  };

  const getFilterColor = (filter: Filter) => {
    switch (filter) {
      case 'All':
        return 'from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700';
      case 'Valid':
        return 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700';
      case 'Partial Match':
        return 'from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700';
      case 'Invalid':
        return 'from-red-500 to-red-600 hover:from-red-600 hover:to-red-700';
    }
  };

  const getFilterCount = (filter: Filter) => {
    if (filter === 'All') return data.length;
    return data.filter((row) => row['Match Status'] === filter).length;
  };

  const handleDownload = async (filter: Filter) => {
    setIsDownloading(filter);

    try {
      // Add a small delay for UX (shows loading state)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const filteredData =
        filter === 'All'
          ? data
          : data.filter((row) => row['Match Status'] === filter);
      
      if (filteredData.length === 0) {
        // Prevent download if there's no data for the filter
        setIsDownloading(null);
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(filteredData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

      const fileBuffer =
        fileType === 'xlsx'
          ? XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
          : XLSX.write(workbook, { bookType: 'csv', type: 'array' });

      // --- 3. DYNAMIC FILENAME LOGIC ---
      // Use original filename if available, otherwise fallback to a default
      const baseName = originalFileName
        ? originalFileName.replace(/\.[^/.]+$/, '')
        : 'Validation_Results';
      
      // Get a clean timestamp in YYYY-MM-DD format
      const timestamp = new Date().toLocaleDateString('en-CA');
      const marker = filter.replace(' ', '_'); // e.g., "Partial_Match"

      const fileName = `${baseName}_Validated_${marker}_${timestamp}.${fileType}`;
      
      const blob = new Blob([fileBuffer], {
        type:
          fileType === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv;charset=utf-8',
      });

      saveAs(blob, fileName);
    } catch (error) {
      console.error('Download failed:', error);
      // Optionally, add a user notification for the error
    } finally {
      setIsDownloading(null);
    }
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
              Export Results
            </h3>
          </div>
          <p className="text-slate-600 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Generated on {getCurrentDate()}
          </p>
        </div>

        {/* File Type Selector */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <Settings className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-700">Export Format</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFileType('xlsx')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                fileType === 'xlsx'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={() => setFileType('csv')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                fileType === 'csv'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Download Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filters.map((filter) => {
          const count = getFilterCount(filter);
          const isLoading = isDownloading === filter;

          return (
            <div
              key={filter}
              className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 border border-slate-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {getFilterIcon(filter)}
                  <h4 className="font-semibold text-slate-800">{filter}</h4>
                </div>
                <div className="bg-white rounded-full px-3 py-1 text-sm font-medium text-slate-600 border border-slate-200">
                  {count} records
                </div>
              </div>

              {/* Download Button */}
              <button
                onClick={() => handleDownload(filter)}
                disabled={isLoading || count === 0}
                className={`
                  w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-white
                  transition-all duration-300 transform hover:scale-105 hover:shadow-xl
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                  bg-gradient-to-r ${getFilterColor(filter)}
                `}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download {filter}
                  </>
                )}
              </button>

              {/* File Info */}
              <div className="mt-3 text-xs text-slate-500 text-center">
                {fileType.toUpperCase()} • {count > 0 ? `${count} rows` : 'No data'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 mb-1">Export Information</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Files include all validation data with match status indicators</li>
                <li>• Excel format preserves formatting, CSV is compatible with all systems</li>
                <li>• Timestamps are automatically added to filenames for organization</li>
                <li>• Large datasets may take a moment to process</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
          <div className="text-lg font-bold text-slate-800">{data.length}</div>
          <div className="text-xs text-slate-500">Total Records</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
          <div className="text-lg font-bold text-emerald-600">{getFilterCount('Valid')}</div>
          <div className="text-xs text-slate-500">Valid</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
          <div className="text-lg font-bold text-amber-600">{getFilterCount('Partial Match')}</div>
          <div className="text-xs text-slate-500">Partial</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
          <div className="text-lg font-bold text-red-600">{getFilterCount('Invalid')}</div>
          <div className="text-xs text-slate-500">Invalid</div>
        </div>
      </div>
    </div>
  );
}