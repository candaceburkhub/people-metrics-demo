import type { Unit } from "./definitions";

const int = (n: number) => Math.round(n).toLocaleString("en-US");

export function formatValue(unit: Unit | "text", v: number | string | null): string {
  if (v === null || v === undefined) return "n/a";
  if (typeof v === "string") return v;
  switch (unit) {
    case "pct":
      return `${v.toFixed(1)}%`;
    case "days":
      return `${v.toFixed(1)} days`;
    case "usd":
      return `$${int(v)}`;
    case "ratio":
      return v.toFixed(2);
    case "score":
      return v.toFixed(1);
    case "nps":
      return `${v >= 0 ? "+" : ""}${Math.round(v)}`;
    case "count":
      return int(v);
    default:
      return String(v);
  }
}

export function formatDelta(unit: Unit, delta: number | null): string {
  if (delta === null) return "n/a";
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const a = Math.abs(delta);
  switch (unit) {
    case "pct":
      return `${sign}${a.toFixed(1)} pts`;
    case "days":
      return `${sign}${a.toFixed(1)} days`;
    case "usd":
      return `${sign}$${int(a)}`;
    case "ratio":
      return `${sign}${a.toFixed(2)}`;
    case "score":
      return `${sign}${a.toFixed(1)}`;
    case "nps":
      return `${sign}${Math.round(a)} pts`;
    default:
      return `${sign}${int(a)}`;
  }
}
