/**
 * Detect whether the app is running in development or production.
 * - Lovable preview URLs → 'dev'
 * - localhost → 'dev'
 * - Everything else (e.g. Netlify prod domain) → 'prod'
 */
export function getAppEnvironment(): 'dev' | 'prod' {
  const host = window.location.hostname;
  if (
    host === 'localhost' ||
    host.includes('lovable.app') ||
    host.includes('lovable.dev') ||
    host.includes('127.0.0.1') ||
    host.includes('angustest.site')
  ) {
    return 'dev';
  }
  return 'prod';
}
