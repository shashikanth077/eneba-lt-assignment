import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import { reportEvent } from './clientLog';

describe('reportEvent', () => {
  it('posts the event and its fields to the server log endpoint', async () => {
    let sent: unknown = null;
    const api = fakeApi({
      'POST /api/client-log': ({ body }) => {
        sent = body;
        return { status: 204 };
      },
    });

    reportEvent('email.failed', { kind: 'order', reason: 'The Public Key is invalid' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(api.callsTo('/api/client-log')).toHaveLength(1);
    expect(sent).toEqual({
      event: 'email.failed',
      fields: { kind: 'order', reason: 'The Public Key is invalid' },
    });
  });

  it('never throws, even when the server is down', async () => {
    fakeApi({ 'POST /api/client-log': { status: 500, body: {} } });
    expect(() => reportEvent('app.error', { message: 'x' })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
});
