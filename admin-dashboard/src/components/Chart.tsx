import { useEffect, useRef } from 'react';

interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function LineChart({
  data,
  color = '#8b5cf6',
  height = 200,
  showGrid = true,
  showLabels = true,
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const padding = { top: 20, right: 20, bottom: showLabels ? 40 : 20, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    const maxValue = Math.max(...data.map((d) => d.value)) * 1.1;
    const minValue = 0;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis labels
        const value = maxValue - (maxValue / 4) * i;
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatNumber(value), padding.left - 10, y + 4);
      }
    }

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const points: { x: number; y: number }[] = [];
    data.forEach((d, i) => {
      const x = padding.left + (chartWidth / (data.length - 1)) * i;
      const y = padding.top + chartHeight - ((d.value - minValue) / (maxValue - minValue)) * chartHeight;
      points.push({ x, y });

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, `${color}40`);
    gradient.addColorStop(1, `${color}00`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Draw points
    points.forEach((p) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // X-axis labels
    if (showLabels) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      const step = Math.ceil(data.length / 7);
      data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
          const x = padding.left + (chartWidth / (data.length - 1)) * i;
          ctx.fillText(d.label, x, height - 10);
        }
      });
    }
  }, [data, color, height, showGrid, showLabels]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height }}
      className="block"
    />
  );
}

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

export function BarChart({ data, height = 200 }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value)) * 1.1;

  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div
            className="w-full rounded-t transition-all duration-300"
            style={{
              height: `${(item.value / maxValue) * 100}%`,
              backgroundColor: item.color || '#8b5cf6',
              minHeight: '4px',
            }}
          />
          <span className="text-xs text-gray-500 truncate max-w-full">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function PieChart({ data, size = 160 }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = -90;

  const segments = data.map((d) => {
    const angle = (d.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...d, startAngle, angle };
  });

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const radius = size / 2;
  const innerRadius = radius * 0.6;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((segment, i) => {
          const startRad = toRadians(segment.startAngle);
          const endRad = toRadians(segment.startAngle + segment.angle);

          const x1 = radius + radius * Math.cos(startRad);
          const y1 = radius + radius * Math.sin(startRad);
          const x2 = radius + radius * Math.cos(endRad);
          const y2 = radius + radius * Math.sin(endRad);

          const x3 = radius + innerRadius * Math.cos(endRad);
          const y3 = radius + innerRadius * Math.sin(endRad);
          const x4 = radius + innerRadius * Math.cos(startRad);
          const y4 = radius + innerRadius * Math.sin(startRad);

          const largeArc = segment.angle > 180 ? 1 : 0;

          const path = `
            M ${x1} ${y1}
            A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
            L ${x3} ${y3}
            A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
            Z
          `;

          return (
            <path
              key={i}
              d={path}
              fill={segment.color}
              className="transition-opacity hover:opacity-80"
            />
          );
        })}
      </svg>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-sm text-gray-400">{d.label}</span>
            <span className="text-sm font-medium text-white">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
}
