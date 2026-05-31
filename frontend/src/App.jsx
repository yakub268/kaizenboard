import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Board from './pages/Board'
import Dashboard from './pages/Dashboard'
import InitiativeDetail from './pages/InitiativeDetail'
import ClaudeProjects from './pages/ClaudeProjects'
import WorkProjects from './pages/WorkProjects'
import Comms from './pages/Comms'

function App() {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Navbar />
      <main className="flex-1 min-w-0 overflow-auto" style={{ paddingLeft: '48px' }}>
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/initiative/:id" element={<InitiativeDetail />} />
          <Route path="/claude" element={<ClaudeProjects />} />
          <Route path="/work" element={<WorkProjects />} />
          <Route path="/comms" element={<Comms />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
