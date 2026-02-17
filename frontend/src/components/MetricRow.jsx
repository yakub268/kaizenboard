import { TrashIcon } from '@heroicons/react/24/outline'

export default function MetricRow({ metric, onDelete }) {
  const before = parseFloat(metric.before_value ?? metric.baseline_value) || 0
  const after = parseFloat(metric.after_value ?? metric.current_value) || 0

  let improvement = 0
  if (before !== 0) {
    improvement = ((before - after) / Math.abs(before)) * 100
  }

  const isPositive = improvement > 0
  const absImprovement = Math.abs(improvement)

  let progressPct = 0
  if (before !== 0) {
    progressPct = Math.min(100, Math.max(0, absImprovement))
  }

  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-700/40 last:border-0 group">
      <div className="w-48 flex-shrink-0">
        <p className="text-sm font-medium text-slate-200">{metric.name}</p>
        {metric.unit && (
          <p className="text-xs text-slate-500 mt-0.5">{metric.unit}</p>
        )}
      </div>

      <div className="w-24 text-center">
        <p className="text-xs text-slate-500 mb-0.5">Before</p>
        <p className="text-sm font-semibold text-slate-400">{before.toLocaleString()}</p>
      </div>

      <div className="flex-1 px-4">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full improvement-bar ${
              isPositive ? 'bg-emerald-400' : after === 0 && before === 0 ? 'bg-slate-700' : 'bg-red-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="w-24 text-center">
        <p className="text-xs text-slate-500 mb-0.5">After</p>
        <p className="text-sm font-semibold text-slate-200">
          {metric.after_value != null || metric.current_value != null
            ? after.toLocaleString()
            : '\u2014'}
        </p>
      </div>

      <div className="w-20 text-right">
        {(metric.after_value != null || metric.current_value != null) ? (
          <span
            className={`inline-flex items-center text-sm font-bold ${
              isPositive ? 'text-emerald-400' : improvement === 0 ? 'text-slate-500' : 'text-red-400'
            }`}
          >
            {isPositive ? '-' : improvement === 0 ? '' : '+'}
            {absImprovement.toFixed(1)}%
          </span>
        ) : (
          <span className="text-sm text-slate-600">{'\u2014'}</span>
        )}
      </div>

      {onDelete && (
        <button
          onClick={() => onDelete(metric.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 transition-all duration-150 cursor-pointer"
          title="Delete metric"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
