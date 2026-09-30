export type AppLanguage = "en" | "zh";

/**
 * Reads the language explicitly selected inside RunWard.
 * The profiles.lang value is the cross-device source of truth; device and
 * authentication metadata locales must not influence notification language.
 */
export async function getAppLanguage(
  supabase: any,
  userId: string,
  knownProfileLang?: unknown,
): Promise<AppLanguage> {
  if (knownProfileLang === "zh") return "zh";
  if (knownProfileLang === "en") return "en";

  const { data } = await supabase
    .from("profiles")
    .select("lang")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.lang === "zh" ? "zh" : "en";
}