// Server-side GA4 events via the Measurement Protocol. Used for conversions
// that happen during a form POST + redirect (signup, cube creation) where a
// client-side gtag call would be unreliable (redirect race, ad-blockers).
//
// Disabled unless BOTH GA_MEASUREMENT_ID and GA_API_SECRET are set, so dev and
// beta (which never receive GA_API_SECRET) report nothing. Fire-and-forget:
// callers do not await, and a failure can never affect the request.

import 'dotenv/config';

const MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const API_SECRET = process.env.GA_API_SECRET;

type Logger = { error: (...args: any[]) => void };

export function trackServerEvent(
  name: string,
  params: Record<string, string | number | boolean> = {},
  options: { clientId?: string; logger?: Logger } = {},
): void {
  if (!MEASUREMENT_ID || !API_SECRET) {
    return;
  }

  // GA4 requires a client_id. Server conversions have no GA cookie, so a
  // per-event UUID is used — this counts the conversion without stitching it
  // to a web session, which is the intended granularity here.
  const clientId = options.clientId || crypto.randomUUID();
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

  fetch(url, {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, events: [{ name, params }] }),
  }).catch((err) => {
    options.logger?.error('Failed to send server analytics event', name, err);
  });
}
