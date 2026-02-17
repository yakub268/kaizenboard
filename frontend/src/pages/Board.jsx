import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronRightIcon,
  UserIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { getInitiatives, createInitiative, updateStatus } from '../api'
import InitiativeForm from '../components/InitiativeForm'

const STATUSES = ['identify', 'analyze', 'plan', 'implement', 'verify', 'sustain']

const STATUS_LABELS = {
  identify: 'Identify',
  analyze: 'Analyze',
  plan: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  sustain: 'Sustain',
}

const STATUS_COLORS = {
  identify: 'border-t-slate-400',
  analyze: 'border-t-blue-400',
  plan: 'border-t-violet-400',
  implement: 'border-t-amber-400',
  verify: 'border-t-cyan-400',
  sustain: 'border-t-emerald-400',
}

const STATUS_BG = {
  identify: 'bg-slate-50',
  analyze: 'bg-blue-50/40',
  plan: 'bg-violet-50/40',
  implement: 'bg-amber-50/40',
  verify: 'bg-cyan-50/40',
  sustain: 'bg-emerald-50/40',
}

const CATEGORY_COLORS = {
  waste: 'bg-red-50 text-red-700 ring-red-200',
  cycle_time: 'bg-blue-50 text-blue-700 ring-blue-200',
  quality: 'bg-purple-50 text-purple-700 ring-purple-200',
  cost: 'bg-green-50 text-green-700 ring-green-200',
  safety: 'bg-orange-50 text-orange-700 ring-orange-200',
}

const CATEGORY_LABELS = {
  waste: 'Waste',
  cycle_time: 'Cycle Time',
  quality: 'Quality',
  cost: 'Cost',
  safety: 'Safety',
}

const PRIORITY_INDICATORS = {
  low: 'bg-slate-300',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  critical: 'bg-red-500',
}

function daysSince(dateStr) {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function InitiativeCard({ initiative, onMove, onClick }) {
  const categoryColor = CATEGORY_COLORS[initiative.category] || CATEGORY_COLORS.waste
  const categoryLabel = CATEGORY_LABELS[initiative.category] || initiative.category
  const priorityColor = PRIORITY_INDICATORS[initiative.priority] || PRIORITY_INDICATORS.medium
  const days = daysSince(initiative.created_at)
  const currentIdx = STATUSES.indexOf(initiative.status)
  const nextStatus = currentIdx < STATUSES.length - 1 ? STATUSES[currentIdx + 1] : null
  const metricCount = initiative.metrics?.length || 0

  return (
    <div
      className="bg-white rounded-lg border border-slate-200/80 p-4 card-hover cursor-pointer animate-fade-in"
      onClick={() => onClick(initiative.id)}
    >
      {/* Priority indicator bar */}
      <div className={`h-0.5 -mt-4 -mx-4 mb-3 rounded-t-lg ${priorityColor}`} />

      {/* Category badge + title */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 flex-1">
          {initiative.title}
        </h3>
        <span
          className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ring-1 ring-inset ${categoryColor}`}
        >
          {categoryLabel}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
        {initiative.owner && (
          <span className="flex items-center gap-1">
            <UserIcon className="w-3.5 h-3.5" />
            {initiative.owner}
          </span>
        )}
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3.5 h-3.5" />
          {days}d
        </span>
        {metricCount > 0 && (
          <span className="flex items-center gap-1">
            <ChartBarIcon className="w-3.5 h-3.5" />
            {metricCount}
          </span>
        )}
      </div>

      {/* Move to next button */}
      {nextStatus && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMove(initiative.id, nextStatus)
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600 rounded-md transition-colors duration-150 cursor-pointer"
        >
          Move to {STATUS_LABELS[nextStatus]}
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

export default function Board() {
  const navigate = useNavigate()
  const [initiatives, setInitiatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  const fetchInitiatives = useCallback(async () => {
    try {
      setError(null)
      const data = await getInitiatives(null, categoryFilter || null)
      setInitiatives(data)
    } catch (err) {
      setError(err.message)
      // Use demo data when API is not available
      setInitiatives(getDemoData())
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    fetchInitiatives()
  }, [fetchInitiatives])

  // Listen for new-initiative event from Navbar
  useEffect(() => {
    const handler = () => setShowForm(true)
    window.addEventListener('open-new-initiative', handler)
    return () => window.removeEventListener('open-new-initiative', handler)
  }, [])

  const handleCreate = async (data) => {
    try {
      await createInitiative(data)
      setShowForm(false)
      fetchInitiatives()
    } catch {
      // If API unavailable, add to local state
      const newItem = {
        id: Date.now(),
        ...data,
        status: 'identify',
        created_at: new Date().toISOString(),
        metrics: [],
      }
      setInitiatives((prev) => [...prev, newItem])
      setShowForm(false)
    }
  }

  const handleMove = async (id, newStatus) => {
    try {
      await updateStatus(id, newStatus)
      fetchInitiatives()
    } catch {
      // Optimistic update
      setInitiatives((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
      )
    }
  }

  const handleCardClick = (id) => {
    navigate(`/initiative/${id}`)
  }

  const filtered = initiatives.filter((i) => {
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped = {}
  STATUSES.forEach((s) => {
    grouped[s] = filtered.filter((i) => i.status === s)
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Improvement Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track initiatives through the Kaizen workflow
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer"
        >
          + New Initiative
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search initiatives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
        </div>
        <div className="relative">
          <FunnelIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg">
          Using demo data. Connect the API at localhost:8000 for live data.
        </div>
      )}

      {/* Kanban Columns */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-4 overflow-x-auto">
          {STATUSES.map((status) => (
            <div key={status} className="min-w-[220px]">
              {/* Column header */}
              <div
                className={`rounded-t-lg border-t-2 ${STATUS_COLORS[status]} px-3 py-3 ${STATUS_BG[status]}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs font-medium text-slate-400 bg-white/80 px-2 py-0.5 rounded-full">
                    {grouped[status].length}
                  </span>
                </div>
              </div>

              {/* Column body */}
              <div className="kanban-column bg-slate-50/50 rounded-b-lg p-2 space-y-2 border border-t-0 border-slate-100">
                {grouped[status].length === 0 ? (
                  <p className="text-xs text-slate-300 text-center py-8">No items</p>
                ) : (
                  grouped[status].map((initiative) => (
                    <InitiativeCard
                      key={initiative.id}
                      initiative={initiative}
                      onMove={handleMove}
                      onClick={handleCardClick}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Initiative Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <InitiativeForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

// Demo data shown when API is unavailable
function getDemoData() {
  return [
    {
      id: 1,
      title: 'Reduce packaging waste by 30%',
      description: 'Implement reusable packaging for internal parts movement between stations.',
      category: 'waste',
      priority: 'high',
      status: 'implement',
      owner: 'Sarah Chen',
      department: 'Manufacturing',
      created_at: '2026-01-15T00:00:00Z',
      metrics: [{ id: 1 }, { id: 2 }],
    },
    {
      id: 2,
      title: 'Cut assembly cycle time 20%',
      description: 'Reorganize Station 4 layout and pre-stage components.',
      category: 'cycle_time',
      priority: 'critical',
      status: 'verify',
      owner: 'Mike Torres',
      department: 'Assembly',
      created_at: '2026-01-20T00:00:00Z',
      metrics: [{ id: 3 }],
    },
    {
      id: 3,
      title: 'Implement 5S in warehouse',
      description: 'Sort, set in order, shine, standardize, sustain for warehouse area B.',
      category: 'quality',
      priority: 'medium',
      status: 'plan',
      owner: 'Lisa Park',
      department: 'Warehouse',
      created_at: '2026-02-01T00:00:00Z',
      metrics: [],
    },
    {
      id: 4,
      title: 'Reduce defect rate in soldering',
      description: 'Root cause analysis on solder joint failures in PCB assembly.',
      category: 'quality',
      priority: 'high',
      status: 'analyze',
      owner: 'James Wu',
      department: 'Electronics',
      created_at: '2026-02-05T00:00:00Z',
      metrics: [{ id: 4 }],
    },
    {
      id: 5,
      title: 'Automate inventory counts',
      description: 'Replace manual weekly counts with RFID scanning system.',
      category: 'cost',
      priority: 'medium',
      status: 'identify',
      owner: 'David Kim',
      department: 'Logistics',
      created_at: '2026-02-10T00:00:00Z',
      metrics: [],
    },
    {
      id: 6,
      title: 'Improve forklift safety protocols',
      description: 'Add proximity sensors and define new traffic patterns.',
      category: 'safety',
      priority: 'critical',
      status: 'implement',
      owner: 'Ana Rodriguez',
      department: 'Safety',
      created_at: '2026-01-08T00:00:00Z',
      metrics: [{ id: 5 }, { id: 6 }, { id: 7 }],
    },
    {
      id: 7,
      title: 'Standardize changeover procedures',
      description: 'Apply SMED methodology to CNC machine changeovers.',
      category: 'cycle_time',
      priority: 'high',
      status: 'sustain',
      owner: 'Tom Bradley',
      department: 'Machining',
      created_at: '2025-12-01T00:00:00Z',
      metrics: [{ id: 8 }],
    },
    {
      id: 8,
      title: 'Reduce energy costs by 15%',
      description: 'Install smart sensors on HVAC and lighting. Track kWh per unit produced.',
      category: 'cost',
      priority: 'medium',
      status: 'plan',
      owner: 'Rachel Adams',
      department: 'Facilities',
      created_at: '2026-02-12T00:00:00Z',
      metrics: [],
    },
  ]
}
