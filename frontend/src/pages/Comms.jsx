import { useState, useEffect, useCallback } from 'react'
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XMarkIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import {
  createClaudeMessage,
  listClaudeMessages,
  patchClaudeMessage,
  getClaudeProjects,
} from '../api'

const MINDSETS = [
  { key: 'focused',     label: 'Focused',     hint: 'deep, uninterrupted' },
  { key: 'tired',       label: 'Tired',       hint: 'short answers, no depth' },
  { key: 'creative',    label: 'Creative',    hint: 'explore tradeoffs' },
  { key: 'trading',     label: 'Trading',     hint: 'money-at-risk, careful' },
  { key: 'quick',       label: 'Quick',       hint: 'triage, no fluff' },
  { key: 'reflective',  label: 'Reflective',  hint: 'step back, think big' },
  { key: 'other',       label: 'Other',       hint: '' },
]

const PRIORITIES = [
  { key: 'low',    label: 'Low',    cls: 'bg-slate-800 text-slate-300 ring-slate-700' },
  { key: 'normal', label: 'Normal', cls: 'bg-slate-800 text-slate-200 ring-slate-700' },
  { key: 'high',   label: 'High',   cls: 'bg-amber-950/60 text-amber-300 ring-amber-800/50' },
]

const STATUS_STYLES = {
  unread:    'bg-emerald-950/60 text-emerald-400 ring-emerald-800/50',
  read:      'bg-slate-800 text-slate-400 ring-slate-700',
  actioned:  'bg-blue-950/60 text-blue-400 ring-blue-800/50',
  dismissed: 'bg-slate-900 text-slate-600 ring-slate-800',
}

function formatTs(iso) {
  if (!iso) return ''
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Comms() {
  const [body, setBody] = useState('')
  const [mindset, setMindset] = useState(null)
  const [scope, setScope] = useState('')
  const [priority, setPriority] = useState('normal')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [messages, setMessages] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [msgs, projs] = await Promise.all([
        listClaudeMessages({ limit: 100 }),
        getClaudeProjects().catch(() => []),
      ])
      setMessages(msgs || [])
      setProjects(projs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text || sending) return
    setSending(true); setSendError(null)
    try {
      await createClaudeMessage({
        body: text,
        mindset: mindset || null,
        scope_slug: scope || null,
        priority,
      })
      setBody('')
      setMindset(null)
      setScope('')
      setPriority('normal')
      await load()
    } catch (err) {
      setSendError(err.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  async function markActioned(id) {
    try { await patchClaudeMessage(id, { status: 'actioned' }); await load() } catch (e) { console.error(e) }
  }
  async function dismiss(id) {
    try { await patchClaudeMessage(id, { status: 'dismissed' }); await load() } catch (e) { console.error(e) }
  }

  const filtered = messages.filter(m => filter === 'all' ? true : m.status === filter)
  const unreadCount = messages.filter(m => m.status === 'unread').length

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-6 h-6 text-emerald-400" />
            Comms
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Leave notes for Claude. Read at every session start. Persist across mindsets and sessions.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {unreadCount > 0 && <span className="text-emerald-400 font-semibold">{unreadCount} unread</span>}
        </button>
      </header>

      {/* Composer */}
      <form
        onSubmit={send}
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-8"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want Claude to know next session? Context, intent, reminders, constraints…"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600 resize-y min-h-[100px]"
          rows={4}
        />

        {/* Mindset chips */}
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Mindset</div>
          <div className="flex flex-wrap gap-1.5">
            {MINDSETS.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMindset(mindset === m.key ? null : m.key)}
                title={m.hint}
                className={`px-2.5 py-1 text-xs rounded-full ring-1 ring-inset transition-colors ${
                  mindset === m.key
                    ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-700'
                    : 'bg-slate-800 text-slate-400 ring-slate-700 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scope + priority row */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Scope</div>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-600"
            >
              <option value="">Global (no project)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Priority</div>
            <div className="flex gap-1">
              {PRIORITIES.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key)}
                  className={`px-2.5 py-1 text-xs rounded-md ring-1 ring-inset transition-colors ${
                    priority === p.key ? p.cls : 'bg-slate-900 text-slate-500 ring-slate-800 hover:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sendError && (
          <div className="mt-3 text-xs text-red-400">{sendError}</div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[11px] text-slate-600">
            Keyboard: <span className="text-slate-500">Ctrl/⌘ + Enter</span> to send
          </div>
          <button
            type="submit"
            disabled={!body.trim() || sending}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(e) }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {sending ? 'Sending…' : 'Send to Claude'}
          </button>
        </div>
      </form>

      {/* Filter tabs */}
      <div className="mb-4 flex items-center gap-1 text-xs">
        {['all', 'unread', 'read', 'actioned', 'dismissed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
              filter === f
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {f}{f === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        ))}
      </div>

      {/* Message list */}
      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <div className="text-center py-12 text-sm text-slate-600">
            No messages {filter !== 'all' ? `with status "${filter}"` : 'yet'}.
          </div>
        )}
        {filtered.map(m => (
          <div key={m.id} className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ring-1 ring-inset ${STATUS_STYLES[m.status] || STATUS_STYLES.read}`}>
                  {m.status}
                </span>
                {m.mindset && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {m.mindset}
                  </span>
                )}
                {m.priority === 'high' && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <BoltIcon className="w-3 h-3" /> high
                  </span>
                )}
                {m.scope_slug && (
                  <span className="text-[10px] text-slate-600">→ {m.scope_slug}</span>
                )}
              </div>
              <span className="text-[11px] text-slate-600 flex-shrink-0">{formatTs(m.created_at)}</span>
            </div>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{m.body}</p>
            {m.claude_reply && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-[10px] uppercase tracking-wide text-emerald-500 mb-1">Claude replied</div>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{m.claude_reply}</p>
                <div className="text-[10px] text-slate-600 mt-1">{formatTs(m.replied_at)}</div>
              </div>
            )}
            {m.status !== 'dismissed' && m.status !== 'actioned' && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => markActioned(m.id)}
                  className="flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
                  title="Mark actioned"
                >
                  <CheckCircleIcon className="w-3.5 h-3.5" /> Mark actioned
                </button>
                <button
                  onClick={() => dismiss(m.id)}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  title="Dismiss"
                >
                  <XMarkIcon className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
