import Svg, { Path } from 'react-native-svg';

import { Decorative } from './Decorative';

/** Histórico de umidade. Escala fixa de 0 a 100% para comparar zonas entre si. */
export function Sparkline({
  values,
  color,
  fill,
  width,
  height = 42,
}: {
  values: number[];
  color: string;
  fill: string;
  width: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (Math.max(0, Math.min(100, v)) / 100) * height;
    return { x, y };
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <Decorative>
      <Svg width={width} height={height}>
        <Path d={area} fill={fill} />
        <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </Decorative>
  );
}
