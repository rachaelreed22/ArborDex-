import { NavLink } from 'react-router-dom';
import { useMode } from '../context/ModeContext';
import logo from '../assets/ArborTag-Logo.png';

export default function Navbar() {
  const { mode, toggleMode } = useMode();

  const brandName = mode === "tag" ? "ArborTag" : "ArborDex";
  const toggleLabel = mode === "tag" ? "ArborDex ⚙️" : "ArborTag 🌿";

  return (
    <header className="navbar">
      <div className="brand">
        <img src={logo} alt={brandName} className="brand-logo" />
        <span className="brand-name">{brandName}</span>
      </div>

      <nav>
        <NavLink to="/" end>Tree Database</NavLink>
        <NavLink to="/add">+ Add Tree</NavLink>

        {/* Mode Toggle */}
        <button className="mode-toggle" onClick={toggleMode}>
          {toggleLabel}
        </button>
      </nav>
    </header>
  );
}


