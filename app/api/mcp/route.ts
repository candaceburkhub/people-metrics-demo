import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { INSTRUCTIONS, registerTools } from "@/lib/mcp/tools";

// Remote MCP server. Add it to Claude as a custom connector with this route's full URL.
//
// Identity and scope:
//   - no token                 leadership scope (aggregates only, small groups hidden)
//   - MCP_HR_TOKEN             HR scope (everything, including restricted detail)
//   - MCP_LEADERSHIP_TOKEN     leadership scope, explicitly
// A token that is present but wrong is rejected with 401. It never silently downgrades.
//
// In production this would be OAuth with scope claims from your identity provider. That is how
// Rippling's own MCP works too, since it inherits each user's Rippling permissions.

export const dynamic = "force-dynamic";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "people-metrics-demo", version: "0.1.0" },
  instructions: INSTRUCTIONS,
});

// HR scope is disabled in production until MCP_HR_TOKEN is set, so a fresh deploy is least-privileged.
const hrToken = () => process.env.MCP_HR_TOKEN ?? (process.env.NODE_ENV !== "production" ? "demo-hr-token" : undefined);
const leadershipToken = () => process.env.MCP_LEADERSHIP_TOKEN;

const authed = withMcpAuth(
  handler,
  (_req, bearer) => {
    if (!bearer) return undefined;
    if (hrToken() && bearer === hrToken()) return { token: bearer, clientId: "hr", scopes: ["hr", "leadership"] };
    if (leadershipToken() && bearer === leadershipToken()) return { token: bearer, clientId: "leadership", scopes: ["leadership"] };
    // A token that is present but wrong is an error, so it can never silently fall back to leadership scope.
    throw new Error("Unknown bearer token");
  },
  { required: false },
);

export { authed as GET, authed as POST, authed as DELETE };
