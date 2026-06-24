import { Navigate, Route, Routes } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { CreatePoolPage } from '@/pages/CreatePoolPage'
import { JoinPoolPage } from '@/pages/JoinPoolPage'
import { PoolDashboardPage } from '@/pages/PoolDashboardPage'
import { MyPredictionsPage } from '@/pages/MyPredictionsPage'
import { OrganizerAdminPage } from '@/pages/OrganizerAdminPage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-gray-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Unirse es público: un invitado entra solo con su nombre (anónimo). */}
      <Route path="/unirse" element={<JoinPoolPage />} />
      <Route path="/unirse/:code" element={<JoinPoolPage />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/crear" element={<Protected><CreatePoolPage /></Protected>} />
      <Route path="/q/:poolId" element={<Protected><PoolDashboardPage /></Protected>} />
      <Route
        path="/q/:poolId/boleto/:ticketId"
        element={<Protected><MyPredictionsPage /></Protected>}
      />
      <Route path="/q/:poolId/admin" element={<Protected><OrganizerAdminPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
