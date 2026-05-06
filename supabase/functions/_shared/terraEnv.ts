// Shared Terra credential resolver. Picks test vs prod based on request origin / hints.

export type TerraEnv = "prod" | "test";

const TEST_HOST_PATTERNS = [
  /(^|\.)angustest\.site$/i,
  /^id-preview--.*\.lovable\.app$/i,
  /^.*\.lovable\.dev$/i,
];

function hostMatchesTest(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].trim().toLowerCase();
  return TEST_HOST_PATTERNS.some((re) => re.test(h));
}

export function pickEnvFromRequest(req: Request, hints: (string | null | undefined)[] = []): TerraEnv {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidates = [origin, referer, ...hints];
  for (const c of candidates) {
    if (hostMatchesTest(c)) return "test";
  }
  return "prod";
}

export function getTerraCreds(env: TerraEnv): { devId: string; apiKey: string; signingSecret: string; env: TerraEnv } {
  if (env === "test") {
    return {
      devId: Deno.env.get("TERRA_DEV_ID_TEST") ?? "",
      apiKey: Deno.env.get("TERRA_API_KEY_TEST") ?? "",
      signingSecret: Deno.env.get("TERRA_SIGNING_SECRET_TEST") ?? "",
      env,
    };
  }
  return {
    devId: Deno.env.get("TERRA_DEV_ID") ?? "",
    apiKey: Deno.env.get("TERRA_API_KEY") ?? "",
    signingSecret: Deno.env.get("TERRA_SIGNING_SECRET") ?? "",
    env,
  };
}
