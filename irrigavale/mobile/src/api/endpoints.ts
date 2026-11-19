import { api } from './client';
import type {
  AlertOut,
  DashboardOut,
  DeviceCreatedOut,
  DeviceOut,
  FarmOut,
  IrrigationAction,
  IrrigationOut,
  IrrigationStatus,
  ReadingOut,
  RoutineOut,
  SummaryOut,
  SummaryPeriod,
  TokenOut,
  UserOut,
  WeatherOut,
  ZoneOut,
} from './types';

export const authApi = {
  login: (email: string, password: string) =>
    api<TokenOut>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload: {
    name: string;
    farm_name: string;
    email: string;
    password: string;
    city: string;
    state: string;
  }) => api<TokenOut>('/auth/register', { method: 'POST', body: payload }),
  me: () => api<UserOut>('/auth/me'),
};

export const farmApi = {
  get: () => api<FarmOut>('/farm'),
  update: (payload: Partial<Omit<FarmOut, 'id'>>) =>
    api<FarmOut>('/farm', { method: 'PATCH', body: payload }),
};

export const zonesApi = {
  list: () => api<ZoneOut[]>('/zones'),
  create: (payload: {
    name: string;
    crop: string;
    area_ha: number;
    dry_threshold?: number;
    wet_threshold?: number;
  }) => api<ZoneOut>('/zones', { method: 'POST', body: payload }),
  update: (
    id: string,
    payload: Partial<Pick<ZoneOut, 'name' | 'crop' | 'area_ha' | 'dry_threshold' | 'wet_threshold' | 'management'>>,
  ) =>
    api<ZoneOut>(`/zones/${id}`, { method: 'PATCH', body: payload }),
  readings: (id: string, hours = 8) => api<ReadingOut[]>(`/zones/${id}/readings?hours=${hours}`),
};

export const devicesApi = {
  list: () => api<DeviceOut[]>('/devices'),
  create: (payload: { code: string; name: string; zone_id: string | null }) =>
    api<DeviceCreatedOut>('/devices', { method: 'POST', body: payload }),
  revoke: (id: string) => api<void>(`/devices/${id}`, { method: 'DELETE' }),
};

export const irrigationsApi = {
  list: (status?: IrrigationStatus) =>
    api<IrrigationOut[]>(`/irrigations${status ? `?status=${status}` : ''}`),
  startManual: (zoneId: string, durationMin = 45) =>
    api<IrrigationOut>('/irrigations', {
      method: 'POST',
      body: { zone_id: zoneId, duration_min: durationMin },
    }),
  act: (id: string, action: IrrigationAction, body?: { volume_l?: number }) =>
    api<IrrigationOut>(`/irrigations/${id}/${action}`, { method: 'POST', body: body ?? undefined }),
};

export const routinesApi = {
  list: () => api<RoutineOut[]>('/routines'),
  create: (payload: {
    zone_id: string;
    weekdays: number[];
    start_time: string;
    duration_min: number;
    respect_sensor: boolean;
    moisture_limit: number;
  }) => api<RoutineOut>('/routines', { method: 'POST', body: payload }),
  update: (
    id: string,
    payload: Partial<
      Pick<RoutineOut, 'active' | 'weekdays' | 'start_time' | 'duration_min' | 'respect_sensor' | 'moisture_limit'>
    >,
  ) =>
    api<RoutineOut>(`/routines/${id}`, { method: 'PATCH', body: payload }),
  remove: (id: string) => api<void>(`/routines/${id}`, { method: 'DELETE' }),
};

export const alertsApi = {
  list: () => api<AlertOut[]>('/alerts'),
  readAll: () => api<void>('/alerts/read-all', { method: 'POST' }),
  clear: () => api<void>('/alerts/clear', { method: 'POST' }),
};

export const dashboardApi = {
  get: () => api<DashboardOut>('/dashboard'),
};

export const weatherApi = {
  /** `null` quando o clima não está disponível (sem internet no servidor, cidade não encontrada). */
  get: () => api<WeatherOut | null>('/weather'),
};

export const statsApi = {
  summary: (period: SummaryPeriod) => api<SummaryOut>(`/stats/summary?period=${period}`),
};
