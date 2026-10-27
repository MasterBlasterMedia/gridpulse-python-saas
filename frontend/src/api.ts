import type {
  Anomalies,
  Dashboard,
  Facility,
  Forecast,
  Incident,
  Session,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const REPOSITORY_URL =
  import.meta.env.VITE_REPOSITORY_URL ||
  "https://github.com/MasterBlasterMedia/gridpulse-python-saas";
export const DOCS_URL = `${API_URL}/docs`;
// Bearer credentials live only in memory, limiting persistence after a shared demo session.
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function response(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.error?.message || `Request failed (${res.status})`,
    );
  }
  return res;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return (await response(path, init)).json() as Promise<T>;
}
export const api = {
  demo: () => request<Session>("/auth/demo", { method: "POST" }),
  login: (email: string, password: string) =>
    request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  facilities: (search = "", status = "", signal?: AbortSignal) =>
    request<Facility[]>(
      `/facilities?${new URLSearchParams({ search, ...(status ? { status } : {}) })}`,
      { signal },
    ),
  facility: (id: string, signal?: AbortSignal) =>
    request<Facility>(`/facilities/${id}`, { signal }),
  dashboard: (params: Record<string, string> = {}, signal?: AbortSignal) =>
    request<Dashboard>(`/dashboard?${new URLSearchParams(params)}`, { signal }),
  incidents: (resolved = false, signal?: AbortSignal) =>
    request<Incident[]>(`/incidents?include_resolved=${resolved}`, { signal }),
  anomalies: (id: string, threshold: number, signal?: AbortSignal) =>
    request<Anomalies>(`/facilities/${id}/anomalies?threshold=${threshold}`, {
      signal,
    }),
  forecast: (
    id: string,
    options: {
      method: string;
      horizon: number;
      window: number;
      alpha: number;
      save: boolean;
    },
  ) =>
    request<Forecast>(`/facilities/${id}/forecast`, {
      method: "POST",
      body: JSON.stringify(options),
    }),
  export: async (params: Record<string, string>) =>
    (
      await response(`/reports/energy.csv?${new URLSearchParams(params)}`)
    ).blob(),
};

export function formatNumber(
  value: number | null | undefined,
  digits = 0,
): string {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(
        value,
      );
}
export function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
