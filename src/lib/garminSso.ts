export const GARMIN_SSO_RETURN_URL = "/?tab=more&page=connect-apps";
export const GARMIN_SSO_EMBED_SERVICE_URL = "https://sso.garmin.com/sso/embed";

export const GARMIN_SSO_KEYS = {
  callback: "garmin-sso-callback",
  pending: "garmin-sso-pending",
  result: "garmin-sso-result",
  mobileEmbedUrl: "garmin-sso-mobile-embed-url",
  mobileServiceUrl: "garmin-sso-mobile-service-url",
} as const;

export type GarminSsoResult = {
  ok: boolean;
  displayName?: string;
  error?: string;
};

export function setGarminSsoResult(result: GarminSsoResult) {
  sessionStorage.setItem(GARMIN_SSO_KEYS.result, JSON.stringify(result));
}

export function clearGarminSsoTransientState() {
  sessionStorage.removeItem(GARMIN_SSO_KEYS.callback);
  sessionStorage.removeItem(GARMIN_SSO_KEYS.pending);
  sessionStorage.removeItem(GARMIN_SSO_KEYS.mobileEmbedUrl);
  sessionStorage.removeItem(GARMIN_SSO_KEYS.mobileServiceUrl);
}