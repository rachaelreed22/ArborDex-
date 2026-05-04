import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMode } from '../context/ModeContext';
import logo from '../assets/ArborTag-Logo.png';
import './Navbar.css';

export default function Navbar() {
  const { mode, toggleMode } = useMode();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const brandName = mode === "tag" ? "ArborTag" : "ArborDex";
  const toggleLabel = mode === "tag" ? "ArborDex ⚙️" : "ArborTag 🌿";
  const isStaff = mode === "dex";

  const handleNav = (path) => {
    navigate(path);
    setMenuOpen(false);
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

        <NavLink to="/database" onClick={() => setMenuOpen(false)}>
          Tree Database
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
          Scan QR
        </button>

        <NavLink to="/ask-arborai" onClick={() => setMenuOpen(false)}>
          Ask ArborAI
        </NavLink>

        <button className="mode-toggle" onClick={() => { toggleMode(); setMenuOpen(false); }}>
          {toggleLabel}
        </button>
      </nav>
    </header>
  );
}

