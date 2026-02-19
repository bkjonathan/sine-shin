import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendPoint } from "../../../types/report";

interface ReportTrendChartProps {
  data: TrendPoint[];
  formatPrice: (amount: number) => string;
  revenueLabel: string;
  profitLabel: string;
  cargoLabel: string;
  ordersLabel: string;
  emptyLabel: string;
}

export default function ReportTrendChart({
  data,
  formatPrice,
  revenueLabel,
  profitLabel,
  cargoLabel,
  ordersLabel,
  emptyLabel,
}: ReportTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            aria-label={`${revenueLabel}, ${profitLabel}, and ${cargoLabel} trend`}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickFormatter={(value) => formatPrice(Number(value) || 0)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(12, 12, 28, 0.92)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "12px",
                color: "#fff",
              }}
              formatter={(value, name) => [
                formatPrice(Number(value) || 0),
                name === "revenue"
                  ? revenueLabel
                  : name === "profit"
                    ? profitLabel
                    : name === "cargoFee"
                      ? cargoLabel
                      : ordersLabel,
              ]}
              labelStyle={{ color: "rgba(255,255,255,0.85)" }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name="revenue"
              stroke="#5b7fff"
              strokeWidth={2.6}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="profit"
              name="profit"
              stroke="#34d399"
              strokeWidth={2.6}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="cargoFee"
              name="cargoFee"
              stroke="#f59e0b"
              strokeWidth={2.6}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-5 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#5b7fff]" />
          {revenueLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
          {profitLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          {cargoLabel}
        </span>
      </div>
    </div>
  );
}
