import { handleMock, type MockSource } from "@/lib/mock/handlers";

// Public mock vendor APIs. Synthetic data only. Try:
//   curl -H "Authorization: Bearer demo-rippling-token" <host>/api/mock/rippling/employees?limit=5
//   curl -X POST -u demo-ashby-key: -d '{"limit":5}' <host>/api/mock/ashby/offer.list

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ source: string; path: string[] }> };

async function route(req: Request, ctx: Ctx) {
  const { source, path } = await ctx.params;
  if (source !== "rippling" && source !== "ashby" && source !== "ops") {
    return Response.json({ error: "unknown source" }, { status: 404 });
  }
  return handleMock(source as MockSource, path, req);
}

export { route as GET, route as POST };
