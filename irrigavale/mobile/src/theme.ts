// Azuis da marca: fundo do login, cabeçalhos e botões.
// Pastéis: cards, tags e estados. Verde/vermelho/âmbar aparecem só para indicar estado.
export const palette = {
  navy: '#1E3A8A',
  brand: '#1D4ED8',
  action: '#2563EB',
  accent: '#3B82F6',

  blue50: '#F3F7FC',
  blue100: '#E3ECF8',
  blue200: '#CFDDF1',
  blue700: '#3F679E',
  blue800: '#2F4F7A',
  blue900: '#24405F',

  red50: '#FDF4F4',
  red100: '#FAE3E3',
  red200: '#F2CECE',
  red700: '#9E4545',
  dry: '#E99A9A',

  amber50: '#FDF9F0',
  amber100: '#F9EED8',
  amber200: '#F0DEB5',
  amber700: '#8F6220',
  amber: '#EBC17E',

  green50: '#F2F9F5',
  green100: '#DEF1E7',
  green200: '#C5E5D4',
  green700: '#3B7A5E',
  green: '#8CCFAF',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  white: '#FFFFFF',
  pageBg: '#F9FAFB',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 12, lg: 16, xl: 24, pill: 99 } as const;

// Tipografia pensada para uso ao ar livre: corpo mínimo de 14px.
export const type = {
  // Menor texto do app: 13px com cinza de contraste ≥ 4,5:1 (gray500 ou mais escuro).
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  metric: { fontSize: 28, lineHeight: 32, fontWeight: '800' as const },
} as const;
