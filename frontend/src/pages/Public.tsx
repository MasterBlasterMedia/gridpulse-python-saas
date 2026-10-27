import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Database,
  Github,
  Layers,
  LockKeyhole,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { Brand, Badge } from "../components/UI";
import { DOCS_URL, REPOSITORY_URL } from "../api";
import { useSession } from "../session";
import s from "../App.module.scss";

function PublicHeader() {
  return (
    <header className={s.publicHeader}>
      <Brand />
      <nav>
        <Link to="/engineering">Engineering</Link>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          Source code <ArrowUpRight size={14} />
        </a>
        <Link to="/app" className={s.button}>
          Explore the demo <ArrowRight size={15} />
        </Link>
      </nav>
    </header>
  );
}

export function Landing() {
  return (
    <div className={s.publicPage}>
      <PublicHeader />
      <main>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <div className={s.eyebrow}>
              <span className={s.dot} /> ENERGY OPERATIONS & ANALYTICS
            </div>
            <h1>
              See the signal.
              <br />
              <span>
                Understand
                <br />
                the load.
              </span>
            </h1>
            <p>
              A connected view of energy demand. Explore facilities, investigate
              anomalies, and forecast what comes next—with Python analytics you
              can actually explain.
            </p>
            <div className={s.heroActions}>
              <Link to="/app" className={s.button}>
                Open the workspace <ArrowRight size={18} />
              </Link>
              <a
                href={REPOSITORY_URL}
                className={s.buttonSecondary}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={18} />
                Explore the code
              </a>
            </div>
            <div className={s.heroTrust}>
              <ShieldCheck size={16} /> No signup · Read-only demo · Synthetic
              data
            </div>
          </div>
          <div
            className={s.heroVisual}
            aria-label="Illustration of data flowing from facilities through a Python analytics engine"
          >
            <div className={s.visualHeader}>
              <span>
                <span className={s.dot} /> GRIDPULSE / SYSTEM TOPOLOGY
              </span>
              <span>01 — 03</span>
            </div>
            <div className={s.topology}>
              <div className={s.topologySources}>
                <span>
                  <Database size={20} />
                  Hourly readings<small>POSTGRESQL</small>
                </span>
                <span>
                  <Activity size={20} />
                  Facility signals<small>SYNTHETIC DATA</small>
                </span>
              </div>
              <div className={s.topologyConnection} />
              <div className={s.engineNode}>
                <Zap size={40} />
                <strong>GridPulse</strong>
                <small>PYTHON ANALYTICS ENGINE</small>
                <div>
                  <span>Forecast</span>
                  <span>Detect</span>
                  <span>Prioritize</span>
                </div>
              </div>
              <div className={s.waveform}>
                <svg
                  viewBox="0 0 480 90"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0 61 20 60 35 51 48 56 60 34 70 46 82 12 94 49 110 42 120 60 140 64 158 53 180 55 196 30 210 40 224 18 235 42 252 41 270 64 289 58 306 62 320 42 333 50 345 22 357 42 370 12 383 47 400 36 418 60 440 53 460 62 480 57"
                    fill="none"
                    stroke="#48ddc5"
                    strokeWidth="2"
                  />
                </svg>
                <span>OBSERVE → ANALYZE → UNDERSTAND</span>
              </div>
            </div>
            <div className={s.visualFooter}>
              <span>Transparent methods. Traceable results.</span>
              <Braces size={17} />
            </div>
          </div>
        </section>
        <div className={s.stackStrip}>
          <span>ENGINEERED WITH</span>
          {[
            "Python / FastAPI",
            "React / TypeScript",
            "PostgreSQL",
            "SQLAlchemy",
            "Docker",
            "AWS-ready IaC",
          ].map((item) => (
            <strong key={item}>{item}</strong>
          ))}
        </div>
        <section className={s.publicSection}>
          <div className={s.sectionIntro}>
            <div>
              <div className={s.eyebrow}>MORE THAN A DASHBOARD</div>
              <h2>
                From raw readings
                <br />
                to reasoned decisions.
              </h2>
            </div>
            <p>
              An independently developed portfolio application built to make the
              engineering inspectable—from the SQL query to the statistical
              result.
            </p>
          </div>
          <div className={s.featureGrid}>
            {[
              {
                n: "01",
                icon: Activity,
                title: "Understand the network",
                text: "Filter real database queries by facility and date. Compare hourly demand, energy consumption, and operating status.",
                to: "/app",
              },
              {
                n: "02",
                icon: Layers,
                title: "Inspect the methodology",
                text: "Try moving averages and exponential smoothing. Evaluate MAE and RMSE on held-out data and inspect statistical anomaly flags.",
                to: "/app/forecasts",
              },
              {
                n: "03",
                icon: Terminal,
                title: "Look under the hood",
                text: "Explore a modular FastAPI backend, tenant-scoped repositories, role restrictions, and tests that prove data isolation.",
                to: "/engineering",
              },
            ].map(({ n, icon: Icon, title, text, to }) => (
              <Link to={to} className={s.featureCard} key={n}>
                <div>
                  <Icon size={25} />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowUpRight size={20} />
              </Link>
            ))}
          </div>
        </section>
        <section className={s.publicCallout}>
          <div>
            <Badge tone="teal">BUILT TO BE REVIEWED</Badge>
            <h2>
              The reasoning is part
              <br />
              of the product.
            </h2>
            <p>
              Read the architecture, challenge the tradeoffs, and run the tests.
              Every significant implementation includes the reasoning behind it.
            </p>
          </div>
          <Link to="/engineering" className={s.buttonSecondary}>
            Read engineering decisions <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className={s.publicFooter}>
        <Brand small />
        <p>
          Independent portfolio demonstration. All operational data is
          synthetic.
          <br />
          Educational analytics only; not certified for electrical
          infrastructure control.
        </p>
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          API documentation <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}

const decisions = [
  {
    id: "architecture",
    title: "One deployable API. Clear internal boundaries.",
    problem:
      "A portfolio should show meaningful engineering without paying the operational cost of a distributed system.",
    choice:
      "A FastAPI modular monolith separates routes, schemas, repositories, services, and pure algorithms. Dependencies provide a request-scoped async SQLAlchemy session.",
    alternative:
      "Microservices offer independent scaling and release cycles; a smaller script would reduce setup.",
    tradeoff:
      "One deployment couples releases. Modules remain small enough to extract if a measurable scaling or ownership need appears.",
  },
  {
    id: "database",
    title: "Tenant ownership is a data-model concern.",
    problem:
      "Filtering the UI is not sufficient protection against cross-organization requests.",
    choice:
      "Every repository carries server-resolved organization context. Composite foreign keys prevent readings and incident links from referring to another tenant’s facility. Time-series indexes begin with tenant and time, or tenant, facility, and time.",
    alternative:
      "PostgreSQL row-level security adds defense in depth; database-per-tenant provides stronger physical isolation.",
    tradeoff:
      "Application scoping requires disciplined tests. Row-level security is a future defense, not an implemented claim. Bounded queries fit the demo; larger datasets would need rollups and pagination.",
  },
  {
    id: "algorithms",
    title: "A forecast you can explain and reproduce.",
    problem: "A convincing chart is not evidence of predictive accuracy.",
    choice:
      "Moving averages and EWMA are evaluated against a frozen, chronological 24-hour holdout, then refitted. The API returns both MAE and RMSE. Anomalies use prior observations only, with a configurable threshold and variance floor.",
    alternative:
      "Seasonal baselines, weather regressors, or richer time-series models could improve performance.",
    tradeoff:
      "These level models do not learn daily cycles. No advanced machine learning is claimed. Missing hours stop forecasting rather than being silently imputed.",
  },
  {
    id: "priority",
    title: "Prioritization as an explicit policy.",
    problem:
      "Severity alone ignores how many sites and customers are affected, or how long an incident has waited.",
    choice:
      "A documented score adds bounded site, customer, and age contributions to severity. A heap selects the top k in O(n log k) time with deterministic tie-breaking.",
    alternative:
      "Sorting all n incidents costs O(n log n) and is simpler when every incident must be displayed.",
    tradeoff:
      "The score is an illustrative policy, not an energy-sector standard. At this dataset size, the heap is an algorithm demonstration, not a proven latency win.",
  },
  {
    id: "security",
    title: "Public exploration without public write access.",
    problem:
      "Employers need a frictionless demo without privileged credentials or access to private data.",
    choice:
      "An expiring demo token maps to a fixed synthetic organization. The API rejects persisted demo actions. Private users use Argon2 password hashes, short-lived JWTs, and server-resolved roles. Audit events commit with their associated writes.",
    alternative:
      "A managed OIDC provider would add SSO and account recovery; server-side sessions provide straightforward revocation.",
    tradeoff:
      "No self-registration, password recovery, or refresh tokens. Rate limits are bounded in-memory and require a shared store before multiple workers are deployed. Access tokens are kept in browser memory.",
  },
  {
    id: "testing",
    title: "Tests exercise boundaries, not screenshots alone.",
    problem:
      "A polished interface can hide invalid analytics or weak isolation.",
    choice:
      "Pytest exercises algorithms and HTTP routes; PostgreSQL integration checks exercise tenant foreign keys and migrations. Vitest and Testing Library cover forms, loading, errors, filtering, and navigation. Playwright smoke tests use the running API.",
    alternative:
      "Mocks shorten feedback loops but cannot prove database constraints or frontend/backend integration.",
    tradeoff:
      "The compact suite targets high-risk behavior. The repository records measured results and verification limits; it does not claim certification or comprehensive penetration testing.",
  },
  {
    id: "cloud",
    title: "Static delivery with a separate Python runtime.",
    problem:
      "GitHub Pages can serve React assets but cannot execute a Python API.",
    choice:
      "A gated GitHub Actions workflow publishes the static frontend after checks. An AWS Terraform example uses ECS Fargate, an HTTPS application load balancer, private PostgreSQL, Secrets Manager, and CloudWatch.",
    alternative:
      "A managed application platform can simplify the API deployment and reduce maintenance for a small demo.",
    tradeoff:
      "AWS has ongoing cost and operational overhead. Infrastructure is only provisioned after explicit cost approval. The repository’s deployment record distinguishes configuration from verified hosting.",
  },
];
export function Engineering() {
  return (
    <div className={s.publicPage}>
      <PublicHeader />
      <main className={s.engineering}>
        <div className={s.eyebrow}>THE THINKING BEHIND GRIDPULSE</div>
        <h1>Engineering decisions.</h1>
        <p className={s.engineeringLead}>
          A working application is one part of the story. These are the
          boundaries, tradeoffs, and deliberate limitations that make it
          understandable and maintainable.
        </p>
        <div className={s.architectureFlow}>
          {[
            "React + TypeScript",
            "FastAPI / REST",
            "Services + algorithms",
            "SQLAlchemy / PostgreSQL",
          ].map((item, i) => (
            <div key={item}>
              <span>0{i + 1}</span>
              <strong>{item}</strong>
              {i < 3 && <ArrowRight size={18} />}
            </div>
          ))}
        </div>
        <nav className={s.decisionNav}>
          {decisions.map((d) => (
            <a
              key={d.id}
              href={`#/engineering#${d.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(d.id)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {d.id}
            </a>
          ))}
        </nav>
        {decisions.map((decision, index) => (
          <section className={s.decision} id={decision.id} key={decision.id}>
            <div className={s.decisionNumber}>0{index + 1}</div>
            <div>
              <h2>{decision.title}</h2>
              <dl>
                <dt>The problem</dt>
                <dd>{decision.problem}</dd>
                <dt>The implementation & why</dt>
                <dd>{decision.choice}</dd>
                <dt>Reasonable alternatives</dt>
                <dd>{decision.alternative}</dd>
                <dt>Tradeoffs & limits</dt>
                <dd>{decision.tradeoff}</dd>
              </dl>
            </div>
          </section>
        ))}
        <section className={s.explanation}>
          <h2>Refactoring, with evidence</h2>
          <p>
            Shared tenant-scoped repository queries serve the dashboard, anomaly
            view, and CSV export. The incident query uses one grouped join
            rather than a query per incident. No performance gain is claimed
            without a measured comparison; benchmark methodology and actual
            outputs belong in the repository’s testing documentation.
          </p>
          <a
            href={`${REPOSITORY_URL}/blob/main/docs/testing.md`}
            target="_blank"
            rel="noreferrer"
            className={s.textLink}
          >
            Testing and measurement record <ArrowUpRight size={14} />
          </a>
        </section>
        <div className={s.heroActions}>
          <Link to="/app" className={s.button}>
            Explore the implementation <ArrowRight size={16} />
          </Link>
          <a href={REPOSITORY_URL} className={s.buttonSecondary}>
            Read the source <Github size={16} />
          </a>
        </div>
      </main>
    </div>
  );
}

export function Login() {
  const { login, demo } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await login(String(data.get("email")), String(data.get("password")));
      navigate("/app");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.loginPage}>
      <Brand />
      <form
        className={`${s.panel} ${s.loginForm}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <span className={s.largeIcon}>
          <LockKeyhole size={24} />
        </span>
        <h1>Welcome to GridPulse.</h1>
        <p>
          Sign in to your private operations workspace, or explore the read-only
          public demonstration.
        </p>
        <label>
          Email address
          <input
            name="email"
            aria-label="Email address"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            aria-label="Password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {error && (
          <p className={s.formError} role="alert">
            {error}
          </p>
        )}
        <button className={s.button} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRight size={16} />
        </button>
        <div className={s.loginDivider}>OR EXPLORE WITHOUT AN ACCOUNT</div>
        <button
          type="button"
          className={s.buttonSecondary}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void demo()
              .then(() => navigate("/app"))
              .catch((error) => setError(String(error)))
              .finally(() => setBusy(false));
          }}
        >
          Continue in demo mode
        </button>
        <small>No public administrator credentials are provided.</small>
      </form>
    </div>
  );
}
