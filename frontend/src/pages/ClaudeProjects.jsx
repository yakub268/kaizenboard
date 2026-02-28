import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SparklesIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarDaysIcon,
  ClockIcon,
  FireIcon,
  ArrowTopRightOnSquareIcon,
  CommandLineIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import {
  getClaudeProjects,
  getClaudeSessions,
  getClaudeBacklog,
  syncClaudeProjects,
  createClaudeTodo,
  toggleClaudeTodo,
  deleteClaudeTodo,
  startClaudeTimer,
  stopClaudeTimer,
  getClaudeActiveTimer,
} from '../api'

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

// ─── Timer helpers ─────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTotalTime(seconds) {
  if (!seconds || seconds === 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// ─── Timer banner ──────────────────────────────────────────────────────────────

function TimerBanner({ activeTimer, onStop }) {
  const startMs = activeTimer ? new Date(activeTimer.start_time).getTime() : 0
  const [elapsed, setElapsed] = useState(() => activeTimer ? Math.floor((Date.now() - startMs) / 1000) : 0)

  useEffect(() => {
    if (!activeTimer) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000)
    return () => clearInterval(id)
  }, [activeTimer, startMs])

  if (!activeTimer) return null

  return (
    <div className="mb-6 flex items-center justify-between gap-4 px-5 py-3.5 bg-orange-950/40 border border-orange-800/50 rounded-xl">
      <div className="flex items-center gap-3 text-sm">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
        </span>
        <span className="text-orange-300 font-medium">Timer running on</span>
        <span className="text-orange-100 font-semibold">{activeTimer.project_name}</span>
        <span className="text-orange-400 font-mono tabular-nums">{formatDuration(elapsed)}</span>
      </div>
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors duration-150 cursor-pointer"
      >
        <StopIcon className="w-3.5 h-3.5" />
        Stop
      </button>
    </div>
  )
}

// ─── Todo item ─────────────────────────────────────────────────────────────────

function TodoItem({ todo, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <li
      className="flex items-center gap-2.5 py-1.5 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onToggle(todo.id)}
        data-no-nav="true"
        className={`flex-shrink-0 w-4 h-4 rounded border transition-colors duration-150 cursor-pointer flex items-center justify-center ${
          todo.completed
            ? 'bg-orange-500 border-orange-500'
            : 'border-slate-600 hover:border-orange-400 bg-transparent'
        }`}
      >
        {todo.completed && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={`flex-1 text-xs leading-relaxed transition-colors duration-150 ${todo.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
        {todo.text}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        data-no-nav="true"
        className={`flex-shrink-0 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all duration-150 cursor-pointer ${hovered ? 'opacity-100' : 'opacity-0'}`}
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}

// ─── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, activeTimer, onTimerStart, onTimerStop, onTodoToggle, onTodoDelete, onTodoAdd }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newText, setNewText] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const claudeUrl = project.claudeUrl || project.claude_url
  const projectPath = project.projectPath || project.project_path
  const todos = project.todos || []
  const completedCount = todos.filter((t) => t.completed).length
  const totalCount = todos.length
  const isActiveTimer = activeTimer && activeTimer.project_slug === project.id
  const hasAnyTimer = !!activeTimer
  const totalTime = formatTotalTime(project.time_summary?.total_seconds || 0)

  async function handleResume(e) {
    e.stopPropagation()
    try {
      const cmd = `cd "${projectPath}" && claude`
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Clipboard copy failed', err)
    }
  }

  const notes = project.notes || []
  const visibleNotes = expanded ? notes : notes.slice(0, 3)
  const hasMore = notes.length > 3

  function handleCardClick(e) {
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

  function handleKeyDown(e) {
    if (e.key === 'Enter' && newText.trim()) {
      onTodoAdd(project.id, newText.trim())
      setNewText('')
    }
  }

  return (
    <div
      className="bg-slate-900 rounded-xl border border-slate-800/80 p-5 card-hover cursor-pointer flex flex-col gap-3"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100 leading-snug">{project.name}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {totalTime && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ClockIcon className="w-3.5 h-3.5" />
              {totalTime}
            </span>
          )}
          <StatusBadge status={project.status} />
          {claudeUrl && (
            <a
              href={claudeUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-no-nav="true"
              onClick={(e) => e.stopPropagation()}
              title="Open Claude history"
              className="text-slate-600 hover:text-orange-400 transition-colors duration-150"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); isActiveTimer ? onTimerStop() : onTimerStart(project.id) }}
            disabled={hasAnyTimer && !isActiveTimer}
            data-no-nav="true"
            title={isActiveTimer ? 'Stop timer' : hasAnyTimer ? 'Another timer is running' : 'Start timer'}
            className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isActiveTimer
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                : 'bg-slate-800 border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
          >
            {isActiveTimer ? (
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60" />
                <StopIcon className="relative w-3.5 h-3.5" />
              </span>
            ) : (
              <PlayIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
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

      {/* ── Checklist ── */}
      <div className="flex flex-col gap-0.5 border-t border-slate-800/50 pt-3" data-no-nav="true" onClick={(e) => e.stopPropagation()}>
        {totalCount > 0 && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">{completedCount}/{totalCount}</span>
          </div>
        )}
        {todos.length === 0 && (
          <p className="text-xs text-slate-600 py-0.5">No todos yet.</p>
        )}
        <ul className="divide-y divide-slate-800/40">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={(id) => onTodoToggle(project.id, id)}
              onDelete={(id) => onTodoDelete(project.id, id)}
            />
          ))}
        </ul>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/40">
          <PlusIcon className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add todo — press Enter"
            className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none"
          />
        </div>
      </div>

      {projectPath && (
        <button
          data-no-nav="true"
          onClick={handleResume}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/60 hover:bg-orange-950/50 hover:text-orange-400 border border-slate-700/40 hover:border-orange-900/60 rounded-md transition-colors duration-150 cursor-pointer"
        >
          {copied ? (
            <span className="text-emerald-400">Copied!</span>
          ) : (
            <><CommandLineIcon className="w-3.5 h-3.5" /> Resume in Claude</>
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
      todos: [],
      name: 'JARVIS Local AI Assistant',
      status: 'Active',
      phase: 'Phase 9 Priority A — Auto-startup, watchdog, keyboard shortcuts, voice/GUI bridge',
      lastUpdated: '2026-02-25',
      claudeUrl: 'https://claude.ai/',
      projectPath: 'C:/Users/yakub/.jarvis',
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
      todos: [],
      name: 'Trading Bot Arsenal',
      status: 'Active',
      phase: 'Phase 2 — Entry quality gates, dynamic Kelly, exit asymmetry',
      lastUpdated: '2026-02-25',
      claudeUrl: 'https://claude.ai/',
      projectPath: 'C:/Users/yakub/Desktop/trading_bot',
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
      todos: [],
      name: 'Kalshi MCP Server',
      status: 'Complete',
      phase: 'Published — PyPI v0.1.1, MCP Registry',
      lastUpdated: '2026-02-20',
      claudeUrl: 'https://github.com/yakub268/kalshi-mcp',
      projectPath: null,
      notes: [
        'Open source at github.com/yakub268/kalshi-mcp',
        'RSA-PSS authentication via PEM file',
        'Available in MCP Registry for community use',
      ],
      boardFilter: '',
    },
    {
      id: 'claude-bridge',
      todos: [],
      name: 'Claude Multi-Agent Bridge',
      status: 'Deferred',
      phase: 'v1.0.0 launched — SaaS monetization paused pending bot profitability',
      lastUpdated: '2026-02-21',
      claudeUrl: 'https://github.com/yakub268/claude-multi-agent-bridge',
      projectPath: 'C:/Users/yakub/claude-multi-agent-bridge',
      notes: [
        'Flask server, Python client, Chrome extension (Manifest V3), SQLite',
        'Consulting tiers: $3.5k / $8.5k / $15k',
        '$5k MRR SaaS target — deferred until 90-day bot profitability confirmed',
      ],
      boardFilter: '',
    },
    {
      id: 'kaizenboard',
      todos: [],
      name: 'KaizenBoard',
      status: 'Active',
      phase: 'Frontend + backend feature expansion',
      lastUpdated: '2026-02-26',
      claudeUrl: 'https://claude.ai/',
      projectPath: 'C:/Users/yakub/kaizenboard',
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
  const [activeClaudeTimer, setActiveClaudeTimer] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [p, s, b, timer] = await Promise.all([
        getClaudeProjects(),
        getClaudeSessions(),
        getClaudeBacklog(),
        getClaudeActiveTimer().catch(() => null),
      ])
      setProjects(p)
      setSessions(s)
      setBacklog(b)
      setActiveClaudeTimer(timer)
    } catch {
      setProjects(getDemoProjects())
      setSessions(getDemoSessions())
      setBacklog(getDemoBacklog())
      setActiveClaudeTimer(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Poll active timer every 3s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const timer = await getClaudeActiveTimer()
        setActiveClaudeTimer(timer)
      } catch {
        // no timer running or network error — both are fine
      }
    }, 3000)
    return () => clearInterval(id)
  }, [])

  async function handleTimerStart(projectId) {
    try {
      await startClaudeTimer(projectId, null)
      const timer = await getClaudeActiveTimer()
      setActiveClaudeTimer(timer)
      const proj = projects.find((p) => p.id === projectId)
      showToast(`Timer started for ${proj ? proj.name : projectId}`)
    } catch {
      setActiveClaudeTimer({ project_slug: projectId, project_name: projectId, start_time: new Date().toISOString() })
    }
  }

  async function handleTimerStop() {
    try {
      await stopClaudeTimer(null)
      setActiveClaudeTimer(null)
      showToast('Timer stopped')
      fetchAll()  // refresh to update time_summary on cards
    } catch {
      setActiveClaudeTimer(null)
      showToast('Timer stopped')
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await syncClaudeProjects()
      await fetchAll()
      showToast('Synced from Memory MCP')
    } catch {
      showToast('Sync failed — using cached data', 'error')
    } finally {
      setSyncing(false)
    }
  }

  // ── Todo handlers ────────────────────────────────────────────────────────────

  function handleTodoToggle(projectId, todoId) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId ? p : {
          ...p,
          todos: (p.todos || []).map((t) => t.id !== todoId ? t : { ...t, completed: !t.completed }),
        }
      )
    )
    toggleClaudeTodo(todoId).catch(() => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId ? p : {
            ...p,
            todos: (p.todos || []).map((t) => t.id !== todoId ? t : { ...t, completed: !t.completed }),
          }
        )
      )
      showToast('Failed to update todo', 'error')
    })
  }

  function handleTodoDelete(projectId, todoId) {
    let removed = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const todo = (p.todos || []).find((t) => t.id === todoId)
        if (todo) removed = todo
        return { ...p, todos: (p.todos || []).filter((t) => t.id !== todoId) }
      })
    )
    deleteClaudeTodo(todoId).catch(() => {
      if (removed) {
        setProjects((prev) =>
          prev.map((p) => p.id !== projectId ? p : { ...p, todos: [...(p.todos || []), removed] })
        )
      }
      showToast('Failed to delete todo', 'error')
    })
  }

  async function handleTodoAdd(projectId, text) {
    const tempId = `temp-${Date.now()}`
    const optimistic = { id: tempId, project_slug: projectId, text, completed: false, order_index: 0 }
    setProjects((prev) =>
      prev.map((p) => p.id !== projectId ? p : { ...p, todos: [...(p.todos || []), optimistic] })
    )
    try {
      const created = await createClaudeTodo(projectId, { text })
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId ? p : {
            ...p,
            todos: (p.todos || []).map((t) => t.id === tempId ? created : t),
          }
        )
      )
    } catch {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId ? p : {
            ...p,
            todos: (p.todos || []).map((t) => t.id === tempId ? { ...t, id: `local-${Date.now()}` } : t),
          }
        )
      )
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

  const completedTotal = projects.reduce((n, p) => n + (p.todos || []).filter((t) => t.completed).length, 0)
  const todoTotal      = projects.reduce((n, p) => n + (p.todos || []).length, 0)
  const totalLogged    = projects.reduce((n, p) => n + (p.time_summary?.total_seconds || 0), 0)

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <span className="text-slate-300 font-semibold">{completedTotal}/{todoTotal}</span>
              todos done
            </div>
            {totalLogged > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <ClockIcon className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-slate-300 font-semibold">{formatTotalTime(totalLogged)}</span>
                logged
              </div>
            )}
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
      </div>

      {/* Active timer banner */}
      <TimerBanner activeTimer={activeClaudeTimer} onStop={handleTimerStop} />

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
            <ProjectCard
              key={project.id || project.name}
              project={project}
              activeTimer={activeClaudeTimer}
              onTimerStart={handleTimerStart}
              onTimerStop={handleTimerStop}
              onTodoToggle={handleTodoToggle}
              onTodoDelete={handleTodoDelete}
              onTodoAdd={handleTodoAdd}
            />
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
