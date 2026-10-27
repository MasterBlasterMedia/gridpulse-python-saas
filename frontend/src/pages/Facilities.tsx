import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Building2, Plus, Search } from "lucide-react";
import { api, formatNumber, request } from "../api";
import type { Facility } from "../types";
import { useSession } from "../session";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  Status,
} from "../components/UI";
import { DemandChart } from "../components/Charts";
import s from "../App.module.scss";

export function FacilitiesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const { session } = useSession();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["facilities", search, status],
    queryFn: ({ signal }) => api.facilities(search, status, signal),
  });
  const stats = useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => api.dashboard({}, signal),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request("/facilities", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      void client.invalidateQueries();
    },
  });
  function toggle(id: string) {
    setCompare((previous) =>
      previous.includes(id)
        ? previous.filter((x) => x !== id)
        : [...previous.slice(-3), id],
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="CONNECTED LOCATIONS"
        title="Your facilities"
        description="Explore site performance, operating status, and hourly energy demand."
      >
        {session?.principal.role === "administrator" && (
          <button className={s.button} onClick={() => setShowForm(!showForm)}>
            <Plus size={16} />
            Add facility
          </button>
        )}
      </PageHeading>
      {showForm && (
        <form
          className={`${s.panel} ${s.formPanel}`}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            create.mutate({
              ...Object.fromEntries(data),
              capacity_kw: Number(data.get("capacity_kw")),
            });
          }}
        >
          <h2>New facility</h2>
          <div className={s.formGrid}>
            {[
              ["code", "Site code"],
              ["name", "Facility name"],
              ["region", "Region"],
              ["kind", "Building type"],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  required
                  minLength={2}
                  maxLength={name === "code" ? 24 : 100}
                  pattern={name === "code" ? "[A-Z0-9-]+" : undefined}
                />
              </label>
            ))}
            <label>
              Capacity (kW)
              <input
                name="capacity_kw"
                type="number"
                min="1"
                max="1000000"
                required
              />
            </label>
          </div>
          {create.error && <p role="alert">{create.error.message}</p>}
          <button className={s.button} disabled={create.isPending}>
            Create facility
          </button>
        </form>
      )}
      <div className={s.filterBar}>
        <label className={s.search}>
          <Search size={17} />
          <input
            aria-label="Search facilities"
            placeholder="Search by facility name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className={s.selectLabel}>
          <span className={s.srOnly}>Operating status</span>
          <select
            aria-label="Operating status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All operating statuses</option>
            <option value="operational">Operational</option>
            <option value="warning">Warning</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
      </div>
      <p className={s.helperText}>
        Select up to four sites to compare their average demand over the latest
        seven days.
      </p>
      {compare.length > 0 && (
        <section className={`${s.panel} ${s.comparePanel}`}>
          <div className={s.panelHeader}>
            <h2>Facility comparison</h2>
            <button className={s.textButton} onClick={() => setCompare([])}>
              Clear selection
            </button>
          </div>
          <div className={s.compareGrid}>
            {compare.map((id) => {
              const site = stats.data?.facilities.find((f) => f.id === id);
              return site ? (
                <div key={id}>
                  <strong>{site.name}</strong>
                  <span>
                    {formatNumber(site.average_demand_kw, 1)}{" "}
                    <small>kW average</small>
                  </span>
                  <div className={s.compareBar}>
                    <i
                      style={{
                        width: `${Math.min(100, ((site.average_demand_kw || 0) / site.capacity_kw) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {formatNumber(site.consumption_kwh, 0)} kWh consumed
                  </small>
                </div>
              ) : null;
            })}
          </div>
        </section>
      )}
      {query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : !query.data.length ? (
        <Empty title="No facilities match your search" />
      ) : (
        <div className={s.facilityGrid}>
          {query.data.map((site) => (
            <article key={site.id} className={s.facilityCard}>
              <div className={s.facilityCardTop}>
                <span className={s.largeIcon}>
                  <Building2 size={24} />
                </span>
                <Status status={site.status} />
              </div>
              <small className={s.siteCode}>
                {site.code} / {site.region}
              </small>
              <Link to={`/app/facilities/${site.id}`}>
                <h2>
                  {site.name} <ArrowUpRight size={18} />
                </h2>
              </Link>
              <p>{site.kind}</p>
              <div className={s.facilityCardMetrics}>
                <div>
                  <small>Installed capacity</small>
                  <strong>
                    {formatNumber(site.capacity_kw / 1000, 1)} <span>MW</span>
                  </strong>
                </div>
                <div>
                  <small>7-day avg. demand</small>
                  <strong>
                    {formatNumber(
                      stats.data?.facilities.find((f) => f.id === site.id)
                        ?.average_demand_kw,
                      0,
                    )}{" "}
                    <span>kW</span>
                  </strong>
                </div>
              </div>
              <label className={s.compareCheck}>
                <input
                  type="checkbox"
                  checked={compare.includes(site.id)}
                  onChange={() => toggle(site.id)}
                />
                Compare facility
              </label>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function FacilityDetail() {
  const { id = "" } = useParams();
  const [threshold, setThreshold] = useState(3);
  const { session } = useSession();
  const client = useQueryClient();
  const site = useQuery({
    queryKey: ["facility", id],
    queryFn: ({ signal }) => api.facility(id, signal),
  });
  const analysis = useQuery({
    queryKey: ["anomalies", id, threshold],
    queryFn: ({ signal }) => api.anomalies(id, threshold, signal),
  });
  const change = useMutation({
    mutationFn: (status: string) =>
      request<Facility>(`/facilities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => void client.invalidateQueries(),
  });
  if (site.error) return <ErrorState error={site.error} />;
  if (!site.data) return <Loading />;
  return (
    <>
      <Link to="/app/facilities" className={s.textLink}>
        <ArrowLeft size={14} />
        Back to facilities
      </Link>
      <PageHeading
        eyebrow={`${site.data.code} / ${site.data.region}`}
        title={site.data.name}
        description={`${site.data.kind} · ${formatNumber(site.data.capacity_kw)} kW installed capacity`}
      >
        <Status status={site.data.status} />
        <Link
          to={`/app/forecasts?facility=${id}`}
          className={s.buttonSecondary}
        >
          Run forecast <ArrowUpRight size={15} />
        </Link>
      </PageHeading>
      {session?.principal.role === "administrator" && (
        <label className={s.inlineForm}>
          Operating status
          <select
            aria-label="Update operating status"
            value={site.data.status}
            onChange={(e) => change.mutate(e.target.value)}
            disabled={change.isPending}
          >
            {["operational", "warning", "maintenance"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          {change.error && <span role="alert">{change.error.message}</span>}
        </label>
      )}
      <section className={s.panel}>
        <div className={s.panelHeader}>
          <div>
            <h2>Demand & anomaly signals</h2>
            <p>Trailing 24-hour baseline · earlier observations only</p>
          </div>
          <label className={s.selectLabel}>
            Threshold
            <select
              aria-label="Anomaly threshold"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            >
              <option value={2}>2σ · Sensitive</option>
              <option value={3}>3σ · Balanced</option>
              <option value={4}>4σ · Conservative</option>
              <option value={5}>5σ · Strict</option>
            </select>
          </label>
        </div>
        {analysis.error ? (
          <ErrorState error={analysis.error} />
        ) : !analysis.data ? (
          <Loading />
        ) : (
          <>
            <div className={s.chartTopline}>
              <span className={s.chartUnit}>MEGAWATTS / MW</span>
              <Badge tone="amber">
                {analysis.data.anomalies.length} signals detected
              </Badge>
            </div>
            <DemandChart
              points={analysis.data.series}
              anomalies={analysis.data.anomalies}
            />
            <div className={s.chartFooter}>
              <span>Teal: observed demand</span>
              <span className={s.warningText}>Amber: threshold exceeded</span>
            </div>
          </>
        )}
      </section>
      <div className={s.explanation}>
        <h2>How to read this signal</h2>
        <p>
          Each reading is compared with the preceding 24 hours. A signal appears
          when its deviation exceeds your selected threshold. A 5% baseline
          floor reduces false alarms on flat traces; missing readings reset the
          window. These statistical flags are review prompts, not diagnoses.
        </p>
      </div>
      {!!analysis.data?.anomalies.length && (
        <section className={s.panel}>
          <div className={s.panelHeader}>
            <h2>Flagged observations</h2>
          </div>
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>TIME (UTC)</th>
                  <th>OBSERVED</th>
                  <th>BASELINE</th>
                  <th>DEVIATION</th>
                </tr>
              </thead>
              <tbody>
                {analysis.data.anomalies.map((a) => (
                  <tr key={a.timestamp}>
                    <td>{new Date(a.timestamp).toUTCString()}</td>
                    <td>{formatNumber(a.actual, 1)} kW</td>
                    <td>{formatNumber(a.baseline, 1)} kW</td>
                    <td>
                      <Badge tone="amber">{a.score.toFixed(2)}σ</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
