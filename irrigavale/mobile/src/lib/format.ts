/** Formatadores em pt-BR. Não dependem de Intl para funcionar bem no Hermes. */

export function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`;
}

export function formatLiters(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} L`;
}

export function formatCubicMeters(liters: number): string {
  return `${(liters / 1000).toFixed(1).replace('.', ',')} m³`;
}

export function formatHHMM(value: string): string {
  // Aceita "05:00", "05:00:00" e ISO 8601.
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (match) return `${match[1]}:${match[2]}`;
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function parseHHMM(text: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

export function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'sem leitura';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

const WEEKDAY_SHORT = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/** Ordem de exibição começando no domingo, como no calendário brasileiro. */
export const WEEK_DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function weekdayShort(index: number): string {
  return WEEKDAY_SHORT[index] ?? '';
}

export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[index] ?? '';
}

const WEEKDAY_ABBR = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** "Todos os dias", "Seg a Sex", "Seg a Sáb", "Seg, Qua, Sex". */
export function describeWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Todos os dias';
  const consecutive = sorted.length >= 3 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive) return `${WEEKDAY_ABBR[sorted[0]]} a ${WEEKDAY_ABBR[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => WEEKDAY_ABBR[d]).join(', ');
}

/** "10 min", "3 h", "2 d" — sem preposição, para rótulos curtos. */
export function formatElapsed(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** "10 min atrás", "agora", "sem leitura". */
export function formatAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'sem leitura';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  return `${formatElapsed(iso, now)} atrás`;
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "Hoje, 4 de setembro". */
export function formatTodayLong(now: Date = new Date()): string {
  return `Hoje, ${now.getDate()} de ${MONTHS[now.getMonth()]}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameLocalDay(iso: string | null, now: Date = new Date()): boolean {
  return iso != null && sameDay(new Date(iso), now);
}

/** "Hoje, 13:45", "Ontem, 08:10" ou "12/11, 08:10". */
export function formatDayTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = formatHHMM(iso);
  if (sameDay(date, now)) return `Hoje, ${time}`;
  if (sameDay(date, yesterday)) return `Ontem, ${time}`;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}, ${time}`;
}

/** "14h30". */
export function formatHourShort(iso: string): string {
  return formatHHMM(iso).replace(':', 'h');
}

/** "R$ 1.240" (sem centavos acima de 100) ou "R$ 12,50". */
export function formatBRL(value: number): string {
  if (Math.abs(value) >= 100) {
    return `R$ ${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "+5587999998888" → "(87) 9 9999-8888". Outros formatos voltam como estão. */
export function formatPhoneBR(e164: string | null): string {
  if (!e164) return '';
  const match = /^\+55(\d{2})(\d)(\d{4})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]} ${match[3]}-${match[4]}`;
}

/** "(87) 9 9999-8888" → "+5587999998888". Aceita número já com +DDI. Nulo se inválido. */
export function toE164BR(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('+')) {
    const plus = `+${trimmed.replace(/\D/g, '')}`;
    return /^\+[1-9]\d{7,14}$/.test(plus) ? plus : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;
  return null;
}

/** Índice de UV em texto, como nos boletins. */
export function uvLabel(index: number): string {
  if (index < 3) return 'Baixo';
  if (index < 6) return 'Moderado';
  if (index < 8) return 'Alto';
  if (index < 11) return 'Muito alto';
  return 'Extremo';
}

/** Mesma estimativa do backend (rules.estimate_volume_l): 1.500 L por hectare por hora. */
export const ESTIMATED_LITERS_PER_HA_HOUR = 1500;

export function estimateVolumeL(areaHa: number, durationMin: number): number {
  return Math.round((areaHa * ESTIMATED_LITERS_PER_HA_HOUR * durationMin) / 60);
}
