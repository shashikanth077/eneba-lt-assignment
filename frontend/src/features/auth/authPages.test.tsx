import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const send = vi.fn(async () => ({ status: 200, text: 'OK' }));
vi.mock('@emailjs/browser', () => ({
  default: { send: (...args: unknown[]) => (send as (...a: unknown[]) => unknown)(...args) },
}));

const filters = {
  body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
};
const USER = { user: { id: 5, email: 'ada@example.com', displayName: 'Ada' } };

beforeEach(() => {
  send.mockClear();
  vi.stubEnv('VITE_EMAILJS_SERVICE_ID', 'svc');
  vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', 'pub');
  vi.stubEnv('VITE_EMAILJS_AUTH_TEMPLATE_ID', 'tpl_auth');
  vi.stubEnv('VITE_EMAILJS_ORDER_TEMPLATE_ID', 'tpl_order');
});

const form = () => screen.getByRole('main');

describe('register form', () => {
  it('validates before sending: every problem is shown and no request is made', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/register');
    await userEvent.click(await screen.findByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(api.callsTo('/api/auth/register')).toHaveLength(0);
  });

  it('shows a field message once the field was left, not while still typing', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/register');
    const user = userEvent.setup();
    const email = await screen.findByLabelText(/email/i);

    await user.type(email, 'ada@');
    expect(screen.queryByText(/valid email address/)).not.toBeInTheDocument();
    await user.tab();
    expect(await screen.findByText(/valid email address/)).toBeInTheDocument();
    await user.type(email, 'example.com');
    expect(screen.queryByText(/valid email address/)).not.toBeInTheDocument();
  });

  it("shows the server's answer for an email that is taken, and sends no welcome email", async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/register': apiError(
        409,
        'email_taken',
        'An account with this email already exists',
      ),
    });
    renderApp('/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/display name/i), 'Ada');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('on success signs in, goes home and sends the welcome email to the account the SERVER created', async () => {
    let registered = false;
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => (registered ? { body: USER } : apiError(401, 'unauthorized', 'x')),
      'POST /api/auth/register': () => {
        registered = true;
        return { status: 201, body: USER };
      },
    });
    const { router } = renderApp('/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/display name/i), '  Ada  ');
    await user.type(screen.getByLabelText(/email/i), ' ada@example.com ');
    await user.type(screen.getByLabelText(/password/i), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      'svc',
      'tpl_auth',
      expect.objectContaining({
        to_email: 'ada@example.com',
        to_name: 'Ada',
        email_heading: 'Welcome aboard, Ada!',
        action_text: 'Explore Marketplace',
        expiry_message: '',
      }),
      { publicKey: 'pub' },
    );
    expect(api.callsTo('/api/auth/register')).toHaveLength(1);
    void form;
  });

  it('a failing email service does not stop the sign-up', async () => {
    send.mockRejectedValueOnce(new Error('EmailJS down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let registered = false;
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => (registered ? { body: USER } : apiError(401, 'unauthorized', 'x')),
      'POST /api/auth/register': () => {
        registered = true;
        return { status: 201, body: USER };
      },
    });
    const { router } = renderApp('/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/display name/i), 'Ada');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});

describe('login form', () => {
  it('validates before sending', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.callsTo('/api/auth/login')).toHaveLength(0);
  });

  it('shows the server error for wrong credentials, once, and does not send a welcome email', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/login': apiError(
        401,
        'invalid_credentials',
        'Email or password is incorrect',
      ),
    });
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a readable message when the server throttles the attempts', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/login': apiError(429, 'too_many_attempts', 'Too many attempts', {
        retryAfterSeconds: 600,
      }),
    });
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 10 min');
  });
});
