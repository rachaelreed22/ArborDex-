import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import TreeList from './pages/TreeList';
import TreeForm from './pages/TreeForm';
import TreeDetail from './pages/TreeDetail';
import ArborTag from './pages/ArborTag';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Visitor-facing ArborTag (no staff navbar) */}
        <Route path="/tag/:id" element={<ArborTag />} />

        {/* Staff-facing ArborDex */}
        <Route path="/*" element={
          <>
            <Navbar />
            <Routes>
              <Route path="/" element={<TreeList />} />
              <Route path="/add" element={<TreeForm />} />
              <Route path="/trees/:id" element={<TreeDetail />} />
              <Route path="/trees/:id/edit" element={<TreeForm />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        } />
      </Routes>
    </BrowserRouter>
  );
}
