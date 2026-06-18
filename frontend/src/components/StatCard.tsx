import { Card } from "antd";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  suffix?: string;
  precision?: number;
  valueColor?: string;
  icon?: ReactNode;
  /** Optional small line under the value (e.g. period change). */
  delta?: ReactNode;
  /** Accent colour for this card — tints the background, icon chip and top rail. */
  tone?: string;
}

export default function StatCard({
  title,
  value,
  prefix,
  suffix,
  precision = 2,
  valueColor,
  icon,
  delta,
  tone,
}: Props) {
  const display =
    typeof value === "number"
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      : value;

  // Locally override --accent so the rail/icon/tint all recolour from one place.
  const toneStyle = tone ? ({ "--accent": tone } as CSSProperties) : undefined;

  return (
    <Card
      className={`stat-card${tone ? " toned" : ""}`}
      variant="borderless"
      style={{ ...toneStyle, height: "100%" }}
      styles={{ body: { padding: "15px 20px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="stat-title">{title}</div>
          <div className="stat-value" style={{ color: valueColor ?? "var(--app-text)" }}>
            {prefix && <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.75 }}>{prefix}</span>}
            {display}
            {suffix && (
              <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>{suffix}</span>
            )}
          </div>
          {/* Always render the delta slot so cards with/without a delta stay the
              same height and align across the row. */}
          <div className="stat-delta">{delta ?? " "}</div>
        </div>
        {icon && <span className="stat-icon-chip">{icon}</span>}
      </div>
    </Card>
  );
}
