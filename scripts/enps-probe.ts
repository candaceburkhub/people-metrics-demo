import { runSync } from "../lib/pipeline/sync";
import { explainChange } from "../lib/metrics/report";
(async () => {
  const ds = await runSync();
  for (const scope of ["hr", "leadership"] as const) {
    const e = explainChange(ds, "enps", { scope, groupBy: "department" });
    console.log(scope, e.current.display, "from", e.previous.display, "delta", e.deltaDisplay);
    for (const r of e.rows) console.log("  ", r.key.padEnd(28), r.contributionDisplay.padEnd(10), `cur=${r.current.display}(n=${r.current.n}) prev=${r.previous.display}(n=${r.previous.n})`);
  }
})();
