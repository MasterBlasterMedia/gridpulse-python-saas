import type { ReactNode } from "react";
import { AlertCircle, ArrowUpRight, LoaderCircle, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import s from "../App.module.scss";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className={s.brand} aria-label="GridPulse home">
      <span className={s.brandIcon}>
        <Zap size={small ? 18 : 22} fill="currentColor" />
      </span>
      GridPulse<span className={s.brandDot}>.</span>
    </Link>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`${s.badge} ${s[tone] || ""}`}>{children}</span>;
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`${s.status} ${s[status] || ""}`}>
      <i />
      {status}
    </span>
  );
}
export function Loading({
  label = "Loading operational data…",
}: {
  label?: string;
}) {
  return (
    <div className={s.state} role="status">
      <LoaderCircle className={s.spin} size={24} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className={s.error} role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>We couldn’t load this view</strong>
        <p>{error.message}</p>
        {retry && (
          <button className={s.buttonSecondary} onClick={retry}>
            Try again
          </button>
        )}
        <Link to="/login">
          Sign in or restart demo <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.state}>
      <strong>{title}</strong>
      <p>{children || "Try a different facility or date range."}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className={s.pageHeading}>
      <div>
        <div className={s.eyebrow}>{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={s.headingActions}>{children}</div>
    </header>
  );
}
export function Metric({
  label,
  value,
  unit,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  note: ReactNode;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <article className={s.metric}>
      <div className={s.metricTop}>
        <span>{label}</span>
        <span className={`${s.metricIcon} ${tone ? s[tone] : ""}`}>{icon}</span>
      </div>
      <div className={s.metricValue}>
        {value}
        <small>{unit}</small>
      </div>
      <div className={s.metricNote}>{note}</div>
    </article>
  );
}
