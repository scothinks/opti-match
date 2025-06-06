'use client';

import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartOptions } from 'chart.js';
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, BarChart3 } from 'lucide-react';
// --- MOBILE OPTIMIZATION: 1. Import the hook ---
import { useMediaQuery } from '@/hooks/useMediaQuery';

ChartJS.register(ArcElement, Tooltip, Legend);

type MatchStatus = 'Valid' | 'Partial Match' | 'Invalid';

type Props = {
  data: { [key: string]: any }[];
};

export default function MatchChart({ data }: Props) {
  // --- MOBILE OPTIMIZATION: 2. Use the hook to detect screen size ---
  // Using 1024px (lg) to match the grid breakpoint
  const isMobile = useMediaQuery('(max-width: 1024px)');

  const stats = useMemo(() => {
    const counts: Record<MatchStatus, number> = {
      Valid: 0,
      'Partial Match': 0,
      Invalid: 0,
    };

    data.forEach((row) => {
      const status = row['Match Status'];
      if (isMatchStatus(status)) {
        counts[status]++;
      }
    });

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return {
      counts,
      total,
      percentages: {
        Valid: total > 0 ? Math.round((counts.Valid / total) * 100) : 0,
        'Partial Match': total > 0 ? Math.round((counts['Partial Match'] / total) * 100) : 0,
        Invalid: total > 0 ? Math.round((counts.Invalid / total) * 100) : 0,
      },
    };
  }, [data]);

  const chartData = {
    labels: ['Valid', 'Partial Match', 'Invalid'],
    datasets: [
      {
        data: [stats.counts.Valid, stats.counts['Partial Match'], stats.counts.Invalid],
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
        ],
        borderColor: ['rgb(16, 185, 129)', 'rgb(245, 158, 11)', 'rgb(239, 68, 68)'],
        borderWidth: 3,
        hoverBorderWidth: 4,
        cutout: '60%',
      },
    ],
  };

  // --- MOBILE OPTIMIZATION: 3. Make chart options responsive using useMemo ---
  const chartOptions: ChartOptions<'doughnut'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        // Hide legend on mobile, as the stats list provides the same info
        display: !isMobile,
        position: 'right' as const,
        labels: {
          boxWidth: 20,
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#000',
        bodyColor: '#000',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 4,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function (context: any) {
            return `${context.label}: ${context.raw} (${Math.round((context.raw / stats.total) * 100)}%)`;
          },
        },
      },
    },
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 800,
      easing: 'easeOutQuart' as const,
    },
  }), [isMobile, stats.total]);

  const getStatusIcon = (status: MatchStatus) => {
    switch (status) {
      case 'Valid': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'Partial Match': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'Invalid': return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: MatchStatus) => {
    switch (status) {
      case 'Valid': return 'from-emerald-500 to-emerald-600';
      case 'Partial Match': return 'from-amber-500 to-amber-600';
      case 'Invalid': return 'from-red-500 to-red-600';
    }
  };

  const getStatusBg = (status: MatchStatus) => {
    switch (status) {
      case 'Valid': return 'bg-emerald-50 border-emerald-200';
      case 'Partial Match': return 'bg-amber-50 border-amber-200';
      case 'Invalid': return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 lg:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          {/* --- MOBILE OPTIMIZATION: 4. Use responsive font size for the title --- */}
          <h3 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
            Validation Summary
          </h3>
        </div>
        <p className="text-slate-600">Analysis of {stats.total} validation records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Chart */}
        <div className="relative">
          {/* --- MOBILE OPTIMIZATION: 5. Make chart container smaller on mobile --- */}
          <div className={`mx-auto relative ${isMobile ? 'w-64 h-64' : 'w-80 h-80'}`}>
            <Doughnut data={chartData} options={chartOptions} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-slate-600">Total</span>
                </div>
                <div className="text-3xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
                  {stats.total}
                </div>
                <div className="text-sm text-slate-500">Records</div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="space-y-4">
          {(Object.keys(stats.counts) as MatchStatus[]).map((status) => (
            <div
              key={status}
              className={`${getStatusBg(status)} border rounded-xl p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(status)}
                  <div>
                    <h4 className="font-semibold text-slate-800">{status}</h4>
                    <p className="text-sm text-slate-600">{stats.counts[status]} records</p>
                  </div>
                </div>
                <div className="text-right">
                  {/* --- MOBILE OPTIMIZATION: 6. Use responsive font size for percentages --- */}
                  <div className="text-xl lg:text-2xl font-bold text-slate-800">
                    {stats.percentages[status]}%
                  </div>
                  <div className="w-16 h-2 bg-white rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full bg-gradient-to-r ${getStatusColor(status)} transition-all duration-700 ease-out`}
                      style={{ width: `${stats.percentages[status]}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Insights (already responsive) */}
      {stats.total > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ...insights cards... */}
          </div>
        </div>
      )}
    </div>
  );
}

function isMatchStatus(value: any): value is MatchStatus {
  return value === 'Valid' || value === 'Partial Match' || value === 'Invalid';
}