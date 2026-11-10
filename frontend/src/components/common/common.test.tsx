import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Button, Chip, Input, Menu, MenuItem, Modal, Pagination, PriceDisplay, Select } from '.';
import { renderWithProviders } from '../../test/renderApp';

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Filters">
          <button>First</button>
          <button>Last</button>
        </Modal>
      </>
    );
  }

  it('is a labelled modal dialog, moves focus in, traps Tab, closes on Escape and returns focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Close filters' })).toHaveFocus(); // the first focusable thing

    await user.tab();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close filters' })).toHaveFocus(); // wrapped, did not escape to the page

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('closes on a click outside the panel, not on a click inside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.pointer({
      keys: '[MouseLeft]',
      target: screen.getByRole('dialog').parentElement as HTMLElement,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Menu', () => {
  const setup = (onSignOut = vi.fn()) =>
    render(
      <MemoryRouter>
        <Menu trigger={(props) => <button {...props}>Account</button>}>
          <MenuItem to="/orders">My orders</MenuItem>
          <MenuItem onClick={onSignOut}>Sign out</MenuItem>
        </Menu>
      </MemoryRouter>,
    );

  it('opens with the first item focused, moves with the arrow keys, closes on Escape with focus back on the button', async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole('button', { name: 'Account' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'My orders' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'My orders' })).toHaveFocus(); // wraps
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('choosing an item runs it and closes the menu', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    setup(onSignOut);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('renders nothing for one page, marks the current page, and reports the chosen one', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Pagination page={1} pageCount={1} onChange={onChange} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    rerender(<Pagination page={2} pageCount={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'page 2' })).toHaveAttribute('aria-current', 'page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('disables previous on the first page and next on the last, and shortens long ranges with gaps', () => {
    const { rerender } = render(<Pagination page={1} pageCount={20} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 10' })).not.toBeInTheDocument();
    rerender(<Pagination page={20} pageCount={20} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });
});

describe('Input, Select, Chip, Button, PriceDisplay', () => {
  it('Input links its label, its message and its invalid state', () => {
    render(<Input label="Email" error="Enter your email address" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter your email address');
  });

  it('Select is a labelled native select that reports the value', async () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Sort by"
        value="a"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'B');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Chip has a remove button named after it only when it can be removed', async () => {
    const remove = vi.fn();
    const { rerender } = render(<Chip label="Steam" onRemove={remove} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove Steam' }));
    expect(remove).toHaveBeenCalled();
    rerender(<Chip label="Steam" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a loading Button ignores clicks and says it is busy; a link Button is a real link', async () => {
    const click = vi.fn();
    const { rerender } = render(
      <Button loading onClick={click}>
        Pay
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Pay' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(button);
    expect(click).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <Button to="/cart">Cart</Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Cart' })).toHaveAttribute('href', '/cart');
  });

  it('PriceDisplay formats cents, with the original price and discount when given', () => {
    renderWithProviders(<PriceDisplay from cents={1999} originalCents={2999} discountPct={33} />);
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText(/19\.99/)).toBeInTheDocument();
    expect(screen.getByText(/29\.99/)).toBeInTheDocument();
    expect(screen.getByText('-33%')).toBeInTheDocument();
  });
});
