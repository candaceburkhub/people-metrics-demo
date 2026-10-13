import { runSync } from "../lib/pipeline/sync";
import { compute, statusFor, trend } from "../lib/metrics/engine";
import { METRICS } from "../lib/metrics/definitions";
(async () => {
  const ds = await runSync();
  for (const d of METRICS) {
    const c = compute(ds, d.id, { period: "2026-09" });
    const prev = compute(ds, d.id, { period: "2026-08", withExtras: false });
    console.log(`${d.id.padEnd(20)} ${String(c.value === null ? null : Math.round(c.value*100)/100).padEnd(9)} prev=${prev.value === null ? null : Math.round(prev.value*100)/100}  num=${Math.round(c.numerator*10)/10} den=${Math.round(c.denominator*10)/10} n=${c.n} status=${statusFor(d.id, c.value)}${c.unavailable ? " UNAVAILABLE" : ""}`);
  }
  console.log("\nTTF trend", trend(ds, "time_to_fill", "2026-09").map(p => `${p.period}:${p.value?.toFixed(1)}(${p.n})`).join(" "));
  console.log("OfferAcc trend", trend(ds, "offer_acceptance", "2026-09").map(p => `${p.period}:${p.value?.toFixed(0)}(${p.n})`).join(" "));
  console.log("D1 trend", trend(ds, "day_one_readiness", "2026-09").map(p => `${p.period}:${p.value?.toFixed(0)}(${p.n})`).join(" "));
  console.log("eNPS trend", trend(ds, "enps", "2026-09").map(p => `${p.period}:${p.value?.toFixed(0)}(${p.n})`).join(" "));
  console.log("Headcount trend", trend(ds, "headcount", "2026-09").map(p => `${p.period}:${p.value}`).join(" "));
  const g = compute(ds, "time_to_fill", { period: "2026-09", groupBy: "department" });
  console.log("TTF by dept Sep", g.groups?.map(x => `${x.key}:${x.value?.toFixed(0)}(${x.n})`).join(" "));
  const g2 = compute(ds, "time_to_fill", { period: "2026-08", groupBy: "department" });
  console.log("TTF by dept Aug", g2.groups?.map(x => `${x.key}:${x.value?.toFixed(0)}(${x.n})`).join(" "));
  const t = compute(ds, "turnover", { period: "2026-09" });
  console.log("turnover extras", t.extras.map(e => `${e.key}=${e.value}`).join(" "));
  const h = compute(ds, "headcount", { period: "2026-09" });
  console.log("headcount extras", h.extras.map(e => `${e.key}=${e.value}`).join(" "));
  console.log("plan", ds.plan.find(p => p.month === "2026-09"));
  const c = compute(ds, "cost_per_hire", { period: "2026-09" });
  console.log("CPH extras", c.extras.map(e => `${e.key}=${e.value}`).join(" "));
  const co = compute(ds, "compliance", { period: "2026-09" });
  console.log("compliance extras", co.extras.map(e => `${e.key}=${e.value}`).join(" "));
})();
