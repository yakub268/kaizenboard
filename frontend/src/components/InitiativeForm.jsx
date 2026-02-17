import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

const CATEGORIES = [
  { value: 'waste_reduction', label: 'Waste Reduction' },
  { value: 'cycle_time', label: 'Cycle Time' },
  { value: 'quality', label: 'Quality' },
  { value: 'cost_savings', label: 'Cost Savings' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const emptyForm = {
  title: '',
  description: '',
  category: 'waste_reduction',
  priority: 'medium',
  owner: '',
  department: '',
  target_date: '',
}

const inputClass = 'w-full px-3 py-2 bg-slate-800 border border-slate-700/60 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-shadow'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1'

export default function InitiativeForm({ initiative, onSubmit, onClose }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initiative) {
      setForm({
        title: initiative.title || '',
        description: initiative.description || '',
        category: initiative.category || 'waste_reduction',
        priority: initiative.priority || 'medium',
        owner: initiative.owner || '',
        department: initiative.department || '',
        target_date: initiative.target_date ? initiative.target_date.slice(0, 10) : '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [initiative])

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(form)
      if (!initiative) setForm(emptyForm)
    } finally {
      setSubmitting(false)
    }
  }

  const isEdit = !!initiative

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-100">
          {isEdit ? 'Edit Initiative' : 'New Initiative'}
        </h2>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Title <span className="text-red-400">*</span></label>
          <input name="title" type="text" value={form.title} onChange={handleChange} required placeholder="e.g., Reduce packaging waste by 30%" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="Describe the improvement goal, root cause, and expected outcome..." className={`${inputClass} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select name="category" value={form.category} onChange={handleChange} className={`${inputClass} cursor-pointer`}>
              {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select name="priority" value={form.priority} onChange={handleChange} className={`${inputClass} cursor-pointer`}>
              {PRIORITIES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Owner</label>
            <input name="owner" type="text" value={form.owner} onChange={handleChange} placeholder="Who is responsible?" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input name="department" type="text" value={form.department} onChange={handleChange} placeholder="e.g., Manufacturing" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Target Date</label>
          <input name="target_date" type="date" value={form.target_date} onChange={handleChange} className={inputClass} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={submitting}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer">
            {submitting ? 'Saving...' : isEdit ? 'Update Initiative' : 'Create Initiative'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
