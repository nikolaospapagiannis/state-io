import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PlayersPage } from './pages/PlayersPage';
import { ModerationPage } from './pages/ModerationPage';
import { EventsPage } from './pages/EventsPage';
import { OffersPage } from './pages/OffersPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SettingsPage } from './pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen bg-dark-400 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/players" element={<PlayersPage />} />
                  <Route path="/moderation" element={<ModerationPage />} />
                  <Route path="/events" element={<EventsPage />} />
                  <Route path="/offers" element={<OffersPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/audit-log" element={<AuditLogPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
}
