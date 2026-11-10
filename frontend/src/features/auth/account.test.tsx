import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const filters = {
  body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
};
const ana = { id: 3, email: 'ana@example.com', displayName: 'Ana', emailVerified: true };
const cart = { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } };

describe('/account', () => {
  it('edits the display name through PATCH /api/auth/profile and shows it in the header', async () => {
    let sent: unknown = null;
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': { body: { user: ana } },
      'GET /api/cart': cart,
      'PATCH /api/auth/profile': ({ body }) => {
        sent = body;
        return { body: { user: { ...ana, displayName: 'Ana Maria' } } };
      },
    });
    renderApp('/account');
    const field = await screen.findByLabelText('Display name');
    await userEvent.setup().clear(field);
    await userEvent.setup().type(field, 'Ana Maria');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Your profile was saved.')).toBeInTheDocument();
    expect(sent).toEqual({ displayName: 'Ana Maria' });
    expect(screen.getByLabelText('Account menu, Ana Maria')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  });

  it('checks the new password before sending anything', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': { body: { user: ana } },
      'GET /api/cart': cart,
    });
    renderApp('/account');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Current password'), 'old password 1');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Repeat the new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('The two passwords are not the same')).toBeInTheDocument();
    expect(api.callsTo('/api/auth/change-password')).toHaveLength(0);
  });

  it('changes the password, and shows the server message when it refuses (wrong current password, demo account)', async () => {
    let attempt = 0;
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': { body: { user: ana } },
      'GET /api/cart': cart,
      'POST /api/auth/change-password': () => {
        attempt += 1;
        if (attempt === 1) {
          return apiError(422, 'validation_failed', 'invalid', {
            fields: { currentPassword: ['Your current password is not correct'] },
          });
        }
        if (attempt === 2)
          return apiError(403, 'demo_account', 'Demo accounts keep their password');
        return { body: { user: ana } };
      },
    });
    renderApp('/account');
    const user = userEvent.setup();
    const fill = async () => {
      await user.clear(screen.getByLabelText('Current password'));
      await user.type(screen.getByLabelText('Current password'), 'old password 1');
      await user.clear(screen.getByLabelText('New password'));
      await user.type(screen.getByLabelText('New password'), 'a brand new one 1');
      await user.clear(screen.getByLabelText('Repeat the new password'));
      await user.type(screen.getByLabelText('Repeat the new password'), 'a brand new one 1');
      await user.click(screen.getByRole('button', { name: 'Change password' }));
    };
    await screen.findByLabelText('Current password');

    await fill();
    expect(await screen.findByText('Your current password is not correct')).toBeInTheDocument();
    await fill();
    expect(await screen.findByText(/Demo accounts keep their password/)).toBeInTheDocument();
    await fill();
    expect(await screen.findByText(/Your password was changed/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''));
  });

  it('is only for signed-in users, and the account menu links to it', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
    });
    const { router, unmount } = renderApp('/account');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.search).toBe('?next=%2Faccount');
    unmount();

    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': { body: { user: ana } },
      'GET /api/cart': cart,
    });
    renderApp('/');
    await userEvent.setup().click(await screen.findByLabelText('Account menu, Ana'));
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'My account' }),
    ).toHaveAttribute('href', '/account');
  });
});
