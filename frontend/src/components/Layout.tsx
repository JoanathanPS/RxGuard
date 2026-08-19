import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../api/token";

const navItem = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50"
  }`;

export default function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold">
            RxGuard <span className="text-slate-400 font-normal">· AI drug-interaction checker</span>
          </span>
          <nav className="flex items-center gap-2">
            <NavLink to="/patients" className={navItem}>
              Patients
            </NavLink>
            <NavLink to="/prescriptions" className={navItem}>
              Prescriptions
            </NavLink>
            <button
              className="ml-2 text-sm text-slate-400 hover:text-white"
              onClick={() => {
                clearToken();
                navigate("/login");
              }}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500">
        RxGuard is a research/educational capstone — decision support only, never a replacement
        for a qualified clinician or an authoritative reference.
      </footer>
    </div>
  );
}