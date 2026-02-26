import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BriefcaseIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  TrashIcon,
  PlusIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import {
  getWorkProjects,
  createTodo,
  toggleTodo,
  deleteTodo,
  startTimer,
  stopTimer,
  getActiveTimer,
} from '../api'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTotalTime(minutes) {
  if (!minutes || minutes === 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Demo data ─────────────────────────────────────────────────────────────────

function getDemoProjects() {
  return [
    {
      id: 'ddv5-platform',
      name: 'DDV5 Platform Modernization',
      status: 'implement',
      description: 'Migrating legacy DDV4 infrastructure to the new DDV5 microservices architecture with improved observability and deployment pipelines.',
      department: 'Engineering',
      lastUpdated: '2026-02-25',
      totalMinutes: 847,
      todos: [
        { id: 't1', text: 'Set up Kubernetes namespaces for DDV5 services', completed: true },
        { id: 't2', text: 'Migrate authentication service to new auth module', completed: true },
        { id: 't3', text: 'Write integration tests for order pipeline', completed: false },
        { id: 't4', text: 'Update Helm charts for staging environment', completed: false },
        { id: 't5', text: 'Document runbook for on-call team', completed: false },
      ],
    },
    {
      id: 'ddv5-reporting',
      name: 'DDV5 Reporting Dashboard',
      status: 'analyze',
      description: 'Building real-time executive reporting layer on top of DDV5 data pipelines. Stakeholders need KPI visibility within 5 minutes of events.',
      department: 'Product',
      lastUpdated: '2026-02-24',
      totalMinutes: 312,
      todos: [
        { id: 't6', text: 'Define KPI taxonomy with product owners', completed: true },
        { id: 't7', text: 'Prototype Grafana dashboard with live DDV5 metrics', completed: false },
        { id: 't8', text: 'Validate data freshness SLA with data engineering', completed: false },
        { id: 't9', text: 'Review with CTO — schedule by EOW', completed: false },
      ],
    },
    {
      id: 'ddv5-security',
      name: 'DDV5 Security Hardening',
      status: 'plan',
      description: 'SOC 2 Type II remediation items for DDV5 environment. Covers secrets management, network segmentation, and audit logging.',
      department: 'Security',
      lastUpdated: '2026-02-22',
      totalMinutes: 195,
      todos: [
        { id: 't10', text: 'Rotate all long-lived API keys in DDV5 services', completed: false },
        { id: 't11', text: 'Implement Vault for secrets management', completed: false },
        { id: 't12', text: 'Enable CloudTrail audit logging for all API calls', completed: false },
        { id: 't13', text: 'Network segmentation review with infra team', completed: false },
      ],
    },
    {
      id: 'ddv5-onboarding',
      name: 'DDV5 Developer Onboarding',
      status: 'verify',
      description: 'New developer experience for joining DDV5 squads. Targeting 1-day setup time down from the current 3-day average.',
      department: 'Engineering',
      lastUpdated: '2026-02-20',
      totalMinutes: 520,
      todos: [
        { id: 't14', text: 'Write getting-started guide in Confluence', completed: true },
        { id: 't15', text: 'Automate local dev environment with devcontainer', completed: true },
        { id: 't16', text: 'Run pilot with 2 new engineers — gather feedback', completed: true },
        { id: 't17', text: 'Address feedback and publish final version', completed: false },
      ],
    },
    {
      id: 'ddv5-perf',
      name: 'DDV5 Performance Baseline',
      status: 'sustain',
      description: 'Establish p50/p95/p99 latency baselines across all DDV5 API surfaces and set up automated regression alerts in CI.',
      department: 'Engineering',
      lastUpdated: '2026-02-18',
      totalMinutes: 1034,
      todos: [
        { id: 't18', text: 'Instrument all DDV5 endpoints with OpenTelemetry', completed: true },
        { id: 't19', text: 'Define SLO targets with engineering leads', completed: true },
        { id: 't20', text: 'Add k6 perf tests to CI pipeline', completed: true },
        { id: 't21', text: 'Dashboard for weekly trend review', completed: true },
        { id: 't22', text: 'Set up PagerDuty alerts on SLO breach', completed: true },
      ],
    },
  ]
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

  return <div className={`${base} ${style}`}>{message}</div>
}

// ─── Active Timer Banner ───────────────────────────────────────────────────────

function TimerBanner({ activeTimer, projects, onStop }) {
  const startMs = activeTimer ? new Date(activeTimer.start_time).getTime() : 0
  const [elapsed, setElapsed] = useState(() => activeTimer ? Math.floor((Date.now() - startMs) / 1000) : 0)

  useEffect(() => {
    if (!activeTimer) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [activeTimer, startMs])

  if (!activeTimer) return null

  const project = projects.find((p) => p.id === activeTimer.initiative_id)
  const projectName = project ? project.title : activeTimer.initiative_id

  return (
    <div className="mb-6 flex items-center justify-between gap-4 px-5 py-3.5 bg-orange-950/40 border border-orange-800/50 rounded-xl">
      <div className="flex items-center gap-3 text-sm">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
        </span>
        <span className="text-orange-300 font-medium">Timer running on</span>
        <span className="text-orange-100 font-semibold">{projectName}</span>
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

// ─── Todo Item ─────────────────────────────────────────────────────────────────

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
        className={`flex-shrink-0 w-4 h-4 rounded border transition-colors duration-150 cursor-pointer flex items-center justify-center ${
          todo.completed
            ? 'bg-orange-500 border-orange-500'
            : 'border-slate-600 hover:border-orange-400 bg-transparent'
        }`}
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {todo.completed && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        className={`flex-1 text-xs leading-relaxed transition-colors duration-150 ${
          todo.completed ? 'line-through text-slate-500' : 'text-slate-300'
        }`}
      >
        {todo.text}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        className={`flex-shrink-0 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all duration-150 cursor-pointer ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Delete todo"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, activeTimer, onTimerStart, onTimerStop, onTodoToggle, onTodoDelete, onTodoAdd }) {
  const [newText, setNewText] = useState('')
  const inputRef = useRef(null)

  const isActiveTimer = activeTimer && activeTimer.initiative_id === project.id
  const hasAnyTimer = !!activeTimer

  const totalTime = formatTotalTime(Math.floor((project.time_summary?.total_seconds || project.totalMinutes * 60 || 0) / 60))

  const completedCount = project.todos.filter((t) => t.completed).length
  const totalCount = project.todos.length

  function handleKeyDown(e) {
    if (e.key === 'Enter' && newText.trim()) {
      onTodoAdd(project.id, newText.trim())
      setNewText('')
    }
  }

  function handleTimerClick() {
    if (isActiveTimer) {
      onTimerStop()
    } else {
      onTimerStart(project.id)
    }
  }

  return (
    <div
      className={`bg-slate-900 rounded-xl border p-5 flex flex-col gap-4 transition-all duration-200 ${
        isActiveTimer
          ? 'border-orange-500/50 ring-1 ring-orange-500/30'
          : 'border-slate-800/80'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-100 leading-snug">{project.title}</h3>
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {totalTime && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ClockIcon className="w-3.5 h-3.5" />
              {totalTime}
            </span>
          )}
          <button
            onClick={handleTimerClick}
            disabled={hasAnyTimer && !isActiveTimer}
            title={
              isActiveTimer
                ? 'Stop timer'
                : hasAnyTimer
                ? 'Another timer is already running'
                : 'Start timer'
            }
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

      {/* Description */}
      {project.description && (
        <p className="text-xs text-slate-400 leading-relaxed">{project.description}</p>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Todos */}
      <div className="flex flex-col gap-0.5">
        {project.todos.length === 0 && (
          <p className="text-xs text-slate-600 py-1">No todos yet.</p>
        )}
        <ul className="divide-y divide-slate-800/40">
          {project.todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={(id) => onTodoToggle(project.id, id)}
              onDelete={(id) => onTodoDelete(project.id, id)}
            />
          ))}
        </ul>

        {/* Add todo input */}
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

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
        {(project.updated_at || project.lastUpdated) && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <CalendarDaysIcon className="w-3 h-3" />
            <span>Updated {formatDate(project.updated_at || project.lastUpdated)}</span>
          </div>
        )}
        {project.department && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-500 rounded-md ring-1 ring-inset ring-slate-700/50">
            {project.department}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WorkProjects() {
  const [projects, setProjects] = useState([])
  const [activeTimer, setActiveTimer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
  }, [])

  // Initial load
  const fetchAll = useCallback(async () => {
    try {
      const [projectData, timerData] = await Promise.all([
        getWorkProjects(),
        getActiveTimer().catch(() => null),
      ])
      setProjects(projectData)
      setActiveTimer(timerData)
    } catch {
      setProjects(getDemoProjects())
      setActiveTimer(null)
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
        const timer = await getActiveTimer()
        setActiveTimer(timer)
      } catch {
        // silently ignore poll errors
      }
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // ── Timer actions ──────────────────────────────────────────────────────────

  async function handleTimerStart(projectId) {
    try {
      const timer = await startTimer(projectId, null)
      setActiveTimer(timer)
      const project = projects.find((p) => p.id === projectId)
      showToast(`Timer started for ${project ? project.title : projectId}`)
    } catch {
      // Optimistically set a local timer if backend is unavailable (demo mode)
      setActiveTimer({
        initiative_id: projectId,
        start_time: new Date().toISOString(),
      })
      const project = projects.find((p) => p.id === projectId)
      showToast(`Timer started for ${project ? project.title : projectId}`)
    }
  }

  async function handleTimerStop() {
    try {
      await stopTimer(null)
      setActiveTimer(null)
      showToast('Timer stopped')
    } catch {
      setActiveTimer(null)
      showToast('Timer stopped')
    }
  }

  // ── Todo actions ───────────────────────────────────────────────────────────

  function handleTodoToggle(projectId, todoId) {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              todos: p.todos.map((t) =>
                t.id !== todoId ? t : { ...t, completed: !t.completed }
              ),
            }
      )
    )

    toggleTodo(todoId).catch(() => {
      // Revert on error
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                todos: p.todos.map((t) =>
                  t.id !== todoId ? t : { ...t, completed: !t.completed }
                ),
              }
        )
      )
      showToast('Failed to update todo', 'error')
    })
  }

  function handleTodoDelete(projectId, todoId) {
    // Optimistic remove
    let removed = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const todo = p.todos.find((t) => t.id === todoId)
        if (todo) removed = todo
        return { ...p, todos: p.todos.filter((t) => t.id !== todoId) }
      })
    )

    deleteTodo(todoId).catch(() => {
      // Revert by re-inserting
      if (removed) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id !== projectId ? p : { ...p, todos: [...p.todos, removed] }
          )
        )
      }
      showToast('Failed to delete todo', 'error')
    })
  }

  async function handleTodoAdd(projectId, text) {
    const tempId = `temp-${Date.now()}`
    const optimisticTodo = { id: tempId, text, completed: false }

    // Optimistic add
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId ? p : { ...p, todos: [...p.todos, optimisticTodo] }
      )
    )

    try {
      const created = await createTodo(projectId, { text })
      // Replace temp entry with real one
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                todos: p.todos.map((t) => (t.id === tempId ? created : t)),
              }
        )
      )
    } catch {
      // In demo mode the backend is absent — keep the optimistic entry
      // but give it a stable local id so it behaves correctly
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                todos: p.todos.map((t) =>
                  t.id === tempId ? { ...t, id: `local-${Date.now()}` } : t
                ),
              }
        )
      )
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const activeProjects = projects.filter((p) => ['implement', 'analyze', 'plan'].includes(p.status))
  const otherProjects  = projects.filter((p) => !['implement', 'analyze', 'plan'].includes(p.status))
  const sorted = [...activeProjects, ...otherProjects]

  const completedTotal = projects.reduce((n, p) => n + p.todos.filter((t) => t.completed).length, 0)
  const todoTotal      = projects.reduce((n, p) => n + p.todos.length, 0)
  const totalLogged    = projects.reduce((n, p) => n + Math.floor((p.time_summary?.total_seconds || p.totalMinutes * 60 || 0) / 60), 0)

  return (
    <div className="py-6 px-16 max-w-7xl">

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <BriefcaseIcon className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Work Projects</h1>
            <p className="text-sm text-slate-500 mt-0.5">Active projects, todos, and time tracking</p>
          </div>
        </div>

        {/* Summary pills */}
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
      </div>

      {/* Active timer banner */}
      <TimerBanner
        activeTimer={activeTimer}
        projects={projects}
        onStop={handleTimerStop}
      />

      {/* ── Projects grid ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Projects
          <span className="ml-2 px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-medium normal-case tracking-normal">
            {sorted.length}
          </span>
        </h2>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {sorted.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              activeTimer={activeTimer}
              onTimerStart={handleTimerStart}
              onTimerStop={handleTimerStop}
              onTodoToggle={handleTodoToggle}
              onTodoDelete={handleTodoDelete}
              onTodoAdd={handleTodoAdd}
            />
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
