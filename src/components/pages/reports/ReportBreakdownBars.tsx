import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BreakdownRow } from "../../../types/report";

interface ReportBreakdownBarsProps {
  title: string;
  subtitle: string;
  rows: BreakdownRow[];
  metric: "orders" | "profit";
  formatPrice: (amount: number) => string;
  emptyLabel: string;
}

export default function ReportBreakdownBars({
  title,
  subtitle,
  rows,
  metric,
  formatPrice,
  emptyLabel,
}: ReportBreakdownBarsProps) {
  const gradientId = useId().replace(/:/g, "");
  const chartData = rows.map((row) => ({
    name: row.name,
    value: metric === "orders" ? row.orders : row.profit,
  }));

  return (
    <div className="glass-panel p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </div>

      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{emptyLabel}</p>
        ) : (
          <>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 6, right: 8, left: 4, bottom: 6 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5b7fff" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.12)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                    tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                    tickFormatter={(value) =>
                      metric === "orders"
                        ? Number(value).toLocaleString()
                        : formatPrice(Number(value) || 0)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={95}
                    tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(12, 12, 28, 0.92)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "12px",
                    }}
                    formatter={(value) =>
                      metric === "orders"
                        ? Number(value).toLocaleString()
                        : formatPrice(Number(value) || 0)
                    }
                  />
                  <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {rows.slice(0, 3).map((row) => (
                <div key={row.name} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary truncate pr-3">{row.name}</span>
                  <span className="text-text-primary">
                    {metric === "orders"
                      ? row.orders.toLocaleString()
                      : formatPrice(row.profit)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
