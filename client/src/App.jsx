console.log('🔥 THIS APP.JSX IS RUNNING 🔥');

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ModeProvider } from './context/ModeContext';

import TreeList from './pages/TreeList';
import TreeForm from './pages/TreeForm';
import ArborTag from './pages/ArborTag';

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

          {/* Public QR Entry */}
          <Route element={<Layout />}>
            <Route path="/tag/:id" element={<ArborTag />} />
          </Route>

          {/* Staff + Public unified pages */}
          <Route element={<Layout />}>
            <Route path="/" element={<TreeList />} />
            <Route path="/add" element={<TreeForm />} />
            <Route path="/trees/:id" element={<ArborTag />} />
            <Route path="/trees/:id/edit" element={<TreeForm />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </BrowserRouter>
    </ModeProvider>
  );
}

