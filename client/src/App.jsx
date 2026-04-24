console.log('🔥 THIS APP.JSX IS RUNNING 🔥');

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ModeProvider } from './context/ModeContext';

import CreateListingForm from "./components/CreateListingForm";
import TreeList from './pages/TreeList';
import ArborTag from './pages/ArborTag';
import Scan from './pages/Scan';   // ← Add this once Scan.jsx exists

function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <ModeProvider>
      <BrowserRouter>
        <Routes>

          {/* Public QR Entry (no staff tools, but still uses Layout for navbar) */}
          <Route element={<Layout />}>
            <Route path="/tag/:id" element={<ArborTag />} />
          </Route>

          {/* Unified Staff + Public Pages */}
          <Route element={<Layout />}>
            <Route path="/" element={<TreeList />} />
            <Route path="/add" element={<CreateListingForm />} />
            <Route path="/listing/:id" element={<ArborTag />} />

            {/* Scan QR Page */}
            <Route path="/scan" element={<Scan />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </BrowserRouter>
    </ModeProvider>
  );
}
