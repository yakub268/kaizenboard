import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SparklesIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarDaysIcon,
  ClockIcon,
  FireIcon,
} from '@heroicons/react/24/outline'
import { getClaudeProjects, getClaudeSessions, getClaudeBacklog, syncClaudeProjects } from '../api'

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  Active:    'bg-emerald-950/60 text-emerald-400 ring-emerald-800/50',
  Deferred:  'bg-amber-950/60  text-amber-400  ring-amber-800/50',
  Complete:  'bg-blue-950/60   text-blue-400   ring-blue-800/50',
}

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.Deferred
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  )
}

// ─── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const notes = project.notes || []
  const visibleNotes = expanded ? notes : notes.slice(0, 3)
  const hasMore = notes.length > 3

  function handleCardClick(e) {
    // Only navigate if the click wasn't on the expand toggle or Start button
    if (e.target.closest('[data-no-nav]')) return
    if (project.boardFilter) {
      navigate(`/?category=${project.boardFilter}`)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d)) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      className="bg-slate-900 rounded-xl border border-slate-800/80 p-5 card-hover cursor-pointer flex flex-col gap-3"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100 leading-snug">{project.name}</h3>
        <StatusBadge status={project.status} />
      </div>

      {/* Phase line */}
      {project.phase && (
        <p className="text-xs text-slate-400 leading-relaxed">{project.phase}</p>
      )}

      {/* Meta row */}
      {project.lastUpdated && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDaysIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Updated {formatDate(project.lastUpdated)}</span>
        </div>
      )}

      {/* Notes list */}
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {visibleNotes.map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-orange-500 flex-shrink-0" />
              <span className="leading-relaxed">{note}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Expand / collapse */}
      {hasMore && (
        <button
          data-no-nav="true"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150 cursor-pointer"
        >
          {expanded ? (
            <><ChevronUpIcon className="w-3.5 h-3.5" /> Show less</>
          ) : (
            <><ChevronDownIcon className="w-3.5 h-3.5" /> +{notes.length - 3} more</>
          )}
        </button>
      )}
    </div>
  )
}

// ─── Activity bar chart (inline SVG) ──────────────────────────────────────────

function ActivityChart({ days }) {
  if (!days || days.length === 0) return null

  const max = Math.max(...days.map((d) => d.messageCount || 0), 1)
  const barWidth = 8
  const barGap = 3
  const chartHeight = 48
  const totalWidth = days.length * (barWidth + barGap) - barGap

  return (
    <svg
      width={totalWidth}
      height={chartHeight}
      className="overflow-visible"
      aria-label="30-day message activity"
    >
      {days.map((day, i) => {
        const count = day.messageCount || 0
        const barH = count === 0 ? 2 : Math.max(4, Math.round((count / max) * chartHeight))
        const x = i * (barWidth + barGap)
        const y = chartHeight - barH
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            rx="2"
            fill={count > 0 ? '#f97316' : '#1e293b'}
            opacity={count > 0 ? 0.85 : 1}
          >
            <title>{day.date}: {count} messages</title>
          </rect>
        )
      })}
    </svg>
  )
}

// ─── Session stats row ─────────────────────────────────────────────────────────

function StatPill({ label, value, icon: Icon }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800/80 px-5 py-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-100 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const base = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg border animate-fade-in'
  const style =
    type === 'success'
      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800/60'
      : 'bg-red-950/90 text-red-300 border-red-800/60'

  return (
    <div className={`${base} ${style}`}>
      {message}
    </div>
  )
}

// ─── Demo data ─────────────────────────────────────────────────────────────────

function getDemoProjects() {
  return [
    {
      id: 'jarvis',
      name: 'JARVIS Local AI Assistant',
      status: 'Active',
      phase: 'Phase 9 Priority A — Auto-startup, watchdog, keyboard shortcuts, voice/GUI bridge',
      lastUpdated: '2026-02-25',
      notes: [
        'Phase 1-8 complete: CLI, routing, voice, system control, memory, Copilot, GitHub monitor, GUI',
        'Auto-startup via Task Scheduler (JARVIS-AutoStart)',
        'Crash watchdog with 60s checks and 5-restart backoff',
        'Keyboard shortcuts: Ctrl+Alt+J/V/C registered via Win32 RegisterHotKey',
        'Voice + GUI bridge with non-blocking daemon threads',
        'Phase 7 (smart home) intentionally deferred',
      ],
      boardFilter: '',
    },
    {
      id: 'trading-bot',
      name: 'Trading Bot Arsenal',
      status: 'Active',
      phase: 'Phase 2 — Entry quality gates, dynamic Kelly, exit asymmetry',
      lastUpdated: '2026-02-25',
      notes: [
        '52 bots in registry; V4 active: Momentum-Scalper, Multi-Momentum, RSI-Extremes, Event-Edge',
        'Stock bots disabled (PDT rule)',
        'yfinance Kalshi bug fixed — eliminated ~1000 errors/run',
        'Dynamic Kelly fraction from last 20 trades',
        'Waiting on 100+ paper trades before Phase 3 / monetization',
      ],
      boardFilter: '',
    },
    {
      id: 'kalshi-mcp',
      name: 'Kalshi MCP Server',
      status: 'Complete',
      phase: 'Published — PyPI v0.1.1, MCP Registry',
      lastUpdated: '2026-02-20',
      notes: [
        'Open source at github.com/yakub268/kalshi-mcp',
        'RSA-PSS authentication via PEM file',
        'Available in MCP Registry for community use',
      ],
      boardFilter: '',
    },
    {
      id: 'claude-bridge',
      name: 'Claude Multi-Agent Bridge',
      status: 'Deferred',
      phase: 'v1.0.0 launched — SaaS monetization paused pending bot profitability',
      lastUpdated: '2026-02-21',
      notes: [
        'Flask server, Python client, Chrome extension (Manifest V3), SQLite',
        'Consulting tiers: $3.5k / $8.5k / $15k',
        '$5k MRR SaaS target — deferred until 90-day bot profitability confirmed',
      ],
      boardFilter: '',
    },
    {
      id: 'kaizenboard',
      name: 'KaizenBoard',
      status: 'Active',
      phase: 'Frontend + backend feature expansion',
      lastUpdated: '2026-02-26',
      notes: [
        'React 19, Vite, Tailwind 4 frontend',
        'FastAPI backend with SQLite persistence',
        'Dashboard with Chart.js, kanban board, initiative detail views',
      ],
      boardFilter: '',
    },
  ]
}

function getDemoSessions() {
  const today = new Date()
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (29 - i))
    const iso = d.toISOString().slice(0, 10)
    const count = Math.random() < 0.35 ? 0 : Math.floor(Math.random() * 80) + 5
    return { date: iso, messageCount: count }
  })
  const totalMessages = days.reduce((s, d) => s + d.messageCount, 0)
  const streakDays = 14
  const peakDay = [...days].sort((a, b) => b.messageCount - a.messageCount)[0]
  const peakHour = '10 PM'
  return { days, totalSessions: 38, totalMessages, streakDays, mostActiveHour: peakHour, peakDay }
}

function getDemoBacklog() {
  return [
    { id: 1, text: 'Kalshi go-live: deposit $200-500, set V4_ACTIVE_BOTS to Kalshi-Market-Maker + Kalshi-Fed, run --live' },
    { id: 2, text: 'Trading bot Phase 3: validate 100+ paper trades before resuming monetization' },
    { id: 3, text: 'JARVIS Phase 7: smart home integration (optional, never started)' },
    { id: 4, text: 'Claude Multi-Agent Bridge SaaS: $5k MRR target — resume after 90-day bot profitability' },
    { id: 5, text: 'Crypto signals product — waiting on bot profitability goal' },
    { id: 6, text: 'AI compliance consulting package — paused' },
  ]
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ClaudeProjects() {
  const [projects, setProjects] = useState([])
  const [sessions, setSessions] = useState(null)
  const [backlog, setBacklog] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [p, s, b] = await Promise.all([
        getClaudeProjects(),
        getClaudeSessions(),
        getClaudeBacklog(),
      ])
      setProjects(p)
      setSessions(s)
      setBacklog(b)
    } catch {
      setProjects(getDemoProjects())
      setSessions(getDemoSessions())
      setBacklog(getDemoBacklog())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncClaudeProjects()
      await fetchAll()
      setToast({ message: 'Synced from Memory MCP', type: 'success' })
    } catch {
      setToast({ message: 'Sync failed — using cached data', type: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const activeProjects  = projects.filter((p) => p.status === 'Active')
  const otherProjects   = projects.filter((p) => p.status !== 'Active')
  const allProjects     = [...activeProjects, ...otherProjects]

  const s = sessions || getDemoSessions()

  return (
    <div className="py-6 px-16 max-w-7xl">

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Claude Projects</h1>
            <p className="text-sm text-slate-500 mt-0.5">Active work, session activity, and deferred backlog</p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync from Memory'}
        </button>
      </div>

      {/* ── Section 1: Active Projects ─────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Projects
          <span className="ml-2 px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-medium normal-case tracking-normal">
            {allProjects.length}
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {allProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>

      {/* ── Section 2: Session Activity ───────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Session Activity
        </h2>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-5">
          <StatPill label="Total Sessions" value={s.totalSessions ?? '—'} icon={SparklesIcon} />
          <StatPill label="Total Messages" value={(s.totalMessages ?? 0).toLocaleString()} icon={ClockIcon} />
          <StatPill label="Streak" value={`${s.streakDays ?? 0}d`} icon={FireIcon} />
          <StatPill label="Most Active" value={s.mostActiveHour ?? '—'} icon={CalendarDaysIcon} />
        </div>

        {/* Bar chart */}
        <div className="bg-slate-900 rounded-xl border border-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-300">Messages — Last 30 Days</h3>
            <span className="text-xs text-slate-500">Each bar = one day</span>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-0">
              <ActivityChart days={s.days} />
            </div>
          </div>
          {/* Date labels: first and last */}
          {s.days && s.days.length > 0 && (
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-slate-600">{s.days[0]?.date}</span>
              <span className="text-[10px] text-slate-600">{s.days[s.days.length - 1]?.date}</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Backlog ─────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Deferred Backlog
          <span className="ml-2 px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-medium normal-case tracking-normal">
            {backlog.length}
          </span>
        </h2>
        <div className="bg-slate-900 rounded-xl border border-slate-800/80 divide-y divide-slate-800/60">
          {backlog.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-600 text-center">Backlog is empty.</p>
          )}
          {backlog.map((item) => (
            <BacklogRow key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}

function BacklogRow({ item }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-slate-800 text-slate-500 ring-1 ring-inset ring-slate-700/50">
        Deferred
      </span>
      <p className="flex-1 text-sm text-slate-300 leading-relaxed">{item.text}</p>
      <button
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-orange-400 bg-orange-950/40 hover:bg-orange-900/50 border border-orange-900/60 rounded-lg transition-colors duration-150 cursor-pointer"
        onClick={() => {
          // Future: dispatch open-new-initiative with pre-filled title from item.text
          window.dispatchEvent(new CustomEvent('open-new-initiative'))
        }}
      >
        Start
      </button>
    </div>
  )
}
