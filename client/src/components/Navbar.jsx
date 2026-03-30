import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="brand">
        <span className="leaf">🌳</span>
        ArborDex
      </div>
      <nav>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          Tree Database
        </NavLink>
        <NavLink to="/add" className={({ isActive }) => isActive ? 'active' : ''}>
          + Add Tree
        </NavLink>
      </nav>
    </header>
  );
}
