export const GARMIN_SSO_RETURN_URL = "/?tab=more&page=connect-apps";
export const GARMIN_SSO_EMBED_SERVICE_URL = "https://sso.garmin.com/sso/embed";

export const GARMIN_SSO_KEYS = {
  callback: "garmin-sso-callback",
  pending: "garmin-sso-pending",
  result: "garmin-sso-result",
  mobileEmbedUrl: "garmin-sso-mobile-embed-url",
  mobileServiceUrl: "garmin-sso-mobile-service-url",
} as const;

const GARMIN_SSO_STORAGE_SCOPES = [sessionStorage, localStorage] as const;

export type GarminSsoResult = {
  ok: boolean;
  displayName?: string;
  error?: string;
};

export function setGarminSsoResult(result: GarminSsoResult) {
  const payload = JSON.stringify(result);
  for (const storage of GARMIN_SSO_STORAGE_SCOPES) {
    storage.setItem(GARMIN_SSO_KEYS.result, payload);
  }
}

export function getGarminSsoValue(key: (typeof GARMIN_SSO_KEYS)[keyof typeof GARMIN_SSO_KEYS]) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

export function setGarminSsoValue(
  key: (typeof GARMIN_SSO_KEYS)[keyof typeof GARMIN_SSO_KEYS],
  value: string,
) {
  for (const storage of GARMIN_SSO_STORAGE_SCOPES) {
    storage.setItem(key, value);
  }
}

export function clearGarminSsoTransientState() {
  for (const storage of GARMIN_SSO_STORAGE_SCOPES) {
    storage.removeItem(GARMIN_SSO_KEYS.callback);
    storage.removeItem(GARMIN_SSO_KEYS.pending);
    storage.removeItem(GARMIN_SSO_KEYS.mobileEmbedUrl);
    storage.removeItem(GARMIN_SSO_KEYS.mobileServiceUrl);
  }
}