import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../app/router';
import { makeStore } from '../app/store';

/** The whole app (real routes, real store with its sagas, real components) on an in-memory router, starting at `path`. */
export function renderApp(path: string) {
  const store = makeStore();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...view, store, router };
}

/** One component with a store and a router around it (for components that do not need the app's routes). */
export function renderWithProviders(ui: ReactElement, { path = '/' }: { path?: string } = {}) {
  const store = makeStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { ...view, store };
}
