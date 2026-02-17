import { TrashIcon } from '@heroicons/react/24/outline'

export default function MetricRow({ metric, onDelete }) {
  const before = parseFloat(metric.baseline_value) || 0
  const after = parseFloat(metric.current_value) || 0
  const target = parseFloat(metric.target_value) || after

  // Calculate improvement percentage
  let improvement = 0
  if (before !== 0) {
    improvement = ((before - after) / Math.abs(before)) * 100
  }

  // For metrics where higher is better (e.g., quality score), flip the sign
  const isPositive = improvement > 0
  const absImprovement = Math.abs(improvement)

  // Progress toward target
  let progressPct = 0
  if (target !== before && before !== 0) {
    progressPct = Math.min(100, Math.max(0, ((before - after) / (before - target)) * 100))
  }

  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0 group">
      {/* Metric name and unit */}
      <div className="w-48 flex-shrink-0">
        <p className="text-sm font-medium text-slate-800">{metric.name}</p>
        {metric.unit && (
          <p className="text-xs text-slate-400 mt-0.5">{metric.unit}</p>
        )}
      </div>

      {/* Before value */}
      <div className="w-24 text-center">
        <p className="text-xs text-slate-400 mb-0.5">Before</p>
        <p className="text-sm font-semibold text-slate-600">{before.toLocaleString()}</p>
      </div>

      {/* Progress bar visualization */}
      <div className="flex-1 px-4">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full improvement-bar ${
              isPositive ? 'bg-emerald-400' : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(absImprovement, 100)}%` }}
          />
        </div>
      </div>

      {/* After value */}
      <div className="w-24 text-center">
        <p className="text-xs text-slate-400 mb-0.5">After</p>
        <p className="text-sm font-semibold text-slate-800">{after.toLocaleString()}</p>
      </div>

      {/* Target value */}
      <div className="w-24 text-center">
        <p className="text-xs text-slate-400 mb-0.5">Target</p>
        <p className="text-sm font-semibold text-slate-500">{target.toLocaleString()}</p>
      </div>

      {/* Improvement */}
      <div className="w-20 text-right">
        <span
          className={`inline-flex items-center text-sm font-bold ${
            isPositive ? 'text-emerald-600' : improvement === 0 ? 'text-slate-400' : 'text-red-500'
          }`}
        >
          {isPositive ? '-' : improvement === 0 ? '' : '+'}
          {absImprovement.toFixed(1)}%
        </span>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={() => onDelete(metric.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all duration-150 cursor-pointer"
          title="Delete metric"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
