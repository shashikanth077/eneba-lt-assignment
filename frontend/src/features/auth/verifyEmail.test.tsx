import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const filters = {
  body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
};
const user = (emailVerified: boolean) => ({
  body: { user: { id: 5, email: 'ada@example.com', displayName: 'Ada', emailVerified } },
});
const TOKEN = 'a'.repeat(64);

describe('/verify-email', () => {
  it('sends the token from the link to the server and reports success', async () => {
    let sent: unknown = null;
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/verify-email': ({ body }) => {
        sent = body;
        return { body: { verified: true } };
      },
    });
    renderApp(`/verify-email?token=${TOKEN}`);

    expect(await screen.findByText('Your email address is verified')).toBeInTheDocument();
    expect(api.callsTo('/api/auth/verify-email')).toHaveLength(1);
    expect(sent).toEqual({ token: TOKEN });
  });

  it('shows the server refusal for an expired or used link and offers a way forward', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/verify-email': () => apiError(400, 'bad_request', 'invalid or expired'),
    });
    renderApp(`/verify-email?token=${TOKEN}`);

    expect(await screen.findByText('We could not verify this link')).toBeInTheDocument();
    expect(screen.getByText(/invalid, has expired or was already used/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in to request a new link/ })).toBeInTheDocument();
  });

  it('does not call the server when the link has no token', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/verify-email');

    expect(await screen.findByText('This link is incomplete')).toBeInTheDocument();
    expect(api.callsTo('/api/auth/verify-email')).toHaveLength(0);
  });
});

describe('verification banner', () => {
  it('shows for an unverified account and offers a new link, then confirms', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': user(false),
      'POST /api/auth/resend-verification': { status: 202, body: { sent: true } },
    });
    renderApp('/store');

    expect(await screen.findByText(/Please verify your email address/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send a new link' }));

    expect(await screen.findByText(/We sent a new link to ada@example.com/)).toBeInTheDocument();
    expect(api.callsTo('/api/auth/resend-verification')).toHaveLength(1);
  });

  it('is not shown for a verified account or a visitor', async () => {
    fakeApi({ 'GET /api/filters': filters, 'GET /api/auth/me': user(true) });
    renderApp('/store');
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument());
    expect(screen.queryByText(/Please verify your email address/)).not.toBeInTheDocument();
  });

  it('turns a failed resend into a plain message', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': user(false),
      'POST /api/auth/resend-verification': () => apiError(429, 'too_many_requests', 'x'),
    });
    renderApp('/store');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/We could not send the email/)).toBeInTheDocument();
  });
});
