import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { SessionProvider } from "./session";
import { ApiError, formatNumber, request, setAccessToken } from "./api";

const site = {
  id: "site-a",
  name: "Hudson Research Campus",
  code: "NYC-01",
  region: "New York",
  kind: "Research",
  status: "operational",
  capacity_kw: 2000,
  current_demand_kw: 1000,
  average_demand_kw: 900,
  consumption_kwh: 21600,
};
const overview = {
  synthetic: true,
  start: "2026-10-20T00:00:00Z",
  end: "2026-10-27T00:00:00Z",
  as_of: "2026-10-26T23:00:00Z",
  facility_count: 1,
  current_demand_kw: 1000,
  consumption_kwh: 21600,
  peak_demand_kw: 1200,
  active_incidents: 1,
  anomaly_count: 2,
  trend_percent: -3.4,
  coverage_percent: 100,
  series: [{ timestamp: "2026-10-20T00:00:00Z", demand_kw: 1000 }],
  facilities: [site],
};
const demo = {
  access_token: "test-demo",
  principal: {
    user_id: "public-demo",
    organization_id: "demo",
    organization_name: "Demo network",
    role: "demo",
  },
};
const incident = {
  id: "incident-a",
  title: "Demand excursion",
  severity: 4,
  status: "open",
  facilities_affected: 1,
  customer_impact: 150,
  created_at: "2026-10-26T10:00:00Z",
  age_hours: 10,
  priority_score: 480,
};
const calls: { path: string; body?: string }[] = [];
let failure = "";

function renderApp(path = "/app") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  failure = "";
  calls.length = 0;
  setAccessToken(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push({
        path,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (failure && path.includes(failure))
        return new Response(
          JSON.stringify({ error: { message: "Database unavailable" } }),
          { status: 503 },
        );
      let body: unknown = {};
      if (path.includes("/auth/demo")) body = demo;
      else if (path.includes("/auth/login"))
        return new Response(
          JSON.stringify({ error: { message: "Invalid email or password" } }),
          { status: 401 },
        );
      else if (path.includes("/dashboard")) body = overview;
      else if (path.includes("/forecast"))
        body = {
          method: "moving_average",
          horizon: 24,
          window: 24,
          alpha: 0.25,
          mae_kw: 31.2,
          rmse_kw: 43.5,
          training_points: 312,
          evaluation_points: 24,
          evaluation: "Chronological holdout",
          limitation: "Level-only baseline",
          history: overview.series,
          series: overview.series,
        };
      else if (path.includes("/anomalies"))
        body = {
          series: overview.series,
          anomalies: [],
          window: 24,
          threshold: 3,
        };
      else if (path.includes("/facilities?"))
        body = path.includes("search=missing") ? [] : [site];
      else if (path.endsWith("/facilities/site-a")) body = site;
      else if (path.includes("/incidents")) body = [incident];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

describe("Operations interface with mocked API transport", () => {
  it("renders database metrics and requests a new scope when the facility changes", async () => {
    renderApp();
    await screen.findByText("Monitored facilities");
    expect(screen.getByText("21.6")).toBeInTheDocument();
    expect(
      calls.filter((call) => call.path.includes("/dashboard")),
    ).toHaveLength(1);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Facility" }),
      "site-a",
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.path.includes("facility_id=site-a")),
      ).toBe(true),
    );
  });

  it("displays loading while the demo identity is pending", () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    renderApp();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening the demonstration workspace",
    );
  });

  it("shows a recoverable dashboard error without inventing metrics", async () => {
    failure = "/dashboard";
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.queryByText("Monitored facilities")).not.toBeInTheDocument();
  });

  it("validates custom dates before fetching", async () => {
    renderApp();
    await screen.findByText("Monitored facilities");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Date range" }),
      "custom",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose an end date after",
    );
  });

  it("filters inventory and explains an empty result", async () => {
    renderApp("/app/facilities");
    await screen.findByRole("heading", { name: "Hudson Research Campus" });
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search facilities" }),
      "missing",
    );
    expect(
      await screen.findByText("No facilities match your search"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add facility" }),
    ).not.toBeInTheDocument();
  });

  it("compares selected facilities using API-derived demand", async () => {
    renderApp("/app/facilities");
    await screen.findByRole("heading", { name: "Hudson Research Campus" });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Compare facility" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Facility comparison" }),
    ).toBeInTheDocument();
    expect(screen.getByText("kW average")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear selection" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Facility comparison" }),
    ).not.toBeInTheDocument();
  });

  it("navigates from a facility to its anomaly analysis", async () => {
    renderApp("/app/facilities");
    await screen.findByRole("heading", { name: "Hudson Research Campus" });
    await userEvent.click(
      screen.getByRole("link", { name: "Hudson Research Campus" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Demand & anomaly signals" }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Anomaly threshold" }),
      "4",
    );
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes("threshold=4"))).toBe(
        true,
      ),
    );
  });

  it("runs a configured forecast and displays calculated error metrics", async () => {
    renderApp("/app/forecasts");
    await screen.findByRole("button", { name: "Generate forecast" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Forecast method" }),
      "moving_average",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Generate forecast" }),
    );
    expect(await screen.findByText("31.2")).toBeInTheDocument();
    const call = calls.find((call) => call.path.includes("/site-a/forecast"));
    expect(JSON.parse(call!.body!)).toMatchObject({
      method: "moving_average",
      save: false,
    });
    expect(
      screen.queryByRole("checkbox", { name: "Save this analysis" }),
    ).not.toBeInTheDocument();
  });

  it("requests resolved incidents without exposing write controls to the demo", async () => {
    renderApp("/app/incidents");
    await screen.findByText("Demand excursion");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Include resolved" }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.path.includes("include_resolved=true")),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).not.toBeInTheDocument();
  });

  it("prevents empty sign-in and displays the API authentication error", async () => {
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(calls.some((call) => call.path.includes("/auth/login"))).toBe(false);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "analyst@example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Password", { exact: true }),
      "wrong-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password",
    );
  });

  it("offers a useful not-found route", () => {
    renderApp("/unavailable");
    expect(
      screen.getByRole("heading", { name: "That view isn’t here." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the workspace" }),
    ).toHaveAttribute("href", "/app");
  });
});

describe("HTTP contract helpers", () => {
  it("formats missing values without pretending they are zero", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(1234.5, 1)).toBe("1,234.5");
  });
  it("includes a bearer token and surfaces structured errors", async () => {
    setAccessToken("session-token");
    failure = "/facilities";
    await expect(request("/facilities")).rejects.toBeInstanceOf(ApiError);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
  });
});
