import { lazy, Suspense, useState } from "react";
import { NavLink, Outlet, Route, Routes, Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  CircleHelp,
  FileDown,
  LayoutDashboard,
  Menu,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import { Brand, ErrorState, Loading } from "./components/UI";
import { useSession } from "./session";
import { Landing, Engineering, Login } from "./pages/Public";
import { DOCS_URL } from "./api";
import s from "./App.module.scss";

// Route splitting keeps charting code out of the public case study's initial download.
const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const FacilitiesPage = lazy(() =>
  import("./pages/Facilities").then((m) => ({ default: m.FacilitiesPage })),
);
const FacilityDetail = lazy(() =>
  import("./pages/Facilities").then((m) => ({ default: m.FacilityDetail })),
);
const ForecastPage = lazy(() =>
  import("./pages/Analysis").then((m) => ({ default: m.ForecastPage })),
);
const IncidentsPage = lazy(() =>
  import("./pages/Analysis").then((m) => ({ default: m.IncidentsPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/Analysis").then((m) => ({ default: m.ReportsPage })),
);

const navigation = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/facilities", label: "Facilities", icon: Building2 },
  { to: "/app/forecasts", label: "Forecast lab", icon: ChartNoAxesCombined },
  { to: "/app/incidents", label: "Incidents", icon: Activity },
  { to: "/app/reports", label: "Reports", icon: FileDown },
];

function Layout() {
  const { session, loading, error, demo } = useSession();
  const [mobile, setMobile] = useState(false);
  return (
    <div className={s.appShell}>
      <a
        className={s.skipLink}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside
        className={`${s.sidebar} ${mobile ? s.sidebarOpen : ""}`}
        aria-label="Main navigation"
      >
        <Brand />
        <button
          className={s.mobileClose}
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className={s.workspace}>
          <span className={s.workspaceAvatar}>NE</span>
          <div>
            <strong>
              {session?.principal.organization_name || "Energy operations"}
            </strong>
            <small>
              {session?.principal.role === "demo"
                ? "Demonstration workspace"
                : "Private workspace"}
            </small>
          </div>
        </div>
        <div className={s.navLabel}>WORKSPACE</div>
        <nav>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `${s.navItem} ${isActive ? s.navActive : ""}`
              }
            >
              <Icon size={18} />
              {label}
              {label === "Overview" && <span className={s.navIndicator} />}
            </NavLink>
          ))}
        </nav>
        <div className={s.navLabel}>BEHIND THE BUILD</div>
        <nav>
          <NavLink to="/engineering" className={s.navItem}>
            <BookOpen size={18} />
            Engineering decisions
            <ArrowUpRight size={13} />
          </NavLink>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className={s.navItem}
          >
            <CircleHelp size={18} />
            API documentation
            <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className={s.sidebarBottom}>
          <div className={s.demoCard}>
            <ShieldCheck size={20} />
            <strong>
              {session?.principal.role === "demo"
                ? "Explore with confidence"
                : "Organization protected"}
            </strong>
            <p>
              {session?.principal.role === "demo"
                ? "Read-only workspace. Every energy reading is simulated."
                : "Changes are role restricted and recorded in the audit trail."}
            </p>
            <Link to="/engineering">
              About this environment <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link className={s.user} to="/login">
            <span className={s.avatar}>
              {session?.principal.role === "demo" ? "G" : "U"}
            </span>
            <span>
              <strong>
                {session?.principal.role === "demo"
                  ? "Guest explorer"
                  : "Workspace member"}
              </strong>
              <small>{session?.principal.role || "Connecting"}</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
      {mobile && (
        <button
          className={s.scrim}
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className={s.mainColumn}>
        <div className={s.topbar}>
          <button
            className={s.mobileToggle}
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <span className={s.breadcrumb}>
            Workspace <span>/</span> Energy operations
          </span>
          <div className={s.topbarRight}>
            <span className={s.simulated}>
              <Radio size={13} /> Synthetic dataset
            </span>
            <span className={s.version}>v1.0</span>
          </div>
        </div>
        <main tabIndex={-1} id="main-content" className={s.main}>
          {loading ? (
            <Loading label="Opening the demonstration workspace…" />
          ) : error ? (
            <ErrorState error={error} retry={() => void demo()} />
          ) : (
            <Outlet />
          )}
        </main>
        <footer className={s.appFooter}>
          <span>
            <span className={s.dot} /> Independently developed portfolio
            demonstration
          </span>
          <span>All timestamps UTC · No physical grid control</span>
        </footer>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading label="Loading workspace view…" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/engineering" element={<Engineering />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="facilities" element={<FacilitiesPage />} />
          <Route path="facilities/:id" element={<FacilityDetail />} />
          <Route path="forecasts" element={<ForecastPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className={s.notFound}>
              <Brand />
              <h1>That view isn’t here.</h1>
              <Link className={s.button} to="/app">
                Open the workspace
              </Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
