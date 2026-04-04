import { motion } from 'framer-motion';
import { type ReviewMetric } from '../lib/review-replay.js';

interface SpiderChartProps {
  metrics: ReviewMetric[];
  size?: number;
}

export function SpiderChart({ metrics, size = 300 }: SpiderChartProps) {
  const center = size / 2;
  const radius = (size / 2) * 0.8;
  const angleStep = (Math.PI * 2) / metrics.length;

  const getCoordinates = (angle: number, value: number) => {
    const x = center + radius * value * Math.cos(angle - Math.PI / 2);
    const y = center + radius * value * Math.sin(angle - Math.PI / 2);
    return { x, y };
  };

  const points = metrics.map((metric, i) => {
    const angle = i * angleStep;
    return getCoordinates(angle, metric.score);
  });

  const polygonPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Background Grid */}
        {gridLevels.map((level) => {
          const gridPoints = metrics.map((_, i) => {
            const angle = i * angleStep;
            const { x, y } = getCoordinates(angle, level);
            return `${x},${y}`;
          });
          return (
            <polygon
              key={level}
              points={gridPoints.join(' ')}
              fill="none"
              stroke="var(--color-border-muted)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axes */}
        {metrics.map((_, i) => {
          const angle = i * angleStep;
          const { x, y } = getCoordinates(angle, 1);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--color-border-muted)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data Polygon */}
        <motion.path
          d={polygonPath}
          fill="var(--color-brand-orange)"
          fillOpacity="0.2"
          stroke="var(--color-brand-orange)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Labels */}
        {metrics.map((metric, i) => {
          const angle = i * angleStep;
          const { x, y } = getCoordinates(angle, 1.15);
          return (
            <text
              key={metric.name}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] uppercase tracking-wider font-medium"
              fill="var(--color-text-dim)"
            >
              {metric.label}
            </text>
          );
        })}
        
        {/* Score Values */}
        {metrics.map((metric, i) => {
          const angle = i * angleStep;
          const { x, y } = getCoordinates(angle, metric.score);
          return (
            <circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r="3"
              fill="var(--color-brand-orange)"
            />
          );
        })}
      </svg>
    </div>
  );
}
