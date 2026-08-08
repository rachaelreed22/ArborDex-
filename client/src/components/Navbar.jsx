import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/ArborTag-Logo.png';
import './Navbar.css';

export default function Navbar() {
  const { mode, toggleMode } = useMode();
  const { isAuthenticated, isStaffAuthorized, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const brandName = mode === "tag" ? "ArborTag" : "ArborDex";
  const toggleLabel = mode === "tag" ? "ArborDex ⚙️" : "ArborTag 🌿";
  const isStaff = mode === "dex";

  const handleNav = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleModeToggle = () => {
    if (mode === 'tag' && !isStaffAuthorized) {
      handleNav('/staff/login');
      return;
    }

    toggleMode();
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    handleNav('/');
  };

  return (
    <header className="navbar">
      <div className="brand" onClick={() => handleNav('/')}>
        <img src={logo} alt={brandName} className="brand-logo" />
        <span className="brand-name">{brandName}</span>
      </div>

      <button
        className={`hamburger ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span className="bar"></span>
        <span className="bar"></span>
        <span className="bar"></span>
      </button>

      <nav className={menuOpen ? 'nav-open' : ''}>
        <NavLink to="/" end onClick={() => setMenuOpen(false)}>
          Home
        </NavLink>

        <NavLink to="/parks" onClick={() => setMenuOpen(false)}>
          Demo Selection
        </NavLink>

        {isStaff && (
          <NavLink to="/add" onClick={() => setMenuOpen(false)}>
            + Add Tree
          </NavLink>
        )}

        <button
          className="scan-qr-btn"
          onClick={() => handleNav('/scan')}
        >
          Submit A Photo
        </button>

        <NavLink to="/ask-arborai" onClick={() => setMenuOpen(false)}>
          Ask ArborAI
        </NavLink>

        <NavLink to="/contact" onClick={() => setMenuOpen(false)}>
          Contact
        </NavLink>

        {isAuthenticated && isStaff && (
          <NavLink to="/park-report" onClick={() => setMenuOpen(false)}>
            Park Report
          </NavLink>
        )}

        {isAuthenticated && (
          <button className="logout-btn" onClick={handleLogout}>
            Sign Out
          </button>
        )}

        <button className="mode-toggle" onClick={handleModeToggle}>
          {toggleLabel}
        </button>
      </nav>
    </header>
  );
}

