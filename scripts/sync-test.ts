import { runSync } from "../lib/pipeline/sync";
(async () => {
  for (const [label, opts] of [["normal", {}], ["chaos", { chaos: true }], ["readonly token", { readonlyRipplingToken: true }]] as const) {
    const t0 = Date.now();
    const ds = await runSync(opts);
    console.log(`\n== ${label} (${Date.now() - t0}ms) people=${ds.people.length} apps=${ds.applications.length} offers=${ds.offers.length} compOK=${ds.compensationAvailable}`);
    console.log(ds.sync.sources.map((s) => `${s.source}: calls=${s.calls} retries=${s.retries} records=${s.records} ok=${s.ok}`).join("\n"));
    if (ds.sync.warnings.length) console.log("warnings:", ds.sync.warnings);
  }
})();
