'use client';

import { ChangeEvent, useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, X, Info } from 'lucide-react';

type Props = {
  label: string;
  onFileSelect: (file: File | null) => void;
  file?: File | null;
  warningText?: string;
};

export default function FileUploader({ label, onFileSelect, file, warningText }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.csv'))) {
      onFileSelect(droppedFile);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-full box-border overflow-hidden">
      {/* Label */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
          {label}
        </h3>
        <p className="text-sm text-slate-500 mt-1">Upload Excel files (.xlsx, .xls)</p>
      </div>

      {/* Upload Area */}
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative overflow-hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 transform
          ${isDragOver 
            ? 'border-indigo-400 bg-indigo-50 scale-102' 
            : file 
              ? 'border-emerald-300 bg-emerald-50' 
              : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
          }
          ${isHovered && !file ? 'shadow-xl border-indigo-400' : 'shadow-lg'}
          ${file ? 'shadow-emerald-100' : ''}
        `}
      >
        {/* Background Gradient Overlay */}
        <div className={`
          absolute inset-0 opacity-0 transition-opacity duration-300
          ${isHovered ? 'opacity-100' : ''}
          bg-gradient-to-br from-indigo-500/5 to-purple-500/5
        `} />

        <div className="relative p-6 sm:p-8">
          {!file ? (
            <div className="text-center">
              {/* Upload Icon */}
              <div className={`
                w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-all duration-300
                ${isDragOver 
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white scale-110' 
                  : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600'
                }
                ${isHovered ? 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white transform scale-105' : ''}
              `}>
                <Upload className={`w-6 h-6 sm:w-7 sm:h-7 transition-transform duration-300 ${isDragOver || isHovered ? 'scale-110' : ''}`} />
              </div>

              {/* Text */}
              <div className="space-y-2">
                <p className="font-semibold text-slate-700">
                  {isDragOver ? 'Drop your file here' : 'Choose file or drag & drop'}
                </p>
                <p className="text-sm text-slate-500">
                  CSV and Excel files only • Max 10MB
                </p>
              </div>

              {/* Warning Display */}
              {warningText && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700">{warningText}</p>
                  </div>
                </div>
              )}

              {/* Decorative Elements */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-indigo-200 rounded-full opacity-60" />
              <div className="absolute bottom-4 left-4 w-3 h-3 bg-purple-200 rounded-full opacity-40" />
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 overflow-hidden">
              {/* File Icon */}
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>

              {/* File Info - ENHANCED FIX */}
              <div className="flex-1 min-w-0 max-w-0 overflow-hidden">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="font-semibold text-slate-700 truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {file.name}
                  </p>
                </div>
                <p className="text-sm text-slate-500 truncate">{formatFileSize(file.size)}</p>
              </div>

              {/* Remove Button */}
              <button
                onClick={handleRemoveFile}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-all duration-200 hover:scale-110"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Progress Bar Effect for File Selected */}
        {file && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-600" />
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}