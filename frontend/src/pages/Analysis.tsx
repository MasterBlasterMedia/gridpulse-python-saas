import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Play,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { api, formatNumber, request } from "../api";
import { useSession } from "../session";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  Status,
} from "../components/UI";
import { ForecastChart } from "../components/Charts";
import s from "../App.module.scss";

export function ForecastPage() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(params.get("facility") || "");
  const [method, setMethod] = useState("ewma");
  const [horizon, setHorizon] = useState(24);
  const [window, setWindow] = useState(24);
  const [alpha, setAlpha] = useState(0.25);
  const [save, setSave] = useState(false);
  const { session } = useSession();
  const sites = useQuery({
    queryKey: ["facilities", "", ""],
    queryFn: ({ signal }) => api.facilities("", "", signal),
  });
  const facility = selected || sites.data?.[0]?.id || "";
  // A mutation represents an explicit calculation request, avoiding unexpected reruns while editing settings.
  const calculation = useMutation({
    mutationFn: () =>
      api.forecast(facility, { method, horizon, window, alpha, save }),
  });
  const result = calculation.data;
  return (
    <>
      <PageHeading
        eyebrow="EXPLAINABLE BY DESIGN"
        title="Forecast lab"
        description="Turn historical readings into a transparent, testable demand baseline."
      >
        <Badge tone="blue">
          <FlaskConical size={13} /> Statistical models
        </Badge>
      </PageHeading>
      <div className={s.analysisLayout}>
        <form
          className={`${s.panel} ${s.settingsPanel}`}
          onSubmit={(e) => {
            e.preventDefault();
            calculation.mutate();
          }}
        >
          <h2>Configure an analysis</h2>
          <p>No black box. Every parameter is yours to inspect.</p>
          <label>
            Facility
            <select
              value={facility}
              onChange={(e) => setSelected(e.target.value)}
              required
              aria-label="Forecast facility"
            >
              <option value="" disabled>
                Select a facility
              </option>
              {sites.data?.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Forecast method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="Forecast method"
            >
              <option value="ewma">Exponential smoothing (EWMA)</option>
              <option value="moving_average">Moving average</option>
            </select>
          </label>
          <label>
            Forecast horizon
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-label="Forecast horizon"
            >
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
            </select>
          </label>
          {method === "ewma" ? (
            <label>
              Smoothing factor · α = {alpha}
              <input
                aria-label="Smoothing factor"
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
              />
              <small>Higher values give recent readings more weight.</small>
            </label>
          ) : (
            <label>
              Moving window (hours)
              <input
                aria-label="Moving window"
                type="number"
                value={window}
                min={3}
                max={168}
                onChange={(e) => setWindow(Number(e.target.value))}
                required
              />
            </label>
          )}
          {session?.principal.role !== "demo" && (
            <label className={s.checkbox}>
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
              />
              Save this analysis
            </label>
          )}
          <button
            className={s.button}
            disabled={!facility || calculation.isPending}
          >
            <Play size={16} />
            {calculation.isPending ? "Calculating…" : "Generate forecast"}
          </button>
          {sites.error && <ErrorState error={sites.error} />}
          <div className={s.formNote}>
            <ShieldCheck size={16} />
            <span>
              {session?.principal.role === "demo"
                ? "Public calculations never modify the database."
                : "Saved analyses include an audit event."}
            </span>
          </div>
        </form>
        <div>
          {calculation.error ? (
            <ErrorState error={calculation.error} />
          ) : calculation.isPending ? (
            <Loading label="Calculating forecast and holdout errors…" />
          ) : !result ? (
            <div className={`${s.panel} ${s.forecastEmpty}`}>
              <span className={s.bigFlask}>
                <FlaskConical size={38} />
              </span>
              <Badge tone="teal">FROM OBSERVATION TO UNDERSTANDING</Badge>
              <h2>
                A useful baseline starts
                <br />
                with an honest model.
              </h2>
              <p>
                Select a facility and generate a forecast. You’ll see the
                calculated demand, a chronological evaluation, and the model’s
                limitations.
              </p>
              <div className={s.modelSteps}>
                <span>
                  01 <b>Read history</b>
                </span>
                <ArrowRight size={16} />
                <span>
                  02 <b>Evaluate</b>
                </span>
                <ArrowRight size={16} />
                <span>
                  03 <b>Forecast</b>
                </span>
              </div>
            </div>
          ) : (
            <>
              <section className={s.panel}>
                <div className={s.panelHeader}>
                  <div>
                    <h2>Observed demand & forecast</h2>
                    <p>
                      {result.method === "ewma"
                        ? "Exponential smoothing"
                        : "Moving average"}{" "}
                      · {result.horizon}-hour horizon
                    </p>
                  </div>
                  <Badge tone="teal">
                    {result.saved_id ? "Analysis saved" : "Calculated"}
                  </Badge>
                </div>
                <ForecastChart
                  history={result.history}
                  forecast={result.series}
                />
                <div className={s.chartFooter}>
                  <span>Teal: observed · Blue: forecast</span>
                  <span>Demand in kW</span>
                </div>
              </section>
              <div className={s.resultMetrics}>
                <article>
                  <small>MEAN ABSOLUTE ERROR</small>
                  <strong>
                    {formatNumber(result.mae_kw, 1)} <span>kW</span>
                  </strong>
                  <p>Average holdout deviation</p>
                </article>
                <article>
                  <small>ROOT MEAN SQUARE ERROR</small>
                  <strong>
                    {formatNumber(result.rmse_kw, 1)} <span>kW</span>
                  </strong>
                  <p>More sensitive to large errors</p>
                </article>
                <article>
                  <small>EVALUATION WINDOW</small>
                  <strong>
                    {result.evaluation_points} <span>hours</span>
                  </strong>
                  <p>{result.training_points} earlier training observations</p>
                </article>
              </div>
              <div className={s.explanation}>
                <h2>What this result means</h2>
                <p>
                  {result.evaluation}. {result.limitation} The flat prediction
                  is the expected output of these level-only methods, not an
                  unfinished visualization.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function IncidentsPage() {
  const [resolved, setResolved] = useState(false);
  const { session } = useSession();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["incidents", resolved],
    queryFn: ({ signal }) => api.incidents(resolved, signal),
  });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      request(`/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => void client.invalidateQueries(),
  });
  return (
    <>
      <PageHeading
        eyebrow="SIGNALS TO ACTION"
        title="Incident queue"
        description="A transparent priority order based on severity, reach, impact, and age."
      >
        <Badge tone="amber">
          <TriangleAlert size={13} /> Operational review
        </Badge>
      </PageHeading>
      <div className={s.queueExplainer}>
        <div>
          <strong>How priority is calculated</strong>
          <p>
            Severity × 100 + affected facilities × 10 + customer impact weight +
            age weight. Bounded impact and age prevent unbounded escalation.
          </p>
        </div>
        <span>
          O(n log k)<small>top-k selection</small>
        </span>
      </div>
      <div className={s.filterBar}>
        <span>{query.data?.length ?? "—"} incidents in this view</span>
        <label className={s.checkbox}>
          <input
            type="checkbox"
            checked={resolved}
            onChange={(e) => setResolved(e.target.checked)}
          />
          Include resolved
        </label>
      </div>
      {change.error && <ErrorState error={change.error} />}
      {query.error ? (
        <ErrorState error={query.error} />
      ) : query.isPending ? (
        <Loading />
      ) : !query.data.length ? (
        <Empty title="No incidents to review" />
      ) : (
        <section className={s.panel}>
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>PRIORITY</th>
                  <th>INCIDENT</th>
                  <th>SEVERITY</th>
                  <th>IMPACT</th>
                  <th>STATUS</th>
                  {session?.principal.role === "administrator" && (
                    <th>ACTION</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data.map((incident, index) => (
                  <tr key={incident.id}>
                    <td>
                      <span className={s.rank}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <small className={s.block}>
                        {incident.priority_score.toFixed(1)} pts
                      </small>
                    </td>
                    <td>
                      <strong>{incident.title}</strong>
                      <small className={s.block}>
                        {new Date(incident.created_at).toUTCString()} ·{" "}
                        {incident.age_hours.toFixed(0)}h old
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          incident.severity === 4
                            ? "red"
                            : incident.severity === 3
                              ? "amber"
                              : "blue"
                        }
                      >
                        {
                          ["", "Low", "Moderate", "High", "Critical"][
                            incident.severity
                          ]
                        }
                      </Badge>
                    </td>
                    <td>
                      {incident.facilities_affected} facilities
                      <small className={s.block}>
                        {formatNumber(incident.customer_impact)} simulated
                        customers
                      </small>
                    </td>
                    <td>
                      <Status status={incident.status} />
                    </td>
                    {session?.principal.role === "administrator" && (
                      <td>
                        {incident.status !== "resolved" && (
                          <button
                            disabled={change.isPending}
                            className={s.buttonSecondary}
                            onClick={() =>
                              change.mutate({
                                id: incident.id,
                                status:
                                  incident.status === "open"
                                    ? "acknowledged"
                                    : "resolved",
                              })
                            }
                          >
                            {incident.status === "open"
                              ? "Acknowledge"
                              : "Resolve"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {session?.principal.role === "demo" && (
        <p className={s.helperText}>
          <ShieldCheck size={14} /> Public demo is read-only. Acknowledgment and
          resolution require an administrator.
        </p>
      )}
    </>
  );
}

export function ReportsPage() {
  const [facility, setFacility] = useState("");
  const [days, setDays] = useState("7");
  const [complete, setComplete] = useState(false);
  const query = useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => api.dashboard({}, signal),
  });
  const download = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error("Wait for the dataset to load");
      const end = new Date(query.data.end);
      const params = {
        end: end.toISOString(),
        start: new Date(end.getTime() - Number(days) * 86400000).toISOString(),
        ...(facility ? { facility_id: facility } : {}),
      };
      const blob = await api.export(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gridpulse-energy.csv";
      link.click();
      // Release the object URL after the browser has started consuming the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setComplete(true);
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="ANALYSIS, READY TO SHARE"
        title="Energy reports"
        description="Export the readings behind your dashboard, with clear units and provenance."
      />
      <div className={s.reportLayout}>
        <form
          className={`${s.panel} ${s.reportForm}`}
          onSubmit={(e) => {
            e.preventDefault();
            setComplete(false);
            download.mutate();
          }}
        >
          <span className={s.largeIcon}>
            <FileSpreadsheet size={28} />
          </span>
          <h2>Energy consumption report</h2>
          <p>
            An hourly CSV export from the database. Open it in your spreadsheet
            or use it in your own Python analysis.
          </p>
          <label>
            Scope
            <select
              aria-label="Report facility"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            >
              <option value="">All facilities</option>
              {query.data?.facilities.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reporting period
            <select
              aria-label="Report period"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="1">Latest 24 hours of data</option>
              <option value="7">Latest 7 days of data</option>
              <option value="30">Latest 30 days of data</option>
            </select>
          </label>
          <button
            className={s.button}
            disabled={download.isPending || !query.data}
          >
            <Download size={17} />
            {download.isPending ? "Preparing export…" : "Download CSV report"}
          </button>
          {complete && (
            <p className={s.success} role="status">
              <CheckCircle2 size={17} />
              Your CSV report is ready.
            </p>
          )}
          {download.error && <ErrorState error={download.error} />}{" "}
          {query.error && <ErrorState error={query.error} />}
        </form>
        <div>
          <section className={`${s.panel} ${s.reportSchema}`}>
            <Badge tone="teal">6 DOCUMENTED COLUMNS</Badge>
            <h2>Every row tells the whole story.</h2>
            {[
              ["facility_code", "Stable site identifier"],
              ["facility_name", "Human-readable facility name"],
              ["timestamp_utc", "Start of the one-hour observation interval"],
              ["mean_demand_kw", "Mean electrical demand during the hour"],
              ["energy_kwh", "Hourly mean kW × 1 hour"],
              ["synthetic", "Always true for this demonstration"],
            ].map(([key, label]) => (
              <div key={key}>
                <code>{key}</code>
                <span>{label}</span>
              </div>
            ))}
          </section>
          <div className={s.explanation}>
            <h2>Designed for safe sharing</h2>
            <p>
              Reports include only your organization’s data. Text cells are
              protected against spreadsheet formula injection. The public
              demonstration exports synthetic observations only.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
