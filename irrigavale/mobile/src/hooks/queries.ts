import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  alertsApi,
  dashboardApi,
  devicesApi,
  farmApi,
  irrigationsApi,
  routinesApi,
  statsApi,
  weatherApi,
  zonesApi,
} from '../api/endpoints';
import { DASHBOARD_REFRESH_MS } from '../config';
import type { IrrigationAction, SummaryPeriod } from '../api/types';

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  zones: ['zones'] as const,
  devices: ['devices'] as const,
  irrigations: ['irrigations'] as const,
  routines: ['routines'] as const,
  alerts: ['alerts'] as const,
  farm: ['farm'] as const,
  weather: ['weather'] as const,
  summary: (period: SummaryPeriod) => ['summary', period] as const,
  readings: (zoneId: string, hours: number) => ['readings', zoneId, hours] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.get,
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
}

export function useZones() {
  return useQuery({ queryKey: queryKeys.zones, queryFn: zonesApi.list });
}

export function useDevices() {
  return useQuery({ queryKey: queryKeys.devices, queryFn: devicesApi.list });
}

export function useIrrigations() {
  return useQuery({ queryKey: queryKeys.irrigations, queryFn: () => irrigationsApi.list(), refetchInterval: DASHBOARD_REFRESH_MS });
}

export function useRoutines() {
  return useQuery({ queryKey: queryKeys.routines, queryFn: routinesApi.list });
}

export function useAlerts() {
  return useQuery({ queryKey: queryKeys.alerts, queryFn: alertsApi.list, refetchInterval: DASHBOARD_REFRESH_MS });
}

export function useFarm() {
  return useQuery({ queryKey: queryKeys.farm, queryFn: farmApi.get });
}

const WEATHER_REFRESH_MS = 15 * 60_000;

export function useWeather() {
  return useQuery({
    queryKey: queryKeys.weather,
    queryFn: weatherApi.get,
    staleTime: WEATHER_REFRESH_MS,
    refetchInterval: WEATHER_REFRESH_MS,
    retry: false,
  });
}

export function useSummary(period: SummaryPeriod) {
  return useQuery({
    queryKey: queryKeys.summary(period),
    queryFn: () => statsApi.summary(period),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
}

export function useZoneReadings(zoneId: string, hours = 8) {
  return useQuery({
    queryKey: queryKeys.readings(zoneId, hours),
    queryFn: () => zonesApi.readings(zoneId, hours),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
}

/** Qualquer mudança de irrigação afeta painel, agenda e alertas. */
export function useInvalidateIrrigationViews() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
      qc.invalidateQueries({ queryKey: queryKeys.irrigations }),
      qc.invalidateQueries({ queryKey: queryKeys.alerts }),
      qc.invalidateQueries({ queryKey: ['summary'] }),
    ]);
}

export function useIrrigationAction() {
  const invalidate = useInvalidateIrrigationViews();
  return useMutation({
    mutationFn: ({ id, action, volumeL }: { id: string; action: IrrigationAction; volumeL?: number }) =>
      irrigationsApi.act(id, action, volumeL !== undefined ? { volume_l: volumeL } : undefined),
    onSuccess: invalidate,
  });
}

export function useStartManualIrrigation() {
  const invalidate = useInvalidateIrrigationViews();
  return useMutation({
    mutationFn: ({ zoneId, durationMin }: { zoneId: string; durationMin?: number }) =>
      irrigationsApi.startManual(zoneId, durationMin),
    onSuccess: invalidate,
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; dry_threshold?: number; wet_threshold?: number }) =>
      zonesApi.update(id, payload),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.zones }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
    ]),
  });
}

export function useAlertActions() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.alerts }),
    qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
  ]);
  return {
    readAll: useMutation({ mutationFn: alertsApi.readAll, onSuccess: refresh }),
    clear: useMutation({ mutationFn: alertsApi.clear, onSuccess: refresh }),
  };
}

/**
 * Inicia a irrigação de uma zona: usa a recomendação/programação aberta, se houver,
 * ou registra uma irrigação manual.
 */
export function useStartZoneIrrigation() {
  const action = useIrrigationAction();
  const manual = useStartManualIrrigation();
  return {
    start: (zoneId: string, openIrrigationId: string | null) =>
      openIrrigationId
        ? action.mutateAsync({ id: openIrrigationId, action: 'start' })
        : manual.mutateAsync({ zoneId }),
    isPending: action.isPending || manual.isPending,
  };
}
