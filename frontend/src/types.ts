// API contracts use explicit units to prevent confusing instantaneous demand with energy.
export interface Principal {
  user_id: string;
  organization_id: string;
  organization_name: string;
  role: "demo" | "analyst" | "administrator";
}
export interface Session {
  access_token: string;
  principal: Principal;
}
export interface Facility {
  id: string;
  code: string;
  name: string;
  region: string;
  kind: string;
  status: "operational" | "warning" | "maintenance";
  capacity_kw: number;
  current_demand_kw?: number | null;
  consumption_kwh?: number;
  average_demand_kw?: number | null;
}
export interface Point {
  timestamp: string;
  demand_kw: number | null;
}
export interface Dashboard {
  synthetic: boolean;
  start: string;
  end: string;
  as_of: string | null;
  facility_count: number;
  current_demand_kw: number | null;
  consumption_kwh: number;
  peak_demand_kw: number;
  active_incidents: number;
  anomaly_count: number;
  trend_percent: number | null;
  coverage_percent: number;
  series: Point[];
  facilities: Facility[];
}
export interface Incident {
  id: string;
  title: string;
  severity: number;
  status: string;
  facilities_affected: number;
  customer_impact: number;
  created_at: string;
  age_hours: number;
  priority_score: number;
}
export interface Anomalies {
  series: Point[];
  anomalies: {
    timestamp: string;
    actual: number;
    baseline: number;
    score: number;
  }[];
  window: number;
  threshold: number;
}
export interface Forecast {
  method: string;
  horizon: number;
  window: number;
  alpha: number;
  mae_kw: number;
  rmse_kw: number;
  training_points: number;
  evaluation_points: number;
  evaluation: string;
  limitation: string;
  series: Point[];
  history: Point[];
  saved_id?: string;
}
