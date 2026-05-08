export const dynamic = "force-dynamic";

export function GET() {
  // Must use the SAME priority order as BUILD_ID in next.config.ts so that
  // the value baked into the client bundle matches what this endpoint returns.
  //
  // VERCEL_URL is unique per deployment and available at both build time and
  // runtime on Vercel — even for CLI deployments without git integration.
  // VERCEL_GIT_COMMIT_SHA is available for git-connected deployments.
  // "dev" is the local-dev fallback (AutoReload skips comparison in this case).
  // Must use the SAME priority order as BUILD_ID in next.config.ts so that
  // the value baked into the client bundle matches what this endpoint returns.
  //
  // VERCEL_URL is unique per deployment and available at both build time and
  // runtime on Vercel — even for CLI deployments without git integration.
  // VERCEL_GIT_COMMIT_SHA is available for git-connected deployments.
  // "dev" is the local-dev fallback (AutoReload skips comparison in this case).
  const v =
    process.env.VERCEL_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev";
  return Response.json({ v }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}
