import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { BetslipProvider } from './context/BetslipContext';
import LoginPage from './pages/LoginPage';
import SportsbookPage from './pages/SportsbookPage';
import AdminPage from './pages/AdminPage';
import ManagerPage from './pages/ManagerPage';
import MyBetsPage from './pages/MyBetsPage';

const ProtectedRoute = ({ children, requireAdmin = false, requireManager = false }: { children: JSX.Element, requireAdmin?: boolean, requireManager?: boolean }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Wait for auth check to complete before deciding where to redirect
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-secondary">
          <span className="w-4 h-4 rounded-full bg-accent-green animate-ping"></span>
          <span>Loading...</span>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  if (requireAdmin && user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  if (requireManager && user?.role !== 'MANAGER') return <Navigate to="/" replace />;
  
  // Route players to sportsbook, admins to admin, managers to manager
  if (!requireAdmin && !requireManager) {
    if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user?.role === 'MANAGER') return <Navigate to="/manager" replace />;
  }

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><SportsbookPage /></ProtectedRoute>} />
      <Route path="/match/:id" element={<ProtectedRoute><SportsbookPage /></ProtectedRoute>} />
      <Route path="/my-bets" element={<ProtectedRoute><MyBetsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
      <Route path="/manager" element={<ProtectedRoute requireManager><ManagerPage /></ProtectedRoute>} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <BetslipProvider>
            <AppRoutes />
          </BetslipProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}