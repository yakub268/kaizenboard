import { NavLink, useNavigate } from 'react-router-dom'
import {
  ViewColumnsIcon,
  ChartBarIcon,
  PlusIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/', label: 'Board', icon: ViewColumnsIcon },
  { to: '/dashboard', label: 'Dashboard', icon: ChartBarIcon },
]

export default function Navbar() {
  const navigate = useNavigate()

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-white flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
            <ArrowTrendingUpIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">KaizenBoard</h1>
            <p className="text-[11px] text-slate-400 tracking-wide uppercase">Continuous Improvement</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Navigation
        </p>
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* New Initiative Button */}
      <div className="px-4 py-4 border-t border-slate-700/50">
        <button
          onClick={() => {
            navigate('/')
            window.dispatchEvent(new CustomEvent('open-new-initiative'))
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          New Initiative
        </button>
      </div>
    </nav>
  )
}
