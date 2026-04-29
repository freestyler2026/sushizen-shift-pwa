export const dynamic = "force-dynamic";

export function GET() {
  // Must match the same priority order as NEXT_PUBLIC_BUILD_ID in next.config.ts
  const v =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  return Response.json({ v }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}
