import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoutinesPage from './pages/RoutinesPage';
import RoutineEditorPage from './pages/RoutineEditorPage';
import WorkoutPage from './pages/WorkoutPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/routines" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestGuard>
                <LoginPage />
              </GuestGuard>
            }
          />
          <Route
            path="/register"
            element={
              <GuestGuard>
                <RegisterPage />
              </GuestGuard>
            }
          />
          <Route
            path="/routines"
            element={
              <AuthGuard>
                <RoutinesPage />
              </AuthGuard>
            }
          />
          <Route
            path="/routines/:id"
            element={
              <AuthGuard>
                <RoutineEditorPage />
              </AuthGuard>
            }
          />
          <Route
            path="/workouts/:id"
            element={
              <AuthGuard>
                <WorkoutPage />
              </AuthGuard>
            }
          />
          <Route path="/" element={<Navigate to="/routines" replace />} />
          <Route path="*" element={<Navigate to="/routines" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
