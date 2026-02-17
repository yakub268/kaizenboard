import { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  RocketLaunchIcon,
  CheckCircleIcon,
  BoltIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline'
import { getDashboardSummary, getDashboardTimeline, getTopImprovements } from '../api'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// Consistent color palette
const COLORS = {
  slate: 'rgb(100, 116, 139)',
  blue: 'rgb(59, 130, 246)',
  violet: 'rgb(139, 92, 246)',
  amber: 'rgb(245, 158, 11)',
  cyan: 'rgb(6, 182, 212)',
  emerald: 'rgb(16, 185, 129)',
  red: 'rgb(239, 68, 68)',
  green: 'rgb(34, 197, 94)',
  orange: 'rgb(249, 115, 22)',
  purple: 'rgb(168, 85, 247)',
}

function SummaryCard({ title, value, subtitle, icon: Icon, trend, trendUp }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-6 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-1 mt-2">
              {trend !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium ${
                    trendUp ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {trendUp ? (
                    <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-0.5" />
                  ) : (
                    <ArrowTrendingDownIcon className="w-3.5 h-3.5 mr-0.5" />
                  )}
                  {trend}
                </span>
              )}
              <span className="text-xs text-slate-400">{subtitle}</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">
          <Icon className="w-6 h-6 text-slate-400" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [topImprovements, setTopImprovements] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryData, timelineData, topData] = await Promise.all([
          getDashboardSummary(),
          getDashboardTimeline(),
          getTopImprovements(),
        ])
        setSummary(summaryData)
        setTimeline(timelineData)
        setTopImprovements(topData)
      } catch {
        // Use demo data
        setSummary(getDemoSummary())
        setTimeline(getDemoTimeline())
        setTopImprovements(getDemoTopImprovements())
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Chart: Initiatives by status
  const statusChartData = {
    labels: ['Identify', 'Analyze', 'Plan', 'Implement', 'Verify', 'Sustain'],
    datasets: [
      {
        label: 'Initiatives',
        data: summary?.by_status
          ? [
              summary.by_status.identify || 0,
              summary.by_status.analyze || 0,
              summary.by_status.plan || 0,
              summary.by_status.implement || 0,
              summary.by_status.verify || 0,
              summary.by_status.sustain || 0,
            ]
          : [3, 2, 4, 5, 2, 3],
        backgroundColor: [
          'rgba(100, 116, 139, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(16, 185, 129, 0.8)',
        ],
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }

  const statusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { family: 'Inter' },
        bodyFont: { family: 'Inter' },
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 12 }, color: '#94a3b8' },
      },
      y: {
        grid: { color: 'rgba(241, 245, 249, 1)' },
        ticks: { font: { family: 'Inter', size: 12 }, color: '#94a3b8', stepSize: 1 },
      },
    },
  }

  // Chart: Initiatives by category (doughnut)
  const categoryChartData = {
    labels: ['Waste', 'Cycle Time', 'Quality', 'Cost', 'Safety'],
    datasets: [
      {
        data: summary?.by_category
          ? [
              summary.by_category.waste || 0,
              summary.by_category.cycle_time || 0,
              summary.by_category.quality || 0,
              summary.by_category.cost || 0,
              summary.by_category.safety || 0,
            ]
          : [4, 5, 3, 4, 3],
        backgroundColor: [
          COLORS.red,
          COLORS.blue,
          COLORS.purple,
          COLORS.green,
          COLORS.orange,
        ],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
          font: { family: 'Inter', size: 12 },
          color: '#64748b',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        cornerRadius: 8,
      },
    },
  }

  // Chart: Completions over time (line)
  const timelineLabels = timeline?.months || [
    'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb',
  ]
  const timelineChartData = {
    labels: timelineLabels,
    datasets: [
      {
        label: 'Completed',
        data: timeline?.completed || [1, 2, 3, 2, 4, 3],
        borderColor: COLORS.emerald,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderColor: COLORS.emerald,
        pointBorderWidth: 2,
      },
      {
        label: 'Started',
        data: timeline?.started || [3, 4, 2, 5, 3, 2],
        borderColor: COLORS.blue,
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderColor: COLORS.blue,
        pointBorderWidth: 2,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
          font: { family: 'Inter', size: 12 },
          color: '#64748b',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        cornerRadius: 8,
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 12 }, color: '#94a3b8' },
      },
      y: {
        grid: { color: 'rgba(241, 245, 249, 1)' },
        ticks: { font: { family: 'Inter', size: 12 }, color: '#94a3b8', stepSize: 1 },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  }

  const improvements = topImprovements || getDemoTopImprovements()

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Overview of continuous improvement performance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <SummaryCard
          title="Total Initiatives"
          value={summary?.total || 19}
          subtitle="across all stages"
          icon={RocketLaunchIcon}
        />
        <SummaryCard
          title="Completion Rate"
          value={`${summary?.completion_rate || 32}%`}
          subtitle="vs last month"
          trend="+8%"
          trendUp
          icon={CheckCircleIcon}
        />
        <SummaryCard
          title="Active Improvements"
          value={summary?.active || 12}
          subtitle="in progress"
          icon={BoltIcon}
        />
        <SummaryCard
          title="Total Cost Saved"
          value={`$${((summary?.total_cost_saved || 142500) / 1000).toFixed(0)}k`}
          subtitle="this quarter"
          trend="+23%"
          trendUp
          icon={CurrencyDollarIcon}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        {/* Bar: by status */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Initiatives by Status</h3>
          <div className="h-64">
            <Bar data={statusChartData} options={statusChartOptions} />
          </div>
        </div>

        {/* Doughnut: by category */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Category</h3>
          <div className="h-64">
            <Doughnut data={categoryChartData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-5 mb-8">
        {/* Line: completions over time */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Completions Over Time</h3>
          <div className="h-64">
            <Line data={timelineChartData} options={lineOptions} />
          </div>
        </div>

        {/* Top Improvements Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Top Improvements</h3>
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">
                    Metric
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">
                    Before
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">
                    After
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">
                    Improvement
                  </th>
                </tr>
              </thead>
              <tbody>
                {improvements.map((item, idx) => {
                  const pct = item.before !== 0
                    ? (((item.before - item.after) / Math.abs(item.before)) * 100).toFixed(1)
                    : 0
                  const isPositive = parseFloat(pct) > 0
                  return (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <p className="text-sm font-medium text-slate-700">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.initiative}</p>
                      </td>
                      <td className="text-right text-sm text-slate-500 py-3">
                        {item.before.toLocaleString()}{item.unit ? ` ${item.unit}` : ''}
                      </td>
                      <td className="text-right text-sm font-medium text-slate-700 py-3">
                        {item.after.toLocaleString()}{item.unit ? ` ${item.unit}` : ''}
                      </td>
                      <td className="text-right py-3">
                        <span
                          className={`inline-flex items-center text-sm font-bold ${
                            isPositive ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {isPositive ? '-' : '+'}
                          {Math.abs(pct)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function getDemoSummary() {
  return {
    total: 19,
    completion_rate: 32,
    active: 12,
    total_cost_saved: 142500,
    by_status: { identify: 3, analyze: 2, plan: 4, implement: 5, verify: 2, sustain: 3 },
    by_category: { waste: 4, cycle_time: 5, quality: 3, cost: 4, safety: 3 },
  }
}

function getDemoTimeline() {
  return {
    months: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    completed: [1, 2, 3, 2, 4, 3],
    started: [3, 4, 2, 5, 3, 2],
  }
}

function getDemoTopImprovements() {
  return [
    { name: 'Defect Rate', initiative: 'Soldering QC', before: 4.8, after: 1.2, unit: '%' },
    { name: 'Changeover Time', initiative: 'SMED CNC Setup', before: 45, after: 12, unit: 'min' },
    { name: 'Packaging Waste', initiative: 'Reusable Containers', before: 2400, after: 840, unit: 'kg/mo' },
    { name: 'Cycle Time', initiative: 'Station 4 Layout', before: 180, after: 138, unit: 'sec' },
    { name: 'Safety Incidents', initiative: 'Forklift Protocols', before: 8, after: 1, unit: '/quarter' },
  ]
}
