import apiClient from '../api/apiClient';
import { endpoints } from '../api/apiEndpoints';

/**
 * Tells the server about things only the browser can see, so they appear in the same log as everything else (docs/LOGGING.md): the
 * order e-mail sent through EmailJS, a payment page that gave up, an uncaught error. The server accepts only these event names and
 * chooses the log level itself. Pass reasons and ids, NEVER an e-mail address, a name, a key or a token. Never throws, never waits:
 * a failed report is simply lost (and must not cause another report).
 */
export type ClientEvent =
  | 'email.sent'
  | 'email.skipped'
  | 'email.invalid'
  | 'email.failed'
  | 'payment.poll.gave_up'
  | 'checkout.failed'
  | 'app.error';

export type ClientLogFields = Partial<
  Record<
    'kind' | 'reason' | 'status' | 'order_id' | 'message' | 'route' | 'missing',
    string | number
  >
>;

export function reportEvent(event: ClientEvent, fields: ClientLogFields = {}): void {
  apiClient.post(endpoints.clientLog, { event, fields }).catch(() => undefined);
}

let uncaughtReported = 0;

/** Once, at start-up: an error nobody caught is reported (at most five per page load, so a loop cannot flood the log). */
export function installUncaughtErrorReporting(): void {
  const report = (message: string) => {
    if (uncaughtReported >= 5) return;
    uncaughtReported += 1;
    reportEvent('app.error', { message: message.slice(0, 200), route: window.location.pathname });
  };
  window.addEventListener('error', (event) => report(event.message || 'error'));
  window.addEventListener('unhandledrejection', (event) =>
    report(event.reason instanceof Error ? event.reason.message : 'unhandled promise rejection'),
  );
}
