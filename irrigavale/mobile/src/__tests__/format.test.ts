import {
  estimateVolumeL,
  formatAgo,
  formatBRL,
  formatDayTime,
  formatElapsed,
  formatPhoneBR,
  formatTodayLong,
  initials,
  toE164BR,
  uvLabel,
  describeWeekdays,
  formatCubicMeters,
  formatHHMM,
  formatLiters,
  formatPct,
  formatRelative,
  parseHHMM,
} from '../lib/format';

describe('formatação', () => {
  it('formata litros com separador de milhar em pt-BR', () => {
    expect(formatLiters(2100)).toBe('2.100 L');
    expect(formatLiters(980)).toBe('980 L');
    expect(formatLiters(1234567)).toBe('1.234.567 L');
    expect(formatLiters(null)).toBe('—');
  });

  it('converte litros em metros cúbicos com vírgula', () => {
    expect(formatCubicMeters(3900)).toBe('3,9 m³');
    expect(formatCubicMeters(8000)).toBe('8,0 m³');
  });

  it('arredonda percentuais e trata ausência de leitura', () => {
    expect(formatPct(21.6)).toBe('22%');
    expect(formatPct(null)).toBe('—');
  });

  it('extrai HH:MM de horários e de datas ISO', () => {
    expect(formatHHMM('05:00:00')).toBe('05:00');
    expect(formatHHMM('17:30')).toBe('17:30');
  });
});

describe('parseHHMM', () => {
  it('aceita horários válidos e normaliza', () => {
    expect(parseHHMM('05:00')).toBe('05:00');
    expect(parseHHMM(' 23:59 ')).toBe('23:59');
  });

  it('rejeita horários inválidos', () => {
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('5:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('abc')).toBeNull();
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');

  it('descreve há quanto tempo foi a última leitura', () => {
    expect(formatRelative('2026-11-12T11:59:40Z', now)).toBe('agora');
    expect(formatRelative('2026-11-12T11:50:00Z', now)).toBe('há 10 min');
    expect(formatRelative('2026-11-12T09:00:00Z', now)).toBe('há 3 h');
    expect(formatRelative('2026-11-10T12:00:00Z', now)).toBe('há 2 d');
    expect(formatRelative(null, now)).toBe('sem leitura');
  });
});

describe('describeWeekdays', () => {
  it('resume em formato curto', () => {
    expect(describeWeekdays([0, 1, 2, 3, 4])).toBe('Seg a Sex');
    expect(describeWeekdays([0, 1, 2, 3, 4, 5])).toBe('Seg a Sáb');
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(describeWeekdays([0, 2, 4])).toBe('Seg, Qua, Sex');
    expect(describeWeekdays([5, 6])).toBe('Sáb, Dom');
    expect(describeWeekdays([6])).toBe('Dom');
  });
});

describe('formatadores do protótipo', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');

  it('descreve o tempo decorrido sem preposição e com "atrás"', () => {
    expect(formatElapsed('2026-11-12T11:50:00Z', now)).toBe('10 min');
    expect(formatElapsed('2026-11-12T09:00:00Z', now)).toBe('3 h');
    expect(formatAgo('2026-11-12T11:50:00Z', now)).toBe('10 min atrás');
    expect(formatAgo('2026-11-12T11:59:50Z', now)).toBe('agora');
    expect(formatAgo(null, now)).toBe('sem leitura');
  });

  it('formata reais', () => {
    expect(formatBRL(1240)).toBe('R$ 1.240');
    expect(formatBRL(69.88)).toBe('R$ 69,88');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('gera iniciais', () => {
    expect(initials('João Silva')).toBe('JS');
    expect(initials('Maria das Dores Souza')).toBe('MS');
    expect(initials('Ana')).toBe('A');
  });

  it('converte celular brasileiro de/para E.164', () => {
    expect(toE164BR('(87) 9 9999-8888')).toBe('+5587999998888');
    expect(toE164BR('87 3861-0000')).toBe('+558738610000');
    expect(toE164BR('+55 87 99999-8888')).toBe('+5587999998888');
    expect(toE164BR('123')).toBeNull();
    expect(formatPhoneBR('+5587999998888')).toBe('(87) 9 9999-8888');
    expect(formatPhoneBR(null)).toBe('');
  });

  it('classifica o índice UV', () => {
    expect(uvLabel(1)).toBe('Baixo');
    expect(uvLabel(7)).toBe('Alto');
    expect(uvLabel(12)).toBe('Extremo');
  });

  it('estima volume igual ao backend (1.500 L/ha/h)', () => {
    expect(estimateVolumeL(2.5, 30)).toBe(1875);
    expect(estimateVolumeL(4, 60)).toBe(6000);
  });

  it('mostra dia e hora relativos', () => {
    const ref = new Date(2026, 10, 12, 15, 0);
    expect(formatDayTime(new Date(2026, 10, 12, 13, 45).toISOString(), ref)).toBe('Hoje, 13:45');
    expect(formatDayTime(new Date(2026, 10, 11, 8, 5).toISOString(), ref)).toBe('Ontem, 08:05');
    expect(formatDayTime(new Date(2026, 10, 3, 8, 5).toISOString(), ref)).toBe('03/11, 08:05');
    expect(formatTodayLong(new Date(2026, 8, 4))).toBe('Hoje, 4 de setembro');
  });
});
