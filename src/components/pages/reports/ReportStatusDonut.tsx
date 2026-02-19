import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface ReportStatusDonutProps {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
  emptyLabel: string;
  title: string;
}

export default function ReportStatusDonut({
  segments,
  total,
  emptyLabel,
  title,
}: ReportStatusDonutProps) {
  if (segments.length === 0 || total === 0) {
    return (
      <div className="glass-panel p-5 h-full">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-muted mt-1">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 h-full">
      <h3 className="text-lg font-semibold text-text-primary mb-5">{title}</h3>
      <div className="flex flex-col xl:flex-row xl:items-center gap-5">
        <div className="relative h-[220px] w-[220px] mx-auto xl:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="label"
                innerRadius={56}
                outerRadius={86}
                strokeWidth={2}
                stroke="rgba(10, 10, 26, 0.75)"
              >
                {segments.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(12, 12, 28, 0.92)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: "12px",
                }}
                formatter={(value) => Number(value).toLocaleString()}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-[30%] rounded-full glass-panel flex flex-col items-center justify-center text-center px-2">
            <p className="text-xs text-text-muted">Total</p>
            <p className="text-lg font-bold text-text-primary">{total.toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm flex-1">
          {segments.map((segment) => (
            <div key={segment.key} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-text-secondary">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                {segment.label}
              </span>
              <span className="text-text-primary">{segment.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
