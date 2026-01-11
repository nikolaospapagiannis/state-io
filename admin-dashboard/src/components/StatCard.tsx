import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  color?: 'primary' | 'green' | 'yellow' | 'red' | 'blue';
}

const colorClasses = {
  primary: 'bg-primary-600/20 text-primary-400',
  green: 'bg-green-600/20 text-green-400',
  yellow: 'bg-yellow-600/20 text-yellow-400',
  red: 'bg-red-600/20 text-red-400',
  blue: 'bg-blue-600/20 text-blue-400',
};

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel = 'vs last period',
  color = 'primary',
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive ? (
                <TrendingUp className="text-green-400" size={16} />
              ) : (
                <TrendingDown className="text-red-400" size={16} />
              )}
              <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
                {isPositive ? '+' : ''}{change.toFixed(1)}%
              </span>
              <span className="text-gray-500 text-sm">{changeLabel}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}
