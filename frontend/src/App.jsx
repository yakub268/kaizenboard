import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Board from './pages/Board'
import Dashboard from './pages/Dashboard'
import InitiativeDetail from './pages/InitiativeDetail'

function App() {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Navbar />
      <main className="flex-1 min-w-0 overflow-auto">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/initiative/:id" element={<InitiativeDetail />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
