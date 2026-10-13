import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>One people-data layer, two reports, one MCP server</h1>
      <p className="sub">A working demo of how I would own Rippling as the source of truth, join it to Ashby, and report on it. Everything here runs on synthetic data behind mock APIs shaped like the vendors&apos;.</p>
      <div className="grid g2">
        <Link href="/hr" className="card" style={{ textDecoration: "none", color: "inherit" }}><h3>HR report</h3><p className="small">All 16 metrics with numerator, denominator and n, breakdowns, why flagged metrics moved, a data quality audit and sync status.</p></Link>
        <Link href="/leadership" className="card" style={{ textDecoration: "none", color: "inherit" }}><h3>Leadership one-pager</h3><p className="small">Headcount against plan, eight headline metrics with targets and trends, and drafted commentary that waits for human review.</p></Link>
      </div>

      <h2>How it fits together</h2>
      <pre>{`Rippling API   Ashby API   Ops sources (survey, LMS, finance)
      \\            |            /
   clients: auth, pagination, retries, partial failure
                    |
        internal model (no names, no emails)
                    |
   metrics layer: ONE definition per metric
        /          |            \\
  HR report   Leadership    MCP server (5 tools)
  (all)       (aggregates)  (HR token or leadership scope)`}</pre>
      <ul>
        <li><b>One definition per metric.</b> Both reports, the MCP tools and the Slack digest read the same numbers, so they cannot disagree.</li>
        <li><b>Privacy by construction.</b> Leadership scope hides groups under 5, masks small counts and refuses restricted metrics, on the server.</li>
        <li><b>Audit built in.</b> Eight planted data problems (missing exit reasons, missing ATS to HRIS IDs, drifted start dates) are detected and mapped to the metrics they distort.</li>
        <li><b>Resilient.</b> Retries with backoff, per-source sync reports, and graceful degradation when a token lacks a scope.</li>
        <li><b>MCP server.</b> Complements Rippling&apos;s own MCP: theirs acts on Rippling, this one serves governed, defined metrics across systems. Endpoint: <code>/api/mcp</code>.</li>
      </ul>
      <p className="small muted">Mock endpoints are at <code>/api/mock/rippling/employees</code> and similar. Targets are illustrative. See the README for go-live steps.</p>
    </main>
  );
}
