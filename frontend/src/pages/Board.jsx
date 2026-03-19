import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronRightIcon,
  UserIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { getInitiatives, createInitiative, updateStatus, deleteInitiative } from '../api'
/* NEW: drag-and-drop */
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
/* END NEW: drag-and-drop */
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
  identify: 'bg-slate-800/50',
  analyze: 'bg-blue-950/30',
  plan: 'bg-violet-950/30',
  implement: 'bg-amber-950/30',
  verify: 'bg-cyan-950/30',
  sustain: 'bg-emerald-950/30',
}

const CATEGORY_COLORS = {
  waste_reduction: 'bg-red-950/50 text-red-400 ring-red-800/50',
  cycle_time: 'bg-blue-950/50 text-blue-400 ring-blue-800/50',
  quality: 'bg-purple-950/50 text-purple-400 ring-purple-800/50',
  cost_savings: 'bg-green-950/50 text-green-400 ring-green-800/50',
  safety: 'bg-orange-950/50 text-orange-400 ring-orange-800/50',
  other: 'bg-slate-800/50 text-slate-400 ring-slate-700/50',
}

const CATEGORY_LABELS = {
  waste_reduction: 'Waste',
  cycle_time: 'Cycle Time',
  quality: 'Quality',
  cost_savings: 'Cost',
  safety: 'Safety',
  other: 'Other',
}

const PRIORITY_INDICATORS = {
  low: 'bg-slate-500',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  critical: 'bg-red-500',
}

function daysSince(dateStr) {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

/* NEW: staleness-warnings */
function staleness(dateStr) {
  const d = daysSince(dateStr)
  if (d >= 60) return 'critical'
  if (d >= 30) return 'warning'
  if (d >= 7) return 'mild'
  return 'none'
}
/* END NEW: staleness-warnings */

/* NEW: staleness-warnings + quick-delete */
function InitiativeCard({ initiative, onMove, onClick, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef(null)

  const categoryColor = CATEGORY_COLORS[initiative.category] || CATEGORY_COLORS.other
  const categoryLabel = CATEGORY_LABELS[initiative.category] || initiative.category
  const priorityColor = PRIORITY_INDICATORS[initiative.priority] || PRIORITY_INDICATORS.medium
  const staleDate = initiative.updated_at || initiative.created_at
  const days = daysSince(staleDate)
  const stale = staleness(staleDate)
  const currentIdx = STATUSES.indexOf(initiative.status)
  const nextStatus = currentIdx < STATUSES.length - 1 ? STATUSES[currentIdx + 1] : null
  const metricCount = initiative.metrics?.length || 0

  const staleBorderClass = {
    none: 'border-slate-700/50',
    mild: 'border-slate-700/50',
    warning: 'border-orange-500/40',
    critical: 'border-red-500/60',
  }[stale]

  const staleAgeClass = {
    none: 'text-slate-500',
    mild: 'text-slate-500',
    warning: 'text-orange-400',
    critical: 'text-red-400',
  }[stale]

  const handleTrashClick = (e) => {
    e.stopPropagation()
    setConfirming(true)
    timerRef.current = setTimeout(() => setConfirming(false), 3000)
  }

  const handleConfirmDelete = (e) => {
    e.stopPropagation()
    clearTimeout(timerRef.current)
    setConfirming(false)
    onDelete(initiative.id)
  }

  const handleCancelDelete = (e) => {
    e.stopPropagation()
    clearTimeout(timerRef.current)
    setConfirming(false)
  }

  return (
    <div
      className={`group relative bg-slate-900 rounded-lg border p-4 card-hover cursor-pointer animate-fade-in ${staleBorderClass}`}
      onClick={() => onClick(initiative.id)}
    >
      <div className={`h-0.5 -mt-4 -mx-4 mb-3 rounded-t-lg ${priorityColor}`} />

      <div className="absolute top-2 right-2">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleConfirmDelete}
              className="p-1 rounded text-emerald-400 hover:bg-emerald-900/40 transition-colors cursor-pointer text-xs font-bold"
              title="Confirm delete"
            >✓</button>
            <button
              onClick={handleCancelDelete}
              className="p-1 rounded text-slate-400 hover:bg-slate-700/60 transition-colors cursor-pointer text-xs font-bold"
              title="Cancel"
            >✗</button>
          </div>
        ) : (
          <button
            onClick={handleTrashClick}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/30 transition-all duration-150 cursor-pointer"
            title="Delete initiative"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-slate-200 leading-snug line-clamp-2 flex-1 pr-6">
          {initiative.title}
        </h3>
        <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ring-1 ring-inset ${categoryColor}`}>
          {categoryLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs mb-3">
        {initiative.owner && (
          <span className="flex items-center gap-1 text-slate-500">
            <UserIcon className="w-3.5 h-3.5" />
            {initiative.owner}
          </span>
        )}
        <span
          className={`flex items-center gap-1 ${staleAgeClass}`}
          title={stale === 'critical' ? `Stale — ${days} days in this stage` : undefined}
        >
          {stale === 'mild' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" />}
          {stale === 'critical' && <span className="mr-0.5">⚠</span>}
          <ClockIcon className="w-3.5 h-3.5" />
          {days}d
        </span>
        {metricCount > 0 && (
          <span className="flex items-center gap-1 text-slate-500">
            <ChartBarIcon className="w-3.5 h-3.5" />
            {metricCount}
          </span>
        )}
      </div>

      {nextStatus && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMove(initiative.id, nextStatus)
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/80 hover:bg-emerald-900/40 hover:text-emerald-400 rounded-md transition-colors duration-150 cursor-pointer"
        >
          Move to {STATUS_LABELS[nextStatus]}
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
/* END NEW: staleness-warnings + quick-delete */

export default function Board() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initiatives, setInitiatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || '')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  const fetchInitiatives = useCallback(async () => {
    try {
      setError(null)
      const data = await getInitiatives(null, categoryFilter || null)
      setInitiatives(data.filter(i => i.category !== 'work_project' && i.category !== 'ai_project'))
    } catch (err) {
      setError(err.message)
      setInitiatives(getDemoData())
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    fetchInitiatives()
  }, [fetchInitiatives])

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
      setInitiatives((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
      )
    }
  }

  /* NEW: quick-delete */
  const handleDelete = async (id) => {
    setInitiatives((prev) => prev.filter((i) => i.id !== id))
    try {
      await deleteInitiative(id)
    } catch {
      fetchInitiatives()
    }
  }
  /* END NEW: quick-delete */

  /* NEW: drag-and-drop */
  const handleDragEnd = async ({ draggableId, source, destination }) => {
    if (!destination) return
    if (destination.droppableId === source.droppableId) return
    const id = parseInt(draggableId, 10)
    const newStatus = destination.droppableId
    setInitiatives((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
    )
    try {
      await updateStatus(id, newStatus)
    } catch {
      fetchInitiatives()
    }
  }
  /* END NEW: drag-and-drop */

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Improvement Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track initiatives through the Kaizen workflow</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer"
        >
          + New Initiative
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search initiatives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/60 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
          />
        </div>
        <div className="relative">
          <FunnelIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select
            value={categoryFilter}
            onChange={(e) => {
              const val = e.target.value
              setCategoryFilter(val)
              if (val) setSearchParams({ category: val })
              else setSearchParams({})
            }}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-700/60 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-amber-900/30 border border-amber-700/40 text-amber-400 text-sm rounded-lg">
          Using demo data. Connect the API at localhost:8000 for live data.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-6 gap-4 overflow-x-auto">
            {STATUSES.map((status) => (
              <div key={status} className="min-w-[220px]">
                <div className={`rounded-t-lg border-t-2 ${STATUS_COLORS[status]} px-3 py-3 ${STATUS_BG[status]}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-300">{STATUS_LABELS[status]}</h2>
                    <span className="text-xs font-medium text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-full">
                      {grouped[status].length}
                    </span>
                  </div>
                </div>

                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`kanban-column rounded-b-lg p-2 space-y-2 border border-t-0 border-slate-800/50 min-h-[80px] transition-colors duration-150 ${snapshot.isDraggingOver ? 'bg-emerald-950/20' : 'bg-slate-900/30'}`}
                    >
                      {grouped[status].length === 0 && !snapshot.isDraggingOver ? (
                        <p className="text-xs text-slate-600 text-center py-8">No items</p>
                      ) : (
                        grouped[status].map((initiative, idx) => (
                          <Draggable key={initiative.id} draggableId={String(initiative.id)} index={idx}>
                            {(dragProvided) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                              >
                                <InitiativeCard
                                  initiative={initiative}
                                  onMove={handleMove}
                                  onClick={handleCardClick}
                                  onDelete={handleDelete}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-slate-900 rounded-xl shadow-xl border border-slate-700/50 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <InitiativeForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

function getDemoData() {
  return [
    { id: 1, title: 'Reduce packaging waste by 30%', category: 'waste_reduction', priority: 'high', status: 'implement', owner: 'Sarah Chen', created_at: '2026-01-15T00:00:00Z', metrics: [{ id: 1 }, { id: 2 }] },
    { id: 2, title: 'Cut assembly cycle time 20%', category: 'cycle_time', priority: 'critical', status: 'verify', owner: 'Mike Torres', created_at: '2026-01-20T00:00:00Z', metrics: [{ id: 3 }] },
    { id: 3, title: 'Implement 5S in warehouse', category: 'quality', priority: 'medium', status: 'plan', owner: 'Lisa Park', created_at: '2026-02-01T00:00:00Z', metrics: [] },
    { id: 4, title: 'Reduce defect rate in soldering', category: 'quality', priority: 'high', status: 'analyze', owner: 'James Wu', created_at: '2026-02-05T00:00:00Z', metrics: [{ id: 4 }] },
    { id: 5, title: 'Automate inventory counts', category: 'cost_savings', priority: 'medium', status: 'identify', owner: 'David Kim', created_at: '2026-02-10T00:00:00Z', metrics: [] },
    { id: 6, title: 'Improve forklift safety protocols', category: 'safety', priority: 'critical', status: 'implement', owner: 'Ana Rodriguez', created_at: '2026-01-08T00:00:00Z', metrics: [{ id: 5 }, { id: 6 }] },
    { id: 7, title: 'Standardize changeover procedures', category: 'cycle_time', priority: 'high', status: 'sustain', owner: 'Tom Bradley', created_at: '2025-12-01T00:00:00Z', metrics: [{ id: 8 }] },
  ]
}
