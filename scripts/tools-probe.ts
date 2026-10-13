import { runTool, schemas, INSTRUCTIONS } from "../lib/mcp/tools";
(async () => {
  console.log("instructions length:", INSTRUCTIONS.length, "(limit 2048)");
  const show = async (name: keyof typeof schemas, args: unknown, scope: "hr" | "leadership") => {
    const t0 = Date.now();
    try { const r = await runTool(name, args, scope); const s = JSON.stringify(r); console.log(`\n[${scope}] ${name} ${JSON.stringify(args)} -> ${s.length} bytes, ${Date.now() - t0} ms`); return r; }
    catch (e) { console.log(`\n[${scope}] ${name} ${JSON.stringify(args)} -> ERROR: ${(e as Error).message.slice(0, 160)}`); }
  };
  await show("list_metrics", { group: "Hiring" }, "leadership");
  await show("get_metric", { metric_id: "time_to_fill" }, "leadership");
  await show("get_metric", { metric_id: "quality_of_hire" }, "leadership");
  await show("get_metric", { metric_id: "quality_of_hire", group_by: "source" }, "hr");
  await show("get_metric", { metric_id: "cost_per_hire", group_by: "department" }, "hr");
  await show("get_metric", { metric_id: "time_to_fill", filter_dimension: "department", filter_value: "People" }, "leadership");
  await show("explain_change", { metric_id: "time_to_fill", group_by: "department" }, "hr");
  await show("data_quality_report", {}, "leadership");
  await show("data_quality_report", {}, "hr");
  await show("leadership_summary", {}, "leadership");
  await show("get_metric", { metric_id: "nope" }, "hr");
})();
