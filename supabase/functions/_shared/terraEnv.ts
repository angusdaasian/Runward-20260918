// Shared Terra credential resolver. Picks test vs prod based on request origin / hints.

export type TerraEnv = "prod" | "test";

// All environments (including angustest.site and lovable previews) now use the
// production Terra credentials. The test env is retained in the type for
// backwards compatibility but `pickEnvFromRequest` always returns "prod".
export function pickEnvFromRequest(_req: Request, _hints: (string | null | undefined)[] = []): TerraEnv {
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
