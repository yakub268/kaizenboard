import { NavLink, useNavigate } from 'react-router-dom'
import {
  ViewColumnsIcon,
  ChartBarIcon,
  PlusIcon,
  ArrowTrendingUpIcon,
  SparklesIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/', label: 'Board', icon: ViewColumnsIcon },
  { to: '/dashboard', label: 'Dashboard', icon: ChartBarIcon },
  { to: '/work', label: 'Work Projects', icon: BriefcaseIcon },
  { to: '/claude', label: 'Claude Projects', icon: SparklesIcon },
]

export default function Navbar() {
  const navigate = useNavigate()

  return (
    <nav className="sticky top-0 h-screen w-56 flex-shrink-0 bg-slate-950 border-r border-slate-800/60 text-white flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <ArrowTrendingUpIcon className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight">KaizenBoard</h1>
          <p className="text-[10px] text-slate-500 tracking-wide uppercase">Continuous Improvement</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4">
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
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* New Initiative Button */}
      <div className="px-3 py-4 border-t border-slate-800/60">
        <button
          onClick={() => {
            navigate('/')
            window.dispatchEvent(new CustomEvent('open-new-initiative'))
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer"
        >
          <PlusIcon className="w-4 h-4 flex-shrink-0" />
          New Initiative
        </button>
      </div>
    </nav>
  )
}
