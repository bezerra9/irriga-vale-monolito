import { palette } from '../theme';
import type { IrrigationStatus, ZoneStatus } from '../api/types';

export interface StatusMeta {
  label: string;
  dot: string;
  tagBg: string;
  tagText: string;
  /** Borda do card do sensor e preenchimento do gráfico. */
  border: string;
  fill: string;
  /** Traço do anel e da linha do gráfico: tom escuro, legível ao sol. */
  ring: string;
}

export const ZONE_STATUS: Record<ZoneStatus, StatusMeta> = {
  dry: {
    label: 'Solo seco',
    dot: palette.dry,
    tagBg: palette.red100,
    tagText: palette.red700,
    border: palette.red200,
    fill: palette.red50,
    ring: palette.red700,
  },
  attention: {
    label: 'Atenção',
    dot: palette.amber,
    tagBg: palette.amber100,
    tagText: palette.amber700,
    border: palette.amber200,
    fill: palette.amber50,
    ring: palette.amber700,
  },
  ideal: {
    label: 'Ideal',
    dot: palette.green,
    tagBg: palette.green100,
    tagText: palette.green700,
    border: palette.gray200,
    fill: palette.green50,
    ring: palette.green700,
  },
  wet: {
    label: 'Úmido',
    dot: palette.accent,
    tagBg: palette.blue100,
    tagText: palette.blue700,
    border: palette.blue200,
    fill: palette.blue50,
    ring: palette.action,
  },
  planned_stress: {
    label: 'Déficit controlado',
    dot: palette.gray400,
    tagBg: palette.gray100,
    tagText: palette.gray600,
    border: palette.gray200,
    fill: palette.gray100,
    ring: palette.gray500,
  },
  offline: {
    label: 'Offline',
    dot: palette.gray400,
    tagBg: palette.gray100,
    tagText: palette.gray600,
    border: palette.gray200,
    fill: palette.gray100,
    ring: palette.gray400,
  },
  no_data: {
    label: 'Sem leitura',
    dot: palette.gray300,
    tagBg: palette.gray100,
    tagText: palette.gray500,
    border: palette.gray200,
    fill: palette.gray100,
    ring: palette.gray300,
  },
};

export const IRRIGATION_STATUS_LABEL: Record<IrrigationStatus, string> = {
  recommended: 'Recomendada',
  approved: 'Programada',
  postponed: 'Adiada',
  in_progress: 'Em andamento',
  done: 'Concluída',
  skipped: 'Pulada',
  cancelled: 'Cancelada',
};

export const OPEN_IRRIGATION: IrrigationStatus[] = ['recommended', 'approved', 'postponed', 'in_progress'];

/** Zonas que precisam de atenção do produtor (aparecem no filtro "Atenção"). */
export function needsAttention(status: ZoneStatus): boolean {
  return status === 'dry' || status === 'attention';
}

/** Cor do texto da bateria: alerta abaixo de 20% (mesmo limite do backend), atenção abaixo de 50%. */
export function batteryColor(pct: number | null): string {
  if (pct == null) return palette.gray500;
  if (pct <= 20) return palette.red700;
  if (pct < 50) return palette.amber700;
  return palette.green700;
}

/** Barras de sinal (0–3) a partir do RSSI do Wi-Fi em dBm. */
export function signalBars(dbm: number | null): number {
  if (dbm == null) return 0;
  if (dbm >= -67) return 3;
  if (dbm >= -80) return 2;
  if (dbm >= -90) return 1;
  return 0;
}
