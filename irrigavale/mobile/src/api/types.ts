// Espelha os schemas Pydantic do backend (app/schemas.py).

export type ZoneStatus =
  | 'no_data'
  | 'offline'
  | 'dry'
  | 'attention'
  | 'ideal'
  | 'wet'
  | 'planned_stress';
export type ZoneManagement = 'normal' | 'planned_stress';
export type IrrigationStatus =
  | 'recommended'
  | 'approved'
  | 'postponed'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'cancelled';
export type IrrigationOrigin = 'system' | 'routine' | 'manual';
export type AlertKind = 'critical' | 'warning' | 'done' | 'info' | 'device';
export type DeviceConnection = 'never' | 'online' | 'offline';
export type IrrigationAction = 'approve' | 'postpone' | 'start' | 'finish' | 'cancel';

export interface FarmOut {
  id: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  daily_water_goal_l: number;
  sms_enabled: boolean;
  sms_phone: string | null;
  app_notifications_enabled: boolean;
  auto_approve: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  irrigation_window_start: string;
  water_price_brl_per_m3: number;
  reading_interval_min: number;
}

export interface UserOut {
  id: string;
  name: string;
  email: string;
  farm: FarmOut;
}

export interface TokenOut {
  access_token: string;
  token_type: 'bearer';
  user: UserOut;
}

export interface ZoneOut {
  id: string;
  name: string;
  crop: string;
  area_ha: number;
  dry_threshold: number;
  wet_threshold: number;
  management: ZoneManagement;
  status: ZoneStatus;
  last_moisture_pct: number | null;
  last_temperature_c: number | null;
  last_reading_at: string | null;
}

export interface ReadingOut {
  recorded_at: string;
  moisture_pct: number;
  temperature_c: number | null;
}

export interface DeviceOut {
  id: string;
  code: string;
  name: string;
  zone_id: string | null;
  battery_pct: number | null;
  signal_dbm: number | null;
  last_seen_at: string | null;
  connection: DeviceConnection;
  created_at: string;
}

export interface DeviceCreatedOut extends DeviceOut {
  api_key: string;
}

export interface IrrigationOut {
  id: string;
  zone_id: string;
  zone_name: string;
  routine_id: string | null;
  origin: IrrigationOrigin;
  status: IrrigationStatus;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_min: number;
  volume_l_estimated: number | null;
  volume_l_actual: number | null;
  reason: string | null;
}

export interface RoutineOut {
  id: string;
  zone_id: string;
  zone_name: string;
  weekdays: number[];
  start_time: string;
  duration_min: number;
  respect_sensor: boolean;
  moisture_limit: number;
  active: boolean;
}

export interface AlertOut {
  id: string;
  zone_id: string | null;
  zone_name: string | null;
  kind: AlertKind;
  message: string;
  sms_sent: boolean;
  created_at: string;
  read_at: string | null;
}

export interface DashboardOut {
  farm_name: string;
  user_name: string;
  zones: ZoneOut[];
  water_used_today_l: number;
  water_goal_l: number;
  active_irrigations: IrrigationOut[];
  unread_alerts: number;
}

export type WeatherIcon = 'sunny' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'night';

export interface WeatherOut {
  temperature_c: number;
  humidity_pct: number;
  wind_kmh: number;
  uv_index: number;
  precipitation_mm: number;
  condition: string;
  icon: WeatherIcon;
  updated_at: string;
}

export type SummaryPeriod = 'today' | 'month';

export interface SummaryOut {
  period: SummaryPeriod;
  period_start: string;
  water_used_l: number;
  irrigations_done: number;
  irrigations_skipped: number;
  water_saved_l: number;
  savings_brl: number;
}
