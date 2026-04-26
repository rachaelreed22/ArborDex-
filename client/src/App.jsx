console.log('🔥 THIS APP.JSX IS RUNNING 🔥');

// GLOBAL + PAGE CSS IMPORTS
import "./index.css";
import "./pages/Scan.css";
import "./pages/TreeList.css";
import "./pages/AddTree.css";
import "./pages/TreeDetail.css";

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ModeProvider } from './context/ModeContext';

import TreeList from './pages/TreeList';
import AddTree from './pages/AddTree';
import TreeDetail from './pages/TreeDetail';
import Scan from './pages/Scan';

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
          <Route element={<Layout />}>
            <Route path="/" element={<TreeList />} />
            <Route path="/add" element={<AddTree />} />
            <Route path="/listing/:id" element={<TreeDetail />} />
            <Route path="/tag/:id" element={<TreeDetail />} />
            <Route path="/scan" element={<Scan />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ModeProvider>
  );
}
