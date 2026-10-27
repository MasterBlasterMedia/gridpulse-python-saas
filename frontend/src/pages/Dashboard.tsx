import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Download,
  Gauge,
  Radio,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { api, dateLabel, formatNumber } from "../api";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  Metric,
  PageHeading,
  Status,
} from "../components/UI";
import { DemandChart } from "../components/Charts";
import s from "../App.module.scss";

export function DashboardPage() {
  const [facility, setFacility] = useState("");
  const [days, setDays] = useState("7");
  const [customStart, setStart] = useState("");
  const [customEnd, setEnd] = useState("");
  const base = useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => api.dashboard({}, signal),
  });
  const params: Record<string, string> = facility
    ? { facility_id: facility }
    : {};
  if (base.data) {
    const end = new Date(base.data.end);
    if (days === "custom" && customStart && customEnd) {
      params.start = `${customStart}T00:00:00Z`;
      params.end = `${customEnd}T00:00:00Z`;
    } else if (days !== "custom") {
      params.end = end.toISOString();
      params.start = new Date(
        end.getTime() - Number(days) * 86400000,
      ).toISOString();
    }
  }
  const invalidRange =
    days === "custom" &&
    (!customStart || !customEnd || customStart >= customEnd);
  const query = useQuery({
    queryKey: ["dashboard", params],
    queryFn: ({ signal }) => api.dashboard(params, signal),
    enabled: !!base.data && !invalidRange,
  });
  const incidents = useQuery({
    queryKey: ["incidents", false],
    queryFn: ({ signal }) => api.incidents(false, signal),
  });
  const data = query.data;
  return (
    <>
      <PageHeading
        eyebrow="YOUR NETWORK, AT A GLANCE"
        title="Operations overview"
        description="A clearer view of demand, performance, and the signals that need you."
      >
        <Link to="/app/reports" className={s.buttonSecondary}>
          <Download size={16} />
          Export report
        </Link>
      </PageHeading>
      <div className={s.filterBar}>
        <div className={s.filterGroup}>
          <label className={s.selectLabel}>
            <Building2 size={15} />
            <span className={s.srOnly}>Facility</span>
            <select
              aria-label="Facility"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            >
              <option value="">All facilities</option>
              {base.data?.facilities.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.selectLabel}>
            <CalendarDays size={15} />
            <span className={s.srOnly}>Date range</span>
            <select
              aria-label="Date range"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="7">Last 7 days of data</option>
              <option value="1">Last 24 hours of data</option>
              <option value="30">Last 30 days of data</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
        </div>
        <span className={s.dataFreshness}>
          <span className={s.dot} />
          {data?.as_of
            ? `Observed ${dateLabel(data.as_of)}, ${new Date(data.as_of).getUTCFullYear()} · UTC`
            : "Database observations"}
        </span>
      </div>
      {days === "custom" && (
        <div className={s.inlineForm}>
          <label>
            Start date
            <input
              aria-label="Start date"
              type="date"
              value={customStart}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            End date (exclusive)
            <input
              aria-label="End date"
              type="date"
              value={customEnd}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {invalidRange && (
            <span role="alert">Choose an end date after the start date.</span>
          )}
        </div>
      )}
      {base.error ? (
        <ErrorState error={base.error} retry={() => void base.refetch()} />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className={s.metrics}>
            <Metric
              label="Monitored facilities"
              value={String(data.facility_count)}
              icon={<Building2 size={20} />}
              note={
                <>
                  <span className={s.dot} />
                  {
                    data.facilities.filter((f) => f.status === "operational")
                      .length
                  }{" "}
                  operating normally
                </>
              }
            />
            <Metric
              label="Observed energy demand"
              value={formatNumber(
                data.current_demand_kw === null
                  ? null
                  : data.current_demand_kw / 1000,
                2,
              )}
              unit="MW"
              icon={<Zap size={20} />}
              tone="teal"
              note={
                data.trend_percent === null ? (
                  "Insufficient data for trend"
                ) : (
                  <>
                    <span
                      className={
                        data.trend_percent > 0 ? s.warningText : s.goodText
                      }
                    >
                      {data.trend_percent > 0 ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownRight size={14} />
                      )}{" "}
                      {Math.abs(data.trend_percent).toFixed(1)}%
                    </span>{" "}
                    vs. prior half of range
                  </>
                )
              }
            />
            <Metric
              label="Energy consumed"
              value={formatNumber(data.consumption_kwh / 1000, 1)}
              unit="MWh"
              icon={<Gauge size={20} />}
              note={`${formatNumber(data.coverage_percent, 1)}% hourly data coverage`}
            />
            <Metric
              label="Active incidents"
              value={String(data.active_incidents)}
              icon={<TriangleAlert size={20} />}
              tone="amber"
              note={
                <Link to="/app/incidents">
                  View priority queue <ArrowRight size={13} />
                </Link>
              }
            />
          </div>
          <div className={s.dashboardMiddle}>
            <section className={`${s.panel} ${s.demandPanel}`}>
              <div className={s.panelHeader}>
                <div>
                  <h2>Energy demand</h2>
                  <p>Aggregated hourly demand across the selected network</p>
                </div>
                <span className={s.chartLegend}>
                  <i />
                  Demand
                </span>
              </div>
              <div className={s.chartTopline}>
                <span className={s.chartUnit}>MEGAWATTS / MW</span>
                <Badge tone="teal">
                  {dateLabel(data.start)} — {dateLabel(data.end)}
                </Badge>
              </div>
              {data.series.length ? (
                <DemandChart points={data.series} />
              ) : (
                <Empty title="No readings in this period" />
              )}
              <div className={s.chartFooter}>
                <span>
                  <Radio size={14} /> Hourly observations · synthetic
                </span>
                <span>
                  Peak{" "}
                  <strong>
                    {formatNumber(data.peak_demand_kw / 1000, 2)} MW
                  </strong>
                </span>
              </div>
            </section>
            <section className={`${s.panel} ${s.insightPanel}`}>
              <div className={s.panelHeader}>
                <h2>Network pulse</h2>
                <span className={s.smallIcon}>
                  <ActivityIcon />
                </span>
              </div>
              <div className={s.pulseVisual}>
                <div
                  className={s.pulseRing}
                  style={{
                    background: `conic-gradient(#48ddc5 ${data.coverage_percent}%, #2b4a4b 0)`,
                  }}
                >
                  <span>
                    {formatNumber(data.coverage_percent, 1)}
                    <small>%</small>
                  </span>
                  <p>data coverage</p>
                </div>
              </div>
              <div className={s.networkStates}>
                {(["operational", "warning", "maintenance"] as const).map(
                  (status) => (
                    <div key={status}>
                      <Status status={status} />
                      <strong>
                        {
                          data.facilities.filter((f) => f.status === status)
                            .length
                        }
                      </strong>
                    </div>
                  ),
                )}
              </div>
              <div className={s.insightNote}>
                <Zap size={16} />
                <p>
                  <strong>{data.anomaly_count} statistical signals</strong>
                  <br />
                  Detected in the selected range. Inspect a facility to explore
                  the readings.
                </p>
              </div>
            </section>
          </div>
          <div className={s.dashboardBottom}>
            <section className={s.panel}>
              <div className={s.panelHeader}>
                <div>
                  <h2>Facility performance</h2>
                  <p>A closer look at your monitored locations</p>
                </div>
                <Link className={s.textLink} to="/app/facilities">
                  All facilities <ArrowUpRight size={14} />
                </Link>
              </div>
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>FACILITY</th>
                      <th>STATUS</th>
                      <th>DEMAND</th>
                      <th>LOAD / CAPACITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.facilities.slice(0, 5).map((site) => (
                      <tr key={site.id}>
                        <td>
                          <Link
                            className={s.facilityName}
                            to={`/app/facilities/${site.id}`}
                          >
                            <span className={s.tableIcon}>
                              <Building2 size={17} />
                            </span>
                            <span>
                              <strong>{site.name}</strong>
                              <small>
                                {site.code} · {site.region}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Status status={site.status} />
                        </td>
                        <td className={s.numeric}>
                          {formatNumber(
                            (site.current_demand_kw || 0) / 1000,
                            2,
                          )}{" "}
                          <small>MW</small>
                        </td>
                        <td>
                          <div className={s.capacity}>
                            <div>
                              <span
                                style={{
                                  width: `${Math.min(100, ((site.current_demand_kw || 0) / site.capacity_kw) * 100)}%`,
                                }}
                              />
                            </div>
                            <span>
                              {formatNumber(
                                ((site.current_demand_kw || 0) /
                                  site.capacity_kw) *
                                  100,
                              )}
                              %
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={s.panel}>
              <div className={s.panelHeader}>
                <div>
                  <h2>Attention required</h2>
                  <p>Ranked by impact and urgency</p>
                </div>
                <Badge tone="amber">{incidents.data?.length ?? "—"} open</Badge>
              </div>
              {incidents.error ? (
                <ErrorState error={incidents.error} />
              ) : !incidents.data ? (
                <Loading />
              ) : incidents.data.length === 0 ? (
                <Empty title="No active incidents" />
              ) : (
                <div className={s.incidentPreview}>
                  {incidents.data.slice(0, 3).map((incident) => (
                    <Link
                      to="/app/incidents"
                      className={s.incidentPreviewItem}
                      key={incident.id}
                    >
                      <span
                        className={`${s.incidentDot} ${incident.severity === 4 ? s.critical : s.amber}`}
                      />
                      <div>
                        <strong>{incident.title}</strong>
                        <p>
                          {incident.facilities_affected}{" "}
                          {incident.facilities_affected === 1
                            ? "facility"
                            : "facilities"}{" "}
                          · {formatNumber(incident.customer_impact)} simulated
                          customers
                        </p>
                        <Badge tone={incident.severity === 4 ? "red" : "amber"}>
                          {
                            ["", "Low", "Moderate", "High", "Critical"][
                              incident.severity
                            ]
                          }
                        </Badge>
                      </div>
                      <ArrowUpRight size={15} />
                    </Link>
                  ))}
                </div>
              )}
              <Link to="/app/incidents" className={s.panelBottomLink}>
                Open incident queue <ArrowRight size={15} />
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function ActivityIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M2 12h4l3-8 6 16 3-8h4" />
    </svg>
  );
}
