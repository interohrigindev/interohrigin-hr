import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminRoute } from '@/components/layout/AdminRoute'
import Login from '@/routes/login'
import DashboardLayout from '@/routes/dashboard'
import DashboardHome from '@/routes/dashboard-home'
import SelfEvaluation from '@/routes/self-evaluation'
import EvaluateList from '@/routes/evaluate-list'
import EvaluateDetail from '@/routes/evaluate-detail'
import Report from '@/routes/report'
import Settings from '@/routes/settings'

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="self-evaluation" element={<SelfEvaluation />} />
              <Route path="evaluate" element={<EvaluateList />} />
              <Route path="evaluate/:employeeId" element={<EvaluateDetail />} />
              <Route path="report" element={<Report />} />
              <Route path="report/:employeeId" element={<Report />} />
              <Route
                path="settings"
                element={
                  <AdminRoute>
                    <Settings />
                  </AdminRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
