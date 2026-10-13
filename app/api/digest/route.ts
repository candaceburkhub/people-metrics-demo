import { getDataset } from "@/lib/pipeline/sync";
import { buildLeadershipReport, slackDigest } from "@/lib/metrics/views";

export const dynamic = "force-dynamic";

// Builds the Slack digest from the leadership report. It posts only when SLACK_REVIEW_WEBHOOK_URL is set,
// and that webhook should point at a People Ops review channel, not the leadership channel. Otherwise it
// returns the payload (a dry run). Everything it builds is labelled a draft.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const post = new URL(req.url).searchParams.get("post") === "1";
  if (post && (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)) return Response.json({ error: "Posting needs the cron secret." }, { status: 401 });
  const payload = slackDigest(buildLeadershipReport(await getDataset()));
  const hook = process.env.SLACK_REVIEW_WEBHOOK_URL;
  if (post && hook) {
    const res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return Response.json({ posted: res.ok, status: res.status });
  }
  return Response.json({ posted: false, dryRun: true, payload });
}
