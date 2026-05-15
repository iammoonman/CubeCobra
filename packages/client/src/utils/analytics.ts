// Thin wrapper around GA4 gtag.js. The snippet is only present in production
// when GA_MEASUREMENT_ID is set (see main.pug), so window.gtag is absent in
// dev, on beta, and whenever a privacy extension blocks it. Tracking must
// never break the UI, so every call is guarded and swallowed.

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  try {
    window.gtag?.('event', name, params);
  } catch {
    // Analytics is best-effort; a failure here must not affect the user.
  }
}
