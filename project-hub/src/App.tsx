import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { ProjectList } from '@/pages/ProjectList'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { Settings } from '@/pages/Settings'
import { Standup } from '@/pages/Standup'
import { Notes } from '@/pages/Notes'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Navigate to="/dashboard" replace />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProjectList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProjectDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/standup"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Standup />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Notes />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
