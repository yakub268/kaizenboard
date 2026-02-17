import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  PlusIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import {
  getInitiative,
  updateInitiative,
  updateStatus,
  deleteInitiative,
  addMetric,
  deleteMetric,
} from '../api'
import StatusBadge from '../components/StatusBadge'
import MetricRow from '../components/MetricRow'
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

const CATEGORY_COLORS = {
  waste: 'bg-red-50 text-red-700 ring-red-200',
  cycle_time: 'bg-blue-50 text-blue-700 ring-blue-200',
  quality: 'bg-purple-50 text-purple-700 ring-purple-200',
  cost: 'bg-green-50 text-green-700 ring-green-200',
  safety: 'bg-orange-50 text-orange-700 ring-orange-200',
}

const CATEGORY_LABELS = {
  waste: 'Waste Reduction',
  cycle_time: 'Cycle Time',
  quality: 'Quality',
  cost: 'Cost Reduction',
  safety: 'Safety',
}

const PRIORITY_STYLES = {
  low: 'text-slate-500',
  medium: 'text-blue-600',
  high: 'text-amber-600',
  critical: 'text-red-600 font-bold',
}

function StatusStepper({ currentStatus, onStatusChange }) {
  const currentIdx = STATUSES.indexOf(currentStatus)

  return (
    <div className="flex items-center w-full">
      {STATUSES.map((status, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isUpcoming = idx > currentIdx

        return (
          <div key={status} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle */}
            <button
              onClick={() => onStatusChange(status)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 cursor-pointer flex-shrink-0 ${
                isCompleted
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : isCurrent
                  ? 'bg-white border-emerald-500 text-emerald-600'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
              title={`Move to ${STATUS_LABELS[status]}`}
            >
              {isCompleted ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <span className="text-xs font-bold">{idx + 1}</span>
              )}
            </button>

            {/* Label below */}
            <div
              className={`absolute mt-14 text-[11px] font-medium ${
                isCurrent ? 'text-emerald-600' : isCompleted ? 'text-slate-600' : 'text-slate-400'
              }`}
              style={{ transform: 'translateX(-25%)' }}
            >
              {/* Label rendered via the wrapper below */}
            </div>

            {/* Connecting line */}
            {idx < STATUSES.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 transition-colors duration-300 ${
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepperLabels({ currentStatus }) {
  const currentIdx = STATUSES.indexOf(currentStatus)

  return (
    <div className="flex items-center w-full mt-2">
      {STATUSES.map((status, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx

        return (
          <div key={status} className="flex-1 last:flex-initial">
            <p
              className={`text-[11px] font-medium text-center ${
                isCurrent ? 'text-emerald-600' : isCompleted ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {STATUS_LABELS[status]}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default function InitiativeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [initiative, setInitiative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showMetricForm, setShowMetricForm] = useState(false)
  const [metricForm, setMetricForm] = useState({
    name: '',
    unit: '',
    baseline_value: '',
    current_value: '',
    target_value: '',
  })

  const fetchInitiative = useCallback(async () => {
    try {
      const data = await getInitiative(id)
      setInitiative(data)
    } catch {
      // Demo data fallback
      setInitiative(getDemoInitiative(id))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchInitiative()
  }, [fetchInitiative])

  const handleUpdate = async (data) => {
    try {
      await updateInitiative(id, data)
      setEditing(false)
      fetchInitiative()
    } catch {
      setInitiative((prev) => ({ ...prev, ...data }))
      setEditing(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await updateStatus(id, newStatus)
      fetchInitiative()
    } catch {
      setInitiative((prev) => ({ ...prev, status: newStatus }))
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this initiative? This cannot be undone.')) return
    try {
      await deleteInitiative(id)
    } catch {
      // proceed anyway
    }
    navigate('/')
  }

  const handleAddMetric = async (e) => {
    e.preventDefault()
    const data = {
      name: metricForm.name,
      unit: metricForm.unit,
      baseline_value: parseFloat(metricForm.baseline_value) || 0,
      current_value: parseFloat(metricForm.current_value) || 0,
      target_value: parseFloat(metricForm.target_value) || 0,
    }
    try {
      await addMetric(id, data)
      fetchInitiative()
    } catch {
      // Add locally
      setInitiative((prev) => ({
        ...prev,
        metrics: [...(prev.metrics || []), { id: Date.now(), ...data }],
      }))
    }
    setMetricForm({ name: '', unit: '', baseline_value: '', current_value: '', target_value: '' })
    setShowMetricForm(false)
  }

  const handleDeleteMetric = async (metricId) => {
    try {
      await deleteMetric(metricId)
      fetchInitiative()
    } catch {
      setInitiative((prev) => ({
        ...prev,
        metrics: prev.metrics.filter((m) => m.id !== metricId),
      }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!initiative) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Initiative not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
        >
          Back to Board
        </button>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="p-6 max-w-2xl">
        <button
          onClick={() => setEditing(false)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6 cursor-pointer"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <div className="bg-white rounded-xl border border-slate-200/80 p-6">
          <InitiativeForm
            initiative={initiative}
            onSubmit={handleUpdate}
            onClose={() => setEditing(false)}
          />
        </div>
      </div>
    )
  }

  const categoryColor = CATEGORY_COLORS[initiative.category] || CATEGORY_COLORS.waste
  const categoryLabel = CATEGORY_LABELS[initiative.category] || initiative.category
  const priorityStyle = PRIORITY_STYLES[initiative.priority] || PRIORITY_STYLES.medium

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6 cursor-pointer"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Board
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={initiative.status} size="lg" />
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide rounded-full ring-1 ring-inset ${categoryColor}`}
              >
                {categoryLabel}
              </span>
              <span className={`text-xs font-medium uppercase tracking-wide ${priorityStyle}`}>
                {initiative.priority} priority
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{initiative.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              title="Edit"
            >
              <PencilSquareIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Delete"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-4 gap-4 py-4 border-t border-b border-slate-100">
          {initiative.owner && (
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Owner</p>
                <p className="text-slate-700 font-medium">{initiative.owner}</p>
              </div>
            </div>
          )}
          {initiative.department && (
            <div className="flex items-center gap-2 text-sm">
              <BuildingOfficeIcon className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Department</p>
                <p className="text-slate-700 font-medium">{initiative.department}</p>
              </div>
            </div>
          )}
          {initiative.created_at && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Created</p>
                <p className="text-slate-700 font-medium">
                  {new Date(initiative.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
          {initiative.target_date && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Target</p>
                <p className="text-slate-700 font-medium">
                  {new Date(initiative.target_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {initiative.description && (
          <div className="mt-4">
            <p className="text-sm text-slate-600 leading-relaxed">{initiative.description}</p>
          </div>
        )}
      </div>

      {/* Status Workflow Stepper */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-6">Workflow Progress</h2>
        <StatusStepper currentStatus={initiative.status} onStatusChange={handleStatusChange} />
        <StepperLabels currentStatus={initiative.status} />
      </div>

      {/* Metrics Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Metrics{' '}
            <span className="text-slate-400 font-normal">
              ({initiative.metrics?.length || 0})
            </span>
          </h2>
          <button
            onClick={() => setShowMetricForm(!showMetricForm)}
            className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Add Metric
          </button>
        </div>

        {/* Add metric form */}
        {showMetricForm && (
          <form
            onSubmit={handleAddMetric}
            className="grid grid-cols-6 gap-3 p-4 bg-slate-50 rounded-lg mb-4 animate-fade-in"
          >
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Metric Name</label>
              <input
                type="text"
                required
                value={metricForm.name}
                onChange={(e) => setMetricForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Defect Rate"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Unit</label>
              <input
                type="text"
                value={metricForm.unit}
                onChange={(e) => setMetricForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="%"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Before</label>
              <input
                type="number"
                step="any"
                required
                value={metricForm.baseline_value}
                onChange={(e) => setMetricForm((f) => ({ ...f, baseline_value: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">After</label>
              <input
                type="number"
                step="any"
                required
                value={metricForm.current_value}
                onChange={(e) => setMetricForm((f) => ({ ...f, current_value: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Target</label>
              <input
                type="number"
                step="any"
                value={metricForm.target_value}
                onChange={(e) => setMetricForm((f) => ({ ...f, target_value: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <div className="col-span-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMetricForm(false)}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>
        )}

        {/* Metrics list */}
        {initiative.metrics && initiative.metrics.length > 0 ? (
          <div>
            {/* Table header */}
            <div className="flex items-center gap-4 pb-2 border-b border-slate-200 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <div className="w-48">Metric</div>
              <div className="w-24 text-center">Before</div>
              <div className="flex-1 px-4 text-center">Progress</div>
              <div className="w-24 text-center">After</div>
              <div className="w-24 text-center">Target</div>
              <div className="w-20 text-right">Change</div>
              <div className="w-8" />
            </div>
            {initiative.metrics.map((metric) => (
              <MetricRow key={metric.id} metric={metric} onDelete={handleDeleteMetric} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-8">
            No metrics yet. Add one to track improvement progress.
          </p>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Activity</h2>
        <div className="space-y-4">
          {getActivityItems(initiative).map((item, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${
                    idx === 0 ? 'bg-emerald-400' : 'bg-slate-300'
                  }`}
                />
                {idx < getActivityItems(initiative).length - 1 && (
                  <div className="w-px flex-1 bg-slate-100 mt-1" />
                )}
              </div>
              <div className="pb-4">
                <p className="text-sm text-slate-700">{item.text}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getActivityItems(initiative) {
  const items = []

  // Current status
  items.push({
    text: `Status: ${STATUS_LABELS[initiative.status] || initiative.status}`,
    date: 'Current',
  })

  // Metrics added
  if (initiative.metrics?.length > 0) {
    items.push({
      text: `${initiative.metrics.length} metric${initiative.metrics.length > 1 ? 's' : ''} tracked`,
      date: 'Metrics',
    })
  }

  // Created
  if (initiative.created_at) {
    items.push({
      text: `Initiative created${initiative.owner ? ` by ${initiative.owner}` : ''}`,
      date: new Date(initiative.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
  }

  // Target
  if (initiative.target_date) {
    items.push({
      text: 'Target completion date set',
      date: new Date(initiative.target_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
  }

  return items
}

function getDemoInitiative(id) {
  return {
    id: parseInt(id),
    title: 'Reduce packaging waste by 30%',
    description:
      'Implement reusable packaging for internal parts movement between stations. Currently using single-use cardboard boxes that generate 2,400 kg of waste per month. Goal is to switch to returnable plastic totes with a tracking system.',
    category: 'waste',
    priority: 'high',
    status: 'implement',
    owner: 'Sarah Chen',
    department: 'Manufacturing',
    created_at: '2026-01-15T00:00:00Z',
    target_date: '2026-04-01T00:00:00Z',
    metrics: [
      {
        id: 1,
        name: 'Monthly Waste',
        unit: 'kg',
        baseline_value: 2400,
        current_value: 1200,
        target_value: 720,
      },
      {
        id: 2,
        name: 'Packaging Cost',
        unit: '$/month',
        baseline_value: 8500,
        current_value: 4200,
        target_value: 2500,
      },
      {
        id: 3,
        name: 'Container Reuse Rate',
        unit: '%',
        baseline_value: 0,
        current_value: 65,
        target_value: 90,
      },
    ],
  }
}
