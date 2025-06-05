'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, Filter, CheckCircle2, AlertTriangle, XCircle, Minus } from 'lucide-react';

type ResultRow = {
  [key: string]: any;
};

type Props = {
  data: ResultRow[];
};

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

export default function ResultTable({ data }: Props) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  if (data.length === 0) return null;

  const headers = Object.keys(data[0]);

  // Filtering logic
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesText = filterText === '' || 
        Object.values(row).some(value => 
          String(value).toLowerCase().includes(filterText.toLowerCase())
        );
      
      const matchesStatus = statusFilter === 'all' || 
        row['Match Status'] === statusFilter;
      
      return matchesText && matchesStatus;
    });
  }, [data, filterText, statusFilter]);

  // Sorting logic
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Valid':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'Partial Match':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'Invalid':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getRowClass = (status: string) => {
    switch (status) {
      case 'Valid':
        return 'bg-gradient-to-r from-emerald-50 to-emerald-25 border-l-4 border-emerald-400';
      case 'Partial Match':
        return 'bg-gradient-to-r from-amber-50 to-amber-25 border-l-4 border-amber-400';
      case 'Invalid':
        return 'bg-gradient-to-r from-red-50 to-red-25 border-l-4 border-red-400';
      default:
        return 'bg-white hover:bg-slate-50 border-l-4 border-transparent';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'Valid':
        return `${baseClasses} bg-emerald-100 text-emerald-700 border border-emerald-200`;
      case 'Partial Match':
        return `${baseClasses} bg-amber-100 text-amber-700 border border-amber-200`;
      case 'Invalid':
        return `${baseClasses} bg-red-100 text-red-700 border border-red-200`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-700 border border-slate-200`;
    }
  };

  // Get unique statuses for filter dropdown
  const uniqueStatuses = [...new Set(data.map(row => row['Match Status']))];

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
              Validation Results
            </h3>
            <p className="text-slate-600 text-sm mt-1">
              {sortedData.length} of {data.length} records
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search records..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-sm"
              />
            </div>
            
            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-8 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-sm appearance-none bg-white"
              >
                <option value="all">All Statuses</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[600px]">
        <table className="min-w-full">
          <thead className="bg-gradient-to-r from-slate-100 to-slate-200 sticky top-0 z-10">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  onClick={() => handleSort(header)}
                  className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors duration-200 border-b border-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span>{header}</span>
                    <div className="flex flex-col">
                      <ChevronUp 
                        className={`w-3 h-3 transition-colors ${
                          sortConfig?.key === header && sortConfig.direction === 'asc' 
                            ? 'text-indigo-600' 
                            : 'text-slate-400'
                        }`} 
                      />
                      <ChevronDown 
                        className={`w-3 h-3 -mt-1 transition-colors ${
                          sortConfig?.key === header && sortConfig.direction === 'desc' 
                            ? 'text-indigo-600' 
                            : 'text-slate-400'
                        }`} 
                      />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedData.map((row, i) => (
              <tr 
                key={i} 
                className={`${getRowClass(row['Match Status'])} transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5`}
              >
                {headers.map((key) => (
                  <td key={key} className="px-6 py-4 whitespace-nowrap text-sm">
                    {key === 'Match Status' ? (
                      <div className="flex items-center gap-2">
                        {getStatusIcon(row[key])}
                        <span className={getStatusBadge(row[key])}>
                          {row[key]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-900 font-medium">
                        {row[key]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {sortedData.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">No results found</h3>
          <p className="text-slate-500">Try adjusting your search or filter criteria</p>
        </div>
      )}

      {/* Footer with Summary */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-400 rounded-full"></div>
              <span className="text-slate-600">
                Valid: {data.filter(row => row['Match Status'] === 'Valid').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
              <span className="text-slate-600">
                Partial: {data.filter(row => row['Match Status'] === 'Partial Match').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-400 rounded-full"></div>
              <span className="text-slate-600">
                Invalid: {data.filter(row => row['Match Status'] === 'Invalid').length}
              </span>
            </div>
          </div>
          <div className="text-slate-500">
            Total Records: {data.length}
          </div>
        </div>
      </div>
    </div>
  );
}