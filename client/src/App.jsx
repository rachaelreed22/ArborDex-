// GLOBAL + PAGE CSS IMPORTS
import "./index.css";
import "./pages/Scan.css";
import "./pages/TreeList.css";
import "./pages/AddTree.css";
import "./pages/TreeDetail.css";

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ModeProvider } from './context/ModeContext';
import { AuthProvider, useAuth } from './context/AuthContext';

import TreeList from './pages/TreeList';
import AddTree from './pages/AddTree';
import TreeDetail from './pages/TreeDetail';
import Scan from './pages/Scan';
import AskArborAI from './pages/AskArborAI';
import PendingPhotos from './pages/PendingPhotos';
import Home from './pages/Home';
import ParkReport from './pages/ParkReport';
import AdminLogin from './pages/AdminLogin';
import ParkSelector from './pages/ParkSelector';
import HomeownersEdition from './pages/HomeownersEdition';

// Layout with navbar (for most pages)
function LayoutWithNavbar() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

// Layout without navbar (for homepage only)
function LayoutNoNavbar() {
  return <Outlet />;
}

// Protected route for authenticated users (staff/admin)
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }
  
  return children;
}

function DatabaseEntryRoute() {
  const selectedParkId = localStorage.getItem('selectedParkId');

  if (!selectedParkId) {
    return <Navigate to="/parks" replace />;
  }

  return <TreeList />;
}

export default function App() {
  return (
    <ModeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Homepage - no navbar */}
            <Route element={<LayoutNoNavbar />}>
              <Route path="/" element={<Home />} />
              <Route path="/homeowners" element={<HomeownersEdition />} />
            </Route>

            {/* Admin login - no navbar */}
            <Route element={<LayoutNoNavbar />}>
              <Route path="/admin" element={<AdminLogin />} />
            </Route>

            {/* Protected staff routes - with navbar */}
            <Route element={<LayoutWithNavbar />}>
              <Route path="/staff/parks" element={<ProtectedRoute><ParkSelector /></ProtectedRoute>} />
            </Route>

            {/* Public routes - with navbar */}
            <Route element={<LayoutWithNavbar />}>
              <Route path="/parks" element={<ParkSelector />} />
              <Route path="/trees" element={<DatabaseEntryRoute />} />
              <Route path="/database" element={<DatabaseEntryRoute />} />
              <Route path="/add" element={<AddTree />} />
              <Route path="/listing/:id" element={<TreeDetail />} />
              <Route path="/tag/:id" element={<TreeDetail />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/ask-arborai" element={<AskArborAI />} />
              <Route path="/park-report" element={<ProtectedRoute><ParkReport /></ProtectedRoute>} />
              <Route path="/pending-photos" element={<PendingPhotos />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ModeProvider>
  );
}
