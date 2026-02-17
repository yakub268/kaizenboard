const STATUS_STYLES = {
  identify: {
    bg: 'bg-slate-800',
    text: 'text-slate-300',
    dot: 'bg-slate-400',
  },
  analyze: {
    bg: 'bg-blue-950/50',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
  },
  plan: {
    bg: 'bg-violet-950/50',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
  },
  implement: {
    bg: 'bg-amber-950/50',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  verify: {
    bg: 'bg-cyan-950/50',
    text: 'text-cyan-400',
    dot: 'bg-cyan-400',
  },
  sustain: {
    bg: 'bg-emerald-950/50',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
}

export default function StatusBadge({ status, size = 'sm' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.identify
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'

  const sizeClasses = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  )
}
