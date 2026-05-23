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
import { HomeownerAuthProvider, useHomeownerAuth } from './context/HomeownerAuthContext';

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
import PoliciesTerms from './pages/PoliciesTerms';
import HomeownerLogin from './pages/HomeownerLogin';
import HomeownerSignup from './pages/HomeownerSignup';
import HomeownerAccount from './pages/HomeownerAccount';
import HomeownerTierSelection from './pages/HomeownerTierSelection';
import HomeownerPlants from './pages/HomeownerPlants';
import HomeownerPlantDetail from './pages/HomeownerPlantDetail';
import HomeownerAskArborAI from './pages/HomeownerAskArborAI';
import HomeownerResetPasswordRequest from './pages/HomeownerResetPasswordRequest';
import HomeownerResetPassword from './pages/HomeownerResetPassword';
import StaffSignup from './pages/StaffSignup';

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
    return <Navigate to="/staff/login" replace />;
  }
  
  return children;
}

function HomeownerProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useHomeownerAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/homeowners/login" replace />;
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
        <HomeownerAuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Homepage - no navbar */}
              <Route element={<LayoutNoNavbar />}>
                <Route path="/" element={<Home />} />
                <Route path="/homeowners" element={<HomeownersEdition />} />
              </Route>

              {/* Login/Policy routes - no navbar */}
              <Route element={<LayoutNoNavbar />}>
                <Route path="/admin" element={<Navigate to="/staff/login" replace />} />
                <Route path="/staff/login" element={<AdminLogin />} />
                <Route path="/staff/signup" element={<StaffSignup />} />
                <Route path="/policies" element={<PoliciesTerms />} />
                <Route path="/homeowners/login" element={<HomeownerLogin />} />
                <Route path="/homeowners/signup" element={<HomeownerSignup />} />
                <Route path="/homeowners/reset-password-request" element={<HomeownerResetPasswordRequest />} />
                <Route path="/homeowners/reset-password" element={<HomeownerResetPassword />} />
              </Route>

              {/* Protected staff routes - with navbar */}
              <Route element={<LayoutWithNavbar />}>
                <Route path="/staff/parks" element={<ProtectedRoute><ParkSelector /></ProtectedRoute>} />
              </Route>

              {/* Protected homeowner routes - no navbar */}
              <Route element={<LayoutNoNavbar />}>
                <Route path="/homeowners/account" element={<HomeownerProtectedRoute><HomeownerAccount /></HomeownerProtectedRoute>} />
                <Route path="/homeowners/tiers" element={<HomeownerProtectedRoute><HomeownerTierSelection /></HomeownerProtectedRoute>} />
                <Route path="/homeowners/ask-arborai" element={<HomeownerProtectedRoute><HomeownerAskArborAI /></HomeownerProtectedRoute>} />
                <Route path="/homeowners/plants" element={<HomeownerProtectedRoute><HomeownerPlants /></HomeownerProtectedRoute>} />
                <Route path="/homeowners/plants/:id" element={<HomeownerProtectedRoute><HomeownerPlantDetail /></HomeownerProtectedRoute>} />
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
        </HomeownerAuthProvider>
      </AuthProvider>
    </ModeProvider>
  );
}
