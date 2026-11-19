import Svg, { Circle } from 'react-native-svg';

import { Decorative } from './Decorative';

/** Anel de umidade. `pct` nulo mostra só a trilha. */
export function Ring({
  size = 64,
  stroke = 7,
  pct,
  color,
  track,
}: {
  size?: number;
  stroke?: number;
  pct: number | null;
  color: string;
  track: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const center = size / 2;

  return (
    <Decorative>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {pct != null ? (
          <Circle
            cx={center}
            cy={center}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * clamped) / 100} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
    </Decorative>
  );
}
