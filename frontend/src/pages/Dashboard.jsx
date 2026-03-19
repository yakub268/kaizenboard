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
import { getDashboardSummary, getDashboardTimeline, getTopImprovements, getDashboardOverview, getClaudeCosts } from '../api'

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

function arrayToMap(arr, keyField) {
  const map = {}
  if (!arr) return map
  for (const item of arr) {
    map[item[keyField]] = item.count
  }
  return map
}

function SummaryCard({ title, value, subtitle, icon: Icon, trend, trendUp }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-6 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-slate-100 mt-1">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-1 mt-2">
              {trend !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium ${
                    trendUp ? 'text-emerald-400' : 'text-red-400'
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
              <span className="text-xs text-slate-500">{subtitle}</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
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
  const [overview, setOverview] = useState(null)
  const [costData, setCostData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryData, timelineData, topData, overviewData, costs] = await Promise.all([
          getDashboardSummary(),
          getDashboardTimeline(),
          getTopImprovements(),
          getDashboardOverview().catch(() => null),
          getClaudeCosts().catch(() => []),
        ])
        setSummary(summaryData)
        setTimeline(timelineData)
        setTopImprovements(topData)
        setOverview(overviewData)
        setCostData((costs || []).filter(c => c.estimated_cost > 0).slice(0, 10))
      } catch {
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

  const statusMap = arrayToMap(summary?.by_status, 'status')
  const categoryMap = arrayToMap(summary?.by_category, 'category')
  const activeCount = (statusMap.plan || 0) + (statusMap.implement || 0) + (statusMap.verify || 0)

  const chartGrid = 'rgba(51, 65, 85, 0.5)'
  const chartTick = '#64748b'

  const statusChartData = {
    labels: ['Identify', 'Analyze', 'Plan', 'Implement', 'Verify', 'Sustain'],
    datasets: [
      {
        label: 'Initiatives',
        data: [
          statusMap.identify || 0, statusMap.analyze || 0, statusMap.plan || 0,
          statusMap.implement || 0, statusMap.verify || 0, statusMap.sustain || 0,
        ],
        backgroundColor: [
          'rgba(100, 116, 139, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(139, 92, 246, 0.8)',
          'rgba(245, 158, 11, 0.8)', 'rgba(6, 182, 212, 0.8)', 'rgba(16, 185, 129, 0.8)',
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
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' }, padding: 12, cornerRadius: 8 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 12 }, color: chartTick } },
      y: { grid: { color: chartGrid }, ticks: { font: { family: 'Inter', size: 12 }, color: chartTick, stepSize: 1 } },
    },
  }

  const categoryChartData = {
    labels: ['Waste Reduction', 'Cycle Time', 'Quality', 'Cost Savings', 'Safety'],
    datasets: [
      {
        data: [
          categoryMap.waste_reduction || 0, categoryMap.cycle_time || 0,
          categoryMap.quality || 0, categoryMap.cost_savings || 0, categoryMap.safety || 0,
        ],
        backgroundColor: [COLORS.red, COLORS.blue, COLORS.purple, COLORS.green, COLORS.orange],
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
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { family: 'Inter', size: 12 }, color: '#94a3b8' },
      },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: 12, cornerRadius: 8 },
    },
  }

  const timelineArr = Array.isArray(timeline) ? timeline : []
  const timelineLabels = timelineArr.map((t) => {
    const [y, m] = t.month.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(m) - 1]} ${y.slice(2)}`
  })
  const timelineValues = timelineArr.map((t) => t.completed)

  const timelineChartData = {
    labels: timelineLabels.length > 0 ? timelineLabels : ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    datasets: [
      {
        label: 'Completed',
        data: timelineValues.length > 0 ? timelineValues : [1, 2, 3, 2, 4, 3],
        borderColor: COLORS.emerald,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#0f172a',
        pointBorderColor: COLORS.emerald,
        pointBorderWidth: 2,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top', align: 'end',
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { family: 'Inter', size: 12 }, color: '#94a3b8' },
      },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: 12, cornerRadius: 8, mode: 'index', intersect: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 12 }, color: chartTick } },
      y: { grid: { color: chartGrid }, ticks: { font: { family: 'Inter', size: 12 }, color: chartTick, stepSize: 1 } },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
  }

  const improvements = topImprovements || getDemoTopImprovements()

  return (
    <div className="py-6 px-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Overview of continuous improvement performance</p>
      </div>

      {/* Overview: Claude + Work + Kaizen */}
      {overview && (
        <div className="grid grid-cols-3 gap-5 mb-6">
          <div className="bg-slate-900 rounded-xl border border-orange-800/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <BoltIcon className="w-4 h-4 text-orange-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Claude Projects</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-2xl font-bold text-orange-400">{overview.claude?.projects || 0}</span><p className="text-slate-500 mt-0.5">projects</p></div>
              <div><span className="text-2xl font-bold text-slate-200">{overview.claude?.sessions || 0}</span><p className="text-slate-500 mt-0.5">sessions</p></div>
              <div><span className="text-sm font-medium text-slate-300">{overview.claude?.most_active || '—'}</span><p className="text-slate-500 mt-0.5">most active</p></div>
              <div><span className="text-sm font-medium text-emerald-400">${overview.claude?.total_cost?.toFixed(2) || '0.00'}</span><p className="text-slate-500 mt-0.5">est. cost</p></div>
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl border border-blue-800/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <RocketLaunchIcon className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Work Projects</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-2xl font-bold text-blue-400">{overview.work?.projects || 0}</span><p className="text-slate-500 mt-0.5">projects</p></div>
              <div><span className="text-2xl font-bold text-slate-200">{overview.work?.completion_pct || 0}%</span><p className="text-slate-500 mt-0.5">todos done</p></div>
              <div className="col-span-2">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${overview.work?.completion_pct || 0}%` }} />
                </div>
                <p className="text-slate-500 mt-1">{overview.work?.todos_done || 0}/{overview.work?.todos_total || 0} todos</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl border border-emerald-800/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Kaizen Initiatives</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-2xl font-bold text-emerald-400">{overview.kaizen?.initiatives || 0}</span><p className="text-slate-500 mt-0.5">initiatives</p></div>
              <div><span className="text-2xl font-bold text-slate-200">{activeCount}</span><p className="text-slate-500 mt-0.5">active</p></div>
              <div><span className="text-sm font-medium text-slate-300">{(summary?.completion_rate || 0).toFixed(0)}%</span><p className="text-slate-500 mt-0.5">completion rate</p></div>
              <div><span className="text-sm font-medium text-slate-300">${((summary?.total_cost_savings || 0) / 1000).toFixed(1)}k</span><p className="text-slate-500 mt-0.5">cost saved</p></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-5 mb-8">
        <SummaryCard title="Total Initiatives" value={summary?.total_initiatives || 0} subtitle="across all stages" icon={RocketLaunchIcon} />
        <SummaryCard title="Completion Rate" value={`${(summary?.completion_rate || 0).toFixed(1)}%`} subtitle="initiatives sustained" icon={CheckCircleIcon} />
        <SummaryCard title="Active Improvements" value={activeCount} subtitle="plan + implement + verify" icon={BoltIcon} />
        <SummaryCard
          title="Total Cost Saved"
          value={`$${((summary?.total_cost_savings || 0) / 1000).toFixed(1)}k`}
          subtitle="from completed metrics"
          trend={summary?.avg_improvement_pct ? `${summary.avg_improvement_pct.toFixed(0)}% avg` : undefined}
          trendUp
          icon={CurrencyDollarIcon}
        />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-8">
        <div className="col-span-2 bg-slate-900 rounded-xl border border-slate-800/80 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Initiatives by Status</h3>
          <div className="h-64">
            <Bar data={statusChartData} options={statusChartOptions} />
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">By Category</h3>
          <div className="h-64">
            <Doughnut data={categoryChartData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-8">
        <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Completions Over Time</h3>
          <div className="h-64">
            <Line data={timelineChartData} options={lineOptions} />
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Improvements</h3>
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Metric</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Before</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">After</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Improvement</th>
                </tr>
              </thead>
              <tbody>
                {improvements.map((item, idx) => {
                  const pct = item.improvement_pct !== undefined
                    ? item.improvement_pct
                    : item.before_value !== 0
                      ? ((item.before_value - item.after_value) / Math.abs(item.before_value)) * 100
                      : 0
                  const isPositive = pct > 0
                  return (
                    <tr key={idx} className="border-b border-slate-800/50 last:border-0">
                      <td className="py-3">
                        <p className="text-sm font-medium text-slate-200">{item.metric_name || item.name}</p>
                        <p className="text-xs text-slate-500">{item.title || item.initiative}</p>
                      </td>
                      <td className="text-right text-sm text-slate-400 py-3">
                        {(item.before_value ?? item.before)?.toLocaleString()}{item.unit ? ` ${item.unit}` : ''}
                      </td>
                      <td className="text-right text-sm font-medium text-slate-200 py-3">
                        {(item.after_value ?? item.after)?.toLocaleString()}{item.unit ? ` ${item.unit}` : ''}
                      </td>
                      <td className="text-right py-3">
                        <span className={`inline-flex items-center text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isPositive ? '' : '-'}{Math.abs(pct).toFixed(1)}%
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

      {/* Cost per project */}
      {costData.length > 0 && (
        <div className="mb-8">
          <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Cost by Project (Estimated)</h3>
            <div className="h-64">
              <Bar
                data={{
                  labels: costData.map(c => c.project.length > 20 ? c.project.slice(0, 20) + '...' : c.project),
                  datasets: [{
                    label: 'Cost ($)',
                    data: costData.map(c => c.estimated_cost),
                    backgroundColor: costData.map((_, i) => {
                      const colors = [
                        'rgba(249, 115, 22, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)',
                        'rgba(139, 92, 246, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(6, 182, 212, 0.8)',
                        'rgba(239, 68, 68, 0.8)', 'rgba(34, 197, 94, 0.8)', 'rgba(168, 85, 247, 0.8)',
                        'rgba(249, 115, 22, 0.6)',
                      ]
                      return colors[i % colors.length]
                    }),
                    borderRadius: 6,
                    borderSkipped: false,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      padding: 12,
                      cornerRadius: 8,
                      callbacks: { label: (ctx) => `$${ctx.raw.toFixed(2)}` },
                    },
                  },
                  scales: {
                    x: {
                      grid: { color: 'rgba(51, 65, 85, 0.5)' },
                      ticks: { font: { family: 'Inter', size: 12 }, color: '#64748b', callback: (v) => `$${v}` },
                    },
                    y: {
                      grid: { display: false },
                      ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getDemoSummary() {
  return {
    total_initiatives: 19, completion_rate: 32, total_cost_savings: 142500, avg_improvement_pct: 68,
    by_status: [
      { status: 'identify', count: 3 }, { status: 'analyze', count: 2 },
      { status: 'plan', count: 4 }, { status: 'implement', count: 5 },
      { status: 'verify', count: 2 }, { status: 'sustain', count: 3 },
    ],
    by_category: [
      { category: 'waste_reduction', count: 4 }, { category: 'cycle_time', count: 5 },
      { category: 'quality', count: 3 }, { category: 'cost_savings', count: 4 },
      { category: 'safety', count: 3 },
    ],
  }
}

function getDemoTimeline() {
  return [
    { month: '2025-09', completed: 1 }, { month: '2025-10', completed: 2 },
    { month: '2025-11', completed: 3 }, { month: '2025-12', completed: 2 },
    { month: '2026-01', completed: 4 }, { month: '2026-02', completed: 3 },
  ]
}

function getDemoTopImprovements() {
  return [
    { metric_name: 'Defect Rate', title: 'Soldering QC', before_value: 4.8, after_value: 1.2, unit: '%', improvement_pct: 75 },
    { metric_name: 'Changeover Time', title: 'SMED CNC Setup', before_value: 45, after_value: 12, unit: 'min', improvement_pct: 73.3 },
    { metric_name: 'Packaging Waste', title: 'Reusable Containers', before_value: 2400, after_value: 840, unit: 'kg/mo', improvement_pct: 65 },
    { metric_name: 'Cycle Time', title: 'Station 4 Layout', before_value: 180, after_value: 138, unit: 'sec', improvement_pct: 23.3 },
    { metric_name: 'Safety Incidents', title: 'Forklift Protocols', before_value: 8, after_value: 1, unit: '/quarter', improvement_pct: 87.5 },
  ]
}
